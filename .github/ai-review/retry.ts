// GitHub now and then answers a read with a transient 5xx that the same request answers 200 to moments later. A review
// reads many files, so one such answer failed the whole review. A read that gets one is sent again once after a short
// fixed pause; a second 5xx is answered as it is, and the caller throws on it as before.
const transient = new Set([500, 502, 503, 504])

export const retryPauseMs = 2000

export function pause() {
  return new Promise<void>((resolve) => setTimeout(resolve, retryPauseMs))
}

export async function readRetryingOnce(read: () => Promise<Response>, wait: () => Promise<void>) {
  const response = await read()
  if (!transient.has(response.status)) return response
  await wait()
  return read()
}
