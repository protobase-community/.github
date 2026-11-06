import { describe, expect, test } from "bun:test"
import { mergeAndDispatch } from "./merge-dispatch"

const pullRequest = { number: 7, sha: "abcdef0123", base: "main" }

function fakes(options: { mergeFails?: boolean; dispatchFails?: boolean; refuses?: string } = {}) {
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
      if (options.dispatchFails || options.refuses === workflow) throw new Error("GitHub answered 403")
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

  test.each(["release.yml deploy.yml", "release.yml, deploy.yml", "release.yml,deploy.yml", "\nrelease.yml\ndeploy.yml\n"])(
    "starts every workflow named in %j",
    async (workflows) => {
      const { calls, merger, dispatcher } = fakes()
      const lines: string[] = []
      await mergeAndDispatch(merger, dispatcher, pullRequest, "squash", workflows, (line) => lines.push(line))
      expect(calls).toEqual(["merge 7 abcdef0123 squash", "dispatch release.yml main", "dispatch deploy.yml main"])
      expect(lines.slice(1)).toEqual(["Started release.yml on main.", "Started deploy.yml on main."])
    },
  )

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

  test.each(["release.yml", "deploy.yml"])("still starts the other workflow and fails when %s is refused", async (refuses) => {
    const { calls, merger, dispatcher } = fakes({ refuses })
    const other = refuses === "release.yml" ? "deploy.yml" : "release.yml"
    const run = mergeAndDispatch(merger, dispatcher, pullRequest, "squash", "release.yml deploy.yml", quiet)
    await expect(run).rejects.toThrow(`Could not start ${refuses}: Error: GitHub answered 403`)
    expect(calls).toEqual(["merge 7 abcdef0123 squash", `dispatch ${other} main`])
  })

  test("names every refused workflow", async () => {
    const { merger, dispatcher } = fakes({ dispatchFails: true })
    const run = mergeAndDispatch(merger, dispatcher, pullRequest, "squash", "release.yml deploy.yml", quiet)
    await expect(run).rejects.toThrow(/release\.yml: .*403; deploy\.yml: .*403/)
  })
})
