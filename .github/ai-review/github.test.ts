import { afterEach, describe, expect, test } from "bun:test"
import { gitHub } from "./github"

const pull = { title: "t", body: null, state: "open", draft: false, user: { login: "u" }, labels: [], changed_files: 1, head: { sha: "h", ref: "topic", repo: null }, base: { sha: "b", ref: "main" } }

function answering(...statuses: number[]) {
  const methods: string[] = []
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    methods.push(init.method ?? "GET")
    const status = statuses[methods.length - 1]
    return new Response(status === 200 ? JSON.stringify(pull) : null, { status })
  }) as unknown as typeof fetch
  return methods
}

describe("request", () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test("tries a GET once more after a 503 and answers the 200 that follows", async () => {
    const calls = answering(503, 200)
    expect(await gitHub("token", "owner/name", 0).pullRequest(105)).toEqual(pull)
    expect(calls).toEqual(["GET", "GET"])
  })

  test("throws when the GET answers 503 twice", async () => {
    const calls = answering(503, 503)
    await expect(gitHub("token", "owner/name", 0).pullRequest(105)).rejects.toThrow("GitHub answered 503 for GET /repos/owner/name/pulls/105")
    expect(calls).toEqual(["GET", "GET"])
  })

  test("throws on a 404 without trying again", async () => {
    const calls = answering(404)
    await expect(gitHub("token", "owner/name", 0).pullRequest(105)).rejects.toThrow("GitHub answered 404 for GET /repos/owner/name/pulls/105")
    expect(calls).toEqual(["GET"])
  })

  test("does not try a write again after a 503", async () => {
    const calls = answering(503)
    await expect(gitHub("token", "owner/name", 0).addLabel(105, "ai-approved")).rejects.toThrow("GitHub answered 503 for POST /repos/owner/name/issues/105/labels")
    expect(calls).toEqual(["POST"])
  })
})
