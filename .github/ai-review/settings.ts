// The model and request settings for every AI review. Switching models is a change to `model` alone.
// Settings come from the Scaleway review benchmark: temperature 0.6, a 16k output cap and high reasoning effort.
export const settings = {
  model: "qwen3.5-397b-a17b",
  provider: "Scaleway",
  endpoint: "https://api.scaleway.ai/v1/chat/completions",
  temperature: 0.6,
  maxTokens: 16000,
  reasoningEffort: "high",
}

// What a review may send. A pull request above the cap is skipped with a short note instead of being trimmed,
// because a review of half a change reads as a review of all of it.
export const limits = {
  maxFiles: 150,
  maxInputChars: 300_000,
  maxFileChars: 60_000,
  maxCommentChars: 60_000,
}
