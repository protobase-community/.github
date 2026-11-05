// Splits a pull request whose diff alone is above the input cap into parts the model is asked about one after another.
// Each part is a user message as fitUserMessage builds it for a pull request that fits: the title and description,
// with only that part's files, so every ask stays inside the measured input window. Pure: the caller fetches the files.
import { buildUserMessage, type ChangedFile, fitUserMessage, type PullRequest } from "./pull-request"

export type Split =
  | { kind: "parts"; messages: string[] }
  | { kind: "file too large"; path: string; size: number }
  | { kind: "too many parts"; count: number }

function partInput(files: ChangedFile[], contents: Map<string, string>, tooLarge: string[]) {
  const names = new Set(files.map((file) => file.filename))
  return {
    files,
    contents: new Map([...contents].filter(([path]) => names.has(path))),
    tooLarge: tooLarge.filter((path) => names.has(path)),
  }
}

// The message with every file's contents left out, the diff alone, as fitUserMessage builds it last.
function diffOnlyLength(pullRequest: PullRequest, files: ChangedFile[], contents: Map<string, string>, tooLarge: string[]) {
  const part = partInput(files, contents, tooLarge)
  return buildUserMessage(pullRequest, files, new Map(), part.tooLarge, [...part.contents.keys()]).length
}

// Whether fitUserMessage fits these files in maxChars. Leaving one more file's contents out always shortens a message
// that already leaves one out, so the diff alone is the shortest message but one: the message that leaves none out,
// which does without the header naming them. That one is built only when the diff alone does not fit.
function fits(pullRequest: PullRequest, files: ChangedFile[], contents: Map<string, string>, tooLarge: string[], maxChars: number) {
  if (diffOnlyLength(pullRequest, files, contents, tooLarge) <= maxChars) return true
  const part = partInput(files, contents, tooLarge)
  return buildUserMessage(pullRequest, files, part.contents, part.tooLarge, []).length <= maxChars
}

// Goes through the files once, in the order given: a file joins the current part while the part still fits in
// maxChars, and otherwise starts the next one. A file that does not fit alone, or more than maxParts parts, is no split.
export function splitIntoParts(
  pullRequest: PullRequest,
  files: ChangedFile[],
  contents: Map<string, string>,
  tooLarge: string[],
  maxChars: number,
  maxParts: number,
): Split {
  const parts: ChangedFile[][] = []
  let current: ChangedFile[] = []
  for (const file of files) {
    if (fits(pullRequest, [...current, file], contents, tooLarge, maxChars)) {
      current.push(file)
      continue
    }
    if (!fits(pullRequest, [file], contents, tooLarge, maxChars)) {
      return { kind: "file too large", path: file.filename, size: diffOnlyLength(pullRequest, [file], contents, tooLarge) }
    }
    if (current.length > 0) parts.push(current)
    current = [file]
  }
  parts.push(current)
  if (parts.length > maxParts) return { kind: "too many parts", count: parts.length }

  const messages = parts.map((part) => {
    const input = partInput(part, contents, tooLarge)
    return fitUserMessage(pullRequest, input.files, input.contents, input.tooLarge, maxChars).message
  })
  return { kind: "parts", messages }
}
