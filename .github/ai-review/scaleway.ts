// One chat completion on Scaleway's Generative APIs, streamed so a long reasoning phase never idles the connection.
// The model gets no tools: its answer is text that is only ever posted as a comment. A refused or failed request is
// not sent again: the review fails instead.
import { settings } from "./settings"

type Usage = { completion_tokens_details?: { reasoning_tokens?: number } }

export type Completion = { content: string; finish: string | null; usage: Usage | null }

export async function complete(key: string, system: string, user: string): Promise<Completion> {
  const body = JSON.stringify({
    model: settings.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: true,
    stream_options: { include_usage: true },
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    reasoning_effort: settings.reasoningEffort,
    thinking_token_budget: settings.thinkingTokenBudget,
  })
  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body,
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Scaleway answered ${response.status}`)
  }
  if (!response.body) throw new Error("Scaleway sent no response body")

  let content = ""
  let finish: string | null = null
  let usage: Usage | null = null
  let buffer = ""
  const decoder = new TextDecoder()
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue
      const event = JSON.parse(line.slice(6))
      if (event.error || event.object === "error") throw new Error("Scaleway sent an error in the response stream")
      if (event.usage) usage = event.usage
      const choice = event.choices?.[0]
      if (!choice) continue
      content += choice.delta?.content ?? ""
      if (choice.finish_reason) finish = choice.finish_reason
    }
  }
  // A stream that ends without a finish reason was cut off, so its answer is not a review.
  if (!finish) throw new Error("Scaleway ended the response stream without finishing")
  return { content, finish, usage }
}

// Whether the reasoning ran into its budget and was cut off, so a short answer may be one the model had not finished
// checking. vLLM stops it one token below the budget.
export function reasonedToBudget(completion: Completion) {
  return (completion.usage?.completion_tokens_details?.reasoning_tokens ?? 0) >= settings.thinkingTokenBudget - 1
}
