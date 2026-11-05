// The model and request settings for every AI review. Switching models is a change to `model` alone.
// Settings come from the Scaleway model reliability benchmark: qwen3.8-27b made no false claims and caught every known
// real bug, at temperature 0.6 and medium reasoning effort (it offers no high). The output cap is Scaleway's 32k
// maximum. max_tokens counts reasoning and answer together. Now and then the model gives no answer, and the review
// then says it was not reviewed: it can reason until that cap, or end its turn well below it with an empty reply,
// whose reasoning the job log then shows. Only settings Scaleway documents are sent. Only that second kind is asked once
// more (ask.ts), as it still happens inside the input cap (firstmate-backlog PR #9, 148k); asking again until an answer
// passes would make the verdict a draw.
export const settings = {
  model: "qwen3.8-27b",
  endpoint: "https://api.scaleway.ai/v1/chat/completions",
  temperature: 0.6,
  maxTokens: 32000,
  reasoningEffort: "medium",
}

// What a review may send. Above maxInputChars, full file contents are left out until the whole diff fits; a pull
// request whose diff alone is above it is skipped with a short note, because a review of half a change reads as a
// review of all of it. maxInputChars is the largest user message measured to get an answer every time: replays of
// public pull requests, 30 asks per setting, gave no empty answer in 240 asks at 155k characters, but about one in two
// at 291k (15, 14 and 14 of 30), still 7 of 30 with every non-Latin character replaced, and no fewer with top_p 0.95,
// low reasoning effort or a reordered prompt. Asking once more recovered some of them, never all.
export const limits = {
  // Files with changes; a file only renamed counts toward no cap.
  maxFiles: 150,
  // The most files GitHub lists for a pull request.
  maxListedFiles: 3000,
  maxInputChars: 155_000,
  maxFileChars: 60_000,
  maxCommentChars: 60_000,
}

// The label a review that found no issues puts on a pull request when auto-merge is on. Taking it off stops a merge
// until the next review event puts it back; the hold label below is what keeps a pull request from merging.
export const approvedLabel = "ai-approved"

// The label that keeps a pull request from being merged automatically, such as one whose merge needs manual steps.
export const holdLabel = "do-not-merge"

// The reviewer whose review decides when the model gives no answer (fallback-review.ts): its GitHub App, whose slug is
// also its login in GraphQL, its account login in REST, and the name of its check run on a head. Only that app's
// check and that account's review threads count.
export const fallbackReviewer = {
  name: "CodeRabbit",
  app: "coderabbitai",
  login: "coderabbitai[bot]",
  check: "CodeRabbit",
}

// How long the review waits for the fallback reviewer's check to finish on the head: a fixed number of reads a fixed
// interval apart. Its reviews of protobase pull requests took 4 to 18 minutes from the push, and the model's asks up
// to about 13, so 15 minutes of waiting still fits the job's 35-minute timeout (ai-pr-review.yml).
export const fallbackWait = {
  intervalSeconds: 30,
  maxReads: 30,
}
