import { describe, expect, test } from "bun:test"
import { isClean, marker, noIssuesComment, reviewComment, skipComment } from "./comment"
import { limits } from "./settings"

describe("reviewComment", () => {
  test("starts with the marker and names the model and the commit", () => {
    const body = reviewComment("0123456789abcdef", "No issues found.")
    expect(body).toStartWith(marker)
    expect(body).toContain("by `qwen3.6-35b-a3b`, of 0123456")
    expect(body).not.toContain("Scaleway")
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

describe("noIssuesComment", () => {
  test("says the head has no issues, so earlier findings do not linger", () => {
    const body = noIssuesComment("0123456789abcdef")
    expect(body).toStartWith(marker)
    expect(body).toEndWith("No issues found at the head 0123456; this replaces the earlier review.")
  })
})
