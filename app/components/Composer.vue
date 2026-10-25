<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { DriveFile, Note } from '~/types/misskey'

type Vis = 'public' | 'home' | 'followers'
interface PollDraft { choices: string[], multiple: boolean, expiredAfter: number | null }

const props = defineProps<{
  account: Account
  channel: Channel
  placeholder: string
  replyTo: Note | null
  quoteOf: Note | null
}>()
const emit = defineEmits<{ cancel: [], posted: [note: Note] }>()

const MAX = 3000
/** Misskey's per-note attachment limit */
const MAX_FILES = 16
const VIS: { value: Vis, label: string, icon: string }[] = [
  { value: 'public', label: '공개', icon: 'global' },
  { value: 'home', label: '홈', icon: 'home' },
  { value: 'followers', label: '팔로워', icon: 'lock' },
]
/** Misskey accepts 2–10 poll choices */
const POLL_MIN = 2
const POLL_MAX = 10
const HOUR = 3_600_000
const POLL_EXPIRY: { value: number | null, label: string }[] = [
  { value: null, label: '무기한' },
  { value: HOUR, label: '1시간' },
  { value: 6 * HOUR, label: '6시간' },
  { value: 24 * HOUR, label: '1일' },
  { value: 3 * 24 * HOUR, label: '3일' },
  { value: 7 * 24 * HOUR, label: '1주' },
]

const api = useApi(props.account)
const toast = useToast()
const { prefs, save } = usePrefs(props.account.key)

const text = ref('')
const cw = ref<string | null>(null)
const files = ref<DriveFile[]>([])
const poll = ref<PollDraft | null>(null)
const uploading = ref(0)
const busy = ref(false)
const visOpen = ref(false)
const plusOpen = ref(false)
const plusWrap = ref<HTMLElement | null>(null)
const visWrap = ref<HTMLElement | null>(null)
const emojiAnchor = ref<HTMLElement | null>(null)
const driveOpen = ref(false)
const appendTag = ref(true)
const ta = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

// A redrafted note keeps its own visibility without touching the saved default
const visOverride = ref<Vis | null>(null)
const visibility = computed<Vis>({
  get: () => visOverride.value ?? prefs.value.defaultVisibility,
  set: (v) => {
    if (visOverride.value) {
      visOverride.value = v
      return
    }
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
const pollChoices = computed(() => poll.value?.choices.map(c => c.trim()).filter(Boolean) ?? [])
const pollValid = computed(() => !poll.value || pollChoices.value.length >= POLL_MIN)
// A redrafted poll keeps its remaining time even if it isn't one of the presets
const pollExpiryOptions = computed(() => {
  const v = poll.value?.expiredAfter
  if (v == null || POLL_EXPIRY.some(o => o.value === v)) return POLL_EXPIRY
  return [...POLL_EXPIRY, { value: v, label: `${Math.max(1, Math.round(v / HOUR))}시간 남음` }]
})
const canSend = computed(() =>
  !busy.value && uploading.value === 0 && pollValid.value
  && (finalText.value.length > 0 || files.value.length > 0 || !!poll.value || !!props.quoteOf) && finalText.value.length <= MAX,
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
function setDraft(d: { text: string, cw: string | null, files: DriveFile[], visibility: Vis, poll?: Note['poll'] }) {
  text.value = d.text
  cw.value = d.cw
  files.value = [...d.files]
  poll.value = d.poll
    ? {
        choices: d.poll.choices.map(c => c.text),
        multiple: d.poll.multiple,
        expiredAfter: d.poll.expiresAt ? Math.max(HOUR, new Date(d.poll.expiresAt).getTime() - Date.now()) : null,
      }
    : null
  visOverride.value = d.visibility
  nextTick(() => {
    focus()
    const el = ta.value
    if (el) el.selectionStart = el.selectionEnd = el.value.length
  })
}

defineExpose({ focus, setDraft })

function onKeydown(e: KeyboardEvent) {
  // Don't send while an IME (Korean/Japanese input) is composing.
  // On touch devices Enter is a newline; the send button sends.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && !matchMedia('(pointer: coarse)').matches) {
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
      ...(poll.value
        ? { poll: { choices: pollChoices.value, multiple: poll.value.multiple, ...(poll.value.expiredAfter ? { expiredAfter: poll.value.expiredAfter } : {}) } }
        : {}),
    })
    text.value = ''
    cw.value = null
    files.value = []
    poll.value = null
    visOverride.value = null
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
      files.value.push(await uploadDriveFile(props.account, file))
    }
    catch (e) {
      toast.error(e)
    }
    finally {
      uploading.value--
    }
  }
}

function pickFrom(action: 'upload' | 'drive' | 'cw' | 'poll') {
  plusOpen.value = false
  if (action === 'upload') fileInput.value?.click()
  else if (action === 'drive') driveOpen.value = true
  else if (action === 'cw') {
    cw.value = cw.value === null ? '' : null
    nextTick(focus)
  }
  else {
    poll.value = poll.value ? null : { choices: ['', ''], multiple: false, expiredAfter: null }
  }
}

function removeChoice(i: number) {
  if (!poll.value) return
  if (poll.value.choices.length > POLL_MIN) poll.value.choices.splice(i, 1)
  else poll.value.choices[i] = ''
}

