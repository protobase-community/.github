import { describe, expect, test } from "bun:test"
import { releaseBody, releaseNotes, releaseTag, requestedSha, requestId, requestText, type Release } from "./text"

const commit = "a".repeat(40)
const release: Release = {
  repository: "PrototeamHQ/protobase-cloud",
  base: "main",
  development: "development",
  commit,
  tag: "v2026-11-01-0900",
  url: "https://github.com/PrototeamHQ/protobase-cloud/releases/tag/untagged-1",
  commits: [{ sha: commit, subject: "A change" }],
  gates: { commit: { state: "passed", text: "CI passed; #12's AI review: no issues found" }, dev: { state: "pending", text: "runs bbbbbbb, which does not have aaaaaaa yet" } },
}

describe("requestText", () => {
  test("names the release, its draft, its commit, its checks and its commits", () => {
    expect(requestText(release)).toEqual({
      reason: "Release v2026-11-01-0900 of PrototeamHQ/protobase-cloud into main?",
      why: [
        "Draft release: https://github.com/PrototeamHQ/protobase-cloud/releases/tag/untagged-1",
        `Commit: ${commit}`,
        "- Checks: CI passed; #12's AI review: no issues found",
        "- Dev environment: runs bbbbbbb, which does not have aaaaaaa yet",
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
    expect(requestedSha(requestText(release).why)).toBe(commit)
    expect(requestedSha("Commit: abc")).toBeNull()
    expect(requestedSha(null)).toBeNull()
  })
})

describe("releaseBody", () => {
  test("names the request it asked and keeps the generated notes, which read back", () => {
    const body = releaseBody(release, { kind: "update", id: 12 }, "https://backlog.example.com/task_preconditions/12", 12, "## What's Changed\n* A change")
    expect(requestId(body)).toBe(12)
    expect(releaseTag(body)).toBe("v2026-11-01-0900")
    expect(releaseNotes(body)).toBe("## What's Changed\n* A change")
    expect(body).toContain("**Approval:** Waiting on the captain in the backlog (https://backlog.example.com/task_preconditions/12).")
    expect(body).toContain("- Dev environment: runs bbbbbbb, which does not have aaaaaaa yet")
  })

  test("lists the commits without generated notes, and names no request before one is asked", () => {
    const body = releaseBody(release, { kind: "wait" }, null, null, "")
    expect(requestId(body)).toBeNull()
    expect(body).toContain("**Approval:** Asked once every check above passed.")
    expect(releaseNotes(body)).toBe("**Commits**\n\n- aaaaaaa A change")
    expect(releaseBody(release, { kind: "wait" }, null, null, releaseNotes(body))).toBe(body)
  })

  test("reads no request or notes from a body without them", () => {
    expect(requestId(null)).toBeNull()
    expect(releaseTag(null)).toBeNull()
    expect(releaseNotes("A release")).toBe("")
  })
})
