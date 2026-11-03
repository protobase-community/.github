// Announces a merge the auto-merge made. A push made with GITHUB_TOKEN starts no workflow, but a repository_dispatch
// event sent with it does, so a merge with GITHUB_TOKEN sends pull_request_merged with the pull request's number, its
// base branch and the merge commit. A repository_dispatch run always runs the default branch's workflow, so `base`
// tells a caller which branch the merge went into. A merge with MERGE_TOKEN starts the base branch's workflows with its
// own push and sends nothing.

export const mergedEvent = "pull_request_merged"

export type Merged = { number: number; base: string; sha: string }

export type Dispatcher = { dispatch(eventType: string, payload: Record<string, unknown>): Promise<void> }

// Whether the merge was announced: only one made with GITHUB_TOKEN is.
export async function announceMerge(dispatcher: Dispatcher, mergeToken: string | undefined, merged: Merged) {
  if (mergeToken) return false
  await dispatcher.dispatch(mergedEvent, merged)
  return true
}
