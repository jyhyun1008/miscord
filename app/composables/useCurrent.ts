import type { InjectionKey } from 'vue'
import type { Account } from './useAccounts'

const GUEST_ACCOUNT: InjectionKey<Account> = Symbol('guest-account')

/**
 * A token-less stand-in for viewers who aren't logged in to that server (shared page links).
 * `apiCall` leaves out `i` for an empty token, so public endpoints still work.
 */
export function provideGuestAccount(host: string): Account {
  const account = { key: `guest@${host}`, host, token: '', user: {} as Account['user'], meta: {} as Account['meta'] }
  provide(GUEST_ACCOUNT, account)
  return account
}

export function isGuest(account: Account) {
  return !account.token
}

/** The account selected by the `/:acct/...` route (or the guest one below a shared page). */
export function useCurrentAccount() {
  const guest = inject(GUEST_ACCOUNT, null)
  if (guest) return computed(() => guest)
  const route = useRoute()
  const { find } = useAccounts()
  return computed(() => find(String(route.params.acct ?? '')))
}

export function useCurrentChannel() {
  const route = useRoute()
  return computed(() => parseChannel(route.params.channel as string[] | undefined))
}

/** API caller bound to an account. */
export function useApi(account: Account) {
  return <T = unknown>(endpoint: string, params: Record<string, unknown> = {}) =>
    apiCall<T>(account.host, endpoint, params, account.token)
}
