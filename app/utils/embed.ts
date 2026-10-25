import * as mfm from 'mfm-js'

/** What a link card shows, whichever source it came from (oEmbed or the instance's summaly). */
export interface LinkEmbed {
  url: string
  title: string | null
  description: string | null
  sitename: string | null
  author: string | null
  icon: string | null
  thumbnail: string | null
  sensitive: boolean
  /** Brand color for the accent bar */
  color: string | null
  player: EmbedPlayer | null
}

export interface EmbedPlayer {
  url: string
  /** Both set → keep that aspect ratio; otherwise a fixed-height widget */
  width: number | null
  height: number | null
  allow: string[]
}

/**
 * Hosts whose players may be framed. Anything else from summaly is shown as a plain card.
 * Keep in sync with frame-src in scripts/security-headers.mjs.
 */
export const PLAYER_HOSTS = [
  'www.youtube-nocookie.com',
  'www.youtube.com',
  'w.soundcloud.com',
  'player.vimeo.com',
  'open.spotify.com',
  'embed.nicovideo.jp',
  'bandcamp.com',
]

const PLAYER_ALLOW = ['autoplay', 'clipboard-write', 'encrypted-media', 'fullscreen', 'picture-in-picture', 'web-share']

/** Links worth a card: plain URLs and `[text](url)`, but not `?[silent](url)`, in order and deduped. */
export function previewUrls(text: string | null, max = 3): string[] {
  if (!text) return []
  const found: string[] = []
  const walk = (nodes: mfm.MfmNode[]) => {
    for (const node of nodes) {
      if (node.type === 'url' || (node.type === 'link' && !node.props.silent)) {
        const url = safeHttpUrl(node.props.url)
        if (url && !found.includes(url)) found.push(url)
      }
      if (node.children) walk(node.children)
    }
  }
  walk(mfm.parse(text))
  return found.slice(0, max)
}

export function youtubeId(raw: string): { id: string, start: number } | null {
  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let id: string | undefined
  if (host === 'youtu.be') id = url.pathname.slice(1)
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.pathname === '/watch'
      ? url.searchParams.get('v') ?? undefined
      : url.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1]
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null
  // t=90, t=90s or t=1m30s
  const t = url.searchParams.get('t') ?? url.searchParams.get('start') ?? ''
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/)
  const start = m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0
  return { id, start }
}

export function isSoundCloud(raw: string): boolean {
  try {
    const url = new URL(raw)
    return /^(www\.|m\.)?soundcloud\.com$/.test(url.hostname) && url.pathname.split('/').filter(Boolean).length >= 1
  }
  catch {
    return false
  }
}

/** A summaly player we can frame, with the URL changed to start playing on the click that revealed it. */
export function safePlayer(p: { url?: string | null, width?: unknown, height?: unknown, allow?: unknown } | null | undefined): EmbedPlayer | null {
  const href = safeHttpUrl(p?.url)
  if (!href) return null
  const url = new URL(href)
  if (url.protocol !== 'https:' || !PLAYER_HOSTS.includes(url.hostname)) return null
  if (url.hostname === 'w.soundcloud.com') url.searchParams.set('auto_play', 'true')
  else url.searchParams.set('autoplay', '1')
  const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null)
  return {
    url: url.href,
    width: num(p?.width),
    height: num(p?.height),
    allow: Array.isArray(p?.allow) ? p.allow.filter((a): a is string => PLAYER_ALLOW.includes(a)) : ['autoplay', 'encrypted-media', 'fullscreen'],
  }
}

/** oEmbed descriptions can be HTML (SoundCloud's are). */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim()
  return text || null
}
