// The model and request settings for every AI review. Switching models is a change to `model` alone.
// Settings come from the Scaleway review benchmark: temperature 0.6 and high reasoning effort. The output cap is
// Scaleway's 32k maximum for this model. max_tokens counts reasoning and answer together, and now and then the model
// reasons until that cap without answering, so the reasoning has its own budget: vLLM's thinking_token_budget, which
// Scaleway enforces on this model though its docs leave it out. It ends the reasoning at 20k, which a normal review
// stays under, and leaves the rest of the cap for the answer. A review asks the model once and never again: its answer
// differs from one ask to the next, so asking again until one passes would make the verdict a draw.
export const settings = {
  model: "qwen3.6-35b-a3b",
  provider: "Scaleway",
  endpoint: "https://api.scaleway.ai/v1/chat/completions",
  temperature: 0.6,
  maxTokens: 32000,
  reasoningEffort: "high",
  thinkingTokenBudget: 20000,
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
