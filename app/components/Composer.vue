<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { DriveFile, Note } from '~/types/misskey'

type Vis = 'public' | 'home' | 'followers'

const props = defineProps<{
  account: Account
  channel: Channel
  placeholder: string
  replyTo: Note | null
  quoteOf: Note | null
}>()
const emit = defineEmits<{ cancel: [], posted: [note: Note] }>()

const MAX = 3000
const VIS: { value: Vis, label: string, icon: string }[] = [
  { value: 'public', label: '공개', icon: 'global' },
  { value: 'home', label: '홈', icon: 'home' },
  { value: 'followers', label: '팔로워', icon: 'lock' },
]

const api = useApi(props.account)
const toast = useToast()
const { prefs, save } = usePrefs(props.account.key)

const text = ref('')
const cw = ref<string | null>(null)
const files = ref<DriveFile[]>([])
const uploading = ref(0)
const busy = ref(false)
const visOpen = ref(false)
const emojiAnchor = ref<HTMLElement | null>(null)
const appendTag = ref(true)
const ta = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const visibility = computed<Vis>({
  get: () => prefs.value.defaultVisibility,
  set: (v) => {
    prefs.value.defaultVisibility = v
    save()
  },
})
// Replies to followers-only notes stay followers-only
const effectiveVis = computed<Vis>(() =>
  props.replyTo?.visibility === 'followers' || props.replyTo?.visibility === 'specified' ? 'followers' : visibility.value,
)
const visMeta = computed(() => VIS.find(v => v.value === effectiveVis.value)!)
const tag = computed(() => (props.channel.kind === 'tag' ? props.channel.tag : null))
const finalText = computed(() => {
  let t = text.value.trim()
  if (tag.value && appendTag.value && !new RegExp(`#${escapeRegExp(tag.value)}(?![\\p{L}\\p{N}_])`, 'iu').test(t)) t = `${t}\n#${tag.value}`.trim()
  return t
})
const canSend = computed(() =>
  !busy.value && uploading.value === 0 && (finalText.value.length > 0 || files.value.length > 0 || !!props.quoteOf) && finalText.value.length <= MAX,
)
const remaining = computed(() => MAX - finalText.value.length)

function autosize() {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`
}
watch(text, () => nextTick(autosize))

function focus() {
  ta.value?.focus()
}
defineExpose({ focus })

function onKeydown(e: KeyboardEvent) {
  // Don't send while an IME (Korean/Japanese input) is composing
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault()
    send()
  }
  else if (e.key === 'Escape' && (props.replyTo || props.quoteOf)) {
    emit('cancel')
  }
}

async function send() {
  if (!canSend.value) return
  busy.value = true
  try {
    const res = await api<{ createdNote: Note }>('notes/create', {
      text: finalText.value || null,
      cw: cw.value?.trim() || null,
      visibility: effectiveVis.value,
      ...(props.channel.kind === 'channel' ? { channelId: props.channel.id } : {}),
      ...(props.replyTo ? { replyId: props.replyTo.id } : {}),
      ...(props.quoteOf ? { renoteId: props.quoteOf.id } : {}),
      ...(files.value.length ? { fileIds: files.value.map(f => f.id) } : {}),
    })
    text.value = ''
    cw.value = null
    files.value = []
    emit('posted', res.createdNote)
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    busy.value = false
    nextTick(focus)
  }
}

async function upload(list: FileList | File[]) {
  for (const file of Array.from(list)) {
    uploading.value++
    try {
      const fd = new FormData()
      fd.append('i', props.account.token)
      fd.append('file', file)
      fd.append('name', file.name)
      const res = await fetch(`https://${normalizeHost(props.account.host)}/api/drive/files/create`, { method: 'POST', body: fd, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(120_000) })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error?.message ?? `업로드 실패 (${res.status})`)
      files.value.push(body as DriveFile)
    }
    catch (e) {
      toast.error(e)
    }
    finally {
      uploading.value--
    }
  }
}

function onPaste(e: ClipboardEvent) {
  const pasted = Array.from(e.clipboardData?.files ?? [])
  if (pasted.length) {
    e.preventDefault()
    upload(pasted)
  }
}

function onDrop(e: DragEvent) {
  if (e.dataTransfer?.files.length) upload(e.dataTransfer.files)
}

function insertEmoji(emoji: string) {
  emojiAnchor.value = null
  const el = ta.value
  const token = emoji.startsWith(':') ? ` ${emoji} ` : emoji
  if (!el) {
    text.value += token
    return
  }
  const { selectionStart: s, selectionEnd: e } = el
  text.value = text.value.slice(0, s) + token + text.value.slice(e)
  nextTick(() => {
    el.focus()
    el.selectionStart = el.selectionEnd = s + token.length
  })
}
</script>

