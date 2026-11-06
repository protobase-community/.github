import { describe, expect, test } from "bun:test"
import { splitIntoParts } from "./parts"
import { type ChangedFile, fitUserMessage } from "./pull-request"
import { limits } from "./settings"

const pullRequest = { title: "feat: the workflow engine", body: "Runs workflows." }
const file = (name: string, patchChars: number): ChangedFile => ({
  filename: name,
  status: "modified",
  patch: `@@ -1 +1 @@\n+${"x".repeat(patchChars)}`,
})
const messagesOf = (split: ReturnType<typeof splitIntoParts>) => {
  if (split.kind !== "parts") throw new Error(`no parts: ${split.kind}`)
  return split.messages
}

describe("splitIntoParts", () => {
  test("a pull request that fits is one part, the message fitUserMessage builds", () => {
    const files = [file("src/a.ts", 1000), file("src/b.ts", 2000), { filename: "bun.lock", status: "modified", patch: "@@" }]
    const contents = new Map([["src/a.ts", "a".repeat(5000)]])
    const split = splitIntoParts(pullRequest, files, contents, ["src/b.ts"], 155_000, 4)
    expect(split).toEqual({ kind: "parts", messages: [fitUserMessage(pullRequest, files, contents, ["src/b.ts"], 155_000).message] })
  })

  test("a 350k diff under a 155k cap is three parts in order, each file in one part and each part within the cap", () => {
    const files = Array.from({ length: 7 }, (_, index) => file(`src/f${index}.ts`, 50_000))
    const contents = new Map(files.map((changed) => [changed.filename, "c".repeat(20_000)]))
    const messages = messagesOf(splitIntoParts(pullRequest, files, contents, [], 155_000, 4))
    expect(messages).toHaveLength(3)
    for (const message of messages) {
      expect(message.length).toBeLessThanOrEqual(155_000)
      expect(message).toContain("## Title\n\nfeat: the workflow engine")
      expect(message).toContain("## Description\n\nRuns workflows.")
    }
    const partOf = files.map((changed) => messages.findIndex((message) => message.includes(`diff --git a/${changed.filename} `)))
    expect(partOf).toEqual([0, 0, 0, 1, 1, 1, 2])
    for (const changed of files) {
      expect(messages.filter((message) => message.includes(`diff --git a/${changed.filename} `))).toHaveLength(1)
    }
  })

  test("a part keeps the contents of its own files that fit, and lists only its own files left out", () => {
    const files = [file("src/a.ts", 100_000), file("src/b.ts", 100_000), { filename: "logo.png", status: "added" }]
    const contents = new Map([["src/b.ts", "b".repeat(10_000)]])
    const messages = messagesOf(splitIntoParts(pullRequest, files, contents, ["src/a.ts"], 155_000, 4))
    expect(messages).toHaveLength(2)
    expect(messages[0]).toContain("- src/a.ts")
    expect(messages[0]).not.toContain("logo.png")
    expect(messages[1]).toContain(`### src/b.ts\n\n\`\`\`\n${"b".repeat(10_000)}`)
    expect(messages[1]).toContain("- logo.png")
  })

  test("a file whose diff alone is above the cap is no split, naming the file and its size", () => {
    const split = splitIntoParts(pullRequest, [file("src/a.ts", 1000), file("src/huge.ts", 200_000)], new Map(), [], 155_000, 4)
    expect(split).toMatchObject({ kind: "file too large", path: "src/huge.ts" })
    if (split.kind === "file too large") expect(split.size).toBeGreaterThan(200_000)
  })

  test("a diff that needs more parts than the cap is no split, naming the count", () => {
    const files = Array.from({ length: 5 }, (_, index) => file(`src/f${index}.ts`, 100_000))
    expect(splitIntoParts(pullRequest, files, new Map(), [], 155_000, 4)).toEqual({ kind: "too many parts", count: 5 })
  })

  test("a 216k diff of many files with contents is two asks, each whole message within the input cap", () => {
    const files = Array.from({ length: 72 }, (_, index) => file(`src/f${index}.ts`, 3000))
    const contents = new Map(files.map((changed) => [changed.filename, "c".repeat(4000)]))
    const messages = messagesOf(splitIntoParts(pullRequest, files, contents, [], limits.maxInputChars, limits.maxParts))
    expect(messages).toHaveLength(2)
    for (const message of messages) expect(message.length).toBeLessThanOrEqual(limits.maxInputChars)
  })

  test("a 110k diff whose contents take it above the input cap is one ask with some contents left out", () => {
    const files = Array.from({ length: 30 }, (_, index) => file(`src/f${index}.ts`, 3600))
    const contents = new Map(files.map((changed) => [changed.filename, "c".repeat(2000)]))
    const messages = messagesOf(splitIntoParts(pullRequest, files, contents, [], limits.maxInputChars, limits.maxParts))
    expect(messages).toHaveLength(1)
    expect(messages[0].length).toBeLessThanOrEqual(limits.maxInputChars)
    expect(messages[0].split("c".repeat(2000)).length - 1).toBeLessThan(files.length)
  })
})
