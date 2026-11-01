// The gates a release's commit passes before the captain is asked: its CI and the AI review of the pull request it came
// through into development, and, where the repository has one, its dev environment. Pure: release.ts fetches what each
// reads.
import { checksState, type CheckRun, type CommitStatus, type WorkflowRun } from "../ai-review/checks"
import { marker } from "../ai-review/comment"

export type Gate = { state: "passed" | "pending" | "failed"; text: string }
export type Gates = { commit: Gate; dev: Gate | null }

const short = (sha: string) => sha.slice(0, 7)

const noCi = "no CI ran on it yet"

export function allPassed(gates: Gates) {
  return [gates.commit, gates.dev].every((gate) => gate === null || gate.state === "passed")
}

// Everything else that ran on the head passed, and something did: a head no CI ran on yet has passed nothing.
export function ciGate(runs: WorkflowRun[], checkRuns: CheckRun[], statuses: CommitStatus[], ownWorkflowId: number): Gate {
  const others = runs.filter((run) => run.workflow_id !== ownWorkflowId)
  if (others.length === 0 && statuses.length === 0) return { state: "pending", text: noCi }
  const checks = checksState(runs, checkRuns, statuses, ownWorkflowId)
  if (checks.state === "red") return { state: "failed", text: `failed: ${checks.names.join(", ")}` }
  if (checks.state === "pending") return { state: "pending", text: `running: ${checks.names.join(", ")}` }
  return { state: "passed", text: "passed" }
}

// The review's verdict on a pull request's head: `approved` says whether the head carries a clean review
// (../ai-review/approval.ts). A skipped review is no review: a release is cut only at commits that each had one.
export function reviewGate(head: string, comment: string | null, approved: boolean): Gate {
  if (approved) return { state: "passed", text: "no issues found" }
  const reviewed = comment?.startsWith(marker) ? /^<!-- reviewed ([0-9a-f]{40}) (\w+) -->$/m.exec(comment) : null
  if (!reviewed || reviewed[1] !== head) return { state: "pending", text: `no review of ${short(head)} yet` }
  if (reviewed[2] === "skipped") {
    const reason = /^Not reviewed: (.+)$/m.exec(comment ?? "")?.[1] ?? "skipped"
    return { state: "failed", text: `not reviewed: ${reason}` }
  }
  return { state: "failed", text: "found issues" }
}

// The pull request a development commit came through, with its head's CI and its AI review.
export type ThroughPullRequest = { number: number; ci: Gate; review: Gate }

// A development commit may be released once it came through a pull request whose AI review passed, and CI passed on it,
// or, where no CI ran on the commit itself, as on a squash merge, on that pull request's head.
// A repository without CI, whose only check is the AI review, says so with `withoutCi`: no CI on the commit or its pull
// request is then no wait.
export function commitGate(ci: Gate, through: ThroughPullRequest | null, withoutCi = false): Gate {
  if (through === null) return { state: "failed", text: "it came through no pull request, so no AI review" }
  if (through.review.state !== "passed") return { ...through.review, text: `#${through.number}'s AI review: ${through.review.text}` }
  const none = (gate: Gate) => gate.text === noCi
  if (withoutCi && none(ci) && none(through.ci)) return { state: "passed", text: `no CI here; #${through.number}'s AI review: ${through.review.text}` }
  const ran = none(ci) ? { ...through.ci, text: `#${through.number}'s CI ${through.ci.text}` } : { ...ci, text: `CI ${ci.text}` }
  if (ran.state !== "passed") return ran
  return { state: "passed", text: `${ran.text}; #${through.number}'s AI review: ${through.review.text}` }
}

// What the dev environment runs, as its deployed and failed commits and its health check answered, and whether the
// deployed commit has the release's commit: development moves on, so it may run a later one.
export type DevEnvironment = { deployed: string | null; failed: string | null; healthStatus: number; hasCommit: boolean }

export function devGate(commit: string, dev: DevEnvironment): Gate {
  if (dev.failed === commit) return { state: "failed", text: `${short(commit)} failed to deploy` }
  if (!dev.deployed || !dev.hasCommit) {
    const running = dev.deployed ? `runs ${short(dev.deployed)}` : "runs no commit"
    return { state: "pending", text: `${running}, which does not have ${short(commit)} yet` }
  }
  const running = dev.deployed === commit ? `runs ${short(commit)}` : `runs ${short(dev.deployed)}, which has ${short(commit)}`
  if (dev.healthStatus < 200 || dev.healthStatus >= 300) return { state: "failed", text: `${running}, but its health check answered ${dev.healthStatus}` }
  return { state: "passed", text: `${running} and is healthy` }
}
