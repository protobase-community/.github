import { afterEach, describe, expect, test } from "bun:test"
import { complete } from "./scaleway"

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
