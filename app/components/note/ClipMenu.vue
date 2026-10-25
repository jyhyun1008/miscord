<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { Clip, Note } from '~/types/misskey'

const props = defineProps<{ account: Account, note: Note }>()
const emit = defineEmits<{ back: [] }>()

const api = useApi(props.account)
const toast = useToast()
const { clips, load, create, touch } = useClips(props.account)

// Clips this note is already in, so each row toggles
const inClip = ref<Set<string> | null>(null)
const busy = ref<string | null>(null)
const newName = ref('')

onMounted(async () => {
  try {
    const [, containing] = await Promise.all([load(), api<Clip[]>('notes/clips', { noteId: props.note.id })])
    inClip.value = new Set(containing.map(c => c.id))
  }
  catch (e) {
    toast.error(e)
    emit('back')
  }
})

async function toggle(clip: Clip) {
  if (!inClip.value || busy.value) return
  const has = inClip.value.has(clip.id)
  busy.value = clip.id
  try {
    await api(has ? 'clips/remove-note' : 'clips/add-note', { clipId: clip.id, noteId: props.note.id })
    if (has) inClip.value.delete(clip.id)
    else inClip.value.add(clip.id)
    touch(clip.id, has ? -1 : 1)
    toast.show(has ? `"${clip.name}"에서 뺐어요` : `"${clip.name}"에 추가했어요`)
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    busy.value = null
  }
}

async function createAndAdd() {
  const name = newName.value.trim()
  if (!name || busy.value) return
  try {
    const clip = await create(name)
    newName.value = ''
    await toggle(clip)
  }
  catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <button class="back" @click="emit('back')">
    <span>클립에 추가</span><Icon name="x" :size="14" />
  </button>
  <p v-if="!inClip" class="hint">불러오는 중…</p>
  <template v-else>
    <button v-for="c in clips" :key="c.id" :disabled="busy === c.id" @click="toggle(c)">
      <span class="name">{{ c.name }}</span>
      <Icon v-if="inClip.has(c.id)" name="check" :size="16" />
    </button>
    <form class="new" @submit.prevent="createAndAdd" @click.stop>
      <input v-model="newName" placeholder="새 클립 이름" maxlength="100">
      <button :disabled="!newName.trim()" title="만들고 추가"><Icon name="plus" :size="16" /></button>
    </form>
  </template>
</template>

<style scoped>
.back {
  color: var(--fg-muted) !important;
  font-size: 12px !important;
  font-weight: 700;
}
.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hint {
  margin: 0;
  padding: 7px 8px;
  font-size: 13px;
  color: var(--fg-muted);
}
.new {
  gap: 4px;
  margin-top: 4px;
  padding: 4px !important;
  border-top: 1px solid var(--border);
  border-radius: 0 !important;
}
.new:hover {
  background: none !important;
}
.new input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  border: none;
  border-radius: 3px;
  background: var(--bg-input);
  outline: none;
  font-size: 13px;
}
.new button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 3px;
  color: var(--fg-muted);
}
.new button:hover:not(:disabled) {
  background: var(--accent);
  color: var(--accent-fg);
}
</style>
