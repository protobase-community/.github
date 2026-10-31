import { afterEach, describe, expect, test } from "bun:test"
import { gitHub } from "./github"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

// Answers the list of a commit's statuses, newest first, as GitHub lists them.
function statuses(...list: { context: string; state: string; login: string }[]) {
  const body = list.map(({ context, state, login }) => ({ context, state, creator: { login } }))
  globalThis.fetch = (async () => Response.json(body)) as unknown as typeof fetch
}

describe("reviewApproved", () => {
  const github = gitHub("token", "owner/name")

  test("holds when the newest ai-review status from github-actions is a success", async () => {
    statuses({ context: "ai-review", state: "success", login: "github-actions[bot]" }, { context: "ci", state: "failure", login: "github-actions[bot]" })
    expect(await github.reviewApproved("sha")).toBe(true)
  })

  test("does not hold for an ai-review status a person set", async () => {
    statuses({ context: "ai-review", state: "success", login: "someone" })
    expect(await github.reviewApproved("sha")).toBe(false)
  })

  test("follows the newest status from github-actions, not an older success", async () => {
    statuses({ context: "ai-review", state: "failure", login: "github-actions[bot]" }, { context: "ai-review", state: "success", login: "github-actions[bot]" })
    expect(await github.reviewApproved("sha")).toBe(false)
  })

  test("does not hold without any ai-review status", async () => {
    statuses()
    expect(await github.reviewApproved("sha")).toBe(false)
  })
})
