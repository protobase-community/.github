// The one advisory comment a pull request gets. It is found again by its marker and updated in place. A hidden line
// records the commit it reviewed and its verdict, which the auto-merge reads back.
import { limits } from "./settings"

export const marker = "<!-- ai-pr-review -->"

type Verdict = "clean" | "findings" | "skipped"

function header(sha: string, verdict: Verdict) {
  return `${marker}\n<!-- reviewed ${sha} ${verdict} -->\n**AI review** of ${sha.slice(0, 7)}. An AI wrote this comment: it is advisory, can be wrong and never blocks a merge.`
}

// A review asked in parts (parts.ts) is clean only when every part's answer is: their joined text alone may not show it.
export function reviewComment(sha: string, review: string, everyPartClean = true) {
  const text = review.trim() || "The model gave no answer."
  const body = text.length > limits.maxCommentChars ? `${text.slice(0, limits.maxCommentChars)}\n\n(cut off)` : text
  return `${header(sha, everyPartClean && isClean(text) ? "clean" : "findings")}\n\n${body}`
}

export function skipComment(sha: string, reason: string) {
  return `${header(sha, "skipped")}\n\nNot reviewed: ${reason}`
}

// Whether a review found nothing. The model says so with the line "No issues found." (prompts/answer.md), and may
// write the checks it ran around it; it tags each finding with a severity, so an answer naming one is never clean,
// even as a word in prose: this verdict lets the review merge, so in doubt it reads findings.
export function isClean(review: string) {
  const verdict = review.split("\n").some((line) => /^no issues found\.?$/i.test(line.trim()))
  return verdict && !/\b(high|medium|low)\b/i.test(review)
}

// The commit a review comment approved, or null when its review found issues, was skipped or is not one.
export function approvedSha(body: string) {
  if (!body.startsWith(marker)) return null
  return /^<!-- reviewed ([0-9a-f]{40}) clean -->$/m.exec(body)?.[1] ?? null
}
