// Why a model's answer is not a review, or null when it is one. An empty answer is not one, and nor is a clean one cut
// off at the output cap: the model was stopped before it finished, so it is no pass.
import { isClean } from "./comment"
import type { Completion } from "./scaleway"

export function skipReason(completion: Completion) {
  if (!completion.content.trim()) {
    return completion.finish === "length" ? "the model used its whole output budget before answering." : "the model gave no answer."
  }
  if (isClean(completion.content) && completion.finish === "length") return "the model's answer was cut off before it finished."
  return null
}
