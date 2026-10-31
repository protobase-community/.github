// Reviews one pull request with the AI model and posts or updates its advisory comment.
// It reads the pull request only through the GitHub API, as data, and never checks out or runs its code.
//
//   REPOSITORY=owner/name PR_NUMBER=1 GITHUB_TOKEN=... SCW_PR_REVIEW_SECRET_KEY=... bun review.ts
import { marker, reviewComment, skipComment } from "./comment"
import { gitHub } from "./github"
import { buildSystemPrompt, loadTemplates, type Rule } from "./prompt"
import { buildUserMessage, contentPaths } from "./pull-request"
import { completeAnswer } from "./scaleway"
import { limits } from "./settings"

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

const pullRequest = await github.pullRequest(number)
const sha = pullRequest.head.sha

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

const user = buildUserMessage(pullRequest, files, contents, tooLarge)
if (user.length > limits.maxInputChars) {
  const size = `${Math.round(user.length / 1000)}k characters`
  await github.upsertComment(number, marker, skipComment(sha, `the diff and changed files come to ${size}, above the cap of ${limits.maxInputChars / 1000}k.`))
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
