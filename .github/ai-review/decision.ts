// The comment a review posts and the reviewer that decided it: the model, or, when the model gave no answer, the
// fallback reviewer, which is read only then.
import { reviewComment } from "./comment"
import { fallbackComment } from "./fallback-comment"
import type { FallbackReview } from "./fallback-review"
import type { Completion } from "./scaleway"
import { fallbackReviewer } from "./settings"
import { skipReason } from "./verdict"

export async function decide(sha: string, completion: Completion, readFallback: () => Promise<FallbackReview>) {
  const reason = skipReason(completion)
  if (!reason) return { body: reviewComment(sha, completion.content), decidedBy: "the model" }
  const review = await readFallback()
  const decidedBy = review.kind === "none" ? `no reviewer, as ${fallbackReviewer.name} had none: ${review.why}` : `${fallbackReviewer.name}, ${review.kind}`
  return { body: fallbackComment(sha, reason, review), decidedBy }
}
