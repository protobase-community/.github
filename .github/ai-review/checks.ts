// Whether everything that ran on a pull request's head commit passed, apart from the AI review's own workflow.
// Pure: the caller fetches the workflow runs, check runs and commit statuses of the commit.

export type WorkflowRun = { name: string; event: string; workflow_id: number; check_suite_id: number; status: string; conclusion: string | null }
export type CheckRun = { name: string; status: string; conclusion: string | null; check_suite: { id: number } }
export type CommitStatus = { context: string; state: string }

export type ChecksState = { state: "green" | "pending" | "red"; names: string[] }

const passed = new Set(["success", "skipped", "neutral"])

// The newest run of each workflow for each event, from runs listed newest first, as GitHub lists them. A run that
// waits for approval never ran, such as the pull_request run of a push made with GITHUB_TOKEN; it is left out when
// the same workflow has a run for another event, such as a workflow_dispatch run of CI on the same commit.
function latestRuns(runs: WorkflowRun[]) {
  const seen = new Set<string>()
  const latest = runs.filter((run) => {
    const key = `${run.workflow_id} ${run.event}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const ran = new Set(latest.filter((run) => run.conclusion !== "action_required").map((run) => run.workflow_id))
  return latest.filter((run) => run.conclusion !== "action_required" || !ran.has(run.workflow_id))
}

// Workflow runs count as well as check runs, because a queued run has no check runs yet. Only the newest run of a
// workflow for an event counts, so a run cancelled or never started on an earlier event does not hold the merge back.
// The AI review's own workflow, every run of it on the commit, is left out: its jobs are this review and this merge.
export function checksState(runs: WorkflowRun[], checkRuns: CheckRun[], statuses: CommitStatus[], ownWorkflowId: number): ChecksState {
  const latest = latestRuns(runs)
  const own = new Set(runs.filter((run) => run.workflow_id === ownWorkflowId).map((run) => run.check_suite_id))
  const stale = new Set(runs.filter((run) => !latest.includes(run)).map((run) => run.check_suite_id))
  const results = [
    ...latest
      .filter((run) => run.workflow_id !== ownWorkflowId)
      .map((run) => ({ name: run.name, done: run.status === "completed", conclusion: run.conclusion })),
    ...checkRuns
      .filter((check) => !own.has(check.check_suite.id) && !stale.has(check.check_suite.id))
      .map((check) => ({ name: check.name, done: check.status === "completed", conclusion: check.conclusion })),
    ...statuses.map((status) => ({ name: status.context, done: status.state !== "pending", conclusion: status.state })),
  ]

  const failed = results.filter((result) => result.done && !passed.has(result.conclusion ?? ""))
  if (failed.length > 0) return { state: "red", names: failed.map((result) => result.name) }
  const waiting = results.filter((result) => !result.done)
  if (waiting.length > 0) return { state: "pending", names: waiting.map((result) => result.name) }
  return { state: "green", names: [] }
}
