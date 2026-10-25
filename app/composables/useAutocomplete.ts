import type { Ref } from 'vue'
import type { Account } from './useAccounts'
import type { UnicodeEmojiEntry } from './useEmojis'
import type { UserLite } from '~/types/misskey'

export type Suggestion =
  | { kind: 'user', user: UserLite }
  | { kind: 'emoji', name: string, url: string }
  | { kind: 'unicode', emoji: string, label: string }

const LIMIT = 8
/** Leave room for unicode matches (Korean names) when custom emojis would fill the list */
const CUSTOM_SHARE = 6

// Korean names/keywords for unicode emojis; loaded the first time `:` is typed
const unicodeIndex = shallowRef<UnicodeEmojiEntry[] | null>(null)

/**
 * `@user` / `@user@host` / `:emoji` completion for a textarea.
 * Users are searched once typing pauses; emojis filter the already-loaded list, so neither is heavy.
 */
export function useAutocomplete(account: Account, text: Ref<string>, ta: Ref<HTMLTextAreaElement | null>) {
  const emojiStore = useEmojis(account)
  const { prefs } = usePrefs(account.key)
  const range = ref<{ start: number, end: number } | null>(null)
  const items = ref<Suggestion[]>([])
  const index = ref(0)
  let timer: ReturnType<typeof setTimeout> | undefined
  let seq = 0

  function close() {
    clearTimeout(timer)
    seq++
    range.value = null
    items.value = []
  }

  function show(list: Suggestion[]) {
    items.value = list
    index.value = 0
  }

  /** Custom emojis (name or alias, so Korean aliases work) plus unicode emojis by Korean name. */
  function searchEmojis(q: string): Suggestion[] {
    const custom = searchCustom(q)
    const index = unicodeIndex.value ?? []
    const labels = new Map(index.map(e => [e.emoji, e.label]))
    const unicode: Suggestion[] = searchUnicodeEmojis(index, q, LIMIT)
      .map(emoji => ({ kind: 'unicode', emoji, label: labels.get(emoji) ?? '' }))
    const customCount = Math.max(CUSTOM_SHARE, LIMIT - unicode.length)
    return [...custom.slice(0, customCount), ...unicode].slice(0, LIMIT)
  }

  /** Name prefixes first, then favorites, then shorter names. */
  function searchCustom(q: string): Suggestion[] {
    const favs = new Set(prefs.value.favoriteEmojis)
    const scored: [number, { name: string, url: string }][] = []
    for (const e of emojiStore.list.value ?? []) {
      const name = e.name.toLowerCase()
      const rank = name.startsWith(q) ? 0 : name.includes(q) || e.aliases?.some(a => a.toLowerCase().includes(q)) ? 2 : -1
      if (rank >= 0) scored.push([rank - (favs.has(`:${e.name}:`) ? 1 : 0), e])
    }
    return scored.sort((x, y) => x[0] - y[0] || x[1].name.length - y[1].name.length)
      .slice(0, LIMIT)
      .map(([, e]): Suggestion => ({ kind: 'emoji', name: e.name, url: e.url }))
  }

  /** Look for a trigger right before the caret; call on input and click. */
  function detect() {
    const el = ta.value
    if (!el || el.selectionStart !== el.selectionEnd) return close()
    const end = el.selectionStart
    // The element, not `text`: v-model holds back Hangul until composition ends
    const before = el.value.slice(0, end)
    clearTimeout(timer)
    const mine = ++seq

    // Not after a letter or digit, so `12:30` and `안녕:` stay plain text
    const emoji = /(?:^|[^\p{L}\p{N}_:]):([\p{L}\p{N}_+-]+)$/u.exec(before)
    if (emoji) {
      const q = emoji[1]!.toLowerCase()
      range.value = { start: end - emoji[1]!.length - 1, end }
      emojiStore.load()
      if (!unicodeIndex.value) {
        loadUnicodeEmojiIndex().then((index) => {
          unicodeIndex.value = index
          if (mine === seq) show(searchEmojis(q))
        })
      }
      show(searchEmojis(q))
      return
    }

    const m = /(?:^|[^\w@])@(\w+)(?:@([\w.-]*))?$/.exec(before)
    if (!m) return close()
    const [, username, host] = m
    range.value = { start: end - 1 - username!.length - (host != null ? host.length + 1 : 0), end }
    timer = setTimeout(async () => {
      try {
        const users = await apiCall<UserLite[]>(account.host, 'users/search-by-username-and-host', {
          username,
          ...(host ? { host } : {}),
          limit: LIMIT,
          detail: false,
        }, account.token)
        if (mine === seq) show(users.map(user => ({ kind: 'user', user })))
      }
      catch {
        if (mine === seq) items.value = []
      }
    }, 200)
  }

  function pick(item: Suggestion) {
    const r = range.value
    const el = ta.value
    if (!r || !el) return
    const token = item.kind === 'user' ? `${acct(item.user)} ` : item.kind === 'emoji' ? `:${item.name}: ` : item.emoji
    emojiStore.use(item.kind === 'emoji' ? `:${item.name}:` : item.kind === 'unicode' ? item.emoji : '')
    text.value = el.value.slice(0, r.start) + token + el.value.slice(r.end)
    close()
    nextTick(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = r.start + token.length
    })
  }

  /** Arrow keys / Enter / Tab / Esc drive the list while it's open. Returns true when it handled the key. */
  function onKey(e: KeyboardEvent) {
    if (!range.value || !items.value.length || e.isComposing) return false
    const n = items.value.length
    if (e.key === 'ArrowDown') index.value = (index.value + 1) % n
    else if (e.key === 'ArrowUp') index.value = (index.value - 1 + n) % n
    else if (e.key === 'Enter' || e.key === 'Tab') pick(items.value[index.value]!)
    else if (e.key === 'Escape') close()
    else return false
    e.preventDefault()
    return true
  }

  const open = computed(() => !!range.value && items.value.length > 0)

  return { range, items, index, open, detect, close, pick, onKey }
}
