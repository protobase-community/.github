import { expect, test } from "bun:test"
import { devEnvironment } from "./dev-environment"

const head = "a".repeat(40)
const addresses = { deployedUrl: "https://dev/deployed", failedUrl: "https://dev/failed", healthUrl: "https://dev/health" }

const serving = (files: Record<string, Response>) => (async (url: string) => files[url] ?? new Response("", { status: 404 })) as unknown as typeof fetch

test("reads the deployed commit, the failed one and the health check's answer", async () => {
  const fetchFn = serving({ "https://dev/deployed": new Response(`${head}\n`), "https://dev/health": new Response('{"status":"ok"}') })
  expect(await devEnvironment(addresses, fetchFn)).toEqual({ deployed: head, failed: null, healthStatus: 200 })
})

test("reads a failed commit and a health check that fails", async () => {
  const fetchFn = serving({ "https://dev/failed": new Response(head), "https://dev/health": new Response("", { status: 502 }) })
  expect(await devEnvironment(addresses, fetchFn)).toEqual({ deployed: null, failed: head, healthStatus: 502 })
})

test("fails the run when a commit file answers with an error", async () => {
  const fetchFn = serving({ "https://dev/deployed": new Response("", { status: 500 }) })
  expect(devEnvironment(addresses, fetchFn)).rejects.toThrow("https://dev/deployed answered 500")
})
