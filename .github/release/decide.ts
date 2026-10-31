// What a release run does about the captain's approval, from the gates of the pull request's head and the request
// the backlog holds for it. Pure: release.ts gathers both and carries the decision out.

// A request as the backlog holds it: still waiting on the captain, or met with their verdict, and the commit it asks about.
export type Request = {
  id: number
  state: "waiting" | "met" | "closed"
  conclusion: string | null
  sha: string | null
}

export type Decision =
  // Nothing to ask yet: the head's gates have not all passed.
  | { kind: "wait" }
  // Ask the captain about the head.
  | { kind: "ask" }
  // Keep the waiting request, its text naming the head and its gates as they are now.
  | { kind: "update"; id: number }
  // The captain approved the head, and its gates passed: merge it.
  | { kind: "merge"; id: number }
  // The captain asked for changes to the head: hold until a newer head.
  | { kind: "held"; id: number }

export function decide(head: string, gatesPassed: boolean, request: Request | null): Decision {
  if (request === null) return gatesPassed ? { kind: "ask" } : { kind: "wait" }
  if (request.state === "waiting") return { kind: "update", id: request.id }

  const forHead = request.state === "met" && request.sha === head
  if (forHead && request.conclusion === "success") return gatesPassed ? { kind: "merge", id: request.id } : { kind: "wait" }
  if (forHead && request.conclusion === "changes_requested") return { kind: "held", id: request.id }

  // A verdict on another commit, or a request closed with its task: the head needs a request of its own.
  return gatesPassed ? { kind: "ask" } : { kind: "wait" }
}
