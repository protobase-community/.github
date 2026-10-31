// The model and request settings for every AI review. Switching models is a change to `model` alone.
// Settings come from the Scaleway review benchmark: temperature 0.6 and high reasoning effort. The output cap is
// Scaleway's 32k maximum for this model, because on a big pull request high effort can reason past 16k.
export const settings = {
  model: "qwen3.6-35b-a3b",
  provider: "Scaleway",
  endpoint: "https://api.scaleway.ai/v1/chat/completions",
  temperature: 0.6,
  maxTokens: 32000,
  reasoningEffort: "high",
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
