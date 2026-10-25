<script setup lang="ts">
import type { DriveFile, Note } from '~/types/misskey'

const props = defineProps<{ note: Note, depth?: number }>()
const showCw = ref(false)
const revealed = ref<Record<string, boolean>>({})
const lightbox = ref<number | null>(null)

const emojis = computed(() => ({ ...props.note.user.emojis, ...props.note.emojis }))
const quote = computed(() => (props.note.renote && (props.depth ?? 0) < 1 ? props.note.renote : null))
const images = computed(() => props.note.files.filter(f => f.type.startsWith('image/')))
const videos = computed(() => props.note.files.filter(f => f.type.startsWith('video/')))
const others = computed(() => props.note.files.filter(f => !f.type.startsWith('image/') && !f.type.startsWith('video/')))
// A lone image gets a box sized to its own aspect ratio (Discord-style, no letterboxing).
// Reserving the size up front also keeps the timeline from jumping while it lazy-loads.
const SINGLE_MAX_W = 400
const SINGLE_MAX_H = 350
function singleImageStyle(f: DriveFile) {
  const { width: w, height: h } = f.properties
  if (!w || !h) return undefined
  const scale = Math.min(1, SINGLE_MAX_W / w, SINGLE_MAX_H / h)
  return { width: `${Math.round(w * scale)}px`, aspectRatio: `${w} / ${h}` }
}
// A quoted note's own link (e.g. a trailing "RN: https://…") is already shown as the quote
const links = computed(() => {
  const q = quote.value
  const own = q ? [q.url, q.uri, `/notes/${q.id}`] : []
  return previewUrls(props.note.text).filter(u => !own.some(o => o && u.endsWith(o)))
})
const totalVotes = computed(() => props.note.poll?.choices.reduce((s, c) => s + c.votes, 0) ?? 0)

const profile = useProfilePopout()
</script>

<template>
  <div class="body">
    <div v-if="props.note.cw != null" class="cw">
      <MfmText :text="props.note.cw" :emojis="emojis" :nyaize="speaksAsCat(props.note.user)" />
      <button class="cw-btn" @click="showCw = !showCw">
        {{ showCw ? '숨기기' : `내용 보기${props.note.files.length ? ` (파일 ${props.note.files.length}개)` : ''}` }}
      </button>
    </div>

    <template v-if="props.note.cw == null || showCw">
      <MfmText v-if="props.note.text" class="text" :text="props.note.text" :emojis="emojis" :nyaize="speaksAsCat(props.note.user)" />

      <div v-if="images.length" class="images" :class="`n${Math.min(images.length, 4)}`">
        <div
          v-for="(f, index) in images"
          :key="f.id"
          class="img-wrap"
          :class="{ sized: images.length === 1 && singleImageStyle(f) }"
          :style="images.length === 1 ? singleImageStyle(f) : undefined"
        >
          <img
            :src="f.thumbnailUrl ?? f.url"
            :alt="f.comment ?? f.name"
            :class="{ blur: f.isSensitive && !revealed[f.id] }"
            loading="lazy"
            @click="f.isSensitive && !revealed[f.id] ? (revealed[f.id] = true) : (lightbox = index)"
          >
          <span v-if="f.isSensitive && !revealed[f.id]" class="nsfw">민감한 콘텐츠 · 클릭해서 보기</span>
        </div>
      </div>

      <video v-for="f in videos" :key="f.id" class="video" :src="f.url" controls preload="metadata" />

      <a v-for="f in others" :key="f.id" class="file" :href="safeHttpUrl(f.url)" target="_blank" rel="noopener noreferrer">
        <Icon name="link" :size="16" /> {{ f.name }}
      </a>

      <div v-if="props.note.poll" class="poll">
        <div v-for="(c, i) in props.note.poll.choices" :key="i" class="choice" :class="{ voted: c.isVoted }">
          <div class="bar" :style="{ width: totalVotes ? `${(c.votes / totalVotes) * 100}%` : '0' }" />
          <MfmText class="ctext" :text="c.text" :emojis="emojis" plain />
          <span class="votes">{{ c.votes }}</span>
        </div>
        <span class="poll-meta">{{ totalVotes }}표</span>
      </div>

      <NoteUrlPreview v-for="u in links" :key="u" :url="u" />
    </template>

    <!-- Quote: Discord-like embed with accent bar -->
    <div v-if="quote" class="embed">
      <div class="embed-head">
        <UserAvatar
          class="embed-avatar"
          :user="quote.user"
          @click="profile.open({ userId: quote.user.id }, $event.currentTarget as HTMLElement)"
        />
        <MfmText class="embed-name" :text="displayName(quote.user)" :emojis="quote.user.emojis" plain />
        <span class="embed-acct">{{ acct(quote.user) }}</span>
      </div>
      <NoteBody :note="quote" :depth="(props.depth ?? 0) + 1" />
    </div>

    <ImageLightbox
      v-if="lightbox !== null"
      :images="images"
      :initial-index="lightbox"
      @close="lightbox = null"
    />
  </div>
