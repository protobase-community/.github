// Whether a development commit may be released, read from GitHub: the pull request it came through into development,
// its AI review and its CI, and CI on the commit itself where any ran (gates.ts's commitGate). Shared by the draft
// release (release.ts), the build to the beta host (build.ts) and the daily promotion (promote.ts).
import { carriesApproval } from "../ai-review/approval"
import { approvedSha, marker } from "../ai-review/comment"
import { ciGate, commitGate, reviewGate } from "./gates"
import type { GitHub } from "./github"

export function commitChecks(github: GitHub, o: { development: string; ownWorkflowId: number; withoutCi: boolean }) {
  // The CI of a commit. A pull_request_target run, such as another pull request's AI review, runs on its base branch's
  // head and is about that pull request, not this commit, so it is left out with its check runs.
  async function ciOf(sha: string) {
    const all = await github.workflowRuns(sha)
    const foreign = new Set(all.filter((run) => run.event === "pull_request_target").map((run) => run.check_suite_id))
    const runs = all.filter((run) => !foreign.has(run.check_suite_id))
    const checkRuns = (await github.checkRuns(sha)).filter((check) => !foreign.has(check.check_suite.id))
    return ciGate(runs, checkRuns, await github.statuses(sha), o.ownWorkflowId)
  }

  return async (sha: string) => {
    const ci = await ciOf(sha)
    const through = (await github.commitPullRequests(sha)).find((pull) => pull.merged_at !== null && pull.base.ref === o.development)
    if (!through) return commitGate(ci, null, o.withoutCi)
    const head = through.head.sha
    const headCi = await ciOf(head)
    const comment = (await github.reviewComment(through.number, marker))?.body ?? null
    const reviewed = approvedSha(comment ?? "")
    const review = reviewGate(head, comment, reviewed !== null && (await carriesApproval(github, head, reviewed, o.development)))
    return commitGate(ci, { number: through.number, ci: headCi, review }, o.withoutCi)
  }
}
