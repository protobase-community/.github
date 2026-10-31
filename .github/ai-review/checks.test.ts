import { describe, expect, test } from "bun:test"
import { type CheckRun, checksState, type WorkflowRun } from "./checks"

const own = 1

function run(workflow_id: number, check_suite_id: number, status: string, conclusion: string | null, event = "pull_request"): WorkflowRun {
  return { name: `workflow ${workflow_id}`, event, workflow_id, check_suite_id, status, conclusion }
}

function check(name: string, suite: number, status: string, conclusion: string | null): CheckRun {
  return { name, status, conclusion, check_suite: { id: suite } }
}

describe("checksState", () => {
  test("is green when everything passed or was skipped", () => {
    const runs = [run(2, 20, "completed", "success"), run(3, 30, "completed", "skipped")]
    const checks = [check("test", 20, "completed", "success"), check("lint", 30, "completed", "skipped")]
    expect(checksState(runs, checks, [{ context: "deploy", state: "success" }], own).state).toBe("green")
  })

  test("is green with nothing but the review itself", () => {
    expect(checksState([run(own, 10, "in_progress", null)], [check("review / merge", 10, "in_progress", null)], [], own).state).toBe("green")
  })

  test("leaves out every run of the review's own workflow", () => {
    const runs = [run(own, 11, "completed", "success"), run(own, 10, "completed", "cancelled", "pull_request_target")]
    expect(checksState(runs, [check("review / review", 10, "completed", "cancelled")], [], own).state).toBe("green")
  })

  test("waits for a queued workflow that has no check runs yet", () => {
    const state = checksState([run(2, 20, "queued", null)], [], [], own)
    expect(state).toEqual({ state: "pending", names: ["workflow 2"] })
  })

  test("waits for a running check and a pending status", () => {
    const state = checksState([run(2, 20, "completed", "success")], [check("test", 20, "in_progress", null)], [{ context: "ext", state: "pending" }], own)
    expect(state).toEqual({ state: "pending", names: ["test", "ext"] })
  })

  test("is red on a failed check even while others still run", () => {
    const runs = [run(2, 20, "completed", "failure"), run(3, 30, "in_progress", null)]
    expect(checksState(runs, [check("test", 20, "completed", "failure")], [], own)).toEqual({ state: "red", names: ["workflow 2", "test"] })
  })

  test("is red on a failed commit status", () => {
    expect(checksState([], [], [{ context: "ext", state: "error" }], own).state).toBe("red")
  })

  test("is red on a run that needs approval", () => {
    expect(checksState([run(2, 20, "completed", "action_required")], [], [], own).state).toBe("red")
  })

  test("leaves out a run waiting for approval when the workflow ran for another event", () => {
    const runs = [run(2, 21, "completed", "success", "workflow_dispatch"), run(2, 20, "completed", "action_required")]
    expect(checksState(runs, [], [], own).state).toBe("green")
  })

  test("counts only the newest run of a workflow for an event", () => {
    const runs = [run(2, 21, "completed", "success"), run(2, 20, "completed", "failure")]
    expect(checksState(runs, [check("test", 21, "completed", "success"), check("test", 20, "completed", "failure")], [], own).state).toBe("green")
  })

  test("counts a workflow's runs for different events apart", () => {
    const runs = [run(2, 21, "completed", "success"), run(2, 20, "completed", "failure", "push")]
    expect(checksState(runs, [], [], own).state).toBe("red")
  })
})
