import { describe, expect, test } from "bun:test"
import { approvedSha, isClean, marker, reviewComment, skipComment } from "./comment"
import { limits } from "./settings"

describe("reviewComment", () => {
  test("starts with the marker and names the model and the commit", () => {
    const body = reviewComment("0123456789abcdef", "No issues found.")
    expect(body).toStartWith(marker)
    expect(body).toContain("by `qwen3.6-35b-a3b` on Scaleway")
    expect(body).toContain("of 0123456")
    expect(body).toContain("An AI wrote this comment")
    expect(body).toEndWith("No issues found.")
  })

  test("cuts off an answer longer than a comment may be", () => {
    const body = reviewComment("0123456", "x".repeat(limits.maxCommentChars + 10))
    expect(body).toEndWith("(cut off)")
  })
})

describe("skipComment", () => {
  test("says why the pull request was not reviewed", () => {
    expect(skipComment("0123456", "too large.")).toEndWith("Not reviewed: too large.")
  })
})

describe("isClean", () => {
  test("is the answer that there are no issues", () => {
    expect(isClean(" No issues found.\n")).toBe(true)
    expect(isClean("no issues found")).toBe(true)
  })

  test("is not any other answer", () => {
    expect(isClean("")).toBe(false)
    expect(isClean("No issues found, except one: High, a.ts:1 ...")).toBe(false)
  })
})

describe("approvedSha", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567"

  test("is the reviewed commit of a review that found no issues", () => {
    expect(approvedSha(reviewComment(sha, "No issues found."))).toBe(sha)
  })

  test("is null for a review with findings, a skipped review or another comment", () => {
    expect(approvedSha(reviewComment(sha, "High, a.ts:1, broken."))).toBeNull()
    expect(approvedSha(skipComment(sha, "too large."))).toBeNull()
    expect(approvedSha(`<!-- reviewed ${sha} clean -->`)).toBeNull()
  })
})
