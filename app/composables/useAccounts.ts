import type { MetaLite, UserDetailed } from '~/types/misskey'

export interface Account {
  /** `username@host` — also used in URLs */
  key: string
  host: string
  token: string
  user: UserDetailed
  meta: MetaLite
}

const STORAGE_KEY = 'miscord:accounts'
const LAST_KEY = 'miscord:last-account'

export const MIAUTH_PERMISSIONS = [
  'read:account',
  'write:account',
  'read:following',
  'write:following',
  'read:mutes',
  'write:mutes',
  'read:blocks',
  'write:blocks',
  'read:reactions',
  'write:reactions',
  'write:notes',
  'read:drive',
  'write:drive',
  'read:favorites',
  'write:favorites',
  'write:votes',
  'read:channels',
  'read:notifications',
  'write:notifications',
  'read:pages',
  'write:pages',
  'read:page-likes',
  'write:page-likes',
  // Settings sync lives in a private Play
  'read:flash',
  'write:flash',
]

export function useAccounts() {
  const accounts = useState<Account[]>('accounts', () => loadJson<Account[]>(STORAGE_KEY, []))

  function persist() {
    saveJson(STORAGE_KEY, accounts.value)
  }

  function find(key: string | null | undefined) {
    return accounts.value.find(a => a.key === key) ?? null
  }

  function upsert(account: Account) {
    const i = accounts.value.findIndex(a => a.key === account.key)
    if (i >= 0) accounts.value.splice(i, 1, account)
    else accounts.value.push(account)
    persist()
  }

  function remove(key: string) {
    accounts.value = accounts.value.filter(a => a.key !== key)
    persist()
    removeKey(`miscord:prefs:${key}`)
  }

  function move(key: string, targetKey: string, after = false) {
    if (key === targetKey || !find(key) || !find(targetKey)) return
    const reordered = [...accounts.value]
    const [account] = reordered.splice(reordered.findIndex(a => a.key === key), 1)
    if (!account) return
    const targetIndex = reordered.findIndex(a => a.key === targetKey)
    reordered.splice(targetIndex + (after ? 1 : 0), 0, account)
    accounts.value = reordered
    persist()
  }

  function lastUsed(): Account | null {
    return find(loadJson<string | null>(LAST_KEY, null)) ?? accounts.value[0] ?? null
  }

  function markUsed(key: string) {
    saveJson(LAST_KEY, key)
  }

  return { accounts, find, upsert, remove, move, lastUsed, markUsed, persist }
}

/** Kick off MiAuth: remember the session locally and send the browser to the instance. */
export function startMiAuth(rawHost: string) {
  const host = normalizeHost(rawHost)
  const session = crypto.randomUUID()
  saveJson('miscord:miauth', { host, session })
  const callback = `${location.origin}/callback`
  const q = new URLSearchParams({
    name: 'Miscord',
    callback,
    permission: MIAUTH_PERMISSIONS.join(','),
  })
  location.href = `https://${host}/miauth/${session}?${q}`
}

/** Finish MiAuth on the callback page and return the stored account. */
export async function finishMiAuth(session: string): Promise<Account> {
  const pending = loadJson<{ host: string, session: string } | null>('miscord:miauth', null)
  if (!pending || pending.session !== session) throw new Error('로그인 세션을 찾을 수 없습니다. 다시 시도해 주세요.')
  const { host } = pending

  const res = await apiCall<{ ok: boolean, token?: string, user?: UserDetailed }>(host, `miauth/${session}/check`)
  if (!res.ok || !res.token) throw new Error('인증이 거부되었거나 만료되었습니다.')

  const [user, meta] = await Promise.all([
    apiCall<UserDetailed>(host, 'i', {}, res.token),
    apiCall<MetaLite>(host, 'meta', { detail: false }).catch(() => ({ name: host, iconUrl: null, themeColor: null, description: null })),
  ])
  removeKey('miscord:miauth')

  const account: Account = {
    key: `${user.username}@${host}`,
    host,
    token: res.token,
    user,
    meta: { name: meta.name, iconUrl: meta.iconUrl, themeColor: meta.themeColor, description: meta.description },
  }
  useAccounts().upsert(account)
  return account
}
