// Merges a pull request that carries the ai-approved label and a clean AI review of its head, once everything else on
// the head has passed. It runs in the review's job after the review, or alone when the label is added or the branch
// only merged its base in. It never merges a pull request whose head is in another repository, from an author who
// cannot write to the repository, whose head moves on while it waits, or that carries the do-not-merge label, and it
// stops at the first failed check. A release, from development into the default branch, never merges here.
//
//   REPOSITORY=owner/name PR_NUMBER=1 MERGE_METHOD=squash RUN_ID=... GITHUB_TOKEN=... bun merge.ts
import { carriesApproval } from "./approval"
import { checksState } from "./checks"
import { approvedSha, marker } from "./comment"
import { gitHub } from "./github"
import { approvedLabel, holdLabel, releaseBranch } from "./settings"

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const repository = required("REPOSITORY")
const number = Number(required("PR_NUMBER"))
const method = required("MERGE_METHOD")
const github = gitHub(required("GITHUB_TOKEN"), repository)

const pollMs = 30_000
const writers = new Set(["admin", "maintain", "write"])
// github-actions opens the protobase bump pull requests. It is no collaborator, and only this repository's own
// workflows act as it.
const workflowAuthor = "github-actions[bot]"

// Why the pull request may not be merged as it is now, or null when its head `sha` may be.
async function refusal(sha: string) {
  const pullRequest = await github.pullRequest(number)
  if (pullRequest.state !== "open" || pullRequest.draft) return "it is no longer an open, ready pull request"

  // A null head repository is a fork that was deleted. Only a head in this very repository ever merges.
  const headRepository = pullRequest.head.repo === null ? null : pullRequest.head.repo.full_name
  if (headRepository !== repository) return `its head is in ${headRepository ?? "a deleted fork"}, not in ${repository}`

  if (pullRequest.head.ref === releaseBranch && pullRequest.base.ref === (await github.defaultBranch()))
    return `it is a release from ${releaseBranch} into ${pullRequest.base.ref}, which needs a person's approval`

  if (pullRequest.head.sha !== sha) return `its head moved on from ${sha.slice(0, 7)}`
  if (pullRequest.labels.some((label) => label.name === holdLabel)) return `it has the ${holdLabel} label`
  if (!pullRequest.labels.some((label) => label.name === approvedLabel)) return `it has no ${approvedLabel} label`

  const author = pullRequest.user.login
  if (author !== workflowAuthor && !writers.has(await github.role(author))) return `its author ${author} cannot write to the repository`

  const approved = approvedSha((await github.reviewComment(number, marker))?.body ?? "")
  if (approved === null || !(await carriesApproval(github, sha, approved, pullRequest.base.ref)))
    return `its head ${sha.slice(0, 7)} has no AI review that found no issues`
  return null
}

function stop(reason: string): never {
  console.log(`Not merging: ${reason}.`)
  process.exit(0)
}

const sha = (await github.pullRequest(number)).head.sha
const ownWorkflowId = (await github.workflowRun(Number(required("RUN_ID")))).workflow_id

while (true) {
  const reason = await refusal(sha)
  if (reason) stop(reason)

  const checks = checksState(await github.workflowRuns(sha), await github.checkRuns(sha), await github.statuses(sha), ownWorkflowId)
  if (checks.state === "red") stop(`these did not pass: ${checks.names.join(", ")}`)
  if (checks.state === "green") break
  await Bun.sleep(pollMs)
}

await github.merge(number, sha, method)
console.log(`Merged ${sha.slice(0, 7)} with ${method}.`)
