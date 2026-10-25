import type { Ref } from 'vue'
import type { Account } from './useAccounts'
import type { Note, UserDetailed } from '~/types/misskey'

const MAX_PAGES = 10
const loading = new Map<string, Promise<void>>()

/** Drop a user from the cached following list without refetching everything. */
export function forgetFollowing(accountKey: string, userId: string) {
  const following = useState<UserDetailed[]>(`following:${accountKey}`, () => [])
  following.value = following.value.filter(u => u.id !== userId)
}

/** Clear the cached following list so the member list reloads it. */
export function resetFollowing(accountKey: string) {
  useState(`following:${accountKey}`).value = []
  useState(`following-cursor:${accountKey}`).value = null
  useState(`following-done:${accountKey}`).value = false
}

/**
 * Mutes and blocks for one account. The lists are loaded once (best effort) and then
 * kept in sync locally, so the timeline and member list can hide people right away.
 */
export function useModeration(account: Account) {
  const api = useApi(account)
  const toast = useToast()

  const muted = useState<string[]>(`muted:${account.key}`, () => [])
  const blocked = useState<string[]>(`blocked:${account.key}`, () => [])
  const loaded = useState<boolean>(`moderation-loaded:${account.key}`, () => false)
  /** `read:mutes` / `read:blocks` missing on an old token */
  const readDenied = useState<boolean>(`moderation-denied:${account.key}`, () => false)

  const mutedSet = computed(() => new Set(muted.value))
  const blockedSet = computed(() => new Set(blocked.value))

  async function fetchIds(endpoint: string, field: 'muteeId' | 'blockeeId') {
    const ids: string[] = []
    let untilId: string | undefined
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await api<({ id: string } & Record<typeof field, string>)[]>(endpoint, { limit: 100, ...(untilId ? { untilId } : {}) })
      ids.push(...page.map(m => m[field]))
      if (page.length < 100) break
      untilId = page.at(-1)!.id
    }
    return ids
  }

  function load() {
    if (loaded.value) return Promise.resolve()
    const running = loading.get(account.key)
    if (running) return running
    const isDenied = (e: unknown) => e instanceof MisskeyApiError && e.code === 'PERMISSION_DENIED'
    const p = Promise.allSettled([fetchIds('mute/list', 'muteeId'), fetchIds('blocking/list', 'blockeeId')])
      .then(([m, b]) => {
        // Keep anything added locally while the lists were loading
        if (m.status === 'fulfilled') muted.value = [...new Set([...m.value, ...muted.value])]
        if (b.status === 'fulfilled') blocked.value = [...new Set([...b.value, ...blocked.value])]
        readDenied.value = [m, b].some(r => r.status === 'rejected' && isDenied(r.reason))
        loaded.value = true
      })
      .finally(() => loading.delete(account.key))
    loading.set(account.key, p)
    return p
  }

  /** Trust the flags `users/show` returns for the viewer over our cached lists. */
  function sync(user: UserDetailed) {
    if (user.isMuted !== undefined) setIn(muted, user.id, user.isMuted)
    if (user.isBlocking !== undefined) setIn(blocked, user.id, user.isBlocking)
  }

  function setIn(list: Ref<string[]>, id: string, on: boolean) {
    const has = list.value.includes(id)
    if (on && !has) list.value = [...list.value, id]
    if (!on && has) list.value = list.value.filter(i => i !== id)
  }

  /** Run a write, treating "already in that state" as success. Returns false on failure. */
  async function write(endpoint: string, params: Record<string, unknown>, okCodes: string[]) {
    try {
      await api(endpoint, params)
      return true
    }
    catch (e) {
      if (e instanceof MisskeyApiError && e.code && okCodes.includes(e.code)) return true
      if (e instanceof MisskeyApiError && e.code === 'PERMISSION_DENIED') {
        if (confirm('뮤트/차단 권한이 없어요. 다시 로그인해서 권한을 추가할까요?')) startMiAuth(account.host)
        return false
      }
      toast.error(e)
      return false
    }
  }

  /** `durationMs` null = forever */
  async function mute(userId: string, durationMs: number | null = null) {
    const ok = await write('mute/create', { userId, expiresAt: durationMs ? Date.now() + durationMs : null }, ['ALREADY_MUTING'])
    if (ok) setIn(muted, userId, true)
    return ok
  }

  async function unmute(userId: string) {
    const ok = await write('mute/delete', { userId }, ['NOT_MUTING'])
    if (ok) setIn(muted, userId, false)
    return ok
  }

  /** Blocking also removes the follow in both directions (server side). */
  async function block(userId: string) {
    const ok = await write('blocking/create', { userId }, ['ALREADY_BLOCKING'])
    if (ok) {
      setIn(blocked, userId, true)
      forgetFollowing(account.key, userId)
    }
    return ok
  }

  async function unblock(userId: string) {
    const ok = await write('blocking/delete', { userId }, ['NOT_BLOCKING'])
    if (ok) setIn(blocked, userId, false)
    return ok
  }

  const isMuted = (userId: string) => mutedSet.value.has(userId)
  const isBlocked = (userId: string) => blockedSet.value.has(userId)

  /** Whether a timeline entry involves someone we muted or blocked (like the server's own filter). */
  function hides(note: Note) {
    const hidden = (id?: string | null) => !!id && id !== account.user.id && (mutedSet.value.has(id) || blockedSet.value.has(id))
    return hidden(note.userId) || hidden(note.renote?.userId) || hidden(note.reply?.userId)
  }

  return { muted, blocked, loaded, readDenied, load, sync, mute, unmute, block, unblock, isMuted, isBlocked, hides }
}
