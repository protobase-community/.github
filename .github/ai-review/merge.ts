// Merges a pull request that carries the ai-approved label and a clean AI review of its head, once everything else on
// the head has passed. It runs in the review's job after the review, alone when the label is added or the branch only
// merged its base in, when a CI run on the pull request's branch finishes, and when another app's check suite or
// commit status on its head finishes. It tries once and never waits, so it holds no runner while checks run: a check
// still running leaves the merge to the one that finishes last. It never
// merges a pull request whose head is in another repository, from an author who cannot write to the repository, or
// that carries the do-not-merge label, nor with a failed check.
//
//   REPOSITORY=owner/name PR_NUMBER=1 MERGE_METHOD=squash RUN_ID=... GITHUB_TOKEN=... bun merge.ts
//   REPOSITORY=owner/name HEAD_BRANCH=topic MERGE_METHOD=squash RUN_ID=... GITHUB_TOKEN=... bun merge.ts
//
// MERGE_TOKEN, when set, makes the merge itself, so its push starts the base branch's workflows, as one with
// GITHUB_TOKEN does not; everything before it reads with GITHUB_TOKEN. DISPATCH_AFTER_MERGE, a workflow file name such
// as release.yml, is the way that needs no token: right after the merge it starts that workflow with
// workflow_dispatch on the base branch, with GITHUB_TOKEN.
// After the merge it deletes the head branch when the repository's "Automatically delete head branches" setting is on,
// which GitHub does not do itself for a merge made with GITHUB_TOKEN.
import { carriesApproval } from "./approval"
import { checksState } from "./checks"
import { approvedSha, marker } from "./comment"
import { deleteMergedHead } from "./delete-head"
import { gitHub } from "./github"
import { mergeAndDispatch } from "./merge-dispatch"
import { approvedLabel, holdLabel } from "./settings"
import { type CheckSuiteEvent, checkSuitePullRequest, type StatusEvent, statusPullRequest } from "./trigger"

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const repository = required("REPOSITORY")
const method = required("MERGE_METHOD")
const github = gitHub(required("GITHUB_TOKEN"), repository)
const merger = process.env.MERGE_TOKEN ? gitHub(process.env.MERGE_TOKEN, repository) : github

function stop(reason: string): never {
  console.log(`Not merging: ${reason}.`)
  process.exit(0)
}

// Another app's check suite or commit status that finished names its pull request only in the event, if at all.
async function eventPullRequest(name: string) {
  const event = await Bun.file(required("GITHUB_EVENT_PATH")).json()
  const found =
    name === "check_suite"
      ? checkSuitePullRequest(event as CheckSuiteEvent)
      : statusPullRequest(event as StatusEvent, await github.commitPullRequests((event as StatusEvent).sha), repository)
  return found ?? stop(`the ${name} event is for no open pull request whose head is in ${repository}`)
}

// A CI run started with workflow_dispatch names no pull request, so its branch finds the open one. 0 names none either.
async function pullRequestNumber() {
  const event = process.env.GITHUB_EVENT_NAME
  if (event === "check_suite" || event === "status") return eventPullRequest(event)
  const given = Number(process.env.PR_NUMBER || 0)
  if (given > 0) return given
  return (await github.openPullRequest(required("HEAD_BRANCH"))) ?? stop(`no open pull request has the head ${process.env.HEAD_BRANCH}`)
}

const number = await pullRequestNumber()

const writers = new Set(["admin", "maintain", "write"])
// github-actions opens the pull requests of this repository's own workflows. It is no collaborator, and only those
// workflows act as it.
const workflowAuthor = "github-actions[bot]"

// Why the pull request may not be merged as it is now, or null when its head may be.
async function refusal(pullRequest: Awaited<ReturnType<typeof github.pullRequest>>) {
  const sha = pullRequest.head.sha
  if (pullRequest.state !== "open" || pullRequest.draft) return "it is no longer an open, ready pull request"

  // A null head repository is a fork that was deleted. Only a head in this very repository ever merges.
  const headRepository = pullRequest.head.repo === null ? null : pullRequest.head.repo.full_name
  if (headRepository !== repository) return `its head is in ${headRepository ?? "a deleted fork"}, not in ${repository}`

  if (pullRequest.labels.some((label) => label.name === holdLabel)) return `it has the ${holdLabel} label`
  if (!pullRequest.labels.some((label) => label.name === approvedLabel)) return `it has no ${approvedLabel} label`

  const author = pullRequest.user.login
  if (author !== workflowAuthor && !writers.has(await github.role(author))) return `its author ${author} cannot write to the repository`

  const approved = approvedSha((await github.reviewComment(number, marker))?.body ?? "")
  if (approved === null || !(await carriesApproval(github, sha, approved, pullRequest.base.ref)))
    return `its head ${sha.slice(0, 7)} has no AI review that found no issues`
  return null
}

const pullRequest = await github.pullRequest(number)
const sha = pullRequest.head.sha
const reason = await refusal(pullRequest)
if (reason) stop(reason)

const ownWorkflowId = (await github.workflowRun(Number(required("RUN_ID")))).workflow_id
const checks = checksState(await github.workflowRuns(sha), await github.checkRuns(sha), await github.statuses(sha), ownWorkflowId)
if (checks.state === "red") stop(`these did not pass: ${checks.names.join(", ")}`)
if (checks.state === "pending") stop(`these still run: ${checks.names.join(", ")}; the check that finishes last merges it`)

// GitHub refuses the merge when the head moved on since it was read.
const target = { number, sha, base: pullRequest.base.ref }
await mergeAndDispatch(merger, github, target, method, process.env.DISPATCH_AFTER_MERGE)
// Only a head in this repository merges, so the branch is this repository's to delete.
await deleteMergedHead(github, pullRequest.head.ref)
