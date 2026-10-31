// The one advisory comment a pull request gets. It is found again by its marker and updated in place. A hidden line
// records the commit it reviewed and its verdict, which the auto-merge reads back.
import { limits, settings } from "./settings"

export const marker = "<!-- ai-pr-review -->"

type Verdict = "clean" | "findings" | "skipped"

function header(sha: string, verdict: Verdict) {
  return `${marker}\n<!-- reviewed ${sha} ${verdict} -->\n**AI review** by \`${settings.model}\` on ${settings.provider}, of ${sha.slice(0, 7)}. An AI wrote this comment: it is advisory, can be wrong and never blocks a merge.`
}

export function reviewComment(sha: string, review: string) {
  const text = review.trim() || "The model gave no answer."
  const body = text.length > limits.maxCommentChars ? `${text.slice(0, limits.maxCommentChars)}\n\n(cut off)` : text
  return `${header(sha, isClean(text) ? "clean" : "findings")}\n\n${body}`
}

export function skipComment(sha: string, reason: string) {
  return `${header(sha, "skipped")}\n\nNot reviewed: ${reason}`
}

// Whether a review found nothing, which the model says with exactly this answer (prompts/answer.md).
export function isClean(review: string) {
  return /^no issues found\.?$/i.test(review.trim())
}

// The commit a review comment approved, or null when its review found issues, was skipped or is not one.
export function approvedSha(body: string) {
  if (!body.startsWith(marker)) return null
  return /^<!-- reviewed ([0-9a-f]{40}) clean -->$/m.exec(body)?.[1] ?? null
}
