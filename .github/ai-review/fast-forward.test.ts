import { describe, expect, test } from "bun:test"
import { landing } from "./fast-forward"
import { mergeAndDispatch } from "./merge-dispatch"

const head = "abcdef0123"
const pullRequest = { number: 7, sha: head, base: "main" }

function fakes(status = "ahead") {
  const calls: string[] = []
  const history = {
    async compare(from: string, to: string) {
      calls.push(`compare ${from} ${to}`)
      return { status }
    },
  }
  const merger = {
    async merge(number: number, sha: string, method: string) {
      calls.push(`merge ${number} ${sha} ${method}`)
      return "merged0123"
    },
    async updateBranch(branch: string, sha: string) {
      calls.push(`move ${branch} to ${sha}`)
    },
  }
  const dispatcher = { async dispatchWorkflow() {} }
  return { calls, history, merger, dispatcher }
}

const quiet = () => {}
const labelled = (...names: string[]) => ({ ...pullRequest, labels: names.map((name) => ({ name })) })

describe("landing", () => {
  test("merges with the caller's method without the fast-forward label", async () => {
    const { calls, history, merger, dispatcher } = fakes()
    const how = await landing(history, merger, labelled("ai-approved"), "squash")
    if (how.kind !== "land") throw new Error(`refused: ${how.kind}`)
    expect(await mergeAndDispatch(how.merger, dispatcher, pullRequest, how.method, "", quiet)).toBe("merged0123")
    expect(calls).toEqual(["merge 7 abcdef0123 squash"])
  })

  test("moves the base to the head and makes no commit when the base is its ancestor", async () => {
    const { calls, history, merger, dispatcher } = fakes("ahead")
    const how = await landing(history, merger, labelled("ai-approved", "fast-forward"), "squash")
    if (how.kind !== "land") throw new Error(`refused: ${how.kind}`)
    expect(await mergeAndDispatch(how.merger, dispatcher, pullRequest, how.method, "", quiet)).toBe(head)
    expect(calls).toEqual(["compare main abcdef0123", "move main to abcdef0123"])
  })

  test("merges nothing and says why when the base is no ancestor of the head", async () => {
    const { calls, history, merger } = fakes("diverged")
    expect(await landing(history, merger, labelled("fast-forward"), "squash")).toEqual({
      kind: "refused",
      reason: "main is not an ancestor of abcdef0 (diverged), so it cannot be fast-forwarded; merge main into the branch first",
    })
    expect(calls).toEqual(["compare main abcdef0123"])
  })
})
