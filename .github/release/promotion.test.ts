import { describe, expect, test } from "bun:test"
import type { BacklogTask } from "./backlog"
import { amsterdamHour, deployedOnBeta, errorsGate, reportsGate, riskyFiles, scenariosGate, soakGate } from "./promotion"

const a = "a".repeat(40)
const b = "b".repeat(40)
const task = (id: string, o: Partial<BacklogTask> = {}): BacklogTask => ({ id, title: id, status: "done", state: "done", cancelled: false, priority: null, ...o })

test("takes each commit the beta host deployed once, newest first", () => {
  expect(deployedOnBeta([
    { sha: b, state: "running", updatedAt: "2026-11-02T10:00:00Z" },
    { sha: a, state: "success", updatedAt: "2026-11-01T09:00:00Z" },
    { sha: a, state: "success", updatedAt: "2026-10-31T09:00:00Z" },
  ])).toEqual([{ sha: a, liveSince: new Date("2026-11-01T09:00:00Z") }])
})

test("passes a soak of 24 hours", () => {
  const now = new Date("2026-11-02T09:00:00Z")
  expect(soakGate(new Date("2026-11-01T08:00:00Z"), now, 24)).toEqual({ state: "passed", text: "25 h on the beta host" })
  expect(soakGate(new Date("2026-11-01T20:00:00Z"), now, 24)).toEqual({ state: "pending", text: "13 h of 24 h on the beta host" })
})

describe("errorsGate", () => {
  const issue = (first_seen: string) => ({ id: "1", first_seen, last_seen: first_seen, calculated_type: "TypeError", calculated_value: "x is undefined" })
  test("fails on an issue first seen since the build went live", () => {
    const since = new Date("2026-11-01T09:00:00Z")
    expect(errorsGate([issue("2026-10-30T00:00:00Z")], since, "errors").state).toBe("passed")
    expect(errorsGate([{ ...issue("2026-10-30T00:00:00Z"), last_seen: "2026-11-01T10:00:00Z" }], since, "failures", "last_seen").state).toBe("failed")
    expect(errorsGate([issue("2026-11-01T10:00:00Z")], since, "errors")).toEqual({
      state: "failed", text: "1 new errors since 2026-11-01T09:00:00.000Z: TypeError: x is undefined",
    })
  })
})

test("fails on an open serious beta report only", () => {
  expect(reportsGate([task("r1", { state: "queued", priority: 2 }), task("r2", { priority: 0 })]).state).toBe("passed")
  expect(reportsGate([task("r3", { state: "queued", priority: 1 })])).toEqual({ state: "failed", text: "open serious beta reports: r3" })
})

test("takes a list of changed files cut short at 300 for risky", () => {
  const many = Array.from({ length: 300 }, (_, i) => `docs/${i}.md`)
  expect(riskyFiles(many, [/migrations\//])).toHaveLength(300)
  expect(riskyFiles(many, [])).toEqual([])
})

test("finds the files that need the integration review", () => {
  expect(riskyFiles(["db/migrations/0042.sql", "docs/x.md", "control-panel/auth/a.ts"], [/migrations\//, /auth\//])).toEqual([
    "db/migrations/0042.sql", "control-panel/auth/a.ts",
  ])
})

describe("scenariosGate", () => {
  test("waits for the review and every scenario", () => {
    expect(scenariosGate(a, []).text).toBe("no integration review of aaaaaaa yet")
    expect(scenariosGate(a, [task("scenario-aaaaaaa-0"), task("scenario-aaaaaaa-1", { state: "queued" })]).state).toBe("pending")
    expect(scenariosGate(a, [task("scenario-aaaaaaa-0"), task("scenario-aaaaaaa-1", { cancelled: true })]).state).toBe("pending")
    expect(scenariosGate(a, [task("scenario-aaaaaaa-0"), task("scenario-aaaaaaa-1")])).toEqual({
      state: "passed", text: "the integration review and its 1 scenarios passed",
    })
  })
})

test("tells the hour in Amsterdam, summer and winter", () => {
  expect(amsterdamHour(new Date("2026-11-02T05:00:00Z"))).toBe(6)
  expect(amsterdamHour(new Date("2026-07-01T04:00:00Z"))).toBe(6)
})
