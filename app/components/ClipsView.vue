<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { Clip, Note } from '~/types/misskey'

const props = defineProps<{ account: Account }>()

const api = useApi(props.account)
const toast = useToast()
const { clips, load: loadClips, create: createClip } = useClips(props.account)

const error = ref('')
// Latest note of each clip, shown as the card preview (like a forum post's first message)
const previews = ref<Record<string, Note | null>>({})

const creating = ref(false)
const newName = ref('')
const newPublic = ref(false)
const busy = ref(false)
const q = ref('')

const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  if (!s || !clips.value) return clips.value ?? []
  return clips.value.filter(c => [c.name, c.description].some(v => v?.toLowerCase().includes(s)))
})

async function load() {
  error.value = ''
  try {
    const list = await loadClips(true)
    // Keep large clip collections from opening hundreds of requests at once.
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(4, list.length) }, async () => {
      while (cursor < list.length) {
        const c = list[cursor++]!
        try {
          previews.value[c.id] = (await api<Note[]>('clips/notes', { clipId: c.id, limit: 1 }))[0] ?? null
        }
        catch {
          previews.value[c.id] = null
        }
      }
    }))
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
onMounted(load)

function open(c: Clip) {
  return navigateTo(channelPath(props.account.key, { kind: 'clip', id: c.id }))
}

async function create() {
  const name = newName.value.trim()
  if (!name) return
  busy.value = true
  try {
    const clip = await createClip(name, newPublic.value)
    newName.value = ''
    creating.value = false
    await open(clip)
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    busy.value = false
  }
}

function snippet(n: Note) {
  const t = appearNote(n)
  return t.cw ?? t.text ?? (t.files.length ? `파일 ${t.files.length}개` : '')
}
function thumb(n: Note) {
  return appearNote(n).files.find(f => f.type.startsWith('image/') && !f.isSensitive)
}
</script>

<template>
  <div class="clips">
    <ViewHeader icon="clip" title="클립" topic="내가 모아 둔 노트" />

    <div class="scroll">
      <div class="toolbar">
        <div class="search">
          <input v-model="q" class="field" type="search" placeholder="클립 검색" aria-label="클립 검색">
        </div>
        <button class="btn" :class="{ on: creating }" @click="creating = !creating">
          <Icon name="plus" :size="16" /> 새 클립
        </button>
      </div>

      <form v-if="creating" class="card new" @submit.prevent="create">
        <input v-model="newName" class="field" placeholder="클립 이름" maxlength="100" autofocus>
        <label class="check"><input v-model="newPublic" type="checkbox"> 공개</label>
        <button class="btn" :disabled="busy || !newName.trim()">만들기</button>
      </form>

      <p v-if="error" class="err">{{ error }} <button @click="load">다시 시도</button></p>
      <p v-else-if="!clips" class="muted">불러오는 중…</p>
      <EmptyState v-else-if="!clips.length && !creating" icon="clip">
        아직 클립이 없어요.
        <template #action>
          <button class="btn" @click="creating = true">첫 클립 만들기</button>
        </template>
      </EmptyState>
      <EmptyState v-else-if="!shown.length && q.trim()" icon="clip">"{{ q.trim() }}"에 맞는 클립이 없어요.</EmptyState>

      <div v-if="shown.length" class="grid">
        <article
          v-for="c in shown"
          :key="c.id"
          class="card"
          role="button"
          tabindex="0"
          @click="open(c)"
          @keydown.enter="open(c)"
        >
          <div class="body">
            <h2 class="name">
              <Icon v-if="!c.isPublic" name="lock" :size="14" class="lock" />
              {{ c.name }}
            </h2>
            <p v-if="c.description" class="desc">{{ c.description }}</p>
            <div v-if="previews[c.id]" class="preview">
              <UserAvatar class="pv-avatar" :user="appearNote(previews[c.id]!).user" />
              <MfmText class="pv-name" :text="displayName(appearNote(previews[c.id]!).user)" :emojis="appearNote(previews[c.id]!).user.emojis" plain />
              <span class="pv-text">{{ snippet(previews[c.id]!) }}</span>
            </div>
            <p v-else-if="previews[c.id] === null" class="pv-empty">아직 노트가 없어요</p>
            <footer class="meta">
              <span v-if="c.notesCount != null"><Icon name="clip" :size="12" /> 노트 {{ c.notesCount }}개</span>
              <span>{{ formatStamp(c.lastClippedAt ?? c.createdAt) }}</span>
            </footer>
          </div>
          <img v-if="previews[c.id] && thumb(previews[c.id]!)" class="thumb" :src="thumb(previews[c.id]!)!.thumbnailUrl ?? thumb(previews[c.id]!)!.url" alt="" loading="lazy">
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clips {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.spacer {
  flex: 1;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
/* Same toolbar as the page gallery */
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.search {
  flex: 1;
  min-width: 0;
}
.toolbar .btn {
  white-space: nowrap;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 12px;
}
.card {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius);
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
  cursor: pointer;
  min-width: 0;
  transition: background 0.15s, border-color 0.15s;
}
.card:hover {
  background: var(--bg-embed);
  border-color: var(--bg-active);
}
.card.new {
  align-items: center;
  margin-bottom: 12px;
  cursor: default;
}
.card.new .field {
  flex: 1;
}
.check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: var(--fg-muted);
  white-space: nowrap;
}
.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.name {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--fg-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lock {
  color: var(--fg-faint);
}
.desc {
  margin: 0;
  font-size: 13px;
  color: var(--fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 14px;
}
.pv-avatar {
  position: relative;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}
.pv-name {
  flex-shrink: 0;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--fg);
}
.pv-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg-muted);
}
.pv-empty {
  margin: 0;
  font-size: 13px;
  color: var(--fg-faint);
}
.meta {
  display: flex;
  gap: 12px;
  margin-top: 2px;
  font-size: 12px;
  color: var(--fg-faint);
}
.meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.thumb {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--bg-active);
}
.muted,
.err {
  font-size: 14px;
  color: var(--fg-muted);
}
.err {
  color: var(--danger);
}
.err button {
  text-decoration: underline;
}
</style>
