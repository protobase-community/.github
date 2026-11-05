// When the model gives no answer, the fallback reviewer's review of the same head decides (settings.fallbackReviewer).
// Clean needs positive evidence: its check finished a review of exactly the head, and none of its review threads on
// the pull request is open, that is neither resolved nor outdated, so a finding an earlier head raised on code the head
// left as it was still counts. Anything else, or anything it cannot read for sure, is no review: the default restricts.
import type { CommitStatus } from "./checks"
import { fallbackReviewer, fallbackWait } from "./settings"

export type ReviewerCheck = {
  id: number
  name: string
  head_sha: string
  status: string
  conclusion: string | null
  app: { slug: string } | null
  output: { title: string | null }
}
export type ReviewerStatus = CommitStatus & { creator: { login: string } | null }
export type ReviewThread = {
  isResolved: boolean
  isOutdated: boolean
  path: string
  line: number | null
  comments: { nodes: { author: { __typename: string; login: string } | null; body: string; url: string }[] }
}

export type Finding = { path: string; line: number | null; title: string; url: string }
export type FallbackReview = { kind: "clean" } | { kind: "findings"; findings: Finding[] } | { kind: "none"; why: string }

type HeadState = { kind: "reviewed" } | { kind: "running" } | { kind: "none"; why: string }

// Where the fallback reviewer's review of the head stands, from its check runs and commit statuses on the head. Its
// newest check run decides; a commit status only says it reviews this repository, as no finished one has been seen to
// read a review from, so a final one counts as no review.
export function headState(sha: string, checks: ReviewerCheck[], statuses: ReviewerStatus[]): HeadState {
  const own = checks.filter((check) => check.app?.slug === fallbackReviewer.app && check.name === fallbackReviewer.check && check.head_sha === sha)
  const check = own.toSorted((a, b) => b.id - a.id)[0]
  if (check) {
    if (check.status !== "completed") return { kind: "running" }
    if (check.conclusion === "success") return { kind: "reviewed" }
    return { kind: "none", why: `its check on this commit ended ${check.conclusion}, "${check.output.title ?? ""}"` }
  }
  const status = statuses.find((status) => status.context === fallbackReviewer.check && status.creator?.login === fallbackReviewer.login)
  if (status?.state === "pending") return { kind: "running" }
  if (status) return { kind: "none", why: `its commit status on this commit is ${status.state}, which holds no review to read` }
  return { kind: "none", why: "it has no check or status on this commit" }
}

// The fallback reviewer's threads that are neither resolved nor outdated. A thread counts as its own when its first
// comment is by its app; no other account's thread counts.
export function openFindings(threads: ReviewThread[]): Finding[] {
  return threads.flatMap((thread) => {
    const first = thread.comments.nodes[0]
    const own = first?.author?.__typename === "Bot" && first.author.login === fallbackReviewer.app
    if (!own || thread.isResolved || thread.isOutdated) return []
    return [{ path: thread.path, line: thread.line, title: findingTitle(first.body), url: first.url }]
  })
}

// A finding's first line: its first bold line, past the badge line of severity icons, or else its first line of plain
// text.
export function findingTitle(body: string) {
  const lines = body.split("\n").map((line) => line.trim())
  const bold = lines.map((line) => /^\*\*([^<*].*?)\*\*$/.exec(line)?.[1]).find((title) => title !== undefined)
  return bold ?? lines.find((line) => line && !line.includes("<")) ?? ""
}

type Reads = {
  checkRunsNamed(sha: string, name: string): Promise<ReviewerCheck[]>
  statuses(sha: string): Promise<ReviewerStatus[]>
  reviewThreads(number: number): Promise<ReviewThread[]>
}

// Reads the head's state up to fallbackWait.maxReads times, fallbackWait.intervalSeconds apart, while the review still
// runs, then its open findings once it finished.
export async function readFallbackReview(github: Reads, number: number, sha: string, sleep = (ms: number) => Bun.sleep(ms)): Promise<FallbackReview> {
  for (let read = 1; ; read++) {
    const state = headState(sha, await github.checkRunsNamed(sha, fallbackReviewer.check), await github.statuses(sha))
    if (state.kind === "none") return state
    if (state.kind === "reviewed") {
      const findings = openFindings(await github.reviewThreads(number))
      return findings.length > 0 ? { kind: "findings", findings } : { kind: "clean" }
    }
    if (read === fallbackWait.maxReads) {
      const minutes = ((fallbackWait.maxReads - 1) * fallbackWait.intervalSeconds) / 60
      return { kind: "none", why: `its review of this commit was still running after ${minutes} minutes` }
    }
    await sleep(fallbackWait.intervalSeconds * 1000)
  }
}
