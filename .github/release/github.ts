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

  // A branch whose rules take changes only through a pull request: `release/<tag>` at `sha`, a pull request of it
  // merged with a merge commit at that head only, and the release branch removed again.
  async function throughPullRequest(branch: string, sha: string, tag: string, message: string) {
    const head = `release/${tag}`
    await request(`/repos/${repository}/git/refs`, { method: "POST", ...body({ ref: `refs/heads/${head}`, sha }) })
    const pull = await json<{ number: number }>(`/repos/${repository}/pulls`, {
      method: "POST",
      ...body({ head, base: branch, title: message, body: `The release ${tag}, which the captain approved in the backlog, at ${sha}.` }),
    })
    const merged = await json<{ sha: string }>(`/repos/${repository}/pulls/${pull.number}/merge`, {
      method: "PUT",
      ...body({ sha, merge_method: "merge", commit_title: message }),
    })
    await request(`/repos/${repository}/git/refs/heads/${encodeURIComponent(head)}`, { method: "DELETE" })
    return merged.sha
  }

  // The branch's head, or null when there is no such branch.
  async function branchHead(branch: string) {
    const response = await send(`/repos/${repository}/branches/${encodeURIComponent(branch)}`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for the branch ${branch}`)
    return ((await response.json()) as { commit: { sha: string } }).commit.sha
  }

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

    // Each change names the tag again, which GitHub otherwise forgets on a draft.
    async setReleaseBody(id: number, tag: string, text: string) {
      await request(`/repos/${repository}/releases/${id}`, { method: "PATCH", ...body({ tag_name: tag, body: text }) })
    },

    // Publishes a draft, which creates its tag at `target`.
    async publish(id: number, tag: string, target: string) {
      const published = { tag_name: tag, draft: false, target_commitish: target, make_latest: "true" }
      await request(`/repos/${repository}/releases/${id}`, { method: "PATCH", ...body(published) })
    },

    branchHead,

    // Moves `branch` forward to `sha`, or creates it there; never backwards or across: GitHub refuses that as no
    // fast-forward.
    async moveBranch(branch: string, sha: string) {
      const moved = await send(`/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", ...body({ sha, force: false }) })
      if (moved.ok) return
      if (moved.status !== 404 && moved.status !== 422) throw new Error(`GitHub answered ${moved.status} to moving ${branch} to ${sha}`)
      if (moved.status === 422 && (await branchHead(branch)) !== null) throw new Error(`${branch} cannot move forward to ${sha}`)
      await request(`/repos/${repository}/git/refs`, { method: "POST", ...body({ ref: `refs/heads/${branch}`, sha }) })
    },

    // The files changed from `base` to `head`, at most 300 as GitHub lists them.
    async changedFiles(base: string, head: string) {
      const { files } = await json<{ files: { filename: string }[] }>(`/repos/${repository}/compare/${base}...${head}`)
      return files.map((file) => file.filename)
    },

    // The repository's published releases, newest first.
    async publishedReleases() {
      return (await json<(DraftRelease & { created_at: string; prerelease: boolean })[]>(`/repos/${repository}/releases?per_page=20`))
        .filter((release) => !release.draft && !release.prerelease)
    },

    // The commit a tag or branch names.
    async commitOf(ref: string) {
      return (await json<{ sha: string }>(`/repos/${repository}/commits/${encodeURIComponent(ref)}`)).sha
    },

    // A published release at `target`, which creates its tag, with GitHub's generated notes.
    async release(tag: string, target: string) {
      const published = { tag_name: tag, target_commitish: target, name: tag, generate_release_notes: true, make_latest: "true" }
      return json<DraftRelease>(`/repos/${repository}/releases`, { method: "POST", ...body(published) })
    },

    // Moves `branch` to `sha` when that is a fast-forward, else merges `sha` into it with a merge commit. A branch whose
    // rules take changes only through a pull request gets one, from `release/<tag>` at `sha`, merged with a merge
    // commit. Answers the branch's new head.
    async advance(branch: string, sha: string, tag: string) {
      const message = `Release ${tag}`
      const forward = await send(`/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", ...body({ sha, force: false }) })
      if (forward.ok) return sha
      if (forward.status !== 422) throw new Error(`GitHub answered ${forward.status} to moving ${branch} to ${sha}`)
      const merge = await send(`/repos/${repository}/merges`, { method: "POST", ...body({ base: branch, head: sha, commit_message: message }) })
      if (merge.ok) return ((await merge.json()) as { sha: string }).sha
      if (merge.status !== 409) throw new Error(`GitHub answered ${merge.status} to merging ${sha} into ${branch}`)
      return throughPullRequest(branch, sha, tag, message)
    },

    // Starts a workflow of this repository on `ref`, as its workflow_dispatch trigger takes it.
    async dispatch(workflow: string, ref: string) {
      await request(`/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, { method: "POST", ...body({ ref }) })
    },
  }
}

export type GitHub = ReturnType<typeof gitHub>
