import { afterEach, describe, expect, test } from "bun:test"
import { join } from "node:path"
import { askForReview } from "./ask"
import type { Completion } from "./scaleway"
import { skipReason } from "./verdict"

// The response of ai-review run 41357095209 on firstmate-backlog PR #9, whose 148k prompt is under the input cap: an
// empty answer the model stopped on still happens inside the cap, so it is asked once more, never again.
const emptyAnswerStream = await Bun.file(join(import.meta.dir, "fixtures", "empty-answer-41357095209.sse")).text()

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const answer = (content: string, finish: string): Completion => ({ content, reasoning: "", finish, usage: null })

function answers(...completions: Completion[]) {
  const asked: Completion[] = []
  const ask = async () => {
    const next = completions[asked.length]
    asked.push(next)
    return next
  }
  return { ask, asked }
}

describe("askForReview", () => {
  test("asks once more after the empty answer of run 41357095209, and no third time", async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response(emptyAnswerStream)
    }) as unknown as typeof fetch
    const { completion } = await askForReview("key", "system", "user")
    expect(calls).toBe(2)
    expect(skipReason(completion)).toBe("the model ended its turn without an answer.")
  })

  test("asks once for an answer", async () => {
    const { ask, asked } = answers(answer("No issues found.", "stop"))
    const { completion } = await askForReview("key", "system", "user", ask)
    expect(asked).toHaveLength(1)
    expect(completion.content).toBe("No issues found.")
  })

  test("keeps the second answer after an empty one", async () => {
    const { ask, asked } = answers(answer("\n\n", "stop"), answer("No issues found.", "stop"))
    const { completion } = await askForReview("key", "system", "user", ask)
    expect(asked).toHaveLength(2)
    expect(completion.content).toBe("No issues found.")
  })

  test("does not ask again for an answer cut off at the output cap", async () => {
    const { ask, asked } = answers(answer("", "length"), answer("No issues found.", "stop"))
    const { completion } = await askForReview("key", "system", "user", ask)
    expect(asked).toHaveLength(1)
    expect(skipReason(completion)).toBe("the model used its whole output budget before answering.")
  })
})
