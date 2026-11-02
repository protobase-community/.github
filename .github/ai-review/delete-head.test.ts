import { describe, expect, test } from "bun:test"
import { deleteMergedHead } from "./delete-head"

function fakes(options: { setting?: boolean; dependents?: number; deleteFails?: boolean; gone?: boolean } = {}) {
  const deleted: string[] = []
  const branches = {
    async deletesHeadOnMerge() {
      return options.setting ?? true
    },
    async openPullRequestsOnto() {
      return options.dependents ?? 0
    },
    async deleteBranch(branch: string) {
      if (options.deleteFails) throw new Error("GitHub answered 422")
      if (options.gone) return false
      deleted.push(branch)
      return true
    },
  }
  return { deleted, branches }
}

const quiet = () => {}

describe("deleteMergedHead", () => {
  test("deletes the head when the repository deletes head branches on merge", async () => {
    const { deleted, branches } = fakes()
    await deleteMergedHead(branches, "topic", quiet)
    expect(deleted).toEqual(["topic"])
  })

  test("keeps the head when the repository does not", async () => {
    const { deleted, branches } = fakes({ setting: false })
    await deleteMergedHead(branches, "topic", quiet)
    expect(deleted).toEqual([])
  })

  test("keeps the head while an open pull request merges into it", async () => {
    const { deleted, branches } = fakes({ dependents: 1 })
    const lines: string[] = []
    await deleteMergedHead(branches, "topic", (line) => lines.push(line))
    expect(deleted).toEqual([])
    expect(lines).toEqual(["Kept topic: an open pull request merges into it."])
  })

  test("passes when the branch was deleted already", async () => {
    const { deleted, branches } = fakes({ gone: true })
    const lines: string[] = []
    await deleteMergedHead(branches, "topic", (line) => lines.push(line))
    expect(deleted).toEqual([])
    expect(lines).toEqual(["topic was deleted already."])
  })

  test("fails when the delete fails", async () => {
    const { branches } = fakes({ deleteFails: true })
    await expect(deleteMergedHead(branches, "topic", quiet)).rejects.toThrow("422")
  })
})
