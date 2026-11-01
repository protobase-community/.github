// The GitHub REST calls a release run makes beyond the AI review's (../ai-review/github.ts): the commits development
// brings, the pull request each came through, the draft release, moving the default branch and starting the deploy.
import { gitHub as reviewGitHub } from "../ai-review/github"
import type { Commit } from "./text"

const api = "https://api.github.com"

export type DraftRelease = { id: number; html_url: string; tag_name: string; target_commitish: string; body: string | null; draft: boolean }
export type MergedPullRequest = { number: number; merged_at: string | null; base: { ref: string }; head: { sha: string } }

export function gitHub(token: string, repository: string) {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }

  async function send(path: string, init: RequestInit = {}) {
    return fetch(`${api}${path}`, { ...init, headers: { ...headers, ...init.headers } })
  }

  async function request(path: string, init: RequestInit = {}) {
    const response = await send(path, init)
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${init.method ?? "GET"} ${path}: ${(await response.text()).slice(0, 300)}`)
    return response
  }

  const json = async <T>(path: string, init: RequestInit = {}) => (await (await request(path, init)).json()) as T
  const body = (value: unknown) => ({ body: JSON.stringify(value) })

  return {
    ...reviewGitHub(token, repository),

    // The commits on `head` that `base` does not have, oldest first, every page of them (the API lists up to 250).
    async commitsAhead(base: string, head: string) {
      const commits: Commit[] = []
      for (let page = 1; ; page++) {
        const path = `/repos/${repository}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?per_page=100&page=${page}`
        const answer = await json<{ commits: { sha: string; commit: { message: string } }[] }>(path)
        commits.push(...answer.commits.map((commit) => ({ sha: commit.sha, subject: commit.commit.message.split("\n")[0] ?? "" })))
        if (answer.commits.length < 100) return commits
      }
    },

    // Whether `ancestor` is `descendant` or one of its ancestors.
    async contains(descendant: string, ancestor: string) {
      const { status } = await json<{ status: string }>(`/repos/${repository}/compare/${ancestor}...${descendant}`)
      return status === "identical" || status === "ahead"
    },

    // The pull requests a commit came through.
    commitPullRequests(sha: string) {
      return json<MergedPullRequest[]>(`/repos/${repository}/commits/${sha}/pulls`)
    },

    async tagExists(tag: string) {
      const response = await send(`/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`)
      if (response.status === 404) return false
      if (!response.ok) throw new Error(`GitHub answered ${response.status} for the tag ${tag}`)
      return true
    },

    // The repository's releases, drafts included (which only a token that may push sees), newest first.
    releases() {
      return json<DraftRelease[]>(`/repos/${repository}/releases?per_page=100`)
    },

    async generatedNotes(tag: string, target: string) {
      return (await json<{ body: string }>(`/repos/${repository}/releases/generate-notes`, { method: "POST", ...body({ tag_name: tag, target_commitish: target }) })).body
    },

    createDraft(tag: string, target: string, name: string, text: string) {
      const draft = { tag_name: tag, target_commitish: target, name, body: text, draft: true }
      return json<DraftRelease>(`/repos/${repository}/releases`, { method: "POST", ...body(draft) })
    },

    async setReleaseBody(id: number, text: string) {
      await request(`/repos/${repository}/releases/${id}`, { method: "PATCH", ...body({ body: text }) })
    },

    // Publishes a draft, which creates its tag at `target`.
    async publish(id: number, target: string) {
      await request(`/repos/${repository}/releases/${id}`, { method: "PATCH", ...body({ draft: false, target_commitish: target, make_latest: "true" }) })
    },

    // Moves `branch` to `sha` when that is a fast-forward, else merges `sha` into it with a merge commit. Answers the
    // branch's new head.
    async advance(branch: string, sha: string, message: string) {
      const forward = await send(`/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", ...body({ sha, force: false }) })
      if (forward.ok) return sha
      if (forward.status !== 422) throw new Error(`GitHub answered ${forward.status} to moving ${branch} to ${sha}`)
      const merge = await json<{ sha: string }>(`/repos/${repository}/merges`, { method: "POST", ...body({ base: branch, head: sha, commit_message: message }) })
      return merge.sha
    },

    // Starts a workflow of this repository on `ref`, as its workflow_dispatch trigger takes it.
    async dispatch(workflow: string, ref: string) {
      await request(`/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, { method: "POST", ...body({ ref }) })
    },
  }
}

export type GitHub = ReturnType<typeof gitHub>
