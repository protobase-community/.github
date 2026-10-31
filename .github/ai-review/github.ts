// The GitHub REST calls a review makes. It reads the pull request as data and writes only its one comment.
import type { ChangedFile } from "./pull-request"

const api = "https://api.github.com"

export function gitHub(token: string, repository: string) {
  const headers = { authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" }

  async function request(path: string, init: RequestInit = {}, accept = "application/vnd.github+json") {
    const response = await fetch(`${api}${path}`, { ...init, headers: { ...headers, accept, ...init.headers } })
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for ${init.method ?? "GET"} ${path}`)
    return response
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

  return {
    fileAt,

    async pullRequest(number: number) {
      return (await (await request(`/repos/${repository}/pulls/${number}`)).json()) as {
        title: string
        body: string | null
        changed_files: number
        head: { sha: string }
        base: { sha: string }
      }
    },

    async description() {
      const repo = (await (await request(`/repos/${repository}`)).json()) as { description: string | null }
      return repo.description
    },

    changedFiles(number: number, maxItems: number) {
      return paginate<ChangedFile>(`/repos/${repository}/pulls/${number}/files`, maxItems)
    },

    async upsertComment(number: number, marker: string, body: string) {
      const comments = await paginate<{ id: number; body: string; user: { login: string } }>(
        `/repos/${repository}/issues/${number}/comments`,
        Number.POSITIVE_INFINITY,
      )
      const existing = comments.find((comment) => comment.user.login === "github-actions[bot]" && comment.body.startsWith(marker))
      const init = { method: existing ? "PATCH" : "POST", body: JSON.stringify({ body }) }
      const path = existing
        ? `/repos/${repository}/issues/comments/${existing.id}`
        : `/repos/${repository}/issues/${number}/comments`
      await request(path, init)
    },
  }
}
