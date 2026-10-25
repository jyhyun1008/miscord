<script lang="ts">
import type { Note } from '~/types/misskey'

// Shared by every embed: the editor preview re-renders on each keystroke, so don't refetch the same note
const cache = new Map<string, Promise<Note>>()
</script>

<script setup lang="ts">
const props = defineProps<{ noteId: string, detailed: boolean }>()

const account = useCurrentAccount()
const profile = useProfilePopout()
const note = ref<Note | null>(null)
const failed = ref(false)

watch(() => props.noteId, async (id) => {
  note.value = null
  failed.value = false
  const a = account.value
  if (!a) return
  const key = `${a.key}:${id}`
  let req = cache.get(key)
  if (!req) {
    if (cache.size >= 200) cache.delete(cache.keys().next().value!)
    req = apiCall<Note>(a.host, 'notes/show', { noteId: id }, a.token)
    cache.set(key, req)
    req.catch(() => cache.delete(key))
  }
  try {
    const n = await req
    if (props.noteId === id) note.value = n
  }
  catch {
    if (props.noteId === id) failed.value = true
  }
}, { immediate: true })
</script>

<template>
  <div class="embed" :class="{ detailed: props.detailed }">
    <template v-if="note">
      <div class="head">
        <button class="who" @click="profile.open({ userId: note.user.id }, $event.currentTarget as HTMLElement)">
          <UserAvatar class="avatar" :user="note.user" />
          <MfmText class="name" :text="displayName(note.user)" :emojis="note.user.emojis" plain />
          <span class="acct">{{ acct(note.user) }}</span>
        </button>
        <span class="time">{{ formatStamp(note.createdAt) }}</span>
      </div>
      <NoteBody :note="note" />
    </template>
    <p v-else-if="failed" class="muted"><Icon name="warn" :size="14" /> 노트를 불러올 수 없어요</p>
    <p v-else class="muted">노트 불러오는 중…</p>
  </div>
</template>

<style scoped>
.embed {
  padding: 10px 12px;
  border-radius: var(--radius);
  border-left: 4px solid var(--bg-active);
  background: var(--bg-embed);
  min-width: 0;
}
.embed.detailed {
  border-left-color: var(--accent);
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  min-width: 0;
}
.who {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 0;
  text-align: left;
}
.avatar {
  position: relative;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
}
.name {
  font-weight: 600;
  color: var(--fg-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.acct,
.time {
  font-size: 12px;
  color: var(--fg-faint);
  white-space: nowrap;
}
.acct {
  overflow: hidden;
  text-overflow: ellipsis;
}
.muted {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  color: var(--fg-faint);
}
</style>
