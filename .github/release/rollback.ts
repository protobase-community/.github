// One look of a repository's rollback watch (../workflows/release-rollback.yml), in the hours after a promotion. Once
// the stable host deployed the newest release, Bugsink first seeing issues there since then sends that host back to
// the release before: central hands it a rollback (protobase-cloud's /deploys/hosts/:host/rollback), and a notice for
// Firstmate goes into the backlog. The default branch stays: the next promotion moves on from it once the cause is
// fixed. Migrations are expand, then contract, so the release before runs on the newer database.
//
//   REPOSITORY=owner/name GITHUB_TOKEN=... STABLE_HOST=eu1 STABLE_RESULTS_URL=https://console.protobase.net/deploys/hosts/eu1 \
//     ROLLBACK_URL=https://console.protobase.net/deploys/hosts/eu1/rollback DEPLOY_ROLLBACK_TOKEN=... BUGSINK_URL=... \
//     BUGSINK_TOKEN=... BUGSINK_PROJECTS=1,2,3 BACKLOG_URL=... BACKLOG_RELEASE_EMAIL=... BACKLOG_RELEASE_PASSWORD=... \
//     [WATCH_HOURS=24] [NEW_ISSUES=1] bun rollback.ts
import { backlog } from "./backlog"
import { bugsink } from "./bugsink"
import { gitHub } from "./github"
import { deployedOn, type HostResult, rollbackDue } from "./promotion"

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const now = new Date()
const repository = required("REPOSITORY")
const host = required("STABLE_HOST")
const watchHours = Number(process.env.WATCH_HOURS || 24)
const threshold = Number(process.env.NEW_ISSUES || 1)
const github = gitHub(required("GITHUB_TOKEN"), repository)

const [newest, before] = await github.publishedReleases()
if (!newest || !before) {
  console.log("No release before the newest to go back to.")
  process.exit(0)
}
if (now.getTime() - new Date(newest.created_at).getTime() > watchHours * 3_600_000) {
  console.log(`${newest.tag_name} is older than ${watchHours} h: the watch is over.`)
  process.exit(0)
}
const [release, previous] = [await github.commitOf(newest.tag_name), await github.commitOf(before.tag_name)]

// The stable host's deploys, newest first: when it took the release, and whether it went back after.
const results = (await (await fetch(required("STABLE_RESULTS_URL"), { signal: AbortSignal.timeout(30_000) })).json()) as { results: HostResult[] }
const deployed = deployedOn(results.results)
const live = deployed.find((build) => build.sha === release)
const rolledBack = live !== undefined && deployed.some((build) => build.sha === previous && build.liveSince > live.liveSince)

const errors = bugsink(required("BUGSINK_URL"), required("BUGSINK_TOKEN"))
const projects = required("BUGSINK_PROJECTS").split(",").map(Number)
const since = live?.liveSince ?? now
const fresh = (await Promise.all(projects.map((project) => errors.issuesSince(project, since))))
  .flat()
  .filter((issue) => new Date(issue.first_seen) >= since)
console.log(`${newest.tag_name} on ${host}: ${live ? `live since ${live.liveSince.toISOString()}` : "not live yet"}; ${fresh.length} new issues.`)
if (!rollbackDue({ liveSince: live?.liveSince ?? null, rolledBack, newIssues: fresh.length, threshold })) process.exit(0)

const asked = await fetch(required("ROLLBACK_URL"), {
  method: "POST",
  headers: { authorization: `Bearer ${required("DEPLOY_ROLLBACK_TOKEN")}`, "content-type": "application/json" },
  body: JSON.stringify({ sha: previous }),
  signal: AbortSignal.timeout(30_000),
})
if (asked.status !== 202) throw new Error(`Central answered ${asked.status} to the rollback of ${host}`)
const names = fresh.slice(0, 5).map((issue) => `- ${issue.calculated_type}: ${issue.calculated_value}`.slice(0, 120))
const app = await backlog(required("BACKLOG_URL"), required("BACKLOG_RELEASE_EMAIL"), required("BACKLOG_RELEASE_PASSWORD"))
await app.fileTask({
  id: `release-${repository.replace("/", "-")}-rollback-${newest.tag_name}`,
  title: `${repository}: ${host} rolled back from ${newest.tag_name} to ${before.tag_name}`,
  repo: repository,
  body: [`Bugsink first saw ${fresh.length} issues on ${host} since ${newest.tag_name} went live, so ${host} went back to ${before.tag_name} (${previous.slice(0, 7)}).`, "", ...names].join("\n"),
})
console.log(`Asked central to roll ${host} back to ${before.tag_name}; filed the notice for Firstmate.`)
