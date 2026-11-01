// The model and request settings for every AI review. Switching models is a change to `model` alone.
// Settings come from the Scaleway model reliability benchmark: qwen3.8-27b made no false claims and caught every known
// real bug, at temperature 0.6 and medium reasoning effort (it offers no high). The output cap is Scaleway's 32k
// maximum. max_tokens counts reasoning and answer together. Now and then the model gives no answer, and the review
// then says it was not reviewed: it can reason until that cap, or end its reasoning well below it with an empty
// reply, whose reasoning the job log then shows. Only settings Scaleway documents are sent. A review asks the model
// once and never again: its answer differs from one ask to the next, so asking again until one passes would make the
// verdict a draw.
export const settings = {
  model: "qwen3.8-27b",
  provider: "Scaleway",
  endpoint: "https://api.scaleway.ai/v1/chat/completions",
  temperature: 0.6,
  maxTokens: 32000,
  reasoningEffort: "medium",
}

// What a review may send. Above maxInputChars, full file contents are left out until the whole diff fits; a pull
// request whose diff alone is above it is skipped with a short note, because a review of half a change reads as a
// review of all of it.
export const limits = {
  maxFiles: 150,
  maxInputChars: 300_000,
  maxFileChars: 60_000,
  maxCommentChars: 60_000,
}

// The label a review that found no issues puts on a pull request when auto-merge is on. Taking it off stops a merge
// until the next review event puts it back; the hold label below is what keeps a pull request from merging.
export const approvedLabel = "ai-approved"

// The label that keeps a pull request from being merged automatically, such as one whose merge needs manual steps.
export const holdLabel = "do-not-merge"

// The branch whose pull requests into the default branch are releases. Those never merge automatically: a release
// needs a person's approval.
export const releaseBranch = "development"
