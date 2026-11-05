// Asks the model for the review. A turn the model ends on its own with no answer is asked once more, never again; a
// second empty answer is a skipped review, which still blocks landing. Any other answer, empty at the output cap too,
// is kept as it is: asking again until an answer passes would make the verdict a draw.
import { complete, type Completion } from "./scaleway"
import { endedWithoutAnswer } from "./verdict"

export type Complete = (key: string, system: string, user: string) => Promise<Completion>

// The answer to use, and the first ask's empty answer when it was asked again, or null.
export async function askForReview(key: string, system: string, user: string, ask: Complete = complete) {
  const first = await ask(key, system, user)
  if (!endedWithoutAnswer(first)) return { completion: first, emptyFirst: null }
  return { completion: await ask(key, system, user), emptyFirst: first }
}
