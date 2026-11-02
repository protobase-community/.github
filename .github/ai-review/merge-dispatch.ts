// Merges the pull request's head and then, when a workflow is named, starts it with workflow_dispatch on the base
// branch. A merge with GITHUB_TOKEN starts no workflow on the base branch, but a workflow_dispatch made with it does:
// https://docs.github.com/en/actions/concepts/security/github_token. A failed dispatch throws after the merge, so the
// job fails visibly with the pull request already merged.
type Merger = { merge(number: number, sha: string, method: string): Promise<void> }
type Dispatcher = { dispatchWorkflow(workflow: string, ref: string): Promise<void> }

export async function mergeAndDispatch(
  merger: Merger,
  dispatcher: Dispatcher,
  pullRequest: { number: number; sha: string; base: string },
  method: string,
  workflow: string | undefined,
  log: (line: string) => void = console.log,
) {
  await merger.merge(pullRequest.number, pullRequest.sha, method)
  log(`Merged ${pullRequest.sha.slice(0, 7)} with ${method}.`)
  if (!workflow) return

  await dispatcher.dispatchWorkflow(workflow, pullRequest.base)
  log(`Started ${workflow} on ${pullRequest.base}.`)
}
