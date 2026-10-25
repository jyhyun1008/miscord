import type { Account } from './useAccounts'
import type { MisskeyNotification } from '~/types/misskey'

// Keyed by stream so a logout/re-login (new stream) subscribes again
const started = new WeakSet<MisskeyStream>()
const listeners = new Map<string, Set<(n: MisskeyNotification) => void>>()

/** Unread notification count (kept live over the `main` stream) and new-notification events. */
export function useNotifications(account: Account) {
  const unread = useState<number>(`notifications-unread:${account.key}`, () => 0)

  function start() {
    const stream = getStream(account)
    if (started.has(stream)) return
    started.add(stream)
    apiCall<{ unreadNotificationsCount?: number, hasUnreadNotification?: boolean }>(account.host, 'i', {}, account.token)
      .then(me => (unread.value = me.unreadNotificationsCount ?? (me.hasUnreadNotification ? 1 : 0)))
      .catch(() => {})
    stream.connect('main', {}, (type, body) => {
      if (type === 'notification') {
        unread.value++
        for (const fn of listeners.get(account.key) ?? []) fn(body)
      }
      else if (type === 'readAllNotifications') {
        unread.value = 0
      }
    })
  }

  function onNotification(fn: (n: MisskeyNotification) => void): () => void {
    if (!listeners.has(account.key)) listeners.set(account.key, new Set())
    listeners.get(account.key)!.add(fn)
    return () => listeners.get(account.key)?.delete(fn)
  }

  return { unread, start, onNotification }
}
