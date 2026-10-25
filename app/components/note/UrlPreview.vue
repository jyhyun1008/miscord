<script lang="ts">
import type { LinkEmbed } from '~/utils/embed'

// Shared by every card: the same link shows up again in replies, renotes and other timelines
const cache = new Map<string, Promise<LinkEmbed | null>>()

async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20_000), headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.json() as T
}

interface OEmbed { title?: string, author_name?: string, thumbnail_url?: string, description?: string }

async function youtube(url: string, id: string, start: number): Promise<LinkEmbed> {
  // The player works without metadata (private or age-restricted videos have no oEmbed), so don't fail on it
  const o = await getJson<OEmbed>(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`).catch(() => ({} as OEmbed))
  return {
    url,
    title: o.title ?? null,
    description: null,
    sitename: 'YouTube',
    author: o.author_name ?? null,
    icon: null,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    sensitive: false,
    color: '#ff0033',
    player: {
      url: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1${start ? `&start=${start}` : ''}`,
      width: 16,
      height: 9,
      allow: ['autoplay', 'encrypted-media', 'fullscreen', 'picture-in-picture'],
    },
  }
}

async function soundcloud(url: string): Promise<LinkEmbed> {
  const o = await getJson<OEmbed>(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`)
  return {
    url,
    title: o.title ?? null,
    description: htmlToText(o.description),
    sitename: 'SoundCloud',
    author: o.author_name ?? null,
    icon: null,
    thumbnail: safeHttpUrl(o.thumbnail_url) ?? null,
    sensitive: false,
    color: '#ff5500',
    player: {
      url: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true&visual=false&show_teaser=false`,
      width: null,
      height: 166,
      allow: ['autoplay', 'encrypted-media'],
    },
  }
}

interface Summary {
  title?: string | null
  description?: string | null
  sitename?: string | null
  icon?: string | null
  thumbnail?: string | null
  sensitive?: boolean
  player?: { url?: string | null, width?: number | null, height?: number | null, allow?: string[] }
  url?: string
  /** Set when summaly couldn't fetch the page; the title is then a placeholder */
  error?: unknown
}

/** Everything else goes through the instance's summaly, relayed same-origin because it sends no CORS headers. */
async function summaly(host: string, url: string): Promise<LinkEmbed | null> {
  const s = await getJson<Summary>(
    `/url-preview?host=${encodeURIComponent(host)}&url=${encodeURIComponent(url)}`,
    { 'X-Miscord-Preview': '1' },
  )
  if (!s || s.error || (!s.title && !s.description && !s.thumbnail)) return null
  return {
    url,
    title: s.title || null,
    description: s.description || null,
    sitename: s.sitename || null,
    author: null,
    icon: safeHttpUrl(s.icon) ?? null,
    thumbnail: safeHttpUrl(s.thumbnail) ?? null,
    sensitive: !!s.sensitive,
    color: null,
    player: safePlayer(s.player),
  }
}

function load(host: string, url: string): Promise<LinkEmbed | null> {
  const key = `${host} ${url}`
  let req = cache.get(key)
  if (!req) {
    if (cache.size >= 300) cache.delete(cache.keys().next().value!)
    const yt = youtubeId(url)
    req = (yt ? youtube(url, yt.id, yt.start) : isSoundCloud(url) ? soundcloud(url) : summaly(host, url))
      .catch(() => null)
    cache.set(key, req)
  }
  return req
}
</script>

<script setup lang="ts">
const props = defineProps<{ url: string }>()

const account = useCurrentAccount()
const embed = ref<LinkEmbed | null>(null)
const playing = ref(false)
const revealed = ref(false)

watch(() => props.url, async (url) => {
  embed.value = null
  playing.value = false
  const a = account.value
  if (!a) return
  const e = await load(a.host, url)
  if (props.url === url) embed.value = e
}, { immediate: true })

const href = computed(() => safeHttpUrl(embed.value?.url))
const hidden = computed(() => !!embed.value?.sensitive && !revealed.value)
const playerStyle = computed(() => {
  const p = embed.value?.player
  if (!p) return undefined
  return p.width && p.height ? { aspectRatio: `${p.width} / ${p.height}` } : { height: `${p.height ?? 200}px` }
})
// A player gets the big media slot; a plain page keeps its picture small on the right, like Discord
const big = computed(() => !!embed.value?.player)
</script>

<template>
  <div v-if="embed" class="card" :class="{ big }" :style="embed.color ? { borderLeftColor: embed.color } : undefined">
    <div class="meta">
      <div v-if="embed.sitename" class="site">
        <img v-if="embed.icon" class="favicon" :src="embed.icon" alt="" loading="lazy">
        <span>{{ embed.sitename }}</span>
      </div>
      <div v-if="embed.author" class="author">{{ embed.author }}</div>
      <a v-if="embed.title" class="title" :href="href" target="_blank" rel="noopener noreferrer">{{ embed.title }}</a>
      <a v-else class="title" :href="href" target="_blank" rel="noopener noreferrer">{{ embed.url }}</a>
      <p v-if="embed.description && !embed.player" class="desc">{{ embed.description }}</p>
    </div>

    <div v-if="embed.thumbnail && !big" class="thumb" :class="{ blur: hidden }" @click="revealed = true">
      <img :src="embed.thumbnail" alt="" loading="lazy">
    </div>

    <div v-if="embed.player" class="media" :style="playerStyle">
      <iframe
        v-if="playing"
        :src="embed.player.url"
        :allow="embed.player.allow.join('; ')"
        allowfullscreen
        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
        referrerpolicy="strict-origin-when-cross-origin"
        loading="lazy"
        title="미디어 플레이어"
      />
      <template v-else>
        <img v-if="embed.thumbnail" :class="{ blur: hidden }" :src="embed.thumbnail" alt="" loading="lazy">
        <div class="controls">
          <button class="ctl" aria-label="재생" @click="revealed = true; playing = true">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
          </button>
          <a class="ctl" :href="href" target="_blank" rel="noopener noreferrer" aria-label="새 탭에서 열기">
            <Icon name="external" :size="18" />
          </a>
        </div>
        <span v-if="hidden" class="nsfw">민감한 콘텐츠</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 16px;
  margin-top: 6px;
  max-width: 432px;
  padding: 8px 16px 14px 12px;
  border-left: 4px solid color-mix(in srgb, var(--fg-faint) 60%, transparent);
  border-radius: 4px;
  background: var(--bg-embed);
}
.card.big {
  grid-template-columns: minmax(0, 1fr);
}
.meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding-top: 4px;
}
.site {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--fg-muted);
  min-width: 0;
}
.site span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.favicon {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  object-fit: contain;
}
.author {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-strong);
}
.title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--fg);
  white-space: pre-line;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.thumb {
  width: 80px;
  height: 80px;
  margin-top: 4px;
  border-radius: 4px;
  overflow: hidden;
}
.thumb img,
.media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.blur img,
img.blur {
  filter: blur(16px);
  cursor: pointer;
}
.media {
  position: relative;
  width: 100%;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
}
.media iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
.controls {
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 24px;
  background: rgba(0, 0, 0, 0.6);
}
.ctl {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: #fff;
  opacity: 0.85;
}
.ctl:hover {
  opacity: 1;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.12);
}
.nsfw {
  position: absolute;
  inset: auto 0 8px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  pointer-events: none;
}
</style>
