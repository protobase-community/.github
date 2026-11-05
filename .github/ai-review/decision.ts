// The comment a review posts and the reviewer that decided it: the model, or, when the model gave no answer, the
// fallback reviewer, which is read only then.
//
// A pull request asked about in parts (parts.ts) gets one comment for all of them: the model decides when every part
// has an answer, or when a part's answer has findings, which no other part's verdict can make clean. Otherwise a part
// without an answer leaves the verdict to the fallback reviewer, whose review covers the whole head.
import { isClean, reviewComment } from "./comment"
import { fallbackComment } from "./fallback-comment"
import type { FallbackReview } from "./fallback-review"
import type { Completion } from "./scaleway"
import { fallbackReviewer } from "./settings"
import { skipReason } from "./verdict"

export async function decide(sha: string, completions: Completion[], readFallback: () => Promise<FallbackReview>) {
  const answers = completions.map((completion) => ({ content: completion.content.trim(), reason: skipReason(completion) }))
  const unanswered = answers.flatMap((answer, index) => (answer.reason === null ? [] : [{ index, reason: answer.reason }]))
  const findings = answers.some((answer) => answer.reason === null && !isClean(answer.content))

  if (answers.length === 1 && unanswered.length === 0) return { body: reviewComment(sha, answers[0].content), decidedBy: "the model" }
  if (unanswered.length === 0 || findings) {
    const sections = answers.map((answer, index) => {
      const text = answer.reason === null ? answer.content : `Not reviewed: ${answer.reason}`
      return `### Part ${index + 1} of ${answers.length}\n\n${text}`
    })
    return { body: reviewComment(sha, sections.join("\n\n"), unanswered.length === 0 && !findings), decidedBy: "the model" }
  }

  // Each part without an answer and why, such as "in part 2 of 3, the model ended its turn without an answer."
  const reason =
    answers.length === 1
      ? unanswered[0].reason
      : unanswered.map(({ index, reason }, at) => `${at === 0 ? "in" : "In"} part ${index + 1} of ${answers.length}, ${reason}`).join(" ")
  const review = await readFallback()
  const decidedBy = review.kind === "none" ? `no reviewer, as ${fallbackReviewer.name} had none: ${review.why}` : `${fallbackReviewer.name}, ${review.kind}`
  return { body: fallbackComment(sha, reason, review), decidedBy }
}
