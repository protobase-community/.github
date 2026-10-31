// The one advisory comment a pull request gets. It is found again by its marker and updated in place. A review that
// finds no issues posts none, and only edits an earlier one.
import { limits, settings } from "./settings"

export const marker = "<!-- ai-pr-review -->"

function header(sha: string) {
  return `${marker}\n**AI review** by \`${settings.model}\`, of ${sha.slice(0, 7)}. An AI wrote this comment: it is advisory, can be wrong and never blocks a merge.`
}

export function reviewComment(sha: string, review: string) {
  const text = review.trim() || "The model gave no answer."
  const body = text.length > limits.maxCommentChars ? `${text.slice(0, limits.maxCommentChars)}\n\n(cut off)` : text
  return `${header(sha)}\n\n${body}`
}

export function skipComment(sha: string, reason: string) {
  return `${header(sha)}\n\nNot reviewed: ${reason}`
}

// What an earlier comment becomes when a later head has no issues, so its findings do not linger.
export function noIssuesComment(sha: string) {
  return `${header(sha)}\n\nNo issues found at the head ${sha.slice(0, 7)}; this replaces the earlier review.`
}

// Whether a review found nothing, which the model says with exactly this answer (prompts/answer.md).
export function isClean(review: string) {
  return /^no issues found\.?$/i.test(review.trim())
}
