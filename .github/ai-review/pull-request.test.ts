import { describe, expect, test } from "bun:test"
import { buildUserMessage, contentPaths, fitUserMessage, omittedFiles, reviewedFiles } from "./pull-request"

const files = [
  { filename: "src/app.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" },
  { filename: "README.md", status: "modified", patch: "@@ -1 +1 @@\n-x\n+y" },
  { filename: "src/old.ts", status: "removed", patch: "@@ -1 +0,0 @@\n-gone" },
  { filename: "bun.lock", status: "modified", patch: "@@ -1 +1 @@\n-1\n+2" },
  { filename: "db/recordings/q.sql.json", status: "added", patch: "@@ -0,0 +1 @@\n+{}" },
  { filename: "logo.png", status: "added" },
]

describe("reviewedFiles", () => {
  test("leaves out generated files and files without a patch", () => {
    expect(reviewedFiles(files).map((file) => file.filename)).toEqual(["src/app.ts", "README.md", "src/old.ts"])
  })
})

describe("contentPaths", () => {
  test("sends the contents of changed code, not docs or deletions", () => {
    expect(contentPaths(files)).toEqual(["src/app.ts"])
  })
})

describe("omittedFiles", () => {
  test("names every changed file the diff leaves out", () => {
    expect(omittedFiles(files)).toEqual(["bun.lock", "db/recordings/q.sql.json", "logo.png"])
  })
})

describe("buildUserMessage", () => {
  const message = buildUserMessage(
    { title: "fix: the thing", body: null },
    files,
    new Map([["src/app.ts", "b\n"]]),
    ["src/big.ts"],
    [],
  )

  test("holds the title, the diff, the omitted files and the contents", () => {
    expect(message).toContain("## Title\n\nfix: the thing")
    expect(message).toContain("## Description\n\n(none)")
    expect(message).toContain("diff --git a/src/app.ts b/src/app.ts (modified)\n@@ -1 +1 @@\n-a\n+b")
    expect(message).not.toContain("diff --git a/bun.lock")
    expect(message).toContain("- logo.png")
    expect(message).toContain("- src/big.ts")
    expect(message).toContain("### src/app.ts\n\n```\nb\n\n```")
    expect(message).not.toContain("## Contents left out to fit")
  })
})

describe("fitUserMessage", () => {
  const pullRequest = { title: "feat: three files", body: null }
  const code = [
    { filename: "src/a.ts", status: "modified", patch: "@@ -1 +1 @@\n-a\n+A" },
    { filename: "src/b.ts", status: "modified", patch: "@@ -1 +1 @@\n-b\n+B" },
    { filename: "src/c.ts", status: "added", patch: "@@ -0,0 +1 @@\n+C" },
  ]
  const contents = new Map([
    ["src/a.ts", "a".repeat(1000)],
    ["src/b.ts", "b".repeat(3000)],
    ["src/c.ts", "c".repeat(2000)],
  ])
  const whole = buildUserMessage(pullRequest, code, contents, [], [])
  const diffOnly = buildUserMessage(pullRequest, code, new Map(), [], ["src/b.ts", "src/c.ts", "src/a.ts"])

  test("sends everything when it fits", () => {
    expect(fitUserMessage(pullRequest, code, contents, [], whole.length)).toEqual({ message: whole, leftOut: [] })
  })

  test("leaves out the largest contents first, keeps the whole diff and names what is diff only", () => {
    const { message, leftOut } = fitUserMessage(pullRequest, code, contents, [], whole.length - 1000)
    expect(leftOut).toEqual(["src/b.ts"])
    expect(message.length).toBeLessThanOrEqual(whole.length - 1000)
    for (const file of code) expect(message).toContain(file.patch)
    expect(message).toContain("## Contents left out to fit")
    expect(message).toContain("- src/b.ts")
    expect(message).not.toContain("### src/b.ts")
    expect(message).toContain("### src/a.ts")
    expect(message).toContain("### src/c.ts")
  })

  test("leaves out more contents until it fits", () => {
    expect(fitUserMessage(pullRequest, code, contents, [], whole.length - 4000).leftOut).toEqual(["src/b.ts", "src/c.ts"])
  })

  test("sends the diff alone when only that fits", () => {
    expect(fitUserMessage(pullRequest, code, contents, [], diffOnly.length)).toEqual({
      message: diffOnly,
      leftOut: ["src/b.ts", "src/c.ts", "src/a.ts"],
    })
  })

  test("stays above the cap only when the diff alone is above it, for the caller to skip", () => {
    const { message } = fitUserMessage(pullRequest, code, contents, [], diffOnly.length - 1)
    expect(message).toBe(diffOnly)
  })
})