</template>

<style scoped>
.body {
  min-width: 0;
}
.text {
  display: block;
}
.cw {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.cw-btn {
  padding: 1px 8px;
  border-radius: 3px;
  background: var(--bg-input);
  color: var(--fg-muted);
  font-size: 12px;
  font-weight: 600;
}
.cw-btn:hover {
  color: var(--fg);
}
.images {
  display: grid;
  gap: 4px;
  margin-top: 6px;
  max-width: 520px;
  border-radius: var(--radius);
  overflow: hidden;
}
.images.n1 {
  grid-template-columns: auto;
  width: fit-content;
  max-width: min(400px, 100%);
}
.images.n2,
.images.n4 {
  grid-template-columns: 1fr 1fr;
}
.images.n3 {
  grid-template-columns: 1fr 1fr;
}
.images.n3 .img-wrap:first-child {
  grid-row: span 2;
  aspect-ratio: auto;
}
/* Fill the two-row cell without the image's own height stretching the rows */
.images.n3 .img-wrap:first-child img {
  position: absolute;
  inset: 0;
}
.img-wrap {
  position: relative;
  overflow: hidden;
  background: var(--bg-rail);
  max-height: 350px;
}
.images:not(.n1) .img-wrap {
  aspect-ratio: 16 / 10;
}
.img-wrap img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: zoom-in;
}
.images.n1 .img-wrap {
  max-width: 100%;
}
.images.n1 .img-wrap.sized {
  max-height: none;
}
/* No dimensions from the server: let the image size itself instead of filling the column */
.images.n1 .img-wrap:not(.sized) img {
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 350px;
}
.img-wrap img.blur {
  filter: blur(24px);
  cursor: pointer;
}
.nsfw {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  pointer-events: none;
}
.video {
  display: block;
  margin-top: 6px;
  max-width: min(400px, 100%);
  max-height: 300px;
  border-radius: var(--radius);
  background: #000;
}
.file {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 8px 12px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-embed);
}
.poll {
  margin-top: 6px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.choice {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid var(--border);
  overflow: hidden;
}
.choice.voted {
  border-color: var(--accent);
}
.bar {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--accent-soft);
}
.ctext,
.votes {
  position: relative;
}
.votes,
.poll-meta {
  font-size: 12px;
  color: var(--fg-muted);
}
.embed {
  margin-top: 6px;
  max-width: 520px;
  padding: 8px 12px 10px;
  border-left: 4px solid var(--accent);
  border-radius: 4px;
  background: var(--bg-embed);
}
.embed-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  min-width: 0;
}
.embed-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  cursor: pointer;
  object-fit: cover;
}
.embed-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-strong);
  white-space: nowrap;
}
.embed-acct {
  font-size: 12px;
  color: var(--fg-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
