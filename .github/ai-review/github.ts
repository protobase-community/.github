// The GitHub REST calls a review and its auto-merge make. They read the pull request as data; the review writes only
// its one comment and the approval label, and the auto-merge only merges or fast-forwards the base branch, starts a workflow after the merge when the caller names one, and deletes the merged head branch when the repository's setting asks for it.
import type { ComparedFile } from "./approval"
import type { CheckRun, WorkflowRun } from "./checks"
import type { ReviewerCheck, ReviewerStatus, ReviewThread } from "./fallback-review"
import type { ChangedFile } from "./pull-request"
import type { CommitPullRequest } from "./trigger"

const api = "https://api.github.com"

// A pull request's review threads, a page at a time, with each one's first comment.
const reviewThreadsQuery = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { isResolved isOutdated path line comments(first: 1) { nodes { author { __typename login } body url } } }
      }
    }
  }
}`

// The server errors GitHub answers now and then and not again a moment later.
const transient = new Set([500, 502, 503, 504])

// `retryPause` is the fixed wait in milliseconds before a GET that met a transient server error is sent once more.
export function gitHub(token: string, repository: string, retryPause = 2000) {
  const headers = { authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" }

  // Every call goes through here. Only a GET, or a POST of a GraphQL query, which this module only ever sends, is sent
  // again, since it changes nothing; a second answer that is not OK is the caller's to handle, as the first would have been.
  async function send(path: string, init: RequestInit) {
    const response = await fetch(`${api}${path}`, init)
    const reads = (init.method ?? "GET") === "GET" || path === "/graphql"
    if (!reads || !transient.has(response.status)) return response
    await new Promise((resolve) => setTimeout(resolve, retryPause))
    return fetch(`${api}${path}`, init)
  }

  async function request(path: string, init: RequestInit = {}, accept = "application/vnd.github+json") {
    const response = await send(path, { ...init, headers: { ...headers, accept, ...init.headers } })
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${init.method ?? "GET"} ${path}`)
    return response
  }

  // The review's own comment: the one github-actions wrote that starts with the marker.
  async function reviewComment(number: number, marker: string) {
    const comments = await paginate<{ id: number; body: string; user: { login: string } }>(
      `/repos/${repository}/issues/${number}/comments`,
      Number.POSITIVE_INFINITY,
    )
    return comments.find((comment) => comment.user.login === "github-actions[bot]" && comment.body.startsWith(marker))
  }

  async function paginate<T>(path: string, maxItems: number) {
    const items: T[] = []
    for (let page = 1; items.length < maxItems; page++) {
      const batch = (await (await request(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`)).json()) as T[]
      items.push(...batch)
      if (batch.length < 100) break
    }
    return items
  }

  // A file's text at a commit, or on the default branch without one, or null when it does not exist there.
  async function fileAt(path: string, ref: string | null, repo = repository) {
    const encoded = path.split("/").map(encodeURIComponent).join("/")
    const query = ref ? `?ref=${ref}` : ""
    const response = await send(`/repos/${repo}/contents/${encoded}${query}`, {
      headers: { ...headers, accept: "application/vnd.github.raw+json" },
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${path} at ${ref ?? "the default branch"} in ${repo}`)
    return response.text()
  }

  // Every page of a list the API wraps in an object under `key`, such as a commit's check runs.
  async function paginateWrapped<T>(path: string, key: string) {
    const items: T[] = []
    for (let page = 1; ; page++) {
      const answer = (await (await request(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`)).json()) as Record<string, unknown>
      const batch = answer[key] as T[]
      items.push(...batch)
      if (batch.length < 100) return items
    }
  }

  return {
    fileAt,

    async pullRequest(number: number) {
      return (await (await request(`/repos/${repository}/pulls/${number}`)).json()) as {
        title: string
        body: string | null
        state: string
        draft: boolean
        user: { login: string }
        labels: { name: string }[]
        changed_files: number
        // repo is null when the pull request came from a fork that was deleted since.
        head: { sha: string; ref: string; repo: { full_name: string } | null }
        base: { sha: string; ref: string }
      }
    },

    // The open pull request whose head is `branch` in this repository, or null.
    async openPullRequest(branch: string) {
      const owner = repository.split("/")[0]
      const path = `/repos/${repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`
      const pulls = (await (await request(path)).json()) as { number: number }[]
      return pulls[0]?.number ?? null
    },

    // The pull requests a commit belongs to, up to one page: those whose head it is and those it is merged into.
    async commitPullRequests(sha: string) {
      return (await (await request(`/repos/${repository}/commits/${sha}/pulls?per_page=100`)).json()) as CommitPullRequest[]
    },

    async description() {
      const repo = (await (await request(`/repos/${repository}`)).json()) as { description: string | null }
      return repo.description
    },

    // The repository's "Automatically delete head branches" setting.
    async deletesHeadOnMerge() {
      const repo = (await (await request(`/repos/${repository}`)).json()) as { delete_branch_on_merge: boolean }
      return repo.delete_branch_on_merge
    },

    // How many open pull requests merge into `base`, up to one page.
    async openPullRequestsOnto(base: string) {
      const path = `/repos/${repository}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=100`
      return ((await (await request(path)).json()) as unknown[]).length
    },

    // False when the branch is gone already, as after a merge with MERGE_TOKEN, which GitHub's own setting deletes.
    // GitHub answers 422 both for a branch that does not exist and for one it refuses to delete, such as a protected
    // one, so a 422 counts as gone only when reading the branch then answers 404.
    async deleteBranch(branch: string) {
      const ref = `heads/${branch.split("/").map(encodeURIComponent).join("/")}`
      const path = `/repos/${repository}/git/refs/${ref}`
      const response = await send(path, { method: "DELETE", headers: { ...headers, accept: "application/vnd.github+json" } })
      if (response.ok) return true
      if (response.status === 422) {
        const lookup = await send(`/repos/${repository}/git/ref/${ref}`, { headers: { ...headers, accept: "application/vnd.github+json" } })
        if (lookup.status === 404) return false
      }
      throw new Error(`GitHub answered ${response.status} for DELETE ${path}`)
    },

    changedFiles(number: number, maxItems: number) {
      return paginate<ChangedFile>(`/repos/${repository}/pulls/${number}/files`, maxItems)
    },

    async parents(sha: string) {
      const commit = (await (await request(`/repos/${repository}/commits/${sha}`)).json()) as { parents: { sha: string }[] }
      return commit.parents.map((parent) => parent.sha)
    },

    async compare(from: string, to: string) {
      const path = `/repos/${repository}/compare/${encodeURIComponent(from)}...${encodeURIComponent(to)}`
      return (await (await request(path)).json()) as { status: string; files: ComparedFile[] }
    },

    async addLabel(number: number, label: string) {
      await request(`/repos/${repository}/issues/${number}/labels`, { method: "POST", body: JSON.stringify({ labels: [label] }) })
    },

    async removeLabel(number: number, label: string) {
      await request(`/repos/${repository}/issues/${number}/labels/${encodeURIComponent(label)}`, { method: "DELETE" })
    },

    async workflowRun(id: number) {
      return (await (await request(`/repos/${repository}/actions/runs/${id}`)).json()) as WorkflowRun
    },

    workflowRuns(sha: string) {
      return paginateWrapped<WorkflowRun>(`/repos/${repository}/actions/runs?head_sha=${sha}`, "workflow_runs")
    },

    checkRuns(sha: string) {
      return paginateWrapped<CheckRun>(`/repos/${repository}/commits/${sha}/check-runs`, "check_runs")
    },

    // The check runs of that name on a commit.
    checkRunsNamed(sha: string, name: string) {
      return paginateWrapped<ReviewerCheck>(`/repos/${repository}/commits/${sha}/check-runs?check_name=${encodeURIComponent(name)}`, "check_runs")
    },

    statuses(sha: string) {
      return paginateWrapped<ReviewerStatus>(`/repos/${repository}/commits/${sha}/status`, "statuses")
    },

    // A user's role in the repository: admin, maintain, write, triage or read, or empty for none. GitHub answers 200
    // for a user who is no collaborator too, with read on a public repository and empty on a private one.
    async role(login: string) {
      const answer = (await (await request(`/repos/${repository}/collaborators/${encodeURIComponent(login)}/permission`)).json()) as { role_name: string }
      return answer.role_name
    },

    // Merges only while the head is still the given commit; GitHub refuses the merge once it moved on. Answers the
    // merge commit.
    async merge(number: number, sha: string, method: string) {
      const path = `/repos/${repository}/pulls/${number}/merge`
      const answer = (await (await request(path, { method: "PUT", body: JSON.stringify({ sha, merge_method: method }) })).json()) as { sha: string }
      return answer.sha
    },

    // Moves a branch to a commit only when that is a fast-forward: with force false GitHub refuses any other move.
    async updateBranch(branch: string, sha: string) {
      const path = `/repos/${repository}/git/refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}`
      await request(path, { method: "PATCH", body: JSON.stringify({ sha, force: false }) })
    },

    // Sends a repository_dispatch event. A refusal throws with GitHub's answer, which says why.
    async dispatch(eventType: string, payload: Record<string, unknown>) {
      const path = `/repos/${repository}/dispatches`
      const response = await send(path, {
        method: "POST",
        headers: { ...headers, accept: "application/vnd.github+json" },
        body: JSON.stringify({ event_type: eventType, client_payload: payload }),
      })
      if (!response.ok) throw new Error(`GitHub answered ${response.status} for POST ${path}: ${await response.text()}`)
    },

    // Starts a workflow that has a workflow_dispatch trigger, by its file name, on a branch.
    async dispatchWorkflow(workflow: string, ref: string) {
      const path = `/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`
      await request(path, { method: "POST", body: JSON.stringify({ ref }) })
    },

    // Every review thread of a pull request, with its first comment. A GraphQL answer with errors throws, as GitHub
    // answers 200 to it.
    async reviewThreads(number: number) {
      const [owner, name] = repository.split("/")
      const threads: ReviewThread[] = []
      let after: string | null = null
      do {
        const body = JSON.stringify({ query: reviewThreadsQuery, variables: { owner, name, number, after } })
        const answer = (await (await request("/graphql", { method: "POST", body })).json()) as {
          errors?: unknown[]
          data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ReviewThread[] } } } }
        }
        if (answer.errors) throw new Error(`GitHub answered GraphQL errors for the review threads of #${number}`)
        const page = answer.data.repository.pullRequest.reviewThreads
        threads.push(...page.nodes)
        after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
      } while (after)
      return threads
    },

    reviewComment,

    async upsertComment(number: number, marker: string, body: string) {
      const existing = await reviewComment(number, marker)
      const init = { method: existing ? "PATCH" : "POST", body: JSON.stringify({ body }) }
      const path = existing
        ? `/repos/${repository}/issues/comments/${existing.id}`
        : `/repos/${repository}/issues/${number}/comments`
      await request(path, init)
    },
  }
}
