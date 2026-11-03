import { afterEach, describe, expect, test } from "bun:test"
import { gitHub } from "./github"

const realFetch = globalThis.fetch
const noWait = async () => {}

// Stubs fetch with the given statuses in turn and counts the requests; a 200 answers `body`.
function answers(statuses: number[], body = "text") {
  const calls = { count: 0 }
  globalThis.fetch = (async () => {
    const status = statuses[calls.count++]
    return new Response(status === 200 ? body : "", { status })
  }) as unknown as typeof fetch
  return calls
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("fileAt", () => {
  test("reads again once after a transient 5xx", async () => {
    const calls = answers([503, 200])
    expect(await gitHub("t", "o/r", noWait).fileAt("a.ts", "abc")).toBe("text")
    expect(calls.count).toBe(2)
  })

  test("throws when the second read gets a 5xx too", async () => {
    const calls = answers([500, 504])
    await expect(gitHub("t", "o/r", noWait).fileAt("a.ts", "abc")).rejects.toThrow("GitHub answered 504 for a.ts at abc in o/r")
    expect(calls.count).toBe(2)
  })

  test("answers null for a 404 without reading again", async () => {
    const calls = answers([404, 200])
    expect(await gitHub("t", "o/r", noWait).fileAt("a.ts", "abc")).toBeNull()
    expect(calls.count).toBe(1)
  })

  test("throws for a 403 without reading again", async () => {
    const calls = answers([403, 200])
    await expect(gitHub("t", "o/r", noWait).fileAt("a.ts", "abc")).rejects.toThrow("GitHub answered 403")
    expect(calls.count).toBe(1)
  })
})

describe("request", () => {
  test("reads again once after a transient 5xx", async () => {
    const calls = answers([502, 200], JSON.stringify({ description: "d" }))
    expect(await gitHub("t", "o/r", noWait).description()).toBe("d")
    expect(calls.count).toBe(2)
  })

  test("throws when the second read gets a 5xx too", async () => {
    const calls = answers([500, 500])
    await expect(gitHub("t", "o/r", noWait).description()).rejects.toThrow("GitHub answered 500 for GET /repos/o/r")
    expect(calls.count).toBe(2)
  })

  test("does not send a write again after a 5xx", async () => {
    const calls = answers([500, 200])
    await expect(gitHub("t", "o/r", noWait).addLabel(1, "l")).rejects.toThrow("GitHub answered 500 for POST")
    expect(calls.count).toBe(1)
  })
})
