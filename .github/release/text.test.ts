import { describe, expect, test } from "bun:test"
import { pullRequestBody, requestedSha, requestId, requestText, type Release } from "./text"

const head = "a".repeat(40)
const passed = { state: "passed" as const, text: "passed" }
const release: Release = {
  repository: "PrototeamHQ/protobase-cloud",
  base: "main",
  development: "development",
  head,
  url: "https://github.com/PrototeamHQ/protobase-cloud/pull/6",
  commits: [{ sha: head, subject: "A change" }],
  gates: { ci: passed, review: { state: "passed", text: "no issues found" }, dev: { state: "pending", text: "runs bbbbbbb, not aaaaaaa yet" } },
}

describe("requestText", () => {
  test("names the commit, its pull request, its gates and its commits", () => {
    expect(requestText(release)).toEqual({
      reason: "Release aaaaaaa of PrototeamHQ/protobase-cloud into main?",
      why: [
        "Pull request: https://github.com/PrototeamHQ/protobase-cloud/pull/6",
        `Commit: ${head}`,
        "- CI: passed",
        "- AI review: no issues found",
        "- Dev environment: runs bbbbbbb, not aaaaaaa yet",
      ].join("\n"),
      plan: "- aaaaaaa A change",
    })
  })

  test("lists fifty commits and counts the rest", () => {
    const commits = Array.from({ length: 53 }, (_, i) => ({ sha: `${i}`.padStart(40, "0"), subject: `Change ${i}` }))
    const plan = requestText({ ...release, commits }).plan.split("\n")
    expect(plan).toHaveLength(51)
    expect(plan.at(-1)).toBe("- and 3 more")
  })

  test("reads back the commit it asks about", () => {
    expect(requestedSha(requestText(release).why)).toBe(head)
    expect(requestedSha("Commit: abc")).toBeNull()
    expect(requestedSha(null)).toBeNull()
  })
})

describe("pullRequestBody", () => {
  test("names the request it asked, which reads back", () => {
    const body = pullRequestBody(release, { kind: "update", id: 12 }, "https://backlog.example.com/task_preconditions/12", 12)
    expect(requestId(body)).toBe(12)
    expect(body).toContain("**Approval:** Waiting on the captain in the backlog (https://backlog.example.com/task_preconditions/12).")
    expect(body).toContain("- Dev environment: runs bbbbbbb, not aaaaaaa yet")
    expect(body).toContain("**Commits (1)**\n\n- aaaaaaa A change\n")
  })

  test("names no request before one is asked", () => {
    const body = pullRequestBody(release, { kind: "wait" }, null, null)
    expect(requestId(body)).toBeNull()
    expect(body).toContain("**Approval:** Asked once every check above passed.")
  })

  test("reads no request from a body without one", () => {
    expect(requestId(null)).toBeNull()
    expect(requestId("Release development into main")).toBeNull()
  })
})
