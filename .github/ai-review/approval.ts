// Whether a pull request's head carries the approval of the commit its AI review found no issues in.
//
// The reviewed commit itself carries it, and so does a merge commit that only brings the base branch in, such as
// GitHub's "Update branch": its first parent carries the approval, its second parent is on the base branch, and the
// pull request's changed files are the same after the merge as before it. Any other commit needs a new review.

export type ComparedFile = { filename: string; status: string; sha: string | null }

export type History = {
  parents(sha: string): Promise<string[]>
  // The files changed from the merge base of `from` and `to` up to `to`, and whether `to` contains `from`.
  compare(from: string, to: string): Promise<{ status: string; files: ComparedFile[] }>
}

// The compare API lists at most 300 files; at that many the list may be cut short, so it proves nothing.
const maxFiles = 300
const maxMerges = 20

// Whether two file lists change the same files to the same contents (the same blob).
export function sameChanges(before: ComparedFile[], after: ComparedFile[]) {
  if (before.length >= maxFiles || after.length >= maxFiles || before.length !== after.length) return false
  const key = (file: ComparedFile) => `${file.filename} ${file.status} ${file.sha}`
  const keys = new Set(before.map(key))
  return after.every((file) => keys.has(key(file)))
}

export async function carriesApproval(history: History, head: string, approved: string, baseRef: string) {
  let sha = head
  for (let step = 0; step <= maxMerges; step++) {
    if (sha === approved) return true

    const parents = await history.parents(sha)
    if (parents.length !== 2) return false
    const [previous, base] = parents

    // The base branch contains `base` when it is ahead of it or the same commit.
    const onBase = await history.compare(base, baseRef)
    if (onBase.status !== "ahead" && onBase.status !== "identical") return false

    const before = await history.compare(base, previous)
    const after = await history.compare(base, sha)
    if (!sameChanges(before.files, after.files)) return false

    sha = previous
  }
  return false
}
