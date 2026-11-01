// The draft release's text and the text of the captain's request in the backlog, each made from the same facts, and
// what release.ts reads back from them. Pure.
import type { Decision } from "./decide"
import type { Gate, Gates } from "./gates"

export type Commit = { sha: string; subject: string }

export type Release = {
  repository: string
  base: string
  development: string
  // The development commit the release is cut at; it never moves.
  commit: string
  tag: string
  // The draft release's page.
  url: string
  commits: Commit[]
  gates: Gates
}

// At most this many commits are listed; the rest are counted.
const maxCommits = 50

const short = (sha: string) => sha.slice(0, 7)

// Marks the draft releases this workflow made; the request it asked follows on its own line.
export const releaseMarker = "<!-- release-pipeline -->"
const notesMarker = "<!-- release-notes -->"

function commitLines(commits: Commit[]) {
  const listed = commits.slice(0, maxCommits).map((commit) => `- ${short(commit.sha)} ${commit.subject}`)
  const more = commits.length - listed.length
  return more > 0 ? [...listed, `- and ${more} more`] : listed
}

function gateLines(gates: Gates) {
  const line = (name: string, gate: Gate) => `- ${name}: ${gate.text}`
  return [line("Checks", gates.commit), ...(gates.dev ? [line("Dev environment", gates.dev)] : [])]
}

// The request's text: `reason` is its title in the app and the captain's email, `why` names the commit it approves.
export function requestText(release: Release) {
  return {
    reason: `Release ${release.tag} of ${release.repository} into ${release.base}?`,
    why: [`Draft release: ${release.url}`, `Commit: ${release.commit}`, ...gateLines(release.gates)].join("\n"),
    plan: commitLines(release.commits).join("\n"),
  }
}

// The commit a request asks about, from its `why`, or null when it names none.
export function requestedSha(why: string | null) {
  return /^Commit: ([0-9a-f]{40})$/m.exec(why ?? "")?.[1] ?? null
}

// The tag a draft release's body names, or null: GitHub answers a draft's own tag_name as untagged-<id> once it was
// changed, so the body keeps it.
export function releaseTag(body: string | null) {
  return /^<!-- release-tag: (\S+) -->$/m.exec(body ?? "")?.[1] ?? null
}

// The request a draft release's body names, or null.
export function requestId(body: string | null) {
  const id = /^<!-- release-request: (\d+) -->$/m.exec(body ?? "")?.[1]
  return id === undefined ? null : Number(id)
}

// The notes GitHub generated when the draft was made, kept below the status.
export function releaseNotes(body: string | null) {
  const at = (body ?? "").indexOf(notesMarker)
  return at === -1 ? "" : (body ?? "").slice(at + notesMarker.length).trim()
}

// Where the captain's approval stands, for the draft's body.
function approvalLine(decision: Decision, link: string | null) {
  const where = link ? ` (${link})` : ""
  if (decision.kind === "wait") return "Asked once every check above passed."
  if (decision.kind === "held") return `The captain asked for changes${where}; the next release asks again.`
  if (decision.kind === "merge") return `Approved${where}; released.`
  return `Waiting on the captain in the backlog${where}.`
}

export function releaseBody(release: Release, decision: Decision, link: string | null, request: number | null, notes: string) {
  const lines = [
    releaseMarker,
    `<!-- release-tag: ${release.tag} -->`,
    ...(request === null ? [] : [`<!-- release-request: ${request} -->`]),
    `\`${release.development}\` at ${short(release.commit)}, kept up to date by the release workflow ` +
      `(protobase-community/.github's \`release.yml\`). Once the captain approves this commit in the backlog, \`${release.base}\` ` +
      "moves to it and this release is published. Newer commits wait for the next release.",
    "",
    ...gateLines(release.gates),
    "",
    `**Approval:** ${approvalLine(decision, link)}`,
    "",
    notesMarker,
    notes || ["**Commits**", "", ...commitLines(release.commits)].join("\n"),
  ]
  return `${lines.join("\n")}\n`
}
