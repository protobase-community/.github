import { describe, expect, test } from "bun:test"
import { skipReason } from "./verdict"

const answer = (content: string, finish: string) => ({ content, finish, usage: null })

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
