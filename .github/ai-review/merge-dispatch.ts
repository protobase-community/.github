// Merges the pull request's head and then starts each named workflow with workflow_dispatch on the base branch. The
// names are separated by commas or whitespace. A merge with GITHUB_TOKEN starts no workflow on the base branch, but a
// workflow_dispatch made with it does: https://docs.github.com/en/actions/concepts/security/github_token. Every name is
// tried, since nothing tries again after the merge. A failed dispatch throws after that, so the job fails visibly with
// the pull request already merged. Answers the merge commit.
type Merger = { merge(number: number, sha: string, method: string): Promise<string> }
type Dispatcher = { dispatchWorkflow(workflow: string, ref: string): Promise<void> }

export async function mergeAndDispatch(
  merger: Merger,
  dispatcher: Dispatcher,
  pullRequest: { number: number; sha: string; base: string },
  method: string,
  workflows: string | undefined,
  log: (line: string) => void = console.log,
) {
  const mergeCommit = await merger.merge(pullRequest.number, pullRequest.sha, method)
  log(`Merged ${pullRequest.sha.slice(0, 7)} with ${method}.`)

  const names = (workflows ?? "").split(/[\s,]+/).filter(Boolean)
  const results = await Promise.allSettled(names.map((name) => dispatcher.dispatchWorkflow(name, pullRequest.base)))
  const refused: string[] = []
  for (const [index, result] of results.entries()) {
    if (result.status === "fulfilled") log(`Started ${names[index]} on ${pullRequest.base}.`)
    else refused.push(`${names[index]}: ${result.reason}`)
  }
  if (refused.length > 0) throw new Error(`Could not start ${refused.join("; ")}`)
  return mergeCommit
}
