import { describe, expect, test } from "bun:test"
import { mergeAndDispatch } from "./merge-dispatch"

const pullRequest = { number: 7, sha: "abcdef0123", base: "main" }

function fakes(options: { mergeFails?: boolean; dispatchFails?: boolean } = {}) {
  const calls: string[] = []
  const merger = {
    async merge(number: number, sha: string, method: string) {
      if (options.mergeFails) throw new Error("GitHub answered 409")
      calls.push(`merge ${number} ${sha} ${method}`)
      return "merged0123"
    },
  }
  const dispatcher = {
    async dispatchWorkflow(workflow: string, ref: string) {
      if (options.dispatchFails) throw new Error("GitHub answered 403")
      calls.push(`dispatch ${workflow} ${ref}`)
    },
  }
  return { calls, merger, dispatcher }
}

const quiet = () => {}

describe("mergeAndDispatch", () => {
  test("starts the named workflow on the base branch after the merge", async () => {
    const { calls, merger, dispatcher } = fakes()
    expect(await mergeAndDispatch(merger, dispatcher, pullRequest, "squash", "release.yml", quiet)).toBe("merged0123")
    expect(calls).toEqual(["merge 7 abcdef0123 squash", "dispatch release.yml main"])
  })

  test("starts nothing without a workflow", async () => {
    const { calls, merger, dispatcher } = fakes()
    expect(await mergeAndDispatch(merger, dispatcher, pullRequest, "squash", "", quiet)).toBe("merged0123")
    expect(calls).toEqual(["merge 7 abcdef0123 squash"])
  })

  test("starts nothing when the merge did not happen", async () => {
    const { calls, merger, dispatcher } = fakes({ mergeFails: true })
    await expect(mergeAndDispatch(merger, dispatcher, pullRequest, "squash", "release.yml", quiet)).rejects.toThrow("409")
    expect(calls).toEqual([])
  })

  test("fails after the merge when the dispatch fails", async () => {
    const { calls, merger, dispatcher } = fakes({ dispatchFails: true })
    const lines: string[] = []
    await expect(mergeAndDispatch(merger, dispatcher, pullRequest, "squash", "release.yml", (line) => lines.push(line))).rejects.toThrow("403")
    expect(calls).toEqual(["merge 7 abcdef0123 squash"])
    expect(lines).toEqual(["Merged abcdef0 with squash."])
  })
})
