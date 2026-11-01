// One pass of a repository's daily promotion (../workflows/release-promote.yml). It takes the newest build the beta
// host deployed that soaked there long enough and is not on the default branch yet. Once every gate passes, it moves
// the default branch to it, publishes a release, which tags it, and starts the deploy workflow on the default branch,
// which deploys it to the stable hosts. The gates:
// - the build's checks (commit-checks.ts) and its soak;
// - no new Bugsink errors since it went live on the beta host;
// - no failed backup or restore check since then (Bugsink's backups project);
// - no open serious beta report;
// - when it changes risky places, its integration review and every scenario done.
// A gate that fails files one notice for Firstmate in the backlog. A hotfix (HOTFIX_SHA) skips only the soak. On its
// schedule it acts at 06:00 in Amsterdam alone.
//
//   REPOSITORY=owner/name GITHUB_TOKEN=... [RUN_ID=...] BETA_RESULTS_URL=https://console.protobase.net/deploys/hosts/eu2 \
//     BUGSINK_URL=... BUGSINK_TOKEN=... BUGSINK_PROJECTS=1,2,3 BUGSINK_BACKUPS_PROJECT=12 BACKLOG_URL=... \
//     BACKLOG_RELEASE_EMAIL=... BACKLOG_RELEASE_PASSWORD=... DEPLOY_WORKFLOW=test.yml [SOAK_HOURS=24] [HOTFIX_SHA=...] \
//     [RISKY_PATHS=<regexes, one a line>] [SCHEDULED=true] bun promote.ts
import { backlog } from "./backlog"
import { bugsink } from "./bugsink"
import { commitChecks } from "./commit-checks"
import type { Gate } from "./gates"
import { gitHub } from "./github"
import { amsterdamHour, deployedOnBeta, errorsGate, type HostResult, reportsGate, riskyFiles, scenariosGate, soakGate } from "./promotion"
import { dateTag } from "./tag"

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const now = new Date()
if (process.env.SCHEDULED === "true" && amsterdamHour(now) !== 6) {
  console.log("Not 06:00 in Amsterdam: the other of the two daily schedules acts.")
  process.exit(0)
}

const repository = required("REPOSITORY")
const development = process.env.DEVELOPMENT_BRANCH || "development"
const beta = process.env.BETA_BRANCH || "beta"
const hotfix = process.env.HOTFIX_SHA || null
const soakHours = Number(process.env.SOAK_HOURS || 24)
const risky = (process.env.RISKY_PATHS || "").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => new RegExp(line))
const github = gitHub(required("GITHUB_TOKEN"), repository)
const ownWorkflowId = process.env.RUN_ID ? (await github.workflowRun(Number(process.env.RUN_ID))).workflow_id : 0
const checksOf = commitChecks(github, { development, ownWorkflowId, withoutCi: process.env.WITHOUT_CI === "true" })
const base = await github.defaultBranch()

// The builds the beta host runs or ran that the default branch does not have yet, newest first.
const results = (await (await fetch(required("BETA_RESULTS_URL"), { signal: AbortSignal.timeout(30_000) })).json()) as { results: HostResult[] }
const builds = []
for (const build of deployedOnBeta(results.results)) {
  if (hotfix && build.sha !== hotfix) continue
  if (await github.contains(base, build.sha)) continue
  if (!(await github.contains(beta, build.sha))) continue
  builds.push(build)
}
const build = builds.find((candidate) => hotfix || soakGate(candidate.liveSince, now, soakHours).state === "passed")
if (!build) {
  console.log(hotfix ? `The beta host has not deployed ${hotfix.slice(0, 7)} yet.` : `No build has soaked ${soakHours} h on the beta host yet.`)
  process.exit(0)
}
const short = build.sha.slice(0, 7)

const errors = bugsink(required("BUGSINK_URL"), required("BUGSINK_TOKEN"))
const projects = required("BUGSINK_PROJECTS").split(",").map(Number)
const errorIssues = (await Promise.all(projects.map((project) => errors.issuesSince(project, build.liveSince)))).flat()
const backupIssues = await errors.issuesSince(Number(required("BUGSINK_BACKUPS_PROJECT")), build.liveSince)
const app = await backlog(required("BACKLOG_URL"), required("BACKLOG_RELEASE_EMAIL"), required("BACKLOG_RELEASE_PASSWORD"))
const reports = await app.tasks('kind = "beta-report" AND state != "done" AND cancelled = false')
const touched = riskyFiles(await github.changedFiles(base, build.sha), risky)
const scenarios = touched.length > 0 ? await app.tasks(`kind = "scenario" AND regex(id, "^scenario-${short}-")`) : []

const gates: Array<[string, Gate]> = [
  ["Checks", await checksOf(build.sha)],
  ...(hotfix ? [] : [["Soak", soakGate(build.liveSince, now, soakHours)] as [string, Gate]]),
  ["Errors", errorsGate(errorIssues, build.liveSince, "errors")],
  ["Backups and restore tests", errorsGate(backupIssues, build.liveSince, "backup or restore failures")],
  ["Beta reports", reportsGate(reports)],
  ...(touched.length > 0 ? [["Integration review", scenariosGate(build.sha, scenarios)] as [string, Gate]] : []),
]
const lines = gates.map(([name, gate]) => `- ${name}: ${gate.text}`)
console.log(`${hotfix ? "Hotfix" : "Build"} ${short}:\n${lines.join("\n")}`)

if (gates.some(([, gate]) => gate.state !== "passed")) {
  const day = now.toISOString().slice(0, 10)
  const filed = await app.fileTask({
    id: `release-${repository.replace("/", "-")}-held-${day}${hotfix ? `-hotfix-${short}` : ""}`,
    title: `${repository}: ${hotfix ? "hotfix" : "the daily promotion"} of ${short} held on ${day}`,
    repo: repository,
    body: [`${base} stays where it is. ${hotfix ? "The hotfix" : "The build"} ${short} did not pass every gate:`, "", ...lines].join("\n"),
  })
  console.log(filed ? "Filed the notice for Firstmate." : "The notice for Firstmate was filed already.")
  process.exit(0)
}

const head = await github.advance(base, build.sha, `Release ${short}`)
const tag = dateTag(now)
await github.release(tag, head)
await github.dispatch(required("DEPLOY_WORKFLOW"), base)
console.log(`${base} is at ${head.slice(0, 7)}; published ${tag}; started ${required("DEPLOY_WORKFLOW")} on ${base}.`)
