<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { DriveFile, DriveFolder } from '~/types/misskey'

const props = withDefaults(defineProps<{
  account: Account
  /** Mime filter in Misskey's form, e.g. `image/*` */
  type?: string
  /** How many files may be picked; 1 picks on click */
  max?: number
}>(), { type: undefined, max: 1 })
const emit = defineEmits<{ pick: [files: DriveFile[]], close: [] }>()

const PAGE_SIZE = 30

const api = useApi(props.account)

// Folder path from the drive root; the last entry is the open folder
const path = ref<DriveFolder[]>([])
const folders = ref<DriveFolder[]>([])
const files = ref<DriveFile[]>([])
const done = ref(false)
const loading = ref(false)
const error = ref('')
const denied = ref(false)
const selected = ref<DriveFile[]>([])

const folderId = computed(() => path.value.at(-1)?.id ?? null)
const multiple = computed(() => props.max > 1)

async function load(more = false) {
  loading.value = true
  error.value = ''
  try {
    const id = folderId.value
    const [fo, fi] = await Promise.all([
      more ? Promise.resolve(folders.value) : api<DriveFolder[]>('drive/folders', { folderId: id, limit: 100 }),
      api<DriveFile[]>('drive/files', {
        folderId: id,
        limit: PAGE_SIZE,
        ...(props.type ? { type: props.type } : {}),
        ...(more && files.value.length ? { untilId: files.value.at(-1)!.id } : {}),
      }),
    ])
    if (id !== folderId.value) return
    folders.value = fo
    files.value = more ? [...files.value, ...fi] : fi
    done.value = fi.length < PAGE_SIZE
  }
  catch (e) {
    denied.value = e instanceof MisskeyApiError && e.code === 'PERMISSION_DENIED'
    error.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    loading.value = false
  }
}
watch(folderId, () => {
  folders.value = []
  files.value = []
  load()
}, { immediate: true })

function isSelected(f: DriveFile) {
  return selected.value.some(s => s.id === f.id)
}
function toggle(f: DriveFile) {
  if (!multiple.value) {
    emit('pick', [f])
    return
  }
  if (isSelected(f)) selected.value = selected.value.filter(s => s.id !== f.id)
  else if (selected.value.length < props.max) selected.value.push(f)
}
</script>

<template>
  <BaseModal title="드라이브에서 선택" :subtitle="multiple ? `최대 ${props.max}개까지 고를 수 있어요` : undefined" :width="640" @close="emit('close')">
    <nav class="crumbs">
      <button :class="{ on: !path.length }" @click="path = []"><Icon name="drive" :size="14" /> 드라이브</button>
      <template v-for="(f, i) in path" :key="f.id">
        <span class="sep">/</span>
        <button :class="{ on: i === path.length - 1 }" @click="path = path.slice(0, i + 1)">{{ f.name }}</button>
      </template>
    </nav>

    <ReloginHint v-if="denied" :host="props.account.host">드라이브를 보려면</ReloginHint>
    <p v-else-if="error && !files.length && !folders.length" class="err">{{ error }} <button @click="load()">다시 시도</button></p>

    <div v-if="folders.length" class="folders">
      <button v-for="f in folders" :key="f.id" class="folder" @click="path = [...path, f]">
        <Icon name="folder" :size="16" />
        <span>{{ f.name }}</span>
      </button>
    </div>

    <div v-if="files.length" class="grid">
      <button
        v-for="f in files"
        :key="f.id"
        class="file"
        :class="{ on: isSelected(f) }"
        :title="f.name"
        :aria-pressed="multiple ? isSelected(f) : undefined"
        @click="toggle(f)"
      >
        <img v-if="f.type.startsWith('image/') && (f.thumbnailUrl ?? f.url)" :class="{ sensitive: f.isSensitive }" :src="f.thumbnailUrl ?? f.url" alt="" loading="lazy">
        <span v-else class="fname"><Icon name="clip" :size="16" />{{ f.name }}</span>
        <span v-if="multiple" class="check"><Icon v-if="isSelected(f)" name="check" :size="14" /></span>
      </button>
    </div>

    <p v-if="loading" class="muted">불러오는 중…</p>
    <EmptyState v-else-if="!error && !files.length && !folders.length" :icon="props.type?.startsWith('image') ? 'image' : 'folder'">
      {{ props.type?.startsWith('image') ? '이 폴더에 이미지가 없어요.' : '이 폴더가 비어 있어요.' }}
    </EmptyState>
    <button v-else-if="!done && files.length" class="more" @click="load(true)">더 보기</button>

    <template v-if="multiple" #footer>
      <span class="count">{{ selected.length }}개 선택</span>
      <button class="btn ghost" @click="emit('close')">취소</button>
      <button class="btn" :disabled="!selected.length" @click="emit('pick', selected)">추가</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.crumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  margin-bottom: 12px;
  font-size: 14px;
}
.crumbs button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--fg-muted);
}
.crumbs button:hover {
  background: var(--bg-hover);
  color: var(--fg);
}
.crumbs button.on {
  color: var(--fg-strong);
  font-weight: 600;
}
.sep {
  color: var(--fg-faint);
}
.folders {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 6px;
  margin-bottom: 12px;
}
.folder {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  border-radius: 6px;
  background: var(--bg-sidebar);
  color: var(--fg);
  font-size: 14px;
  text-align: left;
}
.folder span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder:hover {
  background: var(--bg-embed);
}
.folder .icon {
  color: var(--accent);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 6px;
}
.file {
  position: relative;
  aspect-ratio: 1;
  padding: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-sidebar);
  outline: 2px solid transparent;
  outline-offset: -2px;
}
.file:hover {
  outline-color: var(--bg-active);
}
.file.on {
  outline-color: var(--accent);
}
.file img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.file img.sensitive {
  filter: blur(10px);
}
.fname {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 100%;
  padding: 8px;
  font-size: 12px;
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}
.check {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid #fff;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
}
.file.on .check {
  border-color: var(--accent);
  background: var(--accent);
}
.more {
  display: block;
  margin: 12px auto 0;
  padding: 6px 14px;
  border-radius: 4px;
  color: var(--fg-link);
  font-size: 14px;
}
.more:hover {
  background: var(--bg-hover);
}
.count {
  margin-right: auto;
  align-self: center;
  font-size: 14px;
  color: var(--fg-muted);
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