<template>
  <div class="composer" @dragover.prevent @drop.prevent="onDrop">
    <div v-if="props.replyTo || props.quoteOf" class="context">
      <span v-if="props.replyTo">
        <b><MfmText :text="displayName(props.replyTo.user)" :emojis="props.replyTo.user.emojis" plain /></b>님에게 답장하는 중
      </span>
      <span v-else-if="props.quoteOf">
        <b><MfmText :text="displayName(props.quoteOf.user)" :emojis="props.quoteOf.user.emojis" plain /></b>님의 노트를 인용하는 중
      </span>
      <button class="x" title="취소 (Esc)" @click="emit('cancel')"><Icon name="x" :size="16" /></button>
    </div>

    <div class="box" :class="{ attached: props.replyTo || props.quoteOf }">
      <div v-if="files.length || uploading" class="files">
        <div v-for="f in files" :key="f.id" class="file">
          <img v-if="f.type.startsWith('image/')" :src="f.thumbnailUrl ?? f.url" alt="">
          <span v-else class="fname">{{ f.name }}</span>
          <button class="rm" title="제거" @click="files = files.filter(x => x.id !== f.id)"><Icon name="trash" :size="14" /></button>
        </div>
        <div v-if="uploading" class="file pending">업로드 중…</div>
      </div>

      <input v-if="cw !== null" v-model="cw" class="cw" placeholder="내용 경고 (CW)" maxlength="100">

      <div class="row">
        <button class="tool" title="파일 첨부" @click="fileInput?.click()">
          <Icon name="plus" :size="20" />
        </button>
        <input ref="fileInput" type="file" multiple hidden @change="upload(($event.target as HTMLInputElement).files ?? []); ($event.target as HTMLInputElement).value = ''">

        <textarea
          ref="ta"
          v-model="text"
          rows="1"
          :placeholder="props.placeholder"
          @keydown="onKeydown"
          @paste="onPaste"
        />

        <span v-if="remaining < 300" class="count" :class="{ over: remaining < 0 }">{{ remaining }}</span>

        <button v-if="tag" class="tool tagbtn" :class="{ on: appendTag }" :title="appendTag ? `#${tag} 자동 추가 켜짐` : `#${tag} 자동 추가 꺼짐`" @click="appendTag = !appendTag">
          <Icon name="hash" :size="18" />
        </button>
        <button class="tool" :class="{ on: cw !== null }" title="내용 경고 (CW)" @click="cw = cw === null ? '' : null">
          <Icon name="eye" :size="20" />
        </button>
        <div class="vis-wrap">
          <button class="tool" :title="`공개 범위: ${visMeta.label}`" :disabled="effectiveVis !== visibility" @click="visOpen = !visOpen">
            <Icon :name="visMeta.icon" :size="20" />
          </button>
          <div v-if="visOpen" class="vis-menu" @mouseleave="visOpen = false">
            <button v-for="v in VIS" :key="v.value" :class="{ on: v.value === visibility }" @click="visibility = v.value; visOpen = false">
              <Icon :name="v.icon" :size="16" /> {{ v.label }}
            </button>
          </div>
        </div>
        <button class="tool" title="이모지" @click="emojiAnchor = emojiAnchor ? null : ($event.currentTarget as HTMLElement)">
          <Icon name="smile" :size="20" />
        </button>
        <button class="tool send" :disabled="!canSend" title="전송 (Enter)" @click="send">
          <Icon name="send" :size="18" />
        </button>
      </div>
    </div>

    <EmojiPicker v-if="emojiAnchor" :account="props.account" :anchor="emojiAnchor" @pick="insertEmoji" @close="emojiAnchor = null" />
  </div>
</template>

<style scoped>
.composer {
  flex-shrink: 0;
  /* Vertically centers the one-line box in --footer-h, level with the sidebar's user panel */
  padding: 12px 16px;
}
.context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 8px 8px 0 0;
  background: var(--bg-sidebar);
  font-size: 14px;
  color: var(--fg-muted);
}
.context b {
  color: var(--fg);
}
.x {
  color: var(--fg-muted);
  display: grid;
  place-items: center;
}
.x:hover {
  color: var(--fg);
}
.box {
  border-radius: 8px;
  background: var(--bg-input);
}
.box.attached {
  border-radius: 0 0 8px 8px;
}
.files {
  display: flex;
  gap: 8px;
  padding: 12px 12px 0;
  overflow-x: auto;
}
.file {
  position: relative;
  flex-shrink: 0;
  width: 120px;
  height: 120px;
  border-radius: 6px;
  background: var(--bg-sidebar);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.file img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.fname {
  padding: 8px;
  font-size: 12px;
  word-break: break-all;
}
.file.pending {
  font-size: 12px;
  color: var(--fg-muted);
}
.rm {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  background: var(--bg-main);
  color: var(--danger);
  box-shadow: var(--shadow);
}
.cw {
  display: block;
  width: calc(100% - 24px);
  margin: 10px 12px 0;
  padding: 6px 0;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  outline: none;
  font-size: 14px;
}
.row {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 0 6px 0 4px;
}
textarea {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  max-height: 40vh;
  padding: 11px 6px;
  border: none;
  background: transparent;
  resize: none;
  outline: none;
  line-height: 22px;
}
textarea::placeholder {
  color: var(--fg-faint);
}
.tool {
  width: 36px;
  height: 44px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  color: var(--fg-muted);
}
.tool:hover:not(:disabled) {
  color: var(--fg);
}
.tool:disabled {
  opacity: 0.4;
  cursor: default;
}
.tool.on {
  color: var(--accent);
}
.send:not(:disabled) {
  color: var(--accent);
}
.count {
  align-self: center;
  font-size: 12px;
  color: var(--fg-muted);
  padding: 0 4px;
}
.count.over {
  color: var(--danger);
}
.vis-wrap {
  position: relative;
}
.vis-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 4px);
  min-width: 140px;
  padding: 6px;
  border-radius: 6px;
  background: var(--bg-float);
  box-shadow: var(--shadow);
  z-index: 10;
}
.vis-menu button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 3px;
  font-size: 14px;
}
.vis-menu button:hover {
  background: var(--accent);
  color: var(--accent-fg);
}
.vis-menu button.on {
  color: var(--accent);
}
.vis-menu button.on:hover {
  color: var(--accent-fg);
}

@media (max-width: 768px) {
  .composer {
    padding: 0 8px calc(8px + env(safe-area-inset-bottom));
  }
  .tagbtn {
    display: none;
  }
}
</style>
