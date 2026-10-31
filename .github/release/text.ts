// The release pull request's body and the text of the captain's request in the backlog, each made from the same
// facts, and what release.ts reads back from them. Pure.
import type { Decision } from "./decide"
import type { Gate, Gates } from "./gates"

export type Commit = { sha: string; subject: string }

export type Release = {
  repository: string
  base: string
  development: string
  head: string
  url: string
  commits: Commit[]
  gates: Gates
}

// At most this many commits are listed; the rest are counted.
const maxCommits = 50

const short = (sha: string) => sha.slice(0, 7)

function commitLines(commits: Commit[]) {
  const listed = commits.slice(0, maxCommits).map((commit) => `- ${short(commit.sha)} ${commit.subject}`)
  const more = commits.length - listed.length
  return more > 0 ? [...listed, `- and ${more} more`] : listed
}

function gateLines(gates: Gates) {
  const line = (name: string, gate: Gate) => `- ${name}: ${gate.text}`
  return [line("CI", gates.ci), line("AI review", gates.review), ...(gates.dev ? [line("Dev environment", gates.dev)] : [])]
}

// The request's text: `reason` is its title in the app and the captain's email, `why` names the commit it approves.
export function requestText(release: Release) {
  return {
    reason: `Release ${short(release.head)} of ${release.repository} into ${release.base}?`,
    why: [`Pull request: ${release.url}`, `Commit: ${release.head}`, ...gateLines(release.gates)].join("\n"),
    plan: commitLines(release.commits).join("\n"),
  }
}

// The commit a request asks about, from its `why`, or null when it names none.
export function requestedSha(why: string | null) {
  return /^Commit: ([0-9a-f]{40})$/m.exec(why ?? "")?.[1] ?? null
}

const requestMarker = (id: number) => `<!-- release-request: ${id} -->`

// The request a release pull request's body names, or null.
export function requestId(body: string | null) {
  const id = /^<!-- release-request: (\d+) -->$/m.exec(body ?? "")?.[1]
  return id === undefined ? null : Number(id)
}

// Where the captain's approval stands, for the pull request's body.
function approvalLine(decision: Decision, link: string | null) {
  const where = link ? ` (${link})` : ""
  if (decision.kind === "wait") return "Asked once every check above passed."
  if (decision.kind === "held") return `The captain asked for changes${where}; a newer commit asks again.`
  if (decision.kind === "merge") return `Approved${where}; merging.`
  return `Waiting on the captain in the backlog${where}.`
}

export function pullRequestBody(release: Release, decision: Decision, requestLink: string | null, request: number | null) {
  const lines = [
    ...(request === null ? [] : [requestMarker(request)]),
    `Everything on \`${release.development}\` that is not on \`${release.base}\` yet, kept up to date by the release workflow ` +
      "(protobase-community/.github's `release.yml`). The `do-not-merge` label holds it until the captain approves this " +
      "exact commit in the backlog; the workflow then merges it.",
    "",
    `**Head:** ${short(release.head)}`,
    "",
    ...gateLines(release.gates),
    "",
    `**Approval:** ${approvalLine(decision, requestLink)}`,
    "",
    `**Commits (${release.commits.length})**`,
    "",
    ...commitLines(release.commits),
  ]
  return `${lines.join("\n")}\n`
}
