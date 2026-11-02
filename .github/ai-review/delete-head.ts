// Deletes a merged pull request's head branch when the repository's "Automatically delete head branches" setting is
// on. GitHub applies that setting to merges made in its UI, but not to the merges auto-merge makes with GITHUB_TOKEN,
// which left every such branch behind. A branch another open pull request still merges into is kept, since deleting
// it would close that pull request. A failed delete throws, so the job fails visibly with the pull request merged.
type Branches = {
  deletesHeadOnMerge(): Promise<boolean>
  openPullRequestsOnto(base: string): Promise<number>
  deleteBranch(branch: string): Promise<boolean>
}

export async function deleteMergedHead(branches: Branches, head: string, log: (line: string) => void = console.log) {
  if (!(await branches.deletesHeadOnMerge())) return
  if ((await branches.openPullRequestsOnto(head)) > 0) {
    log(`Kept ${head}: an open pull request merges into it.`)
    return
  }

  const deleted = await branches.deleteBranch(head)
  log(deleted ? `Deleted ${head}.` : `${head} was deleted already.`)
}
