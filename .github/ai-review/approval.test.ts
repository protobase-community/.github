import { describe, expect, test } from "bun:test"
import { carriesApproval, type ComparedFile, type History, sameChanges } from "./approval"

const file = (filename: string, sha: string): ComparedFile => ({ filename, status: "modified", sha })

// A history where `merge` merges the base commit `base1` into the approved commit `approved`.
function history(options: { parents?: string[]; onBase?: string; after?: ComparedFile[] } = {}): History {
  const changes = [file("a.ts", "blob-a")]
  return {
    async parents(sha) {
      return sha === "merge" ? (options.parents ?? ["approved", "base1"]) : ["older"]
    },
    async compare(from, to) {
      if (to === "main") return { status: options.onBase ?? "ahead", files: [] }
      if (to === "merge") return { status: "ahead", files: options.after ?? changes }
      return { status: "diverged", files: changes }
    },
  }
}

describe("sameChanges", () => {
  test("is the same files with the same contents in any order", () => {
    expect(sameChanges([file("a", "1"), file("b", "2")], [file("b", "2"), file("a", "1")])).toBe(true)
  })

  test("is not a file with other contents, or one more file", () => {
    expect(sameChanges([file("a", "1")], [file("a", "2")])).toBe(false)
    expect(sameChanges([file("a", "1")], [file("a", "1"), file("b", "2")])).toBe(false)
  })

  test("is not a list the compare API may have cut short", () => {
    const many = Array.from({ length: 300 }, (_, index) => file(`f${index}`, "1"))
    expect(sameChanges(many, many)).toBe(false)
  })
})

describe("carriesApproval", () => {
  const approved = async (sha: string) => sha === "approved"

  test("holds for the reviewed commit itself", async () => {
    expect(await carriesApproval(history(), "approved", approved, "main")).toBe(true)
  })

  test("holds for a merge that only brings the base branch in", async () => {
    expect(await carriesApproval(history(), "merge", approved, "main")).toBe(true)
  })

  test("does not hold for an ordinary new commit", async () => {
    expect(await carriesApproval(history(), "next", approved, "main")).toBe(false)
  })

  test("does not hold when the merged commit is not on the base branch", async () => {
    expect(await carriesApproval(history({ onBase: "diverged" }), "merge", approved, "main")).toBe(false)
  })

  test("does not hold when the merge also changes the pull request's files", async () => {
    expect(await carriesApproval(history({ after: [file("a.ts", "blob-b")] }), "merge", approved, "main")).toBe(false)
  })

  test("does not hold for a merge onto a commit that was never approved", async () => {
    expect(await carriesApproval(history({ parents: ["unreviewed", "base1"] }), "merge", approved, "main")).toBe(false)
  })
})
