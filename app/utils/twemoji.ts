/** Pinned so a new Twemoji release can't change (or 404) existing emoji under us. */
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/svg/'

/**
 * Twemoji SVG for a unicode emoji. File names are the code points joined by `-`, with FE0F
 * dropped except inside ZWJ sequences (same rule Misskey's web client uses).
 */
export function twemojiUrl(emoji: string): string {
  const points = [...emoji].map(c => c.codePointAt(0)!.toString(16))
  const name = emoji.includes('‍') ? points : points.filter(p => p !== 'fe0f')
  return `${TWEMOJI_BASE}${name.join('-')}.svg`
}

/**
 * Force emoji presentation for a lone code point like `❤` (U+2764), which system fonts
 * otherwise draw as a black text glyph. Harmless on characters that are already emoji-style.
 */
export function emojiPresentation(emoji: string): string {
  return [...emoji].length === 1 ? `${emoji}️` : emoji
}
