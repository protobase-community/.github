// The one advisory comment a pull request gets. It is found again by its marker and updated in place.
import { limits, settings } from "./settings"

export const marker = "<!-- ai-pr-review -->"

function header(sha: string) {
  return `${marker}\n**AI review** by \`${settings.model}\` on ${settings.provider}, of ${sha.slice(0, 7)}. An AI wrote this comment: it is advisory, can be wrong and never blocks a merge.`
}

export function reviewComment(sha: string, review: string) {
  const text = review.trim() || "The model gave no answer."
  const body = text.length > limits.maxCommentChars ? `${text.slice(0, limits.maxCommentChars)}\n\n(cut off)` : text
  return `${header(sha)}\n\n${body}`
}

export function skipComment(sha: string, reason: string) {
  return `${header(sha)}\n\nNot reviewed: ${reason}`
}
