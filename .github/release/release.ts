// One pass of a repository's release (../workflows/release.yml): keeps the one pull request from the development
// branch into the default branch open, held by the do-not-merge label, its body listing what it brings and where its
// checks stand. Once its head passed CI, a clean AI review and, where there is one, the dev environment, it asks the
// captain in the backlog, and keeps that one request's text naming the newest head. Once the captain approved the
// head, while its checks still pass, it merges that exact commit with a merge commit and starts the deploy workflow on
// the default branch: a merge with GITHUB_TOKEN starts no push workflow of its own. Every pass does all of this again,
// so a push, the schedule and a dispatch each bring the release up to date.
//
//   REPOSITORY=owner/name GITHUB_TOKEN=... RUN_ID=... BACKLOG_URL=... BACKLOG_RELEASE_EMAIL=... \
//     BACKLOG_RELEASE_PASSWORD=... [DEVELOPMENT_BRANCH=development] [DEPLOYED_URL= FAILED_URL= HEALTH_URL=] \
//     [DEPLOY_WORKFLOW=test.yml] bun release.ts
import { carriesApproval } from "../ai-review/approval"
import { approvedSha, marker } from "../ai-review/comment"
import { holdLabel } from "../ai-review/settings"
import { type Backlog, backlog } from "./backlog"
import { decide } from "./decide"
import { devEnvironment } from "./dev-environment"
import { allPassed, ciGate, devGate, reviewGate } from "./gates"
import { gitHub } from "./github"
import { pullRequestBody, type Release, requestId, requestText } from "./text"

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const repository = required("REPOSITORY")
const development = process.env.DEVELOPMENT_BRANCH || "development"
const deployWorkflow = process.env.DEPLOY_WORKFLOW || null
const deployedUrl = process.env.DEPLOYED_URL || null
const github = gitHub(required("GITHUB_TOKEN"), repository)

const base = await github.defaultBranch()
const commits = await github.commitsAhead(base, development)
if (commits.length === 0) {
  console.log(`${development} has nothing that ${base} does not have.`)
  process.exit(0)
}

const pullRequest =
  (await github.openPullRequest(development, base)) ??
  (await github.createPullRequest(development, base, `Release ${development} into ${base}`, "The release workflow fills this in."))
const head = pullRequest.head.sha
if (!pullRequest.labels.some((label) => label.name === holdLabel)) await github.addLabel(pullRequest.number, holdLabel)

// The gates of the head.
const ownWorkflowId = (await github.workflowRun(Number(required("RUN_ID")))).workflow_id
const ci = ciGate(await github.workflowRuns(head), await github.checkRuns(head), await github.statuses(head), ownWorkflowId)
const comment = (await github.reviewComment(pullRequest.number, marker))?.body ?? null
const reviewed = approvedSha(comment ?? "")
const review = reviewGate(head, comment, reviewed !== null && (await carriesApproval(github, head, reviewed, base)))
const dev = deployedUrl
  ? devGate(head, await devEnvironment({ deployedUrl, failedUrl: process.env.FAILED_URL || "", healthUrl: required("HEALTH_URL") }))
  : null
const release: Release = { repository, base, development, head, url: pullRequest.html_url, commits, gates: { ci, review, dev } }
const passed = allPassed(release.gates)

// The backlog, signed in only when there is a request to read or one to ask: the app allows few sign-ins a minute.
let signedIn: Backlog | null = null
const backlogApp = async () => {
  signedIn ??= await backlog(required("BACKLOG_URL"), required("BACKLOG_RELEASE_EMAIL"), required("BACKLOG_RELEASE_PASSWORD"))
  return signedIn
}
const named = requestId(pullRequest.body)
const request = named === null ? null : await (await backlogApp()).request(named)
const decision = decide(head, passed, request)
console.log(`Head ${head.slice(0, 7)}: CI ${ci.text}; AI review ${review.text}${dev ? `; dev ${dev.text}` : ""}. ${decision.kind}.`)

let asked = request?.id ?? null
const text = requestText(release)
if (decision.kind === "ask") {
  const app = await backlogApp()
  asked = await app.ask(await app.ensureTask(repository, pullRequest.html_url), text)
}
if (decision.kind === "update" && JSON.stringify(request?.text) !== JSON.stringify(text)) await (await backlogApp()).update(decision.id, text)

const link = asked === null || signedIn === null ? null : (signedIn as Backlog).link(asked)
const body = pullRequestBody(release, decision, link, asked)
if (body !== pullRequest.body) await github.setBody(pullRequest.number, body)

if (decision.kind === "merge") {
  await github.removeLabel(pullRequest.number, holdLabel)
  await github.merge(pullRequest.number, head, "merge")
  console.log(`Merged ${head.slice(0, 7)} into ${base}.`)
  if (deployWorkflow) {
    await github.dispatch(deployWorkflow, base)
    console.log(`Started ${deployWorkflow} on ${base}.`)
  }
}
