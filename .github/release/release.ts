// One pass of a repository's release (../workflows/release.yml), as a draft GitHub release. With no draft, it cuts one
// at the newest development commit that came through a pull request whose AI review passed and whose CI passed, tagged
// by the date or the repository's version, with GitHub's generated notes. Newer development commits wait for the next
// release: the draft's commit never moves. Once that commit also runs on the dev environment, where there is one, it
// asks the captain in the backlog, linking the draft. Once the captain approved that commit, it moves the default
// branch to it (a fast-forward, else a merge commit), publishes the release, which tags it, and starts the deploy
// workflow: GITHUB_TOKEN's tag and push start no workflow of their own, so nothing ships twice. Every pass does all of
// this again, so a push, the schedule and a dispatch each bring the release up to date.
//
//   REPOSITORY=owner/name GITHUB_TOKEN=... [RUN_ID=...] BACKLOG_URL=... BACKLOG_RELEASE_EMAIL=... \
//     BACKLOG_RELEASE_PASSWORD=... [DEVELOPMENT_BRANCH=development] [VERSION_FILE=package.json] [WITHOUT_CI=true] \
//     [DEPLOYED_URL= FAILED_URL= HEALTH_URL=] [DEPLOY_WORKFLOW=test.yml DEPLOY_REF=branch|tag] bun release.ts
import { type Backlog, backlog } from "./backlog"
import { decide } from "./decide"
import { devEnvironment } from "./dev-environment"
import { commitChecks } from "./commit-checks"
import { allPassed, devGate } from "./gates"
import { type DraftRelease, gitHub } from "./github"
import { releaseBody, releaseMarker, releaseNotes, type Release, releaseTag, requestId, requestText } from "./text"
import { dateTag, versionTag } from "./tag"

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const repository = required("REPOSITORY")
const development = process.env.DEVELOPMENT_BRANCH || "development"
const versionFile = process.env.VERSION_FILE || null
const deployWorkflow = process.env.DEPLOY_WORKFLOW || null
const deployRef = process.env.DEPLOY_REF || "branch"
const deployedUrl = process.env.DEPLOYED_URL || null
const withoutCi = process.env.WITHOUT_CI === "true"
const github = gitHub(required("GITHUB_TOKEN"), repository)

const base = await github.defaultBranch()
const ownWorkflowId = process.env.RUN_ID ? (await github.workflowRun(Number(process.env.RUN_ID))).workflow_id : 0

const commitChecksOf = commitChecks(github, { development, ownWorkflowId, withoutCi })

// The draft this workflow made, or a new one at the newest commit whose checks passed; null when there is none to make.
// At most this many of development's newest commits are looked at for one.
const maxCandidates = 20
async function currentDraft(): Promise<DraftRelease | null> {
  const drafts = (await github.releases()).filter((release) => release.draft && release.body?.includes(releaseMarker))
  if (drafts.length > 0) return drafts.at(-1)!

  const ahead = await github.commitsAhead(base, development)
  if (ahead.length === 0) {
    console.log(`${development} has nothing that ${base} does not have.`)
    return null
  }
  for (const candidate of ahead.slice(-maxCandidates).reverse()) {
    const checks = await commitChecksOf(candidate.sha)
    console.log(`${candidate.sha.slice(0, 7)}: ${checks.text}`)
    if (checks.state !== "passed") continue
    const tag = versionFile ? versionTag(await github.fileAt(versionFile, candidate.sha)) : dateTag(new Date())
    if (await github.tagExists(tag)) {
      console.log(`${tag} is released already: ${versionFile ? `raise the version in ${versionFile}` : "try again in a minute"}.`)
      return null
    }
    const notes = await github.generatedNotes(tag, candidate.sha)
    return github.createDraft(tag, candidate.sha, tag, `${releaseMarker}\n<!-- release-tag: ${tag} -->\n<!-- release-notes -->\n${notes}\n`)
  }
  console.log(`No commit of the newest ${maxCandidates} on ${development} has passed its checks yet.`)
  return null
}

const draft = await currentDraft()
if (draft === null) process.exit(0)
const commit = draft.target_commitish
const tag = releaseTag(draft.body) ?? draft.tag_name
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`The draft ${draft.tag_name} targets ${commit}, not a commit`)

const commits = await github.commitsAhead(base, commit)
const checks = await commitChecksOf(commit)
const dev = deployedUrl
  ? await devEnvironment({ deployedUrl, failedUrl: process.env.FAILED_URL || "", healthUrl: required("HEALTH_URL") })
  : null
const devCheck = dev ? devGate(commit, { ...dev, hasCommit: dev.deployed !== null && (await github.contains(dev.deployed, commit)) }) : null
const release: Release = { repository, base, development, commit, tag, url: draft.html_url, commits, gates: { commit: checks, dev: devCheck } }

// The backlog, signed in only when there is a request to read or one to ask: the app allows few sign-ins a minute.
let signedIn: Backlog | null = null
const backlogApp = async () => {
  signedIn ??= await backlog(required("BACKLOG_URL"), required("BACKLOG_RELEASE_EMAIL"), required("BACKLOG_RELEASE_PASSWORD"))
  return signedIn
}
const named = requestId(draft.body)
const request = named === null ? null : await (await backlogApp()).request(named)
const decision = decide(commit, allPassed(release.gates), request)
console.log(`${tag} at ${commit.slice(0, 7)}: ${checks.text}${devCheck ? `; dev ${devCheck.text}` : ""}. ${decision.kind}.`)

let asked = request?.id ?? null
const text = requestText(release)
if (decision.kind === "ask") {
  const app = await backlogApp()
  asked = await app.ask(await app.ensureTask(repository, draft.html_url), text)
}
if (decision.kind === "update" && JSON.stringify(request?.text) !== JSON.stringify(text)) await (await backlogApp()).update(decision.id, text)

const link = asked === null || signedIn === null ? null : (signedIn as Backlog).link(asked)
const body = releaseBody(release, decision, link, asked, releaseNotes(draft.body))
if (body !== draft.body) await github.setReleaseBody(draft.id, tag, body)

if (decision.kind === "merge") {
  const head = await github.advance(base, commit, tag)
  await github.publish(draft.id, tag, head)
  console.log(`${base} is at ${head.slice(0, 7)}; published ${tag}.`)
  if (deployWorkflow) {
    await github.dispatch(deployWorkflow, deployRef === "tag" ? tag : base)
    console.log(`Started ${deployWorkflow} on ${deployRef === "tag" ? tag : base}.`)
  }
}
