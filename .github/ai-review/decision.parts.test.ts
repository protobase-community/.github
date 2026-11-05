import { describe, expect, test } from "bun:test"
import { approvedSha, isClean } from "./comment"
import { decide } from "./decision"
import type { FallbackReview } from "./fallback-review"
import type { Completion } from "./scaleway"
import { fallbackReviewer } from "./settings"

const sha = "0524c06e684f5841f7d1dfb116c36978a830ca61"
const answer = (content: string, finish = "stop"): Completion => ({ content, reasoning: "", finish, usage: null })
const fallback = (review: FallbackReview) => async () => review
const unread = async (): Promise<FallbackReview> => {
  throw new Error("the fallback reviewer was read")
}
const clean = answer("I checked the changed files.\n\nNo issues found.")

describe("decide for a review in parts", () => {
  test("every part clean is the clean comment, which the clean reading accepts, with each part's answer", async () => {
    const { body, decidedBy } = await decide(sha, [clean, answer("No issues found."), clean], unread)
    expect(approvedSha(body)).toBe(sha)
    expect(isClean(body)).toBe(true)
    expect(body).toContain("### Part 1 of 3\n\nI checked the changed files.\n\nNo issues found.\n\n### Part 2 of 3\n\nNo issues found.")
    expect(decidedBy).toBe("the model")
  })

  test("a finding in one part of three is findings, holding it", async () => {
    const { body } = await decide(sha, [clean, answer("**High**: a.ts:1 drops the last page."), clean], unread)
    expect(approvedSha(body)).toBeNull()
    expect(body).toContain(`<!-- reviewed ${sha} findings -->`)
    expect(body).toContain("### Part 2 of 3\n\n**High**: a.ts:1 drops the last page.")
  })

  test("a part's answer that is not clean is findings, even when its text names no severity", async () => {
    const { body } = await decide(sha, [clean, answer("a.ts:1 drops the last page.")], unread)
    expect(isClean(body.slice(body.indexOf("\n\n")))).toBe(true)
    expect(approvedSha(body)).toBeNull()
  })

  test("a part without an answer next to a part with findings is findings, naming it, without the fallback reviewer", async () => {
    const { body } = await decide(sha, [answer(""), answer("**Medium**: b.ts:2 is wrong.")], unread)
    expect(approvedSha(body)).toBeNull()
    expect(body).toContain("### Part 1 of 2\n\nNot reviewed: the model ended its turn without an answer.")
  })

  test("a part without an answer and no review of the head by the fallback reviewer is not reviewed, naming the part", async () => {
    const { body, decidedBy } = await decide(sha, [clean, answer(""), clean], fallback({ kind: "none", why: "it has no check or status on this commit" }))
    expect(body).toContain(`<!-- reviewed ${sha} skipped -->`)
    expect(body).toContain("Not reviewed: in part 2 of 3, the model ended its turn without an answer.")
    expect(body).not.toContain("No issues found.")
    expect(approvedSha(body)).toBeNull()
    expect(decidedBy).toStartWith("no reviewer")
  })

  test("parts without an answer and the fallback reviewer's clean review approve the head, naming each part", async () => {
    const { body } = await decide(sha, [answer(""), clean, answer("", "length")], fallback({ kind: "clean" }))
    expect(approvedSha(body)).toBe(sha)
    expect(body).toContain(
      "The model gave no verdict: in part 1 of 3, the model ended its turn without an answer. In part 3 of 3, the model used its whole output budget before answering.",
    )
    expect(body).toContain(`${fallbackReviewer.name}'s review of 0524c06 decided instead.`)
  })
})
