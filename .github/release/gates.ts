// The three gates a release's head passes before the captain is asked: CI, the AI review and, where the repository has
// one, its dev environment. Pure: release.ts fetches what each reads.
import { checksState, type CheckRun, type CommitStatus, type WorkflowRun } from "../ai-review/checks"
import { marker } from "../ai-review/comment"

export type Gate = { state: "passed" | "pending" | "failed"; text: string }
export type Gates = { ci: Gate; review: Gate; dev: Gate | null }

const short = (sha: string) => sha.slice(0, 7)

export function allPassed(gates: Gates) {
  return [gates.ci, gates.review, gates.dev].every((gate) => gate === null || gate.state === "passed")
}

// Everything else that ran on the head passed, and something did: a head no CI ran on yet has passed nothing.
export function ciGate(runs: WorkflowRun[], checkRuns: CheckRun[], statuses: CommitStatus[], ownWorkflowId: number): Gate {
  const others = runs.filter((run) => run.workflow_id !== ownWorkflowId)
  if (others.length === 0 && statuses.length === 0) return { state: "pending", text: "no CI ran on it yet" }
  const checks = checksState(runs, checkRuns, statuses, ownWorkflowId)
  if (checks.state === "red") return { state: "failed", text: `failed: ${checks.names.join(", ")}` }
  if (checks.state === "pending") return { state: "pending", text: `running: ${checks.names.join(", ")}` }
  return { state: "passed", text: "passed" }
}

// Whether the review skipped a pull request for its size, as ../ai-review/review.ts words it: too many files or too
// long a diff.
const tooBig = (reason: string) => /, above the cap of /.test(reason)

// The review's verdict on the head: `approved` says whether the head carries a clean review (../ai-review/approval.ts).
export function reviewGate(head: string, comment: string | null, approved: boolean): Gate {
  if (approved) return { state: "passed", text: "no issues found" }
  const reviewed = comment?.startsWith(marker) ? /^<!-- reviewed ([0-9a-f]{40}) (\w+) -->$/m.exec(comment) : null
  if (!reviewed || reviewed[1] !== head) return { state: "pending", text: `no review of ${short(head)} yet` }
  if (reviewed[2] === "skipped") {
    const reason = /^Not reviewed: (.+)$/m.exec(comment ?? "")?.[1] ?? "skipped"
    // A release too big for the review passes: each of its changes had a review of its own on its way into the
    // development branch. A small release still needs a clean review of the whole.
    if (tooBig(reason)) return { state: "passed", text: `too big to review (${reason.replace(/\.$/, "")}); each change was reviewed on its way into development` }
    return { state: "failed", text: `not reviewed: ${reason}` }
  }
  return { state: "failed", text: "found issues" }
}

// What the dev environment runs, as its deployed and failed commits and its health check answered.
export type DevEnvironment = { deployed: string | null; failed: string | null; healthStatus: number }

export function devGate(head: string, dev: DevEnvironment): Gate {
  if (dev.failed === head) return { state: "failed", text: `${short(head)} failed to deploy` }
  if (dev.deployed !== head) {
    const running = dev.deployed ? `runs ${short(dev.deployed)}` : "runs no commit"
    return { state: "pending", text: `${running}, not ${short(head)} yet` }
  }
  if (dev.healthStatus < 200 || dev.healthStatus >= 300) return { state: "failed", text: `runs ${short(head)}, but its health check answered ${dev.healthStatus}` }
  return { state: "passed", text: `runs ${short(head)} and is healthy` }
}
