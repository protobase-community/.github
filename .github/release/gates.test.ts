import { describe, expect, test } from "bun:test"
import type { WorkflowRun } from "../ai-review/checks"
import { allPassed, ciGate, devGate, reviewGate } from "./gates"

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

  test("fails a head the review found issues in or skipped for another reason than its size, with the reason", () => {
    expect(reviewGate(head, comment(head, "findings"), false)).toEqual({ state: "failed", text: "found issues" })
    expect(reviewGate(head, comment(head, "skipped", "Not reviewed: the model used its whole output budget before answering."), false)).toEqual({
      state: "failed", text: "not reviewed: the model used its whole output budget before answering.",
    })
  })

  test("passes a head too big to review, saying so", () => {
    const tooLong = comment(head, "skipped", "Not reviewed: its diff alone comes to 403k characters, above the cap of 300k.")
    expect(reviewGate(head, tooLong, false)).toEqual({
      state: "passed",
      text: "too big to review (its diff alone comes to 403k characters, above the cap of 300k); each change was reviewed on its way into development",
    })
    const tooMany = comment(head, "skipped", "Not reviewed: it changes 212 files, above the cap of 150.")
    expect(reviewGate(head, tooMany, false).state).toBe("passed")
  })
})

describe("devGate", () => {
  test("passes only while the head runs there and is healthy", () => {
    expect(devGate(head, { deployed: head, failed: null, healthStatus: 200 })).toEqual({ state: "passed", text: "runs aaaaaaa and is healthy" })
    expect(devGate(head, { deployed: head, failed: null, healthStatus: 502 }).state).toBe("failed")
  })

  test("waits while another commit runs, and fails a head that failed to deploy", () => {
    expect(devGate(head, { deployed: older, failed: null, healthStatus: 200 })).toEqual({ state: "pending", text: "runs bbbbbbb, not aaaaaaa yet" })
    expect(devGate(head, { deployed: null, failed: null, healthStatus: 200 }).text).toBe("runs no commit, not aaaaaaa yet")
    expect(devGate(head, { deployed: older, failed: head, healthStatus: 200 })).toEqual({ state: "failed", text: "aaaaaaa failed to deploy" })
  })
})

test("allPassed leaves out a repository without a dev environment", () => {
  const passed = { state: "passed" as const, text: "" }
  expect(allPassed({ ci: passed, review: passed, dev: null })).toBe(true)
  expect(allPassed({ ci: passed, review: passed, dev: { state: "pending", text: "" } })).toBe(false)
})
