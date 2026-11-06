// The model and request settings for every AI review. Switching models is a change to `model` alone.
// Settings come from the Scaleway model reliability benchmark: qwen3.8-27b made no false claims and caught every known
// real bug, at temperature 0.6 and medium reasoning effort (it offers no high). The output cap is Scaleway's 32k
// maximum. max_tokens counts reasoning and answer together. Now and then the model gives no answer, and the review
// then says it was not reviewed: it can reason until that cap, or, well below it, stop mid-sentence in its reasoning
// and reply with nothing; the job log then shows that reasoning's end. Both come with a long reasoning, which a large
// input brings (limits below). Only settings Scaleway documents are sent. Only that second kind is asked once more
// (ask.ts), as it still happens inside the input cap; asking again until an answer passes would make the verdict a
// draw.
export const settings = {
  model: "qwen3.8-27b",
  endpoint: "https://api.scaleway.ai/v1/chat/completions",
  temperature: 0.6,
  maxTokens: 32000,
  reasoningEffort: "medium",
}

// What a review may send. Above maxInputChars, full file contents are left out until the whole diff fits; a pull
// request whose diff alone is above it is asked about in up to maxParts parts that each fit (parts.ts), and gets one
// verdict for all of them, because a review of half a change reads as a review of all of it. What gets an answer is
// the ask's size in tokens. Replays of a public pull request, 30 asks per setting, gave no empty answer in 240 asks at
// 155k characters, but about one in two at 291k, and no fewer with top_p 0.95, low reasoning effort or a reordered
// prompt. That prose ran about 3.6 characters per token; code runs about 3.35, so 155k came to about 46k tokens on live
// reviews, where 13 of 35 asks of 44k tokens or more gave no answer, against 1 of 39 below. maxInputChars keeps an ask
// of code near 39k tokens.
export const limits = {
  // Files with changes; a file only renamed counts toward no cap.
  maxFiles: 150,
  // The most files GitHub lists for a pull request.
  maxListedFiles: 3000,
  maxInputChars: 130_000,
  // The asks a review of parts makes one after another, each up to about 13 minutes with its second ask.
  maxParts: 4,
  maxFileChars: 60_000,
  maxCommentChars: 60_000,
}

// The label a review that found no issues puts on a pull request when auto-merge is on. Taking it off stops a merge
// until the next review event puts it back; the hold label below is what keeps a pull request from merging.
export const approvedLabel = "ai-approved"

// The label that keeps a pull request from being merged automatically, such as one whose merge needs manual steps.
export const holdLabel = "do-not-merge"

// The label that makes the auto-merge fast-forward the base branch to the pull request's head instead of merging it
// with the caller's method, such as for a pull request that merges one long-lived branch into another, whose commits
// have to stay ancestors of the base (fast-forward.ts).
export const fastForwardLabel = "fast-forward"

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
// to about 13 per part, so 15 minutes of waiting after limits.maxParts parts still fits the job's 75-minute timeout
// (ai-pr-review.yml).
export const fallbackWait = {
  intervalSeconds: 30,
  maxReads: 30,
}
