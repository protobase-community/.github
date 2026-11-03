import { afterEach, describe, expect, test } from "bun:test"
import { announceMerge, type Dispatcher, mergedEvent } from "./announce"
import { gitHub } from "./github"

const merged = { number: 57, base: "main", sha: "abc1234" }

function recorder() {
  const sent: { eventType: string; payload: Record<string, unknown> }[] = []
  const dispatcher: Dispatcher = {
    async dispatch(eventType, payload) {
      sent.push({ eventType, payload })
    },
  }
  return { sent, dispatcher }
}

describe("announceMerge", () => {
  test("sends one pull_request_merged with the number, base and merge commit without a MERGE_TOKEN", async () => {
    const { sent, dispatcher } = recorder()
    expect(await announceMerge(dispatcher, undefined, merged)).toBe(true)
    expect(sent).toEqual([{ eventType: "pull_request_merged", payload: { number: 57, base: "main", sha: "abc1234" } }])
  })

  test("sends nothing with a MERGE_TOKEN, whose push starts the workflows", async () => {
    const { sent, dispatcher } = recorder()
    expect(await announceMerge(dispatcher, "token", merged)).toBe(false)
    expect(sent).toEqual([])
  })
})

describe("dispatch", () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test("posts the event and its payload to the repository's dispatches", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(null, { status: 204 })
    }) as typeof fetch
    await gitHub("token", "owner/name").dispatch(mergedEvent, merged)
    expect(calls[0].url).toBe("https://api.github.com/repos/owner/name/dispatches")
    expect(calls[0].init.method).toBe("POST")
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ event_type: "pull_request_merged", client_payload: merged })
  })

  test("throws GitHub's answer when it refuses the event, so the merge's run fails", async () => {
    globalThis.fetch = (async () => new Response('{"message":"Resource not accessible by integration"}', { status: 403 })) as unknown as typeof fetch
    const announced = announceMerge(gitHub("token", "owner/name"), undefined, merged)
    await expect(announced).rejects.toThrow("GitHub answered 403 for POST /repos/owner/name/dispatches: {\"message\":\"Resource not accessible by integration\"}")
  })
})
