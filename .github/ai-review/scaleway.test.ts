import { afterEach, describe, expect, test } from "bun:test"
import { complete, completeAnswer } from "./scaleway"

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

describe("completeAnswer", () => {
  function answers(...contents: string[]) {
    const bodies = contents.map(
      (content) =>
        `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: content ? "stop" : "length" }] })}\n\ndata: [DONE]\n\n`,
    )
    let calls = 0
    globalThis.fetch = (async () => new Response(bodies[calls++])) as unknown as typeof fetch
    return () => calls
  }

  test("asks once when the first answer has text", async () => {
    const calls = answers("No issues found.")
    expect((await completeAnswer("key", "system", "user")).content).toBe("No issues found.")
    expect(calls()).toBe(1)
  })

  test("asks again once after an empty answer", async () => {
    const calls = answers("  ", "No issues found.")
    expect((await completeAnswer("key", "system", "user")).content).toBe("No issues found.")
    expect(calls()).toBe(2)
  })

  test("asks again with less reasoning effort", async () => {
    const efforts: string[] = []
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const effort = JSON.parse(String(init.body)).reasoning_effort
      efforts.push(effort)
      const content = effort === "high" ? "" : "No issues found."
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: content ? "stop" : "length" }] })}\n\ndata: [DONE]\n\n`)
    }) as unknown as typeof fetch
    expect((await completeAnswer("key", "system", "user")).content).toBe("No issues found.")
    expect(efforts).toEqual(["high", "medium"])
  })

  test("returns the second empty answer without asking a third time", async () => {
    const calls = answers("", "", "never sent")
    expect((await completeAnswer("key", "system", "user")).content).toBe("")
    expect(calls()).toBe(2)
  })
})
