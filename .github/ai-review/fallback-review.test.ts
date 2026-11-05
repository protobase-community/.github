import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { findingTitle, headState, openFindings, readFallbackReview, type ReviewerCheck, type ReviewerStatus, type ReviewThread } from "./fallback-review"
import { fallbackWait } from "./settings"

// Recorded with gh api from PrototeamHQ/protobase: PR #109, which the fallback reviewer reviewed while the model gave no
// answer, and PR #97, whose only open thread is another reviewer's.
async function fixture<T>(name: string) {
  return (await Bun.file(join(import.meta.dir, "fixtures", "fallback", name)).json()) as T
}
type Threads = { data: { repository: { pullRequest: { reviewThreads: { nodes: ReviewThread[] } } } } }
const threads = async (name: string) => (await fixture<Threads>(name)).data.repository.pullRequest.reviewThreads.nodes
const checks = async (name: string) => (await fixture<{ check_runs: ReviewerCheck[] }>(name)).check_runs

// 0524c06 is a head of PR #109 whose review finished; aa90897 its last head, whose review paused.
const finishedHead = "0524c06e684f5841f7d1dfb116c36978a830ca61"
const pausedHead = "aa90897ced3b6f32ba0a8ab5b39a8b4a556f55c1"
const cleanHead = "34da74d0c5d8e415907913d5aec72efeb4858020"

function reads(checkRuns: ReviewerCheck[][], threadList: ReviewThread[], statuses: ReviewerStatus[] = []) {
  const calls = { checks: 0, threads: 0 }
  return {
    calls,
    github: {
      async checkRunsNamed() {
        return checkRuns[Math.min(calls.checks++, checkRuns.length - 1)]
      },
      async statuses() {
        return statuses
      },
      async reviewThreads() {
        calls.threads++
        return threadList
      },
    },
  }
}

const noSleep = async () => {}

describe("readFallbackReview", () => {
  test("a finished review of the head and no open thread of its own is clean, another reviewer's open thread aside", async () => {
    const { github } = reads([await checks("pr97-checks.json")], await threads("pr97-threads.json"))
    expect(await readFallbackReview(github, 97, cleanHead, noSleep)).toEqual({ kind: "clean" })
  })

  test("a finished review of the head with threads an earlier head raised, still open on code it left as it was, is findings", async () => {
    const { github } = reads([await checks("pr109-0524c06-checks.json")], await threads("pr109-threads.json"))
    const review = await readFallbackReview(github, 109, finishedHead, noSleep)
    if (review.kind !== "findings") throw new Error(`expected findings, read ${review.kind}`)
    expect(review.findings).toHaveLength(11)
    expect(review.findings[0]).toEqual({
      path: "docs/website/src/content/docs/reference/workflow-plugins.md",
      line: 128,
      title: "Minor — Bound the polling example’s page.",
      url: "https://github.com/PrototeamHQ/protobase/pull/109#discussion_r4477902391",
    })
  })

  test("a paused review of the head is no review, and its threads are not read", async () => {
    const { github, calls } = reads([await checks("pr109-aa90897-checks.json")], await threads("pr109-threads.json"))
    expect(await readFallbackReview(github, 109, pausedHead, noSleep)).toEqual({
      kind: "none",
      why: 'its check on this commit ended skipped, "Review paused"',
    })
    expect(calls.threads).toBe(0)
  })

  test("no check or status on the head is no review at once, with no wait", async () => {
    let slept = 0
    const { github, calls } = reads([[]], await threads("pr109-threads.json"))
    const review = await readFallbackReview(github, 109, finishedHead, async () => void slept++)
    expect(review).toEqual({ kind: "none", why: "it has no check or status on this commit" })
    expect([calls.checks, slept]).toEqual([1, 0])
  })

  test("a review still running at the last read is no review", async () => {
    const [finished] = await checks("pr109-0524c06-checks.json")
    const running = { ...finished, status: "in_progress", conclusion: null }
    let slept = 0
    const { github, calls } = reads([[running]], await threads("pr109-threads.json"))
    const review = await readFallbackReview(github, 109, finishedHead, async (ms) => void (slept += ms))
    expect(review.kind).toBe("none")
    expect(calls.checks).toBe(fallbackWait.maxReads)
    expect(slept).toBe((fallbackWait.maxReads - 1) * fallbackWait.intervalSeconds * 1000)
  })

  test("a review that finishes while it waits decides", async () => {
    const [finished] = await checks("pr109-0524c06-checks.json")
    const running = { ...finished, status: "queued", conclusion: null }
    const { github, calls } = reads([[running], [running], [finished]], await threads("pr97-threads.json"))
    expect(await readFallbackReview(github, 109, finishedHead, noSleep)).toEqual({ kind: "clean" })
    expect(calls.checks).toBe(3)
  })
})

describe("headState", () => {
  test("a check of another app or of another commit is not the fallback reviewer's", async () => {
    const [finished] = await checks("pr109-0524c06-checks.json")
    const lookalike = { ...finished, app: { slug: "github-actions" } }
    expect(headState(finishedHead, [lookalike], [])).toEqual({ kind: "none", why: "it has no check or status on this commit" })
    expect(headState(pausedHead, [finished], []).kind).toBe("none")
  })

  test("the newest of its checks on the head decides", async () => {
    const [finished] = await checks("pr109-0524c06-checks.json")
    const paused = { ...finished, id: finished.id - 1, conclusion: "skipped", output: { title: "Review paused" } }
    expect(headState(finishedHead, [paused, finished], [])).toEqual({ kind: "reviewed" })
  })

  test("its pending commit status is a review that runs; a final one, or another account's, is no review", () => {
    const status = (state: string, login: string) => ({ context: "CodeRabbit", state, creator: { login } })
    expect(headState(finishedHead, [], [status("pending", "coderabbitai[bot]")])).toEqual({ kind: "running" })
    expect(headState(finishedHead, [], [status("success", "coderabbitai[bot]")]).kind).toBe("none")
    expect(headState(finishedHead, [], [status("pending", "someone")])).toEqual({ kind: "none", why: "it has no check or status on this commit" })
  })
})

describe("openFindings", () => {
  test("a thread another account opened, one that looks like the fallback reviewer's too, is not its finding", async () => {
    const [own] = (await threads("pr109-threads.json")).filter((thread) => !thread.isResolved && !thread.isOutdated)
    const first = own.comments.nodes[0]
    const asUser = { ...own, comments: { nodes: [{ ...first, author: { __typename: "User", login: "coderabbitai" } }] } }
    const asOtherBot = { ...own, comments: { nodes: [{ ...first, author: { __typename: "Bot", login: "coderabbitai-lookalike" } }] } }
    const deleted = { ...own, comments: { nodes: [{ ...first, author: null }] } }
    expect(openFindings([asUser, asOtherBot, deleted])).toEqual([])
    expect(openFindings([own])).toHaveLength(1)
  })

  test("a resolved or outdated thread is no finding", async () => {
    const all = await threads("pr109-threads.json")
    expect(all).toHaveLength(13)
    expect(openFindings(all.filter((thread) => thread.isResolved || thread.isOutdated))).toEqual([])
  })
})

describe("findingTitle", () => {
  test("is the first bold line past the badge line of every recorded finding", async () => {
    const titles = openFindings(await threads("pr109-threads.json")).map((finding) => finding.title)
    expect(titles).toContain("Avoid scanning every window for each new key.")
    for (const title of titles) expect(title).not.toContain("<")
  })

  test("is the first plain line without a bold one", () => {
    expect(findingTitle("<!-- marker -->\n\nThis call can throw.\nMore.")).toBe("This call can throw.")
  })
})
