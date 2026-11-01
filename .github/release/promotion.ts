// The daily promotion's choices and gates (promote.ts), apart from what it reads. Pure.
import type { BacklogTask } from "./backlog"
import type { Gate } from "./gates"

// A deploy result of the beta host, as central lists them newest first (protobase-cloud's /deploys/hosts/:host).
export type HostResult = { sha: string; state: string; updatedAt: string }

const short = (sha: string) => sha.slice(0, 7)

// The commits the beta host deployed, newest first, each with when it went live there.
export function deployedOnBeta(results: HostResult[]) {
  const seen = new Set<string>()
  return results
    .filter((result) => result.state === "success" && !seen.has(result.sha) && seen.add(result.sha))
    .map((result) => ({ sha: result.sha, liveSince: new Date(result.updatedAt) }))
}

export function soakGate(liveSince: Date, now: Date, hours: number): Gate {
  const soaked = (now.getTime() - liveSince.getTime()) / 3_600_000
  if (soaked >= hours) return { state: "passed", text: `${Math.floor(soaked)} h on the beta host` }
  return { state: "pending", text: `${Math.floor(soaked)} h of ${hours} h on the beta host` }
}

// The issues Bugsink first saw since a moment: new errors of the build, or a failed backup or restore check.
export type Issue = { id: string; first_seen: string; last_seen: string; calculated_type: string; calculated_value: string }

// `seen` is `first_seen` for new errors, or `last_seen` for failures that may repeat an old issue, as a backup check's do.
export function errorsGate(issues: Issue[], since: Date, what: string, seen: "first_seen" | "last_seen" = "first_seen"): Gate {
  const fresh = issues.filter((issue) => new Date(issue[seen]) >= since)
  if (fresh.length === 0) return { state: "passed", text: `no new ${what}` }
  const names = fresh.slice(0, 3).map((issue) => `${issue.calculated_type}: ${issue.calculated_value}`.slice(0, 80))
  return { state: "failed", text: `${fresh.length} new ${what} since ${since.toISOString()}: ${names.join("; ")}` }
}

// Serious beta reports Firstmate filed (kind beta-report, priority 0 or 1) that are still open.
export function reportsGate(reports: BacklogTask[]): Gate {
  const open = reports.filter((task) => task.state !== "done" && !task.cancelled && task.priority !== null && task.priority <= 1)
  if (open.length === 0) return { state: "passed", text: "no open serious beta report" }
  return { state: "failed", text: `open serious beta reports: ${open.map((task) => task.id).join(", ")}` }
}

// The files of a batch that need the integration review: the changes to the patterns' places. GitHub lists at most 300
// changed files, so a list that long may be cut short and counts as risky whatever it shows.
export const maxListedFiles = 300
export function riskyFiles(files: string[], patterns: RegExp[]) {
  if (files.length >= maxListedFiles && patterns.length > 0) return files
  return files.filter((file) => patterns.some((pattern) => pattern.test(file)))
}

// The integration review of a batch: `scenario-<sha7>-0` is the review itself, done once it filed its scenarios,
// `scenario-<sha7>-<n>` each scenario, and every one of them must be done.
export function scenariosGate(sha: string, tasks: BacklogTask[]): Gate {
  const review = tasks.find((task) => task.id === `scenario-${short(sha)}-0`)
  if (!review) return { state: "pending", text: `no integration review of ${short(sha)} yet` }
  const open = tasks.filter((task) => task.state !== "done" || task.cancelled)
  if (open.length > 0) return { state: "pending", text: `scenarios not passed yet: ${open.map((task) => task.id).join(", ")}` }
  return { state: "passed", text: `the integration review and its ${tasks.length - 1} scenarios passed` }
}

// The hour it is in Amsterdam: GitHub's cron is UTC, so the schedule runs at both 04:00 and 05:00 UTC and acts at 06:00.
export function amsterdamHour(now: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", hourCycle: "h23" }).format(now))
}
