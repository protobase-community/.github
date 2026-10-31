// The GitHub REST calls a review and its auto-merge make. They read the pull request as data; the review writes only
// its one comment and the approval label, and the auto-merge only merges.
import type { ComparedFile } from "./approval"
import type { CheckRun, CommitStatus, WorkflowRun } from "./checks"
import type { ChangedFile } from "./pull-request"

const api = "https://api.github.com"

export function gitHub(token: string, repository: string) {
  const headers = { authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" }

  async function request(path: string, init: RequestInit = {}, accept = "application/vnd.github+json") {
    const response = await fetch(`${api}${path}`, { ...init, headers: { ...headers, accept, ...init.headers } })
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
    const response = await fetch(`${api}/repos/${repo}/contents/${encoded}${query}`, {
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
        head: { sha: string; repo: { full_name: string } | null }
        base: { sha: string; ref: string }
      }
    },

    async description() {
      const repo = (await (await request(`/repos/${repository}`)).json()) as { description: string | null }
      return repo.description
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

    statuses(sha: string) {
      return paginateWrapped<CommitStatus>(`/repos/${repository}/commits/${sha}/status`, "statuses")
    },

    // A user's role in the repository: admin, maintain, write, triage or read, or empty for none. GitHub answers 200
    // for a user who is no collaborator too, with read on a public repository and empty on a private one.
    async role(login: string) {
      const answer = (await (await request(`/repos/${repository}/collaborators/${encodeURIComponent(login)}/permission`)).json()) as { role_name: string }
      return answer.role_name
    },

    // Merges only while the head is still the given commit; GitHub refuses the merge once it moved on.
    async merge(number: number, sha: string, method: string) {
      await request(`/repos/${repository}/pulls/${number}/merge`, { method: "PUT", body: JSON.stringify({ sha, merge_method: method }) })
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
