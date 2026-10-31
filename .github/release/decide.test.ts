import { describe, expect, test } from "bun:test"
import { decide, type Request } from "./decide"

const head = "a".repeat(40)
const older = "b".repeat(40)
const request = (state: Request["state"], conclusion: string | null, sha: string | null): Request => ({ id: 7, state, conclusion, sha })

describe("decide", () => {
  test("asks only once the head's gates passed", () => {
    expect(decide(head, false, null)).toEqual({ kind: "wait" })
    expect(decide(head, true, null)).toEqual({ kind: "ask" })
  })

  test("keeps updating a waiting request, whatever the gates say", () => {
    expect(decide(head, false, request("waiting", null, older))).toEqual({ kind: "update", id: 7 })
    expect(decide(head, true, request("waiting", null, head))).toEqual({ kind: "update", id: 7 })
  })

  test("merges an approved head only while its gates pass", () => {
    expect(decide(head, true, request("met", "success", head))).toEqual({ kind: "merge", id: 7 })
    expect(decide(head, false, request("met", "success", head))).toEqual({ kind: "wait" })
  })

  test("never merges an approval of another commit, and asks again for the head", () => {
    expect(decide(head, true, request("met", "success", older))).toEqual({ kind: "ask" })
    expect(decide(head, false, request("met", "success", older))).toEqual({ kind: "wait" })
    expect(decide(head, true, request("met", "success", null))).toEqual({ kind: "ask" })
  })

  test("holds a head the captain asked changes for, and asks again for a newer one", () => {
    expect(decide(head, true, request("met", "changes_requested", head))).toEqual({ kind: "held", id: 7 })
    expect(decide(head, true, request("met", "changes_requested", older))).toEqual({ kind: "ask" })
  })

  test("asks again once a request was closed with its task", () => {
    expect(decide(head, true, request("closed", "closed", head))).toEqual({ kind: "ask" })
  })
})
