import { expect, test } from "bun:test"
import { backlog, releaseTaskId } from "./backlog"

const url = "https://backlog.example.com"
const head = "a".repeat(40)

// A stand-in of the backlog's API: the sign-in, the token and a few records, each call kept.
function fakeBacklog() {
  const calls: string[] = []
  const tasks = new Set<string>()
  const requests = new Map<number, Record<string, unknown>>()
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  const fetchFn = (async (input: string, init: RequestInit = {}) => {
    const path = input.slice(url.length)
    const method = init.method ?? "GET"
    calls.push(`${method} ${path}`)
    if (path === "/api/auth/sign-in/email") return new Response("{}", { headers: { "set-cookie": "session=s1; Path=/; HttpOnly" } })
    if (path === "/api/auth/token") return (init.headers as Record<string, string>).cookie === "session=s1" ? json({ token: "t1" }) : json({}, 401)
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t1")
    const task = /^\/api\/v1\/tasks\/(.+)$/.exec(path)
    if (task) return tasks.has(decodeURIComponent(task[1]!)) ? json({ id: task[1] }) : json({}, 404)
    if (path === "/api/v1/tasks" && method === "POST") {
      tasks.add(JSON.parse(init.body as string).id)
      return json({}, 201)
    }
    if (path === "/api/v1/task_preconditions" && method === "POST") {
      const id = requests.size + 1
      requests.set(id, { ...JSON.parse(init.body as string), state: "waiting", conclusion: null })
      return json({ id }, 201)
    }
    const request = /^\/api\/v1\/task_preconditions\/(\d+)$/.exec(path)
    if (request) {
      const record = requests.get(Number(request[1]))
      if (!record) return json({}, 404)
      if (method === "PATCH") Object.assign(record, JSON.parse(init.body as string))
      return json(record)
    }
    return json({}, 500)
  }) as typeof fetch
  return { calls, requests, fetchFn }
}

test("names a repository's release task", () => {
  expect(releaseTaskId("PrototeamHQ/protobase-cloud")).toBe("release-PrototeamHQ-protobase-cloud")
  expect(releaseTaskId("protobase-community/.github")).toBe("release-protobase-community-.github")
})

test("creates the release task once, asks, reads the request and updates its text", async () => {
  const fake = fakeBacklog()
  const client = await backlog(url, "release@example.com", "secret", fake.fetchFn)
  const task = await client.ensureTask("PrototeamHQ/protobase-cloud", "https://github.com/PrototeamHQ/protobase-cloud/pull/6")
  await client.ensureTask("PrototeamHQ/protobase-cloud", "https://github.com/PrototeamHQ/protobase-cloud/pull/6")
  expect(fake.calls.filter((call) => call === "POST /api/v1/tasks")).toHaveLength(1)

  const id = await client.ask(task, { reason: "Release aaaaaaa?", why: `Commit: ${head}`, plan: "- aaaaaaa A change" })
  expect(fake.requests.get(id)).toMatchObject({ task_id: task, kind: "manual", waits_on: "captain" })
  expect(await client.request(id)).toEqual({
    id, state: "waiting", conclusion: null, sha: head, text: { reason: "Release aaaaaaa?", why: `Commit: ${head}`, plan: "- aaaaaaa A change" },
  })

  await client.update(id, { reason: "Release bbbbbbb?", why: `Commit: ${"b".repeat(40)}`, plan: "- bbbbbbb B" })
  expect(await client.request(id)).toMatchObject({ sha: "b".repeat(40), text: { reason: "Release bbbbbbb?", plan: "- bbbbbbb B" } })
  expect(await client.request(99)).toBeNull()
  expect(client.link(id)).toBe(`${url}/task_preconditions/${id}`)
})

test("fails a run whose sign-in is refused", async () => {
  const refuse = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch
  expect(backlog(url, "release@example.com", "wrong", refuse)).rejects.toThrow("The backlog answered 401 to the sign-in of release@example.com")
})
