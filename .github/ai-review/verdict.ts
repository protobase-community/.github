// Why a model's answer is not a review, or null when it is one. An empty answer is not one, and nor is a clean one
// whose reasoning was cut off at its budget: the model was stopped before it finished checking, so it is no pass.
import { isClean } from "./comment"
import { type Completion, reasonedToBudget } from "./scaleway"

export function skipReason(completion: Completion) {
  if (!completion.content.trim()) {
    return completion.finish === "length" ? "the model used its whole output budget before answering." : "the model gave no answer."
  }
  if (isClean(completion.content) && reasonedToBudget(completion)) return "the model's reasoning ran into its budget before it finished checking."
  return null
}
