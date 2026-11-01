// One chat completion on Scaleway's Generative APIs, streamed so a long reasoning phase never idles the connection.
// The model gets no tools: its answer is text that is only ever posted as a comment. A refused or failed request is
// not sent again: the review fails instead. The reasoning is kept apart from the answer and never posted.
import { settings } from "./settings"

export type Completion = { content: string; reasoning: string; finish: string | null; usage: unknown }

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
  let reasoning = ""
  let finish: string | null = null
  let usage: unknown = null
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
      reasoning += choice.delta?.reasoning_content ?? ""
      if (choice.finish_reason) finish = choice.finish_reason
    }
  }
  // A stream that ends without a finish reason was cut off, so its answer is not a review.
  if (!finish) throw new Error("Scaleway ended the response stream without finishing")
  return { content, reasoning, finish, usage }
}

