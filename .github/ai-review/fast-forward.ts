// Fast-forwards a pull request's base branch to its head, for a pull request with the fast-forward label. GitHub's
// merge API has no such method: merge, squash and rebase each make or rewrite commits. Moving the base branch to the
// head instead makes none, so every commit of the head lands as it is and the base keeps all of them as ancestors;
// GitHub then shows the pull request as merged, as its commits are in the base. That only works while the base is an
// ancestor of the head, so with any other base nothing is merged, and the review comment says why.
import { fastForwardLabel } from "./settings"

type History = { compare(from: string, to: string): Promise<{ status: string }> }
type Merger = { merge(number: number, sha: string, method: string): Promise<string> }
type Refs = Merger & { updateBranch(branch: string, sha: string): Promise<void> }

export type Landing = { kind: "refused"; reason: string } | { kind: "land"; merger: Merger; method: string }

// How a pull request lands: `merger` merges it with the caller's `method`, or, with the fast-forward label, moves the
// base branch to the head with the same token, or nothing lands, with the reason.
export async function landing(
  history: History,
  merger: Refs,
  pullRequest: { sha: string; base: string; labels: { name: string }[] },
  method: string,
): Promise<Landing> {
  if (!pullRequest.labels.some((label) => label.name === fastForwardLabel)) return { kind: "land", merger, method }

  // The base is an ancestor of the head when the head is ahead of it, or the same commit.
  const { status } = await history.compare(pullRequest.base, pullRequest.sha)
  if (status !== "ahead" && status !== "identical") {
    const reason = `${pullRequest.base} is not an ancestor of ${pullRequest.sha.slice(0, 7)} (${status}), so it cannot be fast-forwarded; merge ${pullRequest.base} into the branch first`
    return { kind: "refused", reason }
  }

  // GitHub refuses the move when the base moved on since it was compared, as it is no fast-forward then.
  const fastForwarder = {
    async merge(_number: number, sha: string) {
      await merger.updateBranch(pullRequest.base, sha)
      return sha
    },
  }
  return { kind: "land", merger: fastForwarder, method: "fast-forward" }
}
