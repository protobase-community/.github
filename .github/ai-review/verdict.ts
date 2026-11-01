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

// How much of the reasoning the job log keeps when the answer is empty: its end shows whether the model wrote its
// verdict inside the reasoning or stopped with nothing, which the usage line alone cannot tell.
export const reasoningTailChars = 4000

// The end of the reasoning to log for an empty answer, or null when there is an answer. It goes to the job log only,
// never to the comment, and the review stays not passed.
export function emptyAnswerReasoning(completion: Completion) {
  if (completion.content.trim()) return null
  return completion.reasoning.slice(-reasoningTailChars)
}
