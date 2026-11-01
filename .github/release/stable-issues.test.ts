import { expect, test } from "bun:test"
import { bugsink, type EventData } from "./bugsink"
import { raisedOn, stableIssues } from "./stable-issues"

const url = "https://errors.example.com"
const release = "a".repeat(40)
const beta = "b".repeat(40)
const since = new Date("2026-11-02T06:30:00Z")
const issue = (id: string) => ({ id, first_seen: "2026-11-02T08:00:00Z", last_seen: "2026-11-02T09:00:00Z", calculated_type: "TypeError", calculated_value: id })

// A stand-in of Bugsink's events API: each issue's events, newest first, each with the data its SDK sent.
function fakeBugsink(events: Record<string, (EventData & { timestamp?: string })[]>) {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } })
  const fetchFn = (async (input: string) => {
    const path = input.slice(`${url}/api/canonical/0`.length)
    const list = /^\/events\/\?issue=([^&]+)&order=desc$/.exec(path)
    if (list) {
      const results = (events[list[1]!] ?? []).map((event, i) => ({ id: `${list[1]}-${i}`, timestamp: event.timestamp ?? "2026-11-02T08:00:00Z" }))
      return json({ results, next: null })
    }
    const [, id, index] = /^\/events\/(.+)-(\d+)\/$/.exec(path)!
    const { timestamp: _, ...data } = events[id!]![Number(index)]!
    return json({ data })
  }) as typeof fetch
  return bugsink(url, "token", fetchFn)
}

test("counts an issue the stable host raised on the new release, and none the beta host or central raised", async () => {
  const errors = fakeBugsink({
    beta: [{ server_name: "eu2", release: beta }],
    central: [{ server_name: "central", release }],
    stable: [{ server_name: "eu2", release: beta }, { server_name: "eu1", release }],
  })
  const found = await stableIssues(errors, [issue("beta"), issue("central"), issue("stable")], { host: "eu1", release, since })
  expect(found.map((found) => found.id)).toEqual(["stable"])
})

test("leaves out the stable host's events from before the release went live", async () => {
  const errors = fakeBugsink({ old: [{ server_name: "eu1", release, timestamp: "2026-11-02T06:00:00Z" }] })
  expect(await stableIssues(errors, [issue("old")], { host: "eu1", release, since })).toEqual([])
})

test("takes the host by its hostname, and the release whole or shortened", () => {
  expect(raisedOn({ server_name: "eu1.protobase.net", release: release.slice(0, 7) }, "eu1", release)).toBe(true)
  expect(raisedOn({ server_name: "eu1", release }, "eu1", release)).toBe(true)
  expect(raisedOn({ server_name: "eu12", release }, "eu1", release)).toBe(false)
  expect(raisedOn({ server_name: "eu1", release: beta }, "eu1", release)).toBe(false)
  expect(raisedOn({ server_name: "eu1", release: "aaa" }, "eu1", release)).toBe(false)
  expect(raisedOn({}, "eu1", release)).toBe(false)
})
