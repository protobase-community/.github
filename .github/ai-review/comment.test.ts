import { describe, expect, test } from "bun:test"
import { approvedSha, isClean, marker, reviewComment, skipComment, withMergeNote } from "./comment"
import { analysisThenClean, cleanThenNotes, noneThenLowFinding } from "./comment.answers"
import { limits, settings } from "./settings"

describe("reviewComment", () => {
  test("starts with the marker and names the commit", () => {
    const body = reviewComment("0123456789abcdef", "No issues found.")
    expect(body).toStartWith(marker)
    expect(body).toContain("**AI review** of 0123456.")
    expect(body).toContain("An AI wrote this comment")
    expect(body).toEndWith("No issues found.")
  })

  test("cuts off an answer longer than a comment may be", () => {
    const body = reviewComment("0123456", "x".repeat(limits.maxCommentChars + 10))
    expect(body).toEndWith("(cut off)")
  })
})

describe("a comment's public text", () => {
  // The model and its host are settings, never named in a comment: public text names no other company or product.
  const named = [settings.model, ...new URL(settings.endpoint).hostname.split(".").slice(-2, -1)].map((name) => name.toLowerCase())

  test.each([
    ["a verdict", reviewComment("0123456", "No issues found.")],
    ["findings", reviewComment("0123456", "High, a.ts:1, broken.")],
    ["a non-answer", skipComment("0123456", "the model gave no answer.")],
    ["an empty answer", reviewComment("0123456", "")],
  ])("names neither the model nor its host for %s", (_, body) => {
    for (const name of named) expect(body.toLowerCase()).not.toContain(name)
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

  test("is that answer on a line of its own among the checks the model ran", () => {
    expect(isClean(analysisThenClean)).toBe(true)
    expect(isClean(cleanThenNotes)).toBe(true)
  })

  test("is not an answer with a finding, also when it closes with the verdict", () => {
    expect(isClean("High, a.ts:1, broken.\n\nNo issues found.")).toBe(false)
    expect(isClean("**Medium** - a.ts:1, broken.\nNo issues found.")).toBe(false)
    expect(isClean("No issues found.\n\nSeverity: low, a.ts:1, a typo.")).toBe(false)
    expect(isClean(noneThenLowFinding)).toBe(false)
  })

  test("is not any other answer", () => {
    expect(isClean("")).toBe(false)
    expect(isClean("No issues found, except one: High, a.ts:1 ...")).toBe(false)
    expect(isClean("Some notes.\nNo issues found in a.ts, but b.ts:1 is broken.")).toBe(false)
  })
})

describe("approvedSha", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567"

  test("is the reviewed commit of a review that found no issues", () => {
    expect(approvedSha(reviewComment(sha, "No issues found."))).toBe(sha)
    expect(approvedSha(reviewComment(sha, analysisThenClean))).toBe(sha)
  })

  test("is null for a review with findings, a skipped review or another comment", () => {
    expect(approvedSha(reviewComment(sha, "High, a.ts:1, broken."))).toBeNull()
    expect(approvedSha(skipComment(sha, "too large."))).toBeNull()
    expect(approvedSha(`<!-- reviewed ${sha} clean -->`)).toBeNull()
  })
})

describe("withMergeNote", () => {
  test("adds the note once and replaces an earlier one", () => {
    const body = reviewComment("a".repeat(40), "No issues found.")
    const once = withMergeNote(body, "main moved on")
    expect(once).toBe(`${body}\n\n<!-- merge note -->\n**Not merged:** main moved on.`)
    expect(withMergeNote(once, "main moved on")).toBe(once)
    expect(withMergeNote(once, "other")).toBe(`${body}\n\n<!-- merge note -->\n**Not merged:** other.`)
    expect(approvedSha(once)).toBe("a".repeat(40))
  })
})
