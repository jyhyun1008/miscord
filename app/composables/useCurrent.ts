import type { Account } from './useAccounts'

/** The account selected by the `/:acct/...` route. Only valid inside the app page. */
export function useCurrentAccount() {
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
