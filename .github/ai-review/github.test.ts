import { afterEach, describe, expect, test } from "bun:test"
import { gitHub } from "./github"

const realFetch = globalThis.fetch
const sent: { url: string; method: string }[] = []

// Answers each request with the next status in turn, the body naming the status.
function answer(...statuses: number[]) {
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    sent.push({ url, method: init.method ?? "GET" })
    const status = statuses.shift() ?? 200
    return new Response(status === 204 ? null : JSON.stringify({ status }), { status })
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
  sent.length = 0
})

const github = () => gitHub("token", "o/r", 0)

describe("gitHub", () => {
  test("a GET that GitHub answers 500 once is sent again and answers the second body", async () => {
    answer(500, 200)
    expect(await github().fileAt("AGENTS.md", "abc")).toBe(JSON.stringify({ status: 200 }))
    expect(sent).toHaveLength(2)
  })

  test("each transient server error is retried once", async () => {
    for (const status of [500, 502, 503, 504]) {
      answer(status, 200)
      expect(await github().description()).toBeUndefined()
    }
    expect(sent).toHaveLength(8)
  })

  test("a GET that GitHub answers 500 twice throws naming the status", async () => {
    answer(500, 500)
    await expect(github().fileAt("AGENTS.md", "abc")).rejects.toThrow("GitHub answered 500 for AGENTS.md at abc in o/r")
    expect(sent).toHaveLength(2)
  })

  test("a request that GitHub answers 503 twice throws naming the status", async () => {
    answer(503, 503)
    await expect(github().pullRequest(7)).rejects.toThrow("GitHub answered 503 for GET /repos/o/r/pulls/7")
    expect(sent).toHaveLength(2)
  })

  test("a file GitHub answers 404 for is null without a retry", async () => {
    answer(404)
    expect(await github().fileAt("AGENTS.md", "abc")).toBeNull()
    expect(sent).toHaveLength(1)
  })

  test("a 4xx is not retried", async () => {
    answer(403)
    await expect(github().pullRequest(7)).rejects.toThrow("GitHub answered 403 for GET /repos/o/r/pulls/7")
    expect(sent).toHaveLength(1)
  })

  test("a write that GitHub answers 500 is not sent again", async () => {
    answer(500)
    await expect(github().addLabel(7, "ai-approved")).rejects.toThrow("GitHub answered 500 for POST /repos/o/r/issues/7/labels")
    expect(sent).toEqual([{ url: "https://api.github.com/repos/o/r/issues/7/labels", method: "POST" }])
  })
})
