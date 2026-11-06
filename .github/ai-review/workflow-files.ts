// GitHub refuses a write with GITHUB_TOKEN that changes a file under .github/workflows/, as that needs the workflows
// permission, which GITHUB_TOKEN can never be granted: it answers 403 to the merge, and to a fast-forward of the base.
// Without MERGE_TOKEN such a pull request is left to a person.
import type { ChangedFile } from "./pull-request"

const workflowsDirectory = ".github/workflows/"

const touchesWorkflows = (file: ChangedFile) =>
  file.filename.startsWith(workflowsDirectory) || (file.previous_filename?.startsWith(workflowsDirectory) ?? false)

// Why GITHUB_TOKEN may not land these changed files, or null when it may. `total` is the pull request's changed_files:
// GitHub lists at most 3000 files, so a shorter list may hide a workflow file.
export function workflowRefusal(files: ChangedFile[], total: number) {
  if (files.some(touchesWorkflows)) return "it changes workflow files, which GITHUB_TOKEN may not merge"
  if (files.length < total) return `GitHub lists only ${files.length} of its ${total} changed files, so it may change workflow files, which GITHUB_TOKEN may not merge`
  return null
}
