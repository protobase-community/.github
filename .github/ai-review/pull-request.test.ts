import { describe, expect, test } from "bun:test"
import { buildUserMessage, contentPaths, omittedFiles, reviewedFiles } from "./pull-request"

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
  )

  test("holds the title, the diff, the omitted files and the contents", () => {
    expect(message).toContain("## Title\n\nfix: the thing")
    expect(message).toContain("## Description\n\n(none)")
    expect(message).toContain("diff --git a/src/app.ts b/src/app.ts (modified)\n@@ -1 +1 @@\n-a\n+b")
    expect(message).not.toContain("diff --git a/bun.lock")
    expect(message).toContain("- logo.png")
    expect(message).toContain("- src/big.ts")
    expect(message).toContain("### src/app.ts\n\n```\nb\n\n```")
  })
})
