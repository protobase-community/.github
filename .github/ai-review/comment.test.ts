import { describe, expect, test } from "bun:test"
import { marker, reviewComment, skipComment } from "./comment"
import { limits, settings } from "./settings"

describe("reviewComment", () => {
  test("starts with the marker and names the model and the commit", () => {
    const body = reviewComment("0123456789abcdef", "No issues found.")
    expect(body).toStartWith(marker)
    expect(body).toContain(settings.model)
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
