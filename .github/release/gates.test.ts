import { describe, expect, test } from "bun:test"
import type { WorkflowRun } from "../ai-review/checks"
import { allPassed, ciGate, commitGate, devGate, reviewGate } from "./gates"

const head = "a".repeat(40)
const older = "b".repeat(40)
const run = (workflow_id: number, conclusion: string | null, status = "completed"): WorkflowRun => ({
  name: `workflow ${workflow_id}`, event: "pull_request", workflow_id, check_suite_id: workflow_id * 10, status, conclusion,
})

describe("ciGate", () => {
  test("has passed nothing while only the release workflow ran", () => {
    expect(ciGate([run(1, null, "in_progress")], [], [], 1)).toEqual({ state: "pending", text: "no CI ran on it yet" })
  })

  test("passes once everything else passed, and names what failed or still runs", () => {
    expect(ciGate([run(1, null, "in_progress"), run(2, "success")], [], [], 1).state).toBe("passed")
    expect(ciGate([run(2, "failure")], [], [], 1)).toEqual({ state: "failed", text: "failed: workflow 2" })
    expect(ciGate([run(2, null, "queued")], [], [], 1)).toEqual({ state: "pending", text: "running: workflow 2" })
  })
})

describe("reviewGate", () => {
  const comment = (sha: string, verdict: string, text = "") => `<!-- ai-pr-review -->\n<!-- reviewed ${sha} ${verdict} -->\n**AI review**\n\n${text}`

  test("passes a head that carries a clean review", () => {
    expect(reviewGate(head, comment(older, "clean"), true).state).toBe("passed")
  })

  test("waits for a review of the head", () => {
    expect(reviewGate(head, null, false)).toEqual({ state: "pending", text: "no review of aaaaaaa yet" })
    expect(reviewGate(head, comment(older, "findings"), false).state).toBe("pending")
  })

  test("fails a head the review found issues in or skipped, with the reason", () => {
    expect(reviewGate(head, comment(head, "findings"), false)).toEqual({ state: "failed", text: "found issues" })
    expect(reviewGate(head, comment(head, "skipped", "Not reviewed: its diff alone comes to 403k characters, above the cap of 300k."), false)).toEqual({
      state: "failed", text: "not reviewed: its diff alone comes to 403k characters, above the cap of 300k.",
    })
  })
})

describe("commitGate", () => {
  const passed = { state: "passed" as const, text: "passed" }
  const clean = { state: "passed" as const, text: "no issues found" }

  test("passes a commit whose pull request was reviewed clean and whose CI passed", () => {
    expect(commitGate(passed, { number: 12, ci: passed, review: clean })).toEqual({ state: "passed", text: "CI passed; #12's AI review: no issues found" })
  })

  test("takes the pull request's CI for a commit no CI ran on, such as a squash merge", () => {
    const none = { state: "pending" as const, text: "no CI ran on it yet" }
    expect(commitGate(none, { number: 12, ci: passed, review: clean }).text).toBe("#12's CI passed; #12's AI review: no issues found")
    expect(commitGate(none, { number: 12, ci: { state: "failed", text: "failed: test" }, review: clean })).toEqual({ state: "failed", text: "#12's CI failed: test" })
  })

  test("passes a commit of a repository without CI on its pull request's review alone", () => {
    const none = { state: "pending" as const, text: "no CI ran on it yet" }
    expect(commitGate(none, { number: 12, ci: none, review: clean }, true)).toEqual({ state: "passed", text: "no CI here; #12's AI review: no issues found" })
    expect(commitGate(none, { number: 12, ci: none, review: clean }).state).toBe("pending")
  })

  test("never passes a commit without a reviewed pull request", () => {
    expect(commitGate(passed, null).state).toBe("failed")
    expect(commitGate(passed, { number: 12, ci: passed, review: { state: "failed", text: "found issues" } })).toEqual({ state: "failed", text: "#12's AI review: found issues" })
  })
})

describe("devGate", () => {
  const dev = (deployed: string | null, hasCommit: boolean, failed: string | null = null, healthStatus = 200) => ({ deployed, failed, healthStatus, hasCommit })

  test("passes while the commit, or a later one that has it, runs there and is healthy", () => {
    expect(devGate(head, dev(head, true))).toEqual({ state: "passed", text: "runs aaaaaaa and is healthy" })
    expect(devGate(head, dev(older, true))).toEqual({ state: "passed", text: "runs bbbbbbb, which has aaaaaaa and is healthy" })
    expect(devGate(head, dev(head, true, null, 502)).state).toBe("failed")
  })

  test("waits while it runs an earlier commit, and fails a commit that failed to deploy", () => {
    expect(devGate(head, dev(older, false))).toEqual({ state: "pending", text: "runs bbbbbbb, which does not have aaaaaaa yet" })
    expect(devGate(head, dev(null, false)).text).toBe("runs no commit, which does not have aaaaaaa yet")
    expect(devGate(head, dev(older, false, head))).toEqual({ state: "failed", text: "aaaaaaa failed to deploy" })
  })
})

test("allPassed leaves out a repository without a dev environment", () => {
  const passed = { state: "passed" as const, text: "" }
  expect(allPassed({ commit: passed, dev: null })).toBe(true)
  expect(allPassed({ commit: passed, dev: { state: "pending", text: "" } })).toBe(false)
})
