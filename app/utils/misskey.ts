export class MisskeyApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
  ) {
    super(message)
  }
}

export function normalizeHost(input: string): string {
  const raw = input.trim()
  if (!raw || /[\s\\]/.test(raw)) throw new Error('올바른 인스턴스 주소를 입력해 주세요.')
  const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('올바른 인스턴스 주소를 입력해 주세요.')
  }
  return url.host.toLowerCase()
}

/** POST https://{host}/api/{endpoint} with the token in the body, as Misskey expects. */
export async function apiCall<T = unknown>(
  host: string,
  endpoint: string,
  params: Record<string, unknown> = {},
  token?: string | null,
): Promise<T> {
  const normalizedHost = normalizeHost(host)
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(endpoint)) throw new Error('Invalid API endpoint')
  const res = await fetch(`https://${normalizedHost}/api/${endpoint}`, {
    method: 'POST',
    redirect: 'error',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(token ? { ...params, i: token } : params),
  })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = body?.error
    throw new MisskeyApiError(err?.message ?? `HTTP ${res.status}`, err?.code, res.status)
  }
  return body as T
}

export function acct(user: { username: string, host: string | null }): string {
  return user.host ? `@${user.username}@${user.host}` : `@${user.username}`
}

export function displayName(user: { name: string | null, username: string }): string {
  return user.name || user.username
}
