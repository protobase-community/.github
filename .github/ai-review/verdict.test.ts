import { describe, expect, test } from "bun:test"
import { emptyAnswerReasoning, endedWithoutAnswer, reasoningTailChars, skipReason } from "./verdict"

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
    expect(skipReason(answer(" ", "stop"))).toBe("the model ended its turn without an answer.")
  })
})

describe("endedWithoutAnswer", () => {
  test("is an empty answer the model stopped on", () => {
    expect(endedWithoutAnswer(answer("", "stop"))).toBe(true)
    expect(endedWithoutAnswer(answer("\n\n", "stop"))).toBe(true)
  })

  test("is not an answer, nor an empty one cut off at the output cap", () => {
    expect(endedWithoutAnswer(answer("No issues found.", "stop"))).toBe(false)
    expect(endedWithoutAnswer(answer("", "length"))).toBe(false)
  })
})

describe("emptyAnswerReasoning", () => {
  test("gives nothing to log for an answer", () => {
    expect(emptyAnswerReasoning(answer("No issues found.", "stop", "Looks fine."))).toBeNull()
  })

  test("gives the reasoning of an empty answer that ended below the cap, which stays not passed", () => {
    const completion = answer("\n\n", "stop", "So the verdict: No issues found.")
    expect(emptyAnswerReasoning(completion)).toBe("So the verdict: No issues found.")
    expect(skipReason(completion)).toBe("the model ended its turn without an answer.")
  })

  test("keeps only the end of a long reasoning", () => {
    const reasoning = "a".repeat(reasoningTailChars) + "the end"
    const tail = emptyAnswerReasoning(answer("", "length", reasoning))
    expect(tail).toHaveLength(reasoningTailChars)
    expect(tail?.endsWith("the end")).toBe(true)
  })
})
