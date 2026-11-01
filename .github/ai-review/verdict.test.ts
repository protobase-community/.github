import { describe, expect, test } from "bun:test"
import { settings } from "./settings"
import { skipReason } from "./verdict"

const answer = (content: string, reasoning_tokens: number) => ({ content, finish: "stop", usage: { completion_tokens_details: { reasoning_tokens } } })

describe("skipReason", () => {
  test("does not pass a clean answer whose reasoning stopped at its budget", () => {
    expect(skipReason(answer("No issues found.", settings.thinkingTokenBudget - 1))).toBe(
      "the model's reasoning ran into its budget before it finished checking.",
    )
  })

  test("passes a clean answer whose reasoning finished under its budget", () => {
    expect(skipReason(answer("No issues found.", 6648))).toBeNull()
  })

  test("keeps the findings of an answer whose reasoning stopped at its budget", () => {
    expect(skipReason(answer("1. A bug.", settings.thinkingTokenBudget - 1))).toBeNull()
  })

  test("does not pass an empty answer", () => {
    expect(skipReason({ content: "", finish: "length", usage: null })).toBe("the model used its whole output budget before answering.")
    expect(skipReason({ content: " ", finish: "stop", usage: null })).toBe("the model gave no answer.")
  })
})
