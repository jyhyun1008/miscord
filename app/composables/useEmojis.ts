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
    recent.value = [emoji, ...recent.value.filter(e => e !== emoji)].slice(0, 32)
    saveJson(RECENT_KEY, recent.value)
  }

  return { list, byName, recent, load, use }
}

export const UNICODE_EMOJIS: { category: string, emojis: string[] }[] = [
  { category: '자주 쓰는', emojis: ['👍', '❤️', '😆', '🤔', '😮', '🎉', '💢', '😥', '😇', '🍮', '⭐', '🙏', '👀', '🔥', '✅', '💯'] },
  { category: '표정', emojis: ['😀', '😃', '😄', '😁', '😅', '🤣', '😂', '🙂', '😉', '😊', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪', '😎', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '🤗', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😴', '🤤', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤠', '🤡', '👻', '💀', '👽', '🤖', '💩', '😺', '😸', '😹', '😻', '🙀', '😿'] },
  { category: '손', emojis: ['👋', '🤚', '✋', '🖖', '👌', '🤌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👎', '✊', '👊', '👏', '🙌', '👐', '🤲', '🤝', '💪', '🫶'] },
  { category: '하트', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝'] },
  { category: '사물', emojis: ['🎉', '🎊', '🎁', '🏆', '🥇', '⚽', '🎮', '🎵', '🎶', '📷', '💡', '📌', '📎', '✏️', '📝', '📚', '💻', '📱', '☕', '🍵', '🍺', '🍰', '🍕', '🍣', '🍜', '🍙', '🍓', '🌸', '🌈', '☀️', '🌙', '⭐', '⚡', '❄️', '🔥', '💧', '🌊', '🐱', '🐶', '🐰', '🦊', '🐻', '🐼', '🐧', '🐸', '🦀'] },
  { category: '기호', emojis: ['✅', '❌', '⭕', '❗', '❓', '‼️', '⁉️', '💯', '🆗', '🆕', '🔞', '⚠️', '🚫', '♻️', '➕', '➖', '💤', '💬', '👁️‍🗨️', '🗯️'] },
]
