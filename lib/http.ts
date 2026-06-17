/**
 * fetch with an AbortController-backed timeout. Throws if the request takes
 * longer than `ms`. Partner adapters wrap their calls in this so a slow/hung
 * upstream can't stall a route handler past its maxDuration.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
