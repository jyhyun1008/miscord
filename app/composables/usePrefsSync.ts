import { effectScope, watch, type Ref } from 'vue'
import type { Account } from './useAccounts'
import type { AccountPrefs } from './usePrefs'

/**
 * Syncs account prefs across devices through one private Play (Flash) whose script holds the JSON.
 * Drive files can't be read cross-origin on many servers, and the registry is per-token,
 * so a Play — read and edited in place through the API — is the one store every login shares.
 */

/** Everything but `collapsed`, which is per-device UI state */
const SYNCED = ['channels', 'antennas', 'lists', 'tags', 'pinnedUserIds', 'groups', 'userGroups', 'hiddenSections', 'defaultVisibility', 'favoriteEmojis'] as const
type Synced = Pick<AccountPrefs, typeof SYNCED[number]>

interface Envelope {
  miscord: 1
  updatedAt: number
  prefs: Partial<Synced>
}
interface Flash {
  id: string
  script: string
  visibility?: 'public' | 'private'
}
interface SyncMeta {
  /** Opt-in per device; nothing is created or read until it's turned on */
  enabled?: boolean
  flashId: string | null
  /** `updatedAt` of the version both sides last agreed on */
  updatedAt: number
  /** JSON of that version; local prefs differing from it have unsynced edits */
  synced: string | null
  /** When local prefs were last edited */
  editedAt: number
}

export interface PrefsSyncState {
  status: 'off' | 'idle' | 'syncing' | 'synced' | 'denied' | 'unsupported' | 'error'
  error?: string
  at?: number
}

const TITLE = 'Miscord 설정'
const SUMMARY = 'Miscord가 기기 사이에 설정(즐겨찾기 이모지, 그룹 등)을 맞추는 데 쓰는 비공개 Play예요. 지우면 동기화된 설정이 사라져요.'
const PUSH_DELAY = 2000
const FOCUS_INTERVAL = 60_000

const engines = new Map<string, { sync: () => Promise<void>, setEnabled: (on: boolean) => void }>()

export function usePrefsSync(account: Account) {
  const state = useState<PrefsSyncState>(`prefs-sync:${account.key}`, () => ({ status: 'idle' }))

  function start() {
    if (engines.has(account.key)) return
    const { accounts } = useAccounts()
    const { prefs, save } = usePrefs(account.key)
    engines.set(account.key, createEngine(account.key, accounts, prefs, save, state))
  }

  function syncNow() {
    return engines.get(account.key)?.sync()
  }

  function setEnabled(on: boolean) {
    start()
    engines.get(account.key)!.setEnabled(on)
  }

  return { state, start, syncNow, setEnabled }
}

function parse(script: string): Envelope | null {
  try {
    const data = JSON.parse(script)
    return data?.miscord === 1 && typeof data.prefs === 'object' ? data : null
  }
  catch {
    return null
  }
}

function pick(prefs: AccountPrefs): Synced {
  return Object.fromEntries(SYNCED.map(k => [k, prefs[k]])) as Synced
}

/** First sync on a device that already has local prefs: keep both sides, remote first. */
function merge(remote: Partial<Synced>, local: Synced): Synced {
  const union = <T>(a: T[] | undefined, b: T[], id: (x: T) => unknown = x => x) => {
    const seen = new Set((a ?? []).map(id))
    return [...(a ?? []), ...b.filter(x => !seen.has(id(x)))]
  }
  const byId = (x: { id: string }) => x.id
  return {
    channels: union(remote.channels, local.channels, byId),
    antennas: union(remote.antennas, local.antennas, byId),
    lists: union(remote.lists, local.lists, byId),
    tags: union(remote.tags, local.tags),
    pinnedUserIds: union(remote.pinnedUserIds, local.pinnedUserIds),
    groups: union(remote.groups, local.groups, byId),
    userGroups: { ...local.userGroups, ...remote.userGroups },
    hiddenSections: { ...local.hiddenSections, ...remote.hiddenSections },
    defaultVisibility: remote.defaultVisibility ?? local.defaultVisibility,
    favoriteEmojis: union(remote.favoriteEmojis, local.favoriteEmojis),
  }
}

