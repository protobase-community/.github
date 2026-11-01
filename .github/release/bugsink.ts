// Bugsink's read-only API (https://errors.protobase.net/api/canonical/0/): a project's issues, newest last seen first,
// as far back as a moment, for the daily promotion's error gates, and an issue's events for the rollback watch.
import type { Issue } from "./promotion"

type Fetch = typeof fetch

// An event of an issue as the list gives it, and its detail's `data`: the Sentry event its SDK sent.
export type IssueEvent = { id: string; timestamp: string }
export type EventData = { release?: string; server_name?: string }

export function bugsink(url: string, token: string, fetchFn: Fetch = fetch) {
  const api = `${url.replace(/\/+$/, "")}/api/canonical/0`
  async function read<T>(address: string, what: string) {
    const response = await fetchFn(address, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Bugsink answered ${response.status} for ${what}`)
    return (await response.json()) as T
  }
  return {
    // The project's issues last seen since `since`, following the cursor pages until older ones come.
    async issuesSince(project: number, since: Date) {
      const found: Issue[] = []
      let next: string | null = `${api}/issues/?project=${project}`
      while (next) {
        const page: { results: Issue[]; next: string | null } = await read(next, `the issues of project ${project}`)
        const recent = page.results.filter((issue) => new Date(issue.last_seen) >= since)
        found.push(...recent)
        // Older issues, or an empty page, end the walk.
        next = page.results.length > 0 && recent.length === page.results.length ? page.next : null
      }
      return found
    },

    // The issue's events since `since`, newest first, at most `limit` of them.
    async eventsSince(issue: string, since: Date, limit: number) {
      const found: IssueEvent[] = []
      let next: string | null = `${api}/events/?issue=${issue}&order=desc`
      while (next && found.length < limit) {
        const page: { results: IssueEvent[]; next: string | null } = await read(next, `the events of issue ${issue}`)
        const recent = page.results.filter((event) => new Date(event.timestamp) >= since)
        found.push(...recent)
        next = page.results.length > 0 && recent.length === page.results.length ? page.next : null
      }
      return found.slice(0, limit)
    },
    async eventData(event: string) {
      const detail: { data: EventData } = await read(`${api}/events/${event}/`, `event ${event}`)
      return detail.data
    },
  }
}
