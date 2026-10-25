import type { AvatarDecoration, UserLite } from '~/types/misskey'

interface CachedDecorations {
  decorations: AvatarDecoration[]
  expires: number
}

const cache = shallowReactive(new Map<string, CachedDecorations>())
const pending = new Map<string, Promise<void>>()
const queue: (() => void)[] = []
let active = 0

function drain() {
  while (active < 4 && queue.length) queue.shift()!()
}

function load(host: string, username: string, key: string): Promise<void> {
  const existing = pending.get(key)
  if (existing) return existing
  const request = new Promise<void>((resolve) => {
    queue.push(() => {
      active++
      void (async () => {
        let decorations: AvatarDecoration[] = []
        let ttl = 60_000
        try {
          // Query the origin anonymously; account tokens must never leave their server.
          const origin = new URL(`https://${host}`)
          if (origin.host !== host || origin.username || origin.password || origin.pathname !== '/') return
          const response = await fetch(`${origin.origin}/api/users/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.timeout(8000),
          })
          if (!response.ok) throw new Error('Avatar lookup failed')
          const user = await response.json() as UserLite
          if (user.username?.toLowerCase() !== username.toLowerCase() || user.host != null) return
          decorations = Array.isArray(user.avatarDecorations)
            ? user.avatarDecorations.filter(d => d && typeof d.url === 'string')
            : []
          ttl = 5 * 60_000
        }
        catch { /* Unsupported servers and CORS failures keep the normal avatar. */ }
        finally {
          if (cache.size >= 500) cache.delete(cache.keys().next().value!)
          cache.set(key, { decorations, expires: Date.now() + ttl })
          pending.delete(key)
          active--
          resolve()
          drain()
        }
      })()
    })
  })
  pending.set(key, request)
  drain()
  return request
}

export function useAvatarDecorations(user: () => UserLite, visible: Ref<boolean>) {
  const key = computed(() => user().host ? `${user().username}@${user().host}` : '')
  watch([key, visible], () => {
    const u = user()
    if (!visible.value || !u.host || u.avatarDecorations?.length) return
    const cached = cache.get(key.value)
    if (!cached || cached.expires <= Date.now()) void load(u.host, u.username, key.value)
  }, { immediate: true })

  return computed(() => {
    const u = user()
    return u.avatarDecorations?.length ? u.avatarDecorations : cache.get(key.value)?.decorations ?? []
  })
}
