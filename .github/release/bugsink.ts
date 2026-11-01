// Bugsink's read-only API (https://errors.protobase.net/api/canonical/0/): a project's issues, newest last seen first,
// as far back as a moment, for the daily promotion's error gates.
import type { Issue } from "./promotion"

type Fetch = typeof fetch

export function bugsink(url: string, token: string, fetchFn: Fetch = fetch) {
  return {
    // The project's issues last seen since `since`, following the cursor pages until older ones come.
    async issuesSince(project: number, since: Date) {
      const found: Issue[] = []
      let next: string | null = `${url.replace(/\/+$/, "")}/api/canonical/0/issues/?project=${project}`
      while (next) {
        const response = await fetchFn(next, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) })
        if (!response.ok) throw new Error(`Bugsink answered ${response.status} for the issues of project ${project}`)
        const page = (await response.json()) as { results: Issue[]; next: string | null }
        const recent = page.results.filter((issue) => new Date(issue.last_seen) >= since)
        found.push(...recent)
        next = recent.length === page.results.length ? page.next : null
      }
      return found
    },
  }
}
