import { afterEach, expect, test } from "bun:test"
import { join } from "node:path"
import { complete } from "./scaleway"
import { endedWithoutAnswer, skipReason } from "./verdict"

// The response of ai-review run 41357095209 on firstmate-backlog PR #9: its finish reason and usage as the job logged
// them, with neutral filler in place of its reasoning text.
const emptyAnswerStream = await Bun.file(join(import.meta.dir, "fixtures", "empty-answer-41357095209.sse")).text()

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

test("the empty answer of run 41357095209 is a turn the model ended with no answer, which is no review", async () => {
  globalThis.fetch = (async () => new Response(emptyAnswerStream)) as unknown as typeof fetch
  const completion = await complete("key", "system", "user")
  expect(completion.finish).toBe("stop")
  expect(completion.usage).toMatchObject({ completion_tokens: 9390, completion_tokens_details: { reasoning_tokens: 9389 } })
  expect(endedWithoutAnswer(completion)).toBe(true)
  expect(skipReason(completion)).toBe("the model ended its turn without an answer.")
})
