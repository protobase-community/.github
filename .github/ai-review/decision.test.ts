import { describe, expect, test } from "bun:test"
import { approvedSha, isClean, marker } from "./comment"
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
const finding = { path: "a.ts", line: 3, title: "Bound the page.", url: "https://github.com/o/r/pull/1#discussion_r1" }

// The cases where the model gave no answer after its asks, by skipReason.
const noAnswers = [
  ["an empty answer", answer("")],
  ["an answer cut off at the output cap", answer("", "length")],
  ["a clean answer cut off before it finished", answer("No issues found.", "length")],
] as const

describe("decide", () => {
  test.each(noAnswers)("%s and the fallback reviewer's clean review approve the head, naming it", async (_, completion) => {
    const { body, decidedBy } = await decide(sha, completion, fallback({ kind: "clean" }))
    expect(body).toStartWith(marker)
    expect(approvedSha(body)).toBe(sha)
    expect(body).toContain(`${fallbackReviewer.name}'s review of 0524c06 decided instead.`)
    expect(decidedBy).toBe(`${fallbackReviewer.name}, clean`)
  })

  test.each(noAnswers)("%s and the fallback reviewer's open findings are findings, each listed", async (_, completion) => {
    const { body, decidedBy } = await decide(sha, completion, fallback({ kind: "findings", findings: [finding, { ...finding, line: null }] }))
    expect(approvedSha(body)).toBeNull()
    expect(body).toContain(`<!-- reviewed ${sha} findings -->`)
    expect(body).toContain("It has 2 open review threads:")
    expect(body).toContain("- `a.ts:3` Bound the page. ([thread](https://github.com/o/r/pull/1#discussion_r1))")
    expect(body).toContain("- `a.ts` Bound the page.")
    expect(decidedBy).toBe(`${fallbackReviewer.name}, findings`)
  })

  test("no answer and no review of the head by the fallback reviewer is today's note, saying it had none", async () => {
    const { body, decidedBy } = await decide(sha, answer(""), fallback({ kind: "none", why: "it has no check or status on this commit" }))
    expect(body).toContain(`<!-- reviewed ${sha} skipped -->`)
    expect(body).toContain("Not reviewed: the model ended its turn without an answer.")
    expect(body).toEndWith(`${fallbackReviewer.name} had no finished review of 0524c06 either: it has no check or status on this commit.`)
    expect(approvedSha(body)).toBeNull()
    expect(decidedBy).toStartWith("no reviewer")
  })

  test("an answer from the model decides, and the fallback reviewer is not read", async () => {
    expect(await decide(sha, answer("No issues found."), unread)).toMatchObject({ decidedBy: "the model" })
    const { body } = await decide(sha, answer("High, a.ts:1, broken."), unread)
    expect(body).toEndWith("High, a.ts:1, broken.")
  })

  test("the line naming the fallback reviewer holds no severity word, for every reason", async () => {
    for (const [, completion] of noAnswers) {
      const { body } = await decide(sha, completion, fallback({ kind: "clean" }))
      expect(isClean(body.slice(body.indexOf("No issues found.")))).toBe(true)
    }
  })
})