function createEngine(
  key: string,
  accounts: Ref<Account[]>,
  prefs: Ref<AccountPrefs>,
  save: () => void,
  state: Ref<PrefsSyncState>,
) {
  const metaKey = `miscord:prefs-sync:${key}`
  const meta = loadJson<SyncMeta>(metaKey, { flashId: null, updatedAt: 0, synced: null, editedAt: 0 })
  const saveMeta = () => saveJson(metaKey, meta)

  let running: Promise<void> | null = null
  let again = false
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastPull = 0

  function call<T>(endpoint: string, params: Record<string, unknown>) {
    const account = accounts.value.find(a => a.key === key)
    if (!account) throw new Error('계정을 찾을 수 없어요')
    return apiCall<T>(account.host, endpoint, params, account.token)
  }
  const missing = (e: unknown) => e instanceof MisskeyApiError && (e.code === 'NO_SUCH_FLASH' || e.code === 'ACCESS_DENIED')

  function applyLocal(next: Partial<Synced>) {
    for (const k of SYNCED) {
      if (next[k] !== undefined) (prefs.value as unknown as Record<string, unknown>)[k] = next[k]
    }
    save()
  }

  async function findFlash(): Promise<Flash | null> {
    if (meta.flashId) {
      try {
        return await call<Flash>('flash/show', { flashId: meta.flashId })
      }
      catch (e) {
        if (!missing(e)) throw e
        meta.flashId = null
      }
    }
    let untilId: string | undefined
    for (;;) {
      const page = await call<Flash[]>('flash/my', { limit: 100, ...(untilId ? { untilId } : {}) })
      const found = page.find(f => parse(f.script))
      if (found) {
        meta.flashId = found.id
        return found
      }
      if (page.length < 100) return null
      untilId = page.at(-1)!.id
    }
  }

  async function push() {
    const current = pick(prefs.value)
    const updatedAt = Date.now()
    const script = JSON.stringify({ miscord: 1, updatedAt, prefs: current } satisfies Envelope)
    if (meta.flashId) {
      try {
        await call('flash/update', { flashId: meta.flashId, script })
      }
      catch (e) {
        if (!missing(e)) throw e
        meta.flashId = null
      }
    }
    if (!meta.flashId) {
      const flash = await call<Flash>('flash/create', { title: TITLE, summary: SUMMARY, script, permissions: [], visibility: 'private' })
      // Servers without private Plays would publish everyone's settings; take it back down
      if (flash.visibility !== 'private') {
        await call('flash/delete', { flashId: flash.id }).catch(() => {})
        stopped = true
        state.value = { status: 'unsupported' }
        return
      }
      meta.flashId = flash.id
    }
    meta.updatedAt = updatedAt
    meta.synced = JSON.stringify(current)
  }

  async function run() {
    const remote = await findFlash().then(f => f && parse(f.script))
    const local = pick(prefs.value)
    const dirty = JSON.stringify(local) !== meta.synced

    if (!remote) {
      await push()
    }
    else if (meta.synced === null) {
      applyLocal(merge(remote.prefs, local))
      await push()
    }
    else if (remote.updatedAt > meta.updatedAt && !(dirty && meta.editedAt > remote.updatedAt)) {
      // Another device saved more recently than our unsynced edits (last write wins)
      applyLocal(remote.prefs)
      meta.updatedAt = remote.updatedAt
      meta.synced = JSON.stringify(pick(prefs.value))
    }
    else if (dirty) {
      await push()
    }
    saveMeta()
  }

  function sync(): Promise<void> {
    if (stopped || !meta.enabled) return Promise.resolve()
    if (running) {
      again = true
      return running
    }
    state.value = { ...state.value, status: 'syncing' }
    lastPull = Date.now()
    running = run()
      .then(() => {
        if (!stopped) state.value = { status: 'synced', at: Date.now() }
      })
      .catch((e) => {
        if (e instanceof MisskeyApiError && e.code === 'PERMISSION_DENIED') {
          stopped = true
          state.value = { status: 'denied' }
        }
        else {
          state.value = { status: 'error', error: e instanceof Error ? e.message : String(e) }
        }
      })
      .finally(() => {
        running = null
        if (again) {
          again = false
          sync()
        }
      })
    return running
  }

  // Detached: this outlives whichever page started it
  effectScope(true).run(() => {
    watch(prefs, () => {
      if (stopped || !meta.enabled || meta.synced === null) return
      if (JSON.stringify(pick(prefs.value)) === meta.synced) return
      meta.editedAt = Date.now()
      saveMeta()
      clearTimeout(timer)
      timer = setTimeout(sync, PUSH_DELAY)
    }, { deep: true })
  })

  // Pick up edits made on other devices when coming back to the tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastPull > FOCUS_INTERVAL) sync()
  })

  function setEnabled(on: boolean) {
    meta.enabled = on
    clearTimeout(timer)
    if (on) {
      stopped = false
      sync()
    }
    else {
      // Turning it back on later merges again instead of trusting a stale baseline
      meta.synced = null
      state.value = { status: 'off' }
    }
    saveMeta()
  }

  if (meta.enabled) sync()
  else state.value = { status: 'off' }
  return { sync, setEnabled }
}
