import { afterEach, describe, expect, test } from "bun:test"
import { complete } from "./scaleway"
import { settings } from "./settings"

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function stream(...events: unknown[]) {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n"
  globalThis.fetch = (async () => new Response(text)) as unknown as typeof fetch
}

describe("complete", () => {
  test("returns the streamed answer", async () => {
    stream({ choices: [{ delta: { content: "No issues " } }] }, { choices: [{ delta: { content: "found." }, finish_reason: "stop" }] })
    const completion = await complete("key", "system", "user")
    expect(completion.content).toBe("No issues found.")
    expect(completion.finish).toBe("stop")
  })

  test("keeps the reasoning apart from the answer", async () => {
    stream(
      { choices: [{ delta: { reasoning_content: "The diff " } }] },
      { choices: [{ delta: { reasoning_content: "looks fine." } }] },
      { choices: [{ delta: { content: "No issues found." }, finish_reason: "stop" }] },
    )
    const completion = await complete("key", "system", "user")
    expect(completion.content).toBe("No issues found.")
    expect(completion.reasoning).toBe("The diff looks fine.")
  })

  // The shape of the c60cdc0 review: the model ended its reasoning well below the output cap and replied with nothing.
  test("returns an empty answer that ended its reasoning", async () => {
    stream(
      { choices: [{ delta: { reasoning_content: "So the verdict: No issues found." } }] },
      { choices: [{ delta: { content: "\n\n" }, finish_reason: "stop" }] },
      { choices: [], usage: { completion_tokens: 12410, completion_tokens_details: { reasoning_tokens: 12408 } } },
    )
    const completion = await complete("key", "system", "user")
    expect(completion.content.trim()).toBe("")
    expect(completion.reasoning).toBe("So the verdict: No issues found.")
    expect(completion.finish).toBe("stop")
  })

  // Scaleway's streaming documentation for its Qwen reasoning models sends the reasoning in `delta.reasoning`.
  test("keeps the reasoning Scaleway streams in delta.reasoning", async () => {
    stream(
      { choices: [{ delta: { reasoning: "So the verdict: " } }] },
      { choices: [{ delta: { reasoning: "No issues found." } }] },
      { choices: [{ delta: { content: "\n\n" }, finish_reason: "stop" }] },
    )
    const completion = await complete("key", "system", "user")
    expect(completion.reasoning).toBe("So the verdict: No issues found.")
  })

  test("fails on an error inside the stream", async () => {
    stream({ choices: [{ delta: { content: "Partial" } }] }, { error: { message: "overloaded", code: 500 } })
    await expect(complete("key", "system", "user")).rejects.toThrow("an error in the response stream")
  })

  test("fails on a stream that ends without finishing", async () => {
    stream({ choices: [{ delta: { content: "Partial" } }] })
    await expect(complete("key", "system", "user")).rejects.toThrow("without finishing")
  })

  test("fails on a refused request", async () => {
    globalThis.fetch = (async () => new Response("denied", { status: 403 })) as unknown as typeof fetch
    await expect(complete("key", "system", "user")).rejects.toThrow("Scaleway answered 403")
  })
})

describe("one ask", () => {
  test("sends one request with the reasoning effort", async () => {
    const bodies: Record<string, unknown>[] = []
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "" }, finish_reason: "length" }] })}\n\ndata: [DONE]\n\n`)
    }) as unknown as typeof fetch
    expect((await complete("key", "system", "user")).content).toBe("")
    expect(bodies).toHaveLength(1)
    expect(bodies[0].reasoning_effort).toBe(settings.reasoningEffort)
  })

  test("fails on an overloaded service without asking again", async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response("busy", { status: 503 })
    }) as unknown as typeof fetch
    await expect(complete("key", "system", "user")).rejects.toThrow("Scaleway answered 503")
    expect(calls).toBe(1)
  })
})
