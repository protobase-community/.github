// The GitHub REST calls a release run makes beyond the AI review's (../ai-review/github.ts): the commits development
// brings, its one release pull request, its body, and starting the deploy workflow after a merge.
import { gitHub as reviewGitHub } from "../ai-review/github"
import type { Commit } from "./text"

const api = "https://api.github.com"

export type ReleasePullRequest = { number: number; html_url: string; body: string | null; labels: { name: string }[]; head: { sha: string } }

export function gitHub(token: string, repository: string) {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" }
  const owner = repository.split("/")[0]

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${api}${path}`, { ...init, headers: { ...headers, ...init.headers } })
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${init.method ?? "GET"} ${path}: ${(await response.text()).slice(0, 300)}`)
    return response
  }

  return {
    ...reviewGitHub(token, repository),

    // The commits on `head` that `base` does not have, oldest first, every page of them (the API lists up to 250).
    async commitsAhead(base: string, head: string) {
      const commits: Commit[] = []
      for (let page = 1; ; page++) {
        const path = `/repos/${repository}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?per_page=100&page=${page}`
        const answer = (await (await request(path)).json()) as { commits: { sha: string; commit: { message: string } }[] }
        commits.push(...answer.commits.map((commit) => ({ sha: commit.sha, subject: commit.commit.message.split("\n")[0] ?? "" })))
        if (answer.commits.length < 100) return commits
      }
    },

    async branchHead(branch: string) {
      const answer = (await (await request(`/repos/${repository}/branches/${encodeURIComponent(branch)}`)).json()) as { commit: { sha: string } }
      return answer.commit.sha
    },

    // The open pull request from `head` into `base` in this repository, or null.
    async openPullRequest(head: string, base: string) {
      const query = `state=open&head=${encodeURIComponent(`${owner}:${head}`)}&base=${encodeURIComponent(base)}`
      const found = (await (await request(`/repos/${repository}/pulls?${query}`)).json()) as ReleasePullRequest[]
      return found[0] ?? null
    },

    async createPullRequest(head: string, base: string, title: string, body: string) {
      const init = { method: "POST", body: JSON.stringify({ head, base, title, body }) }
      return (await (await request(`/repos/${repository}/pulls`, init)).json()) as ReleasePullRequest
    },

    async setBody(number: number, body: string) {
      await request(`/repos/${repository}/pulls/${number}`, { method: "PATCH", body: JSON.stringify({ body }) })
    },

    // Starts a workflow of this repository on `ref`, as its workflow_dispatch trigger takes it.
    async dispatch(workflow: string, ref: string) {
      const path = `/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`
      await request(path, { method: "POST", body: JSON.stringify({ ref }) })
    },
  }
}

export type GitHub = ReturnType<typeof gitHub>
