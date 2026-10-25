import type { Account } from './useAccounts'
import type { CustomEmoji } from '~/types/misskey'

const lookupMaps = new WeakMap<CustomEmoji[], Map<string, string>>()
const pendingLoads = new Map<string, Promise<void>>()

const RECENT_KEY = 'miscord:recent-emojis'

/** Instance custom emojis (fetched once per account) and recently used reactions. */
export function useEmojis(account: Account) {
  const list = useState<CustomEmoji[] | null>(`emojis:${account.key}`, () => null)
  const recent = useState<string[]>('recent-emojis', () => loadJson<string[]>(RECENT_KEY, []))
  const byName = computed(() => {
    const emojis = list.value
    if (!emojis) return new Map<string, string>()
    let map = lookupMaps.get(emojis)
    if (!map) {
      map = new Map(emojis.map(e => [e.name, e.url]))
      lookupMaps.set(emojis, map)
    }
    return map
  })

  async function load() {
    if (list.value) return
    const running = pendingLoads.get(account.key)
    if (running) return running
    const request = (async () => {
      try {
        const res = await apiCall<{ emojis: CustomEmoji[] }>(account.host, 'emojis', {})
        list.value = res.emojis
      }
      catch {
        list.value = []
      }
    })().finally(() => pendingLoads.delete(account.key))
    pendingLoads.set(account.key, request)
    return request
  }

  function use(emoji: string) {
    if (!emoji) return
    recent.value = [emoji, ...recent.value.filter(e => e !== emoji)].slice(0, 32)
    saveJson(RECENT_KEY, recent.value)
  }

  return { list, byName, recent, load, use }
}

export interface UnicodeEmojiEntry {
  emoji: string
  /** CLDR Korean name, e.g. 빨간색 하트 */
  label: string
  /** CLDR Korean keywords, e.g. 사랑, 하트 */
  tags: string[]
}

let unicodeIndex: Promise<UnicodeEmojiEntry[]> | null = null

/**
 * Korean names/keywords for every unicode emoji, so the picker can search 하트, 웃음, 고양이...
 * ~600KB of JSON (~100KB gzipped), so it's a lazy chunk fetched the first time a picker opens.
 */
export function loadUnicodeEmojiIndex(): Promise<UnicodeEmojiEntry[]> {
  unicodeIndex ??= import('emojibase-data/ko/compact.json')
    .then(m => m.default
      // group 2 = skin tone / hair components; no group = regional indicator letters
      .filter(e => e.group != null && e.group !== 2)
      .map(e => ({ emoji: e.unicode, label: e.label, tags: e.tags ?? [] })))
    .catch(() => {
      unicodeIndex = null
      return []
    })
  return unicodeIndex
}

/** Unicode emojis whose Korean name or keyword contains `query`; exact keyword hits first. */
export function searchUnicodeEmojis(index: UnicodeEmojiEntry[], query: string, limit = 120): string[] {
  const exact: string[] = []
  const partial: string[] = []
  for (const e of index) {
    if (e.label === query || e.tags.includes(query)) exact.push(e.emoji)
    else if (e.label.includes(query) || e.tags.some(t => t.includes(query))) partial.push(e.emoji)
  }
  return [...exact, ...partial].slice(0, limit)
}

export const UNICODE_EMOJIS: { category: string, emojis: string[] }[] = [
  { category: '자주 쓰는', emojis: ['👍', '❤️', '😆', '🤔', '😮', '🎉', '💢', '😥', '😇', '🍮', '⭐', '🙏', '👀', '🔥', '✅', '💯'] },
  { category: '표정', emojis: ['😀', '😃', '😄', '😁', '😅', '🤣', '😂', '🙂', '😉', '😊', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪', '😎', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '🤗', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😴', '🤤', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤠', '🤡', '👻', '💀', '👽', '🤖', '💩', '😺', '😸', '😹', '😻', '🙀', '😿'] },
  { category: '손', emojis: ['👋', '🤚', '✋', '🖖', '👌', '🤌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👎', '✊', '👊', '👏', '🙌', '👐', '🤲', '🤝', '💪', '🫶'] },
  { category: '하트', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'] },
  { category: '사물', emojis: ['🎉', '🎊', '🎁', '🏆', '🥇', '⚽', '🎮', '🎵', '🎶', '📷', '💡', '📌', '📎', '✏️', '📝', '📚', '💻', '📱', '☕', '🍵', '🍺', '🍰', '🍕', '🍣', '🍜', '🍙', '🍓', '🌸', '🌈', '☀️', '🌙', '⭐', '⚡', '❄️', '🔥', '💧', '🌊', '🐱', '🐶', '🐰', '🦊', '🐻', '🐼', '🐧', '🐸', '🦀'] },
  { category: '기호', emojis: ['✅', '❌', '⭕', '❗', '❓', '‼️', '⁉️', '💯', '🆗', '🆕', '🔞', '⚠️', '🚫', '♻️', '➕', '➖', '💤', '💬', '👁️‍🗨️', '🗯️'] },
]
