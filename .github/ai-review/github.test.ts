import { afterEach, describe, expect, test } from "bun:test"
import { gitHub, MergeRefused } from "./github"

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

  test("a pull request GitHub answers 422 for is read again once and answers the second body", async () => {
    answer(422, 200)
    expect(await github().pullRequest(7)).toEqual({ status: 200 })
    expect(sent).toEqual([
      { url: "https://api.github.com/repos/o/r/pulls/7", method: "GET" },
      { url: "https://api.github.com/repos/o/r/pulls/7", method: "GET" },
    ])
  })

  test("a pull request GitHub answers 422 for twice throws naming the status", async () => {
    answer(422, 422)
    await expect(github().pullRequest(7)).rejects.toThrow("GitHub answered 422 for GET /repos/o/r/pulls/7")
    expect(sent).toHaveLength(2)
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

describe("merge", () => {
  test("answers the merge commit", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ sha: "m1" }))) as unknown as typeof fetch
    expect(await github().merge(115, "c39c3f3", "squash")).toBe("m1")
  })

  test("a 405 throws MergeRefused with the review decision and merge state, without a retry", async () => {
    const state = { data: { repository: { pullRequest: { reviewDecision: "CHANGES_REQUESTED", mergeStateStatus: "BLOCKED" } } } }
    const answers = [new Response("{}", { status: 405 }), new Response(JSON.stringify(state))]
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      sent.push({ url, method: init.method ?? "GET" })
      return answers.shift()
    }) as typeof fetch
    const refused = github().merge(115, "c39c3f3", "squash")
    await expect(refused).rejects.toBeInstanceOf(MergeRefused)
    await expect(refused).rejects.toMatchObject({ number: 115, reviewDecision: "CHANGES_REQUESTED", mergeStateStatus: "BLOCKED" })
    await expect(refused).rejects.toThrow("GitHub refused to merge #115: its review decision is CHANGES_REQUESTED and its merge state BLOCKED")
    expect(sent.map((request) => request.method)).toEqual(["PUT", "POST"])
  })

  test("another refusal throws naming the status and GitHub's answer", async () => {
    answer(403)
    await expect(github().merge(115, "c39c3f3", "squash")).rejects.toThrow('GitHub answered 403 for PUT /repos/o/r/pulls/115/merge: {"status":403}')
  })
})

describe("reviewThreads", () => {
  const page = (nodes: unknown[], endCursor: string | null) =>
    JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes } } } } })

  test("reads every page, and sends a query GitHub answers 502 once again", async () => {
    const answers = [new Response("{}", { status: 502 }), new Response(page([{ path: "a" }], "c1")), new Response(page([{ path: "b" }], null))]
    const sentBodies: string[] = []
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      sent.push({ url, method: init.method ?? "GET" })
      sentBodies.push(String(init.body))
      return answers.shift()
    }) as typeof fetch
    expect(await github().reviewThreads(7)).toEqual([{ path: "a" }, { path: "b" }] as never)
    expect(sent.map((request) => request.method)).toEqual(["POST", "POST", "POST"])
    expect(JSON.parse(sentBodies[2]).variables).toEqual({ owner: "o", name: "r", number: 7, after: "c1" })
  })

  test("an answer with GraphQL errors throws", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ errors: [{ message: "x" }], data: null }))) as unknown as typeof fetch
    await expect(github().reviewThreads(7)).rejects.toThrow("GitHub answered GraphQL errors for the review threads of #7")
  })
})
