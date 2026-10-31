// One chat completion on Scaleway's Generative APIs, streamed so a long reasoning phase never idles the connection.
// The model gets no tools: its answer is text that is only ever posted as a comment.
import { settings } from "./settings"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function send(key: string, body: string) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body,
    })
    if (response.ok) return response
    const retryable = response.status === 429 || response.status >= 500
    await response.body?.cancel()
    if (!retryable || attempt === 4) throw new Error(`Scaleway answered ${response.status}`)
    await sleep(10_000 * 2 ** (attempt - 1))
  }
}

export type Completion = { content: string; finish: string | null; usage: unknown }

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
  const response = await send(key, body)
  if (!response.body) throw new Error("Scaleway sent no response body")

  let content = ""
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
      if (event.usage) usage = event.usage
      const choice = event.choices?.[0]
      if (!choice) continue
      content += choice.delta?.content ?? ""
      if (choice.finish_reason) finish = choice.finish_reason
    }
  }
  return { content, finish, usage }
}
