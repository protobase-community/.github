// The review comment when the model gave no answer and the fallback reviewer's review of the head decided. It goes
// through reviewComment and skipComment, so its marker and verdict read as an in-house review's do. The line naming
// the fallback reviewer holds no severity word, which isClean would read as a finding.
import { reviewComment, skipComment } from "./comment"
import type { FallbackReview, Finding } from "./fallback-review"
import { fallbackReviewer } from "./settings"

// `reason` is skipReason's sentence for why the model's answer is no review.
export function fallbackComment(sha: string, reason: string, review: FallbackReview) {
  const name = fallbackReviewer.name
  const short = sha.slice(0, 7)
  if (review.kind === "none") return skipComment(sha, `${reason}\n\n${name} had no finished review of ${short} either: ${review.why}.`)
  const decided = `The model gave no verdict: ${reason} ${name}'s review of ${short} decided instead.`
  if (review.kind === "clean") return reviewComment(sha, `No issues found.\n\n${decided} It finished a review of this commit and has no open review thread.`)
  const count = review.findings.length === 1 ? "1 open review thread" : `${review.findings.length} open review threads`
  return reviewComment(sha, `${decided} It has ${count}:\n\n${review.findings.map(findingLine).join("\n")}`)
}

function findingLine(finding: Finding) {
  const place = finding.line === null ? finding.path : `${finding.path}:${finding.line}`
  return `- \`${place}\` ${finding.title} ([thread](${finding.url}))`
}
