import { describe, expect, test } from "bun:test"
import { emptyAnswerReasoning, reasoningTailChars, skipReason } from "./verdict"

const answer = (content: string, finish: string, reasoning = "") => ({ content, reasoning, finish, usage: null })

describe("skipReason", () => {
  test("does not pass a clean answer cut off at the output cap", () => {
    expect(skipReason(answer("No issues found.", "length"))).toBe("the model's answer was cut off before it finished.")
  })

  test("passes a clean answer that finished", () => {
    expect(skipReason(answer("No issues found.", "stop"))).toBeNull()
  })

  test("keeps the findings of an answer cut off at the output cap", () => {
    expect(skipReason(answer("1. A bug.", "length"))).toBeNull()
  })

  test("does not pass an empty answer", () => {
    expect(skipReason(answer("", "length"))).toBe("the model used its whole output budget before answering.")
    expect(skipReason(answer(" ", "stop"))).toBe("the model gave no answer.")
  })
})

describe("emptyAnswerReasoning", () => {
  test("gives nothing to log for an answer", () => {
    expect(emptyAnswerReasoning(answer("No issues found.", "stop", "Looks fine."))).toBeNull()
  })

  test("gives the reasoning of an empty answer that ended below the cap, which stays not passed", () => {
    const completion = answer("\n\n", "stop", "So the verdict: No issues found.")
    expect(emptyAnswerReasoning(completion)).toBe("So the verdict: No issues found.")
    expect(skipReason(completion)).toBe("the model gave no answer.")
  })

  test("keeps only the end of a long reasoning", () => {
    const reasoning = "a".repeat(reasoningTailChars) + "the end"
    const tail = emptyAnswerReasoning(answer("", "length", reasoning))
    expect(tail).toHaveLength(reasoningTailChars)
    expect(tail?.endsWith("the end")).toBe(true)
  })
})
