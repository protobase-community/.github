// Reviews one pull request with the AI model and posts or updates its advisory comment.
// It reads the pull request only through the GitHub API, as data, and never checks out or runs its code.
//
// With AUTO_MERGE=true a review that finds no issues also puts the approval label on, and any other review takes it
// off. A head that still carries an earlier approval, because it only merged the base branch in, is not reviewed again
// and keeps or gets the label.
//
//   REPOSITORY=owner/name PR_NUMBER=1 GITHUB_TOKEN=... SCW_PR_REVIEW_SECRET_KEY=... [AUTO_MERGE=true] bun review.ts
import { carriesApproval } from "./approval"
import { approvedSha, isClean, marker, reviewComment, skipComment } from "./comment"
import { gitHub } from "./github"
import { buildSystemPrompt, loadTemplates, type Rule } from "./prompt"
import { contentPaths, fitUserMessage } from "./pull-request"
import { completeAnswer } from "./scaleway"
import { approvedLabel, limits } from "./settings"

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

if (pullRequest.changed_files > limits.maxFiles) {
  await github.upsertComment(number, marker, skipComment(sha, `it changes ${pullRequest.changed_files} files, above the cap of ${limits.maxFiles}.`))
  process.exit(0)
}

const files = await github.changedFiles(number, limits.maxFiles)
const contents = new Map<string, string>()
const tooLarge: string[] = []
for (const path of contentPaths(files)) {
  const text = await github.fileAt(path, sha)
  if (text === null) continue
  if (text.length > limits.maxFileChars) tooLarge.push(path)
  else contents.set(path, text)
}

const { message: user } = fitUserMessage(pullRequest, files, contents, tooLarge, limits.maxInputChars)
if (user.length > limits.maxInputChars) {
  const size = `${Math.round(user.length / 1000)}k characters`
  await github.upsertComment(number, marker, skipComment(sha, `its diff alone comes to ${size}, above the cap of ${limits.maxInputChars / 1000}k.`))
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

const completion = await completeAnswer(key, system, user)
console.log(`finish=${completion.finish} usage=${JSON.stringify(completion.usage)}`)

const body =
  completion.finish === "length" && !completion.content.trim()
    ? skipComment(sha, "the model used its whole output budget before answering.")
    : reviewComment(sha, completion.content)
await github.upsertComment(number, marker, body)
if (autoMerge && isClean(completion.content)) await github.addLabel(number, approvedLabel)
