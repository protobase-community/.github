// The backlog app's REST API as the release account uses it (firstmate-backlog's docs/releases.md): the repository's
// release task and the captain's approval requests on it. It signs in once per run: Better Auth's session cookie from
// /api/auth/sign-in/email, traded at /api/auth/token for a bearer token of the app.
import type { Request } from "./decide"
import { requestedSha } from "./text"

type Fetch = typeof fetch

export type RequestText = { reason: string; why: string; plan: string }

export type BacklogTask = { id: string; title: string; status: string; state: string; cancelled: boolean; priority: number | null }

// The release task of a repository: `release-` and its owner and name joined by a dash.
export const releaseTaskId = (repository: string) => `release-${repository.replace("/", "-")}`

export async function backlog(url: string, email: string, password: string, fetchFn: Fetch = fetch) {
  async function send(path: string, init: RequestInit) {
    return fetchFn(`${url}${path}`, { ...init, signal: AbortSignal.timeout(30_000) })
  }

  async function expectOk(response: Response, action: string) {
    if (!response.ok) throw new Error(`The backlog answered ${response.status} to ${action}`)
    return response
  }

  const signIn = await expectOk(
    await send("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: url },
      body: JSON.stringify({ email, password }),
    }),
    `the sign-in of ${email}`,
  )
  const cookie = signIn.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ")
  const { token } = (await (await expectOk(await send("/api/auth/token", { headers: { cookie } }), "the token request")).json()) as { token: string }
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", "if-match": "*" }

  async function api(method: string, path: string, body?: unknown) {
    return send(`/api/v1${path}`, { method, headers, ...(body !== undefined && { body: JSON.stringify(body) }) })
  }

  return {
    // Creates the repository's release task the first time it asks.
    async ensureTask(repository: string, pullRequestUrl: string) {
      const id = releaseTaskId(repository)
      const found = await api("GET", `/tasks/${encodeURIComponent(id)}`)
      if (found.ok) return id
      if (found.status !== 404) throw new Error(`The backlog answered ${found.status} to reading the task ${id}`)
      const task = {
        id,
        title: `Release ${repository}`,
        kind: "release",
        repo: repository,
        body: `The captain's approvals of each release of ${repository} into its default branch, asked by its release workflow (${pullRequestUrl}).`,
      }
      await expectOk(await api("POST", "/tasks", task), `creating the task ${id}`)
      return id
    },

    // A request as the backlog holds it, with its text, or null when there is none of that id the account may read.
    async request(id: number): Promise<(Request & { text: RequestText }) | null> {
      const response = await api("GET", `/task_preconditions/${id}`)
      if (response.status === 404) return null
      const record = (await (await expectOk(response, `reading the request ${id}`)).json()) as RequestText & {
        state: Request["state"]
        conclusion: string | null
      }
      const { reason, why, plan } = record
      return { id, state: record.state, conclusion: record.conclusion, sha: requestedSha(why), text: { reason, why, plan } }
    },

    async ask(taskId: string, text: RequestText) {
      const response = await expectOk(
        await api("POST", "/task_preconditions", { task_id: taskId, kind: "manual", waits_on: "captain", ...text }),
        `asking the captain on ${taskId}`,
      )
      return ((await response.json()) as { id: number }).id
    },

    async update(id: number, text: RequestText) {
      await expectOk(await api("PATCH", `/task_preconditions/${id}`, text), `updating the request ${id}`)
    },

    // Every task the account may read that matches the filter, with the fields the gates read.
    async tasks(filter: string) {
      const found: BacklogTask[] = []
      let token = ""
      do {
        const query = new URLSearchParams({ filter, page_size: "100", ...(token && { page_token: token }) })
        const response = await expectOk(await api("GET", `/tasks?${query}`), `listing the tasks ${filter}`)
        const page = (await response.json()) as { items: BacklogTask[]; next_page_token?: string }
        found.push(...page.items)
        token = page.next_page_token ?? ""
      } while (token)
      return found
    },

    // A task of its own, such as a held promotion's notice for Firstmate; false when one of that id exists already.
    async fileTask(task: { id: string; title: string; repo: string; body: string }) {
      const response = await api("POST", "/tasks", { ...task, kind: "release" })
      if (response.status === 409) return false
      await expectOk(response, `filing the task ${task.id}`)
      return true
    },

    link: (id: number) => `${url}/task_preconditions/${id}`,
  }
}

export type Backlog = Awaited<ReturnType<typeof backlog>>
