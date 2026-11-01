// What a repository's dev environment runs, read from the addresses its caller names, such as the dev Cloud's
// https://console.dev.protobase.net/.dev-cloud/deployed and /failed (infra's roles/dev_cloud) and its /health.
import type { DevEnvironment } from "./gates"

type Fetch = typeof fetch

export type DevAddresses = { deployedUrl: string; failedUrl: string; healthUrl: string }

// A commit file's commit, or null when there is none (404).
async function commitAt(url: string, fetchFn: Fetch) {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(15_000) })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return (await response.text()).trim() || null
}

export async function devEnvironment(addresses: DevAddresses, fetchFn: Fetch = fetch): Promise<Omit<DevEnvironment, "hasCommit">> {
  const deployed = await commitAt(addresses.deployedUrl, fetchFn)
  const failed = addresses.failedUrl ? await commitAt(addresses.failedUrl, fetchFn) : null
  const health = await fetchFn(addresses.healthUrl, { signal: AbortSignal.timeout(15_000) })
  return { deployed, failed, healthStatus: health.status }
}
