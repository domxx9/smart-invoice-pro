/**
 * Shared fetch helper that branches on Capacitor vs browser environment.
 * All API modules should use this instead of duplicating `isNative()` branching.
 *
 * Returns `{ data, raw }` where:
 *   - `data`  = parsed JSON body (caller's primary usage)
 *   - `raw`   = underlying response object for header access (pagination, etc.)
 *     Native: raw.headers for Link header
 *     Browser: raw.headers.get() for Link header
 */
const isNative = () => typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()

export async function platformFetch(url, headers = {}, opts = {}) {
  const { method = 'GET', body, devUrl } = opts

  if (isNative()) {
    const res = await window.Capacitor.Plugins.CapacitorHttp.get({ url, headers, method, body })
    if (res.status < 200 || res.status >= 300)
      throw new Error(`API ${res.status} — ${JSON.stringify(res.data).slice(0, 180)}`)
    return { data: res.data, raw: res }
  }

  const target = devUrl || url
  const res = await fetch(target, { headers, method, body })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  const data = await res.json()
  return { data, raw: res }
}
