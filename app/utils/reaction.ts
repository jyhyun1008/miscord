import type { Note } from '~/types/misskey'

export interface ReactionInfo {
  reaction: string
  /** unicode emoji or `:name:` text fallback */
  label: string
  url: string | null
  /** what to send to notes/reactions/create, or null if this account can't use it */
  sendAs: string | null
}

/** Server-side key for a reaction we sent: local custom `:name:` is stored as `:name@.:`. */
export function normalizeReaction(reaction: string): string {
  return /^:[\w+-]+:$/.test(reaction) ? reaction.replace(/:$/, '@.:') : reaction
}

/**
 * Resolve a reaction key (`👍`, `:blob@.:`, `:blob@remote.host:`) to something renderable.
 * Remote custom emojis are usable only when this instance has an emoji with the same name.
 */
export function reactionInfo(reaction: string, note: Note, host: string, localEmojis?: Map<string, string>): ReactionInfo {
  const m = reaction.match(/^:([\w+-]+)(?:@([\w.-]+))?:$/)
  if (!m) return { reaction, label: reaction, url: null, sendAs: reaction }
  const [, name, emojiHost] = m
  const local = !emojiHost || emojiHost === '.'
  const key = local ? name! : `${name}@${emojiHost}`
  const url = note.reactionEmojis?.[key] ?? (local ? localEmojis?.get(name!) : null) ?? `https://${host}/emoji/${key}.webp`
  const sendAs = local || localEmojis?.has(name!) ? `:${name}:` : null
  return { reaction, label: `:${name}:`, url, sendAs }
}