function onOutsidePointerDown(e: PointerEvent) {
  const t = e.target as Node
  if (plusOpen.value && !plusWrap.value?.contains(t)) plusOpen.value = false
  if (visOpen.value && !visWrap.value?.contains(t)) visOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onOutsidePointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointerDown))

function onDrivePick(picked: DriveFile[]) {
  driveOpen.value = false
  files.value.push(...picked.filter(f => !files.value.some(k => k.id === f.id)))
  nextTick(focus)
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

      <div v-if="poll" class="poll">
        <div v-for="(_, i) in poll.choices" :key="i" class="choice">
          <input v-model="poll.choices[i]" :placeholder="`선택지 ${i + 1}`" maxlength="50">
          <button class="x" title="선택지 삭제" @click="removeChoice(i)"><Icon name="x" :size="14" /></button>
        </div>
        <div class="poll-opts">
          <button v-if="poll.choices.length < POLL_MAX" class="add" @click="poll.choices.push('')">
            <Icon name="plus" :size="14" /> 선택지 추가
          </button>
          <label><input v-model="poll.multiple" type="checkbox"> 복수 선택</label>
          <select v-model="poll.expiredAfter" title="투표 기한">
            <option v-for="o in pollExpiryOptions" :key="o.label" :value="o.value">{{ o.label }}</option>
          </select>
          <button class="x end" title="투표 삭제" @click="poll = null"><Icon name="trash" :size="14" /></button>
        </div>
      </div>

      <div class="row">
        <div ref="plusWrap" class="menu-wrap">
          <button class="tool" :class="{ on: plusOpen }" title="추가" @click="plusOpen = !plusOpen">
            <Icon name="plus" :size="20" />
          </button>
          <div v-if="plusOpen" class="menu left">
            <button :disabled="files.length >= MAX_FILES" @click="pickFrom('upload')">
              <Icon name="image" :size="16" /> 파일 업로드
            </button>
            <button :disabled="files.length >= MAX_FILES" @click="pickFrom('drive')">
              <Icon name="drive" :size="16" /> 드라이브에서 첨부
            </button>
            <button :class="{ on: cw !== null }" @click="pickFrom('cw')">
              <Icon name="eye" :size="16" /> 내용 경고 (CW)
            </button>
            <button :class="{ on: !!poll }" @click="pickFrom('poll')">
              <Icon name="poll" :size="16" /> 투표
            </button>
          </div>
        </div>
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
        <button class="tool" title="이모지" @click="emojiAnchor = emojiAnchor ? null : ($event.currentTarget as HTMLElement)">
          <Icon name="smile" :size="20" />
        </button>
        <div ref="visWrap" class="menu-wrap">
          <button class="tool" :title="`공개 범위: ${visMeta.label}`" :disabled="effectiveVis !== visibility" @click="visOpen = !visOpen">
            <Icon :name="visMeta.icon" :size="20" />
          </button>
          <div v-if="visOpen" class="menu">
            <button v-for="v in VIS" :key="v.value" :class="{ on: v.value === visibility }" @click="visibility = v.value; visOpen = false">
              <Icon :name="v.icon" :size="16" /> {{ v.label }}
            </button>
          </div>
        </div>
        <button class="tool send" :disabled="!canSend" title="전송 (Enter)" @click="send">
          <Icon name="send" :size="18" />
        </button>
      </div>
    </div>

    <DrivePicker
      v-if="driveOpen"
      :account="props.account"
      :max="MAX_FILES - files.length"
      @pick="onDrivePick"
      @close="driveOpen = false"
    />
    <EmojiPicker v-if="emojiAnchor" :account="props.account" :anchor="emojiAnchor" @pick="insertEmoji" @close="emojiAnchor = null" />
  </div>
</template>

<style scoped>
.composer {
  flex-shrink: 0;
  /* Vertically centers the one-line box in --footer-h, level with the sidebar's user panel */
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
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
.menu-wrap {
  position: relative;
}
.menu {
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
.menu.left {
  right: auto;
  left: 0;
  min-width: 180px;
}
.menu button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 3px;
  font-size: 14px;
}
.menu button {
  white-space: nowrap;
}
.menu button:hover:not(:disabled) {
  background: var(--accent);
  color: var(--accent-fg);
}
.menu button:disabled {
  opacity: 0.4;
  cursor: default;
}
.menu button.on {
  color: var(--accent);
}
.menu button.on:hover {
  color: var(--accent-fg);
}
.poll {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 10px 12px 0;
  padding: 10px;
  border-radius: 6px;
  background: var(--bg-sidebar);
}
.choice {
  display: flex;
  align-items: center;
  gap: 6px;
}
.choice input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  outline: none;
  font-size: 14px;
}
.choice input:focus {
  border-color: var(--accent);
}
.poll-opts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--fg-muted);
}
.poll-opts .add {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--accent);
}
.poll-opts label {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.poll-opts select {
  padding: 3px 4px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--fg);
  font-size: 13px;
}
.poll-opts .end {
  margin-left: auto;
}

@media (max-width: 768px) {
  .composer {
    padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
  }
  .tagbtn {
    display: none;
  }
}
</style>
