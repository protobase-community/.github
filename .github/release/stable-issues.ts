// The issues the stable host raised on the release it took, for the rollback watch (rollback.ts). The api and router
// projects also take the beta host's events, from newer development builds, and central's: an issue counts only when
// one of its events since the release went live came from the stable host on that release. The Sentry SDK names the
// host by `server_name`, its hostname, such as `eu1` or `eu1.protobase.net`, and the build by `release`, the deployed
// commit (`SENTRY_RELEASE`), whole or shortened to at least seven characters.
import type { bugsink, EventData } from "./bugsink"
import type { Issue } from "./promotion"

// The events of each issue looked at, newest first: a fixed number, so an issue spammed from another host costs no more.
export const eventsPerIssue = 50

export function raisedOn(data: EventData, host: string, release: string) {
  const server = data.server_name ?? ""
  const build = data.release ?? ""
  const onHost = server === host || server.startsWith(`${host}.`)
  const onRelease = build.length >= 7 && release.startsWith(build)
  return onHost && onRelease
}

export async function stableIssues(errors: ReturnType<typeof bugsink>, issues: Issue[], o: { host: string; release: string; since: Date }) {
  const raised = await Promise.all(issues.map(async (issue) => {
    for (const event of await errors.eventsSince(issue.id, o.since, eventsPerIssue)) {
      if (raisedOn(await errors.eventData(event.id), o.host, o.release)) return true
    }
    return false
  }))
  return issues.filter((_, i) => raised[i])
}
