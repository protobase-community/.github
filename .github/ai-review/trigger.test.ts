import { describe, expect, test } from "bun:test"
import { checkSuitePullRequest, statusPullRequest } from "./trigger"

const sha = "b61e1b0"

describe("checkSuitePullRequest", () => {
  const suite = (pulls: { number: number; sha: string; repo: number }[]) => ({
    repository: { id: 1 },
    check_suite: { head_sha: sha, pull_requests: pulls.map((pull) => ({ number: pull.number, head: { sha: pull.sha, repo: { id: pull.repo } } })) },
  })

  test("gives the pull request whose head is the suite's commit in this repository", () => {
    expect(checkSuitePullRequest(suite([{ number: 75, sha, repo: 1 }]))).toBe(75)
  })

  test("gives none for a fork's head or a suite without a pull request", () => {
    expect(checkSuitePullRequest(suite([{ number: 75, sha, repo: 2 }]))).toBeNull()
    expect(checkSuitePullRequest(suite([]))).toBeNull()
  })

  test("gives none for a pull request whose head moved on", () => {
    expect(checkSuitePullRequest(suite([{ number: 75, sha: "c0ffee0", repo: 1 }]))).toBeNull()
  })
})

describe("statusPullRequest", () => {
  const pull = (number: number, state: string, head: string, repo: string | null) => ({
    number,
    state,
    head: { sha: head, repo: repo === null ? null : { full_name: repo } },
  })
  const repository = "owner/name"

  test("gives the open pull request whose head is the status's commit in this repository", () => {
    const pulls = [pull(70, "closed", sha, repository), pull(75, "open", sha, repository)]
    expect(statusPullRequest({ sha, state: "success" }, pulls, repository)).toBe(75)
    expect(statusPullRequest({ sha, state: "failure" }, pulls, repository)).toBe(75)
  })

  test("gives none for a pending status", () => {
    expect(statusPullRequest({ sha, state: "pending" }, [pull(75, "open", sha, repository)], repository)).toBeNull()
  })

  test("gives none for a fork's head, a deleted fork or a commit that is no open pull request's head", () => {
    expect(statusPullRequest({ sha, state: "success" }, [pull(75, "open", sha, "fork/name")], repository)).toBeNull()
    expect(statusPullRequest({ sha, state: "success" }, [pull(75, "open", sha, null)], repository)).toBeNull()
    expect(statusPullRequest({ sha, state: "success" }, [pull(75, "open", "c0ffee0", repository)], repository)).toBeNull()
    expect(statusPullRequest({ sha, state: "error" }, [], repository)).toBeNull()
  })
})
