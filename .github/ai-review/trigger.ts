// Picks the pull request a merge retry is for from the event that started it, when another app's check suite
// completes or another app's commit status changes. Pure: the caller reads the event and, for a status, the pull
// requests of its commit. Only a pull request whose head is the event's commit, in this very repository, counts.

export type CheckSuiteEvent = {
  repository: { id: number }
  check_suite: {
    head_sha: string
    pull_requests: { number: number; head: { sha: string; repo: { id: number } } }[]
  }
}

export type StatusEvent = { sha: string; state: string }

// A pull request as GET /repos/{repo}/commits/{sha}/pulls lists it; repo is null for a deleted fork.
export type CommitPullRequest = { number: number; state: string; head: { sha: string; repo: { full_name: string } | null } }

// A check suite on a fork's branch lists no pull requests, so it gives none.
export function checkSuitePullRequest(event: CheckSuiteEvent) {
  const suite = event.check_suite
  const match = suite.pull_requests.find((pull) => pull.head.sha === suite.head_sha && pull.head.repo.id === event.repository.id)
  return match?.number ?? null
}

// A status names no pull request, so the pull requests of its commit find it. A pending status gives none: it is no
// check that finished.
export function statusPullRequest(event: StatusEvent, pulls: CommitPullRequest[], repository: string) {
  if (event.state === "pending") return null
  const match = pulls.find((pull) => pull.state === "open" && pull.head.sha === event.sha && pull.head.repo?.full_name === repository)
  return match?.number ?? null
}
