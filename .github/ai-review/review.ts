// Reviews one pull request with the AI model and posts or updates its advisory comment.
// It reads the pull request only through the GitHub API, as data, and never checks out or runs its code.
//
// A pull request whose diff alone is above the input cap is asked about in parts, with one verdict for all (parts.ts).
// When the model gives no answer, the fallback reviewer's review of the same head decides instead (fallback-review.ts).
//
// With AUTO_MERGE=true a review that finds no issues also puts the approval label on, and any other review takes it
// off. A head that still carries an earlier approval, because it only merged the base branch in, is not reviewed again
// and keeps or gets the label.
//
//   REPOSITORY=owner/name PR_NUMBER=1 GITHUB_TOKEN=... SCW_PR_REVIEW_SECRET_KEY=... [AUTO_MERGE=true] bun review.ts
import { carriesApproval } from "./approval"
import { askForReview } from "./ask"
import { approvedSha, marker, skipComment } from "./comment"
import { decide } from "./decision"
import { readFallbackReview } from "./fallback-review"
import { gitHub } from "./github"
import { buildSystemPrompt, loadTemplates, type Rule } from "./prompt"
import { splitIntoParts } from "./parts"
import { contentPaths, isPureRename } from "./pull-request"
import type { Completion } from "./scaleway"
import { approvedLabel, limits } from "./settings"
import { emptyAnswerReasoning } from "./verdict"

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const repository = required("REPOSITORY")
const number = Number(required("PR_NUMBER"))
const key = required("SCW_PR_REVIEW_SECRET_KEY")
const github = gitHub(required("GITHUB_TOKEN"), repository)
const frameworkGeneric = process.env.FRAMEWORK_GENERIC === "true"
const autoMerge = process.env.AUTO_MERGE === "true"

const pullRequest = await github.pullRequest(number)
const sha = pullRequest.head.sha

// A dispatched review gets here without the workflow's event checks.
if (pullRequest.state !== "open" || pullRequest.draft) {
  console.log("Not reviewed: the pull request is closed or a draft.")
  process.exit(0)
}

if (autoMerge) {
  const approved = approvedSha((await github.reviewComment(number, marker))?.body ?? "")
  // A head that carries an approval gets the label too: the approval may come from a review made before auto-merge
  // was on, which put no label on. The do-not-merge label, not this one, is how a person holds a merge back.
  if (approved !== null && (await carriesApproval(github, sha, approved, pullRequest.base.ref))) {
    console.log(`Not reviewed again: ${sha.slice(0, 7)} carries the approval of ${approved.slice(0, 7)}.`)
    if (!pullRequest.labels.some((label) => label.name === approvedLabel)) await github.addLabel(number, approvedLabel)
    process.exit(0)
  }
  if (pullRequest.labels.some((label) => label.name === approvedLabel)) await github.removeLabel(number, approvedLabel)
}

const files = pullRequest.changed_files > limits.maxListedFiles ? [] : await github.changedFiles(number, limits.maxListedFiles)
const changed = pullRequest.changed_files > limits.maxListedFiles ? pullRequest.changed_files : files.filter((file) => !isPureRename(file)).length
if (changed > limits.maxFiles) {
  await github.upsertComment(number, marker, skipComment(sha, `it changes ${changed} files, above the cap of ${limits.maxFiles}.`))
  process.exit(0)
}

const contents = new Map<string, string>()
const tooLarge: string[] = []
for (const path of contentPaths(files)) {
  const text = await github.fileAt(path, sha)
  if (text === null) continue
  if (text.length > limits.maxFileChars) tooLarge.push(path)
  else contents.set(path, text)
}

// A diff alone above the cap is asked about in parts that each fit (parts.ts); one that fits is a single part.
const split = splitIntoParts(pullRequest, files, contents, tooLarge, limits.maxInputChars, limits.maxParts)
const cap = `${limits.maxInputChars / 1000}k`
if (split.kind === "file too large") {
  const reason = `the diff of ${split.path} alone comes to ${Math.round(split.size / 1000)}k characters, above the cap of ${cap}.`
  await github.upsertComment(number, marker, skipComment(sha, reason))
  process.exit(0)
}
if (split.kind === "too many parts") {
  const reason = `its diff needs ${split.count} parts of at most ${cap} characters, above the cap of ${limits.maxParts} parts.`
  await github.upsertComment(number, marker, skipComment(sha, reason))
  process.exit(0)
}

// The rules come from the base commit, so a pull request cannot rewrite the rules it is reviewed against.
// A repository without its own CONTRIBUTING.md falls back to its organization's default one.
async function rules(): Promise<Rule[]> {
  const base = pullRequest.base.sha
  const owner = repository.split("/")[0]
  const contributing =
    (await github.fileAt("CONTRIBUTING.md", base)) ??
    (await github.fileAt(".github/CONTRIBUTING.md", base)) ??
    (await github.fileAt("CONTRIBUTING.md", null, `${owner}/.github`))
  const agents = await github.fileAt("AGENTS.md", base)
  return [
    ...(contributing ? [{ name: "CONTRIBUTING.md", text: contributing }] : []),
    ...(agents ? [{ name: "AGENTS.md", text: agents }] : []),
  ]
}

const system = buildSystemPrompt(await loadTemplates(), {
  repository,
  description: await github.description(),
  frameworkGeneric,
  rules: await rules(),
})

// An empty answer, or a clean one cut off at the output cap, is not a pass: the fallback reviewer's review of the head
// decides instead (decision.ts). Only a turn the model ended with no answer is asked once more (ask.ts).
function logAsk(completion: Completion) {
  console.log(`finish=${completion.finish} usage=${JSON.stringify(completion.usage)}`)
  const reasoning = emptyAnswerReasoning(completion)
  if (reasoning !== null) console.log(`The answer is empty; the reasoning ends with:\n${reasoning}`)
}

const completions: Completion[] = []
for (const [index, user] of split.messages.entries()) {
  if (split.messages.length > 1) console.log(`Part ${index + 1} of ${split.messages.length}, ${Math.round(user.length / 1000)}k characters:`)
  const { completion, emptyFirst } = await askForReview(key, system, user)
  if (emptyFirst) {
    logAsk(emptyFirst)
    console.log("Asked once more, as the model ended its turn with no answer.")
  }
  logAsk(completion)
  completions.push(completion)
}

const { body, decidedBy } = await decide(sha, completions, () => readFallbackReview(github, number, sha))
console.log(`Decided by ${decidedBy}.`)
await github.upsertComment(number, marker, body)
if (autoMerge && approvedSha(body) === sha) await github.addLabel(number, approvedLabel)
