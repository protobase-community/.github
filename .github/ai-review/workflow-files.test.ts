import { describe, expect, test } from "bun:test"
import { workflowRefusal } from "./workflow-files"

const changed = (filename: string, previous_filename?: string) => ({ filename, status: previous_filename ? "renamed" : "modified", previous_filename })

describe("workflowRefusal", () => {
  test("refuses a pull request that changes a workflow file", () => {
    const files = [changed("src/app.ts"), changed(".github/workflows/deploy.yml")]
    expect(workflowRefusal(files, 2)).toBe("it changes workflow files, which GITHUB_TOKEN may not merge")
  })

  test("refuses a pull request that moves a workflow file out of the workflows directory", () => {
    expect(workflowRefusal([changed("old/deploy.yml", ".github/workflows/deploy.yml")], 1)).toContain("it changes workflow files")
  })

  test("allows a pull request that changes no workflow file", () => {
    expect(workflowRefusal([changed("src/app.ts"), changed(".github/ai-review/merge.ts"), changed("workflows/notes.md")], 3)).toBeNull()
  })

  test("refuses a pull request whose files GitHub does not list in full", () => {
    expect(workflowRefusal([changed("src/app.ts")], 3001)).toBe(
      "GitHub lists only 1 of its 3001 changed files, so it may change workflow files, which GITHUB_TOKEN may not merge",
    )
  })
})
