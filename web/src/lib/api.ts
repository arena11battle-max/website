// Access token lives in memory only; the refresh token is an httpOnly cookie the browser sends to /api/auth.
let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null
let onSignedOut: () => void = () => {}

export function setAccessToken(token: string | null) {
  accessToken = token
}
export function getAccessToken() {
  return accessToken ?? undefined
}
export function onSessionLost(fn: () => void) {
  onSignedOut = fn
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok || res.status === 204) return false
      const body = await res.json()
      accessToken = body.accessToken
      return true
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

export async function api<T = unknown>(method: string, url: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (accessToken) headers.authorization = `Bearer ${accessToken}`
  let res: Response
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check the Wi-Fi connection.')
  }
  if (res.status === 401 && retry && !url.startsWith('/api/auth/')) {
    if (await refreshSession()) return api<T>(method, url, body, false)
    onSignedOut()
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`)
  return data as T
}

export const get = <T>(url: string) => api<T>('GET', url)
export const post = <T>(url: string, body?: unknown) => api<T>('POST', url, body ?? {})
export const patch = <T>(url: string, body: unknown) => api<T>('PATCH', url, body)
export const del = <T>(url: string) => api<T>('DELETE', url)
