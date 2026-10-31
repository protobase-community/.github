// Turns a pull request's changed files, as the GitHub API lists them, into the review's user message.
// Pure: the caller fetches the files and their contents.

export type ChangedFile = {
  filename: string
  status: string
  patch?: string
}

export type PullRequest = {
  title: string
  body: string | null
}

// Generated files whose diff says nothing a reviewer can act on. They are named as omitted instead.
const generated = [
  /(^|\/)(bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|uv\.lock|poetry\.lock|Cargo\.lock|composer\.lock)$/,
  /\.sql\.json$/,
  /(^|\/)CHANGELOG(\.md)?$/,
  /\.min\.(js|css)$/,
]

const isGenerated = (path: string) => generated.some((pattern) => pattern.test(path))
const isDoc = (path: string) => /\.mdx?$/.test(path)

// Files whose diff is sent. A file without a patch is binary or too large for the API to diff.
export function reviewedFiles(files: ChangedFile[]) {
  return files.filter((file) => file.patch !== undefined && !isGenerated(file.filename))
}

// Reviewed files whose full contents at the head commit are sent too: code, not docs or deletions.
export function contentPaths(files: ChangedFile[]) {
  return reviewedFiles(files)
    .filter((file) => file.status !== "removed" && !isDoc(file.filename))
    .map((file) => file.filename)
}

export function omittedFiles(files: ChangedFile[]) {
  const reviewed = new Set(reviewedFiles(files).map((file) => file.filename))
  return files.filter((file) => !reviewed.has(file.filename)).map((file) => file.filename)
}

function diffOf(file: ChangedFile) {
  return `diff --git a/${file.filename} b/${file.filename} (${file.status})\n${file.patch}`
}

export function buildUserMessage(
  pullRequest: PullRequest,
  files: ChangedFile[],
  contents: Map<string, string>,
  tooLarge: string[],
) {
  const omitted = omittedFiles(files)
  const sections = [
    `Review this pull request.`,
    `## Title\n\n${pullRequest.title}`,
    `## Description\n\n${pullRequest.body?.trim() || "(none)"}`,
    `## Diff\n\n\`\`\`diff\n${reviewedFiles(files).map(diffOf).join("\n")}\n\`\`\``,
  ]
  if (omitted.length > 0) {
    sections.push(`## Changed but left out\n\nGenerated, binary or too large to diff:\n${omitted.map((path) => `- ${path}`).join("\n")}`)
  }
  if (tooLarge.length > 0) {
    sections.push(`## Contents left out\n\nThese files are too large to send whole; only their diff is above:\n${tooLarge.map((path) => `- ${path}`).join("\n")}`)
  }
  const fileSections = [...contents].map(([path, text]) => `### ${path}\n\n\`\`\`\n${text}\n\`\`\``)
  if (fileSections.length > 0) {
    sections.push(`## Full contents of the changed files at the head commit\n\n${fileSections.join("\n\n")}`)
  }
  return sections.join("\n\n")
}
