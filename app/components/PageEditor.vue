<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { DriveFile, Note, Page, PageBlock } from '~/types/misskey'

const props = defineProps<{ account: Account, pageId: string | null }>()

interface Draft {
  title: string
  summary: string
  text: string
  name: string
  font: Page['font']
  alignCenter: boolean
  cover: DriveFile | null
  /** Files the text references, so the preview can show them */
  files: DriveFile[]
  /** updatedAt of the page this draft edits; a draft of an older version is dropped */
  base: string | null
}

const EMPTY: Draft = { title: '', summary: '', text: '', name: '', font: 'sans-serif', alignCenter: false, cover: null, files: [], base: null }

const api = useApi(props.account)
const toast = useToast()
const { feeds } = usePages(props.account)

const draftKey = `miscord:page-draft:${props.account.key}:${props.pageId ?? 'new'}`
// Blocks the text editor can't express, referenced from the text as `![type](block:id)`
const keep = new Map<string, PageBlock>()

const original = ref<Page | null>(null)
const ready = ref(false)
const loadError = ref('')
const restored = ref(false)
const saving = ref(false)
const uploading = ref(0)
const pane = ref<'write' | 'preview'>('write')
const helpOpen = ref(false)
const advancedOpen = ref(false)
const noteQuery = ref<string | null>(null)
const emojiAnchor = ref<HTMLElement | null>(null)
/** Which slot the drive picker fills */
const drivePick = ref<'body' | 'cover' | null>(null)
const ta = ref<HTMLTextAreaElement | null>(null)
const titleEl = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const coverInput = ref<HTMLInputElement | null>(null)

const title = ref('')
const summary = ref('')
const text = ref('')
const name = ref('')
const font = ref<Page['font']>('sans-serif')
const alignCenter = ref(false)
const cover = ref<DriveFile | null>(null)
const files = ref<DriveFile[]>([])

let base: Draft = EMPTY
let saved = false

function snapshot(): Draft {
  return {
    title: title.value,
    summary: summary.value,
    text: text.value,
    name: name.value,
    font: font.value,
    alignCenter: alignCenter.value,
    cover: cover.value,
    files: files.value,
    base: original.value?.updatedAt ?? null,
  }
}
function apply(d: Draft) {
  title.value = d.title
  summary.value = d.summary
  text.value = d.text
  name.value = d.name
  font.value = d.font
  alignCenter.value = d.alignCenter
  cover.value = d.cover
  files.value = [...d.files]
}
const sameContent = (a: Draft, b: Draft) => JSON.stringify({ ...a, files: [] }) === JSON.stringify({ ...b, files: [] })

onMounted(async () => {
  if (props.pageId) {
    try {
      const p = await api<Page>('pages/show', { pageId: props.pageId })
      if (p.userId !== props.account.user.id) {
        loadError.value = '내가 쓴 페이지만 편집할 수 있어요.'
        return
      }
      original.value = p
      base = {
        title: p.title,
        summary: p.summary ?? '',
        text: pageBlocksToText(p.content, keep),
        name: p.name,
        font: p.font,
        alignCenter: p.alignCenter,
        cover: p.eyeCatchingImage,
        files: p.attachedFiles,
        base: p.updatedAt,
      }
    }
    catch (e) {
      loadError.value = e instanceof Error ? e.message : String(e)
      return
    }
  }
  const draft = loadJson<Draft | null>(draftKey, null)
  if (draft && draft.base === base.base && !sameContent(draft, base)) {
    apply({ ...draft, files: [...base.files, ...draft.files.filter(f => !base.files.some(b => b.id === f.id))] })
    restored.value = true
  }
  else {
    apply(base)
  }
  ready.value = true
  await nextTick()
  autosize()
  if (!props.pageId && !title.value) titleEl.value?.focus()
})

// Autosave a local draft; nothing is sent to the server until 게시/저장
let draftTimer: ReturnType<typeof setTimeout> | undefined
function writeDraft() {
  clearTimeout(draftTimer)
  if (!ready.value || saved) return
  const d = snapshot()
  if (sameContent(d, base)) removeKey(draftKey)
  else saveJson(draftKey, d)
}
watch([title, summary, text, name, font, alignCenter, cover], () => {
  clearTimeout(draftTimer)
  draftTimer = setTimeout(writeDraft, 400)
})
onBeforeUnmount(writeDraft)

function discardDraft() {
  removeKey(draftKey)
  apply(base)
  restored.value = false
  nextTick(autosize)
}

// Preview lags the text slightly so long pages don't re-render on every keystroke
const previewText = ref('')
let previewTimer: ReturnType<typeof setTimeout> | undefined
watch(text, (v) => {
  clearTimeout(previewTimer)
  previewTimer = setTimeout(() => (previewText.value = v), previewText.value ? 150 : 0)
}, { immediate: true })
const previewBlocks = computed(() => {
  // Positional ids keep the preview's components stable between keystrokes
  let n = 0
  return pageTextToBlocks(previewText.value, { keep, host: props.account.host, newId: () => `p${n++}` })
})
const previewFiles = computed(() => (cover.value ? [cover.value, ...files.value] : files.value))

// --- Text editing helpers ---

function autosize() {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
// Hidden behind the preview tab the textarea measures 0px, so re-measure when it comes back
watch([text, pane], () => nextTick(autosize))

function replaceRange(start: number, end: number, insert: string, caret = start + insert.length) {
  text.value = text.value.slice(0, start) + insert + text.value.slice(end)
  nextTick(() => {
    const el = ta.value
    if (!el) return
    el.focus()
    el.selectionStart = el.selectionEnd = caret
  })
}

/** Insert lines as their own paragraph at the caret (images and notes must sit alone on a line). */
function insertLines(lines: string[]) {
  const el = ta.value
  const at = el?.selectionEnd ?? text.value.length
  const before = text.value.slice(0, at)
  const after = text.value.slice(at)
  const chunk = `${before && !before.endsWith('\n') ? '\n' : ''}${lines.join('\n')}${after.startsWith('\n') ? '' : '\n'}`
  replaceRange(at, at, chunk)
}

function cycleHeading() {
  const el = ta.value
  if (!el) return
  const start = text.value.lastIndexOf('\n', el.selectionStart - 1) + 1
  const lineEnd = text.value.indexOf('\n', start)
  const line = text.value.slice(start, lineEnd < 0 ? undefined : lineEnd)
  const m = /^(#{1,6})[ \t]+/.exec(line)
  // none → # → ## → ### → none
  const next = !m ? '# ' : m[1]!.length < 3 ? `${m[1]}# ` : ''
  const body = m ? line.slice(m[0].length) : line
  replaceRange(start, start + line.length, next + body, start + next.length + body.length)
}

function wrap(mark: string) {
  const el = ta.value
  if (!el) return
  const { selectionStart: s, selectionEnd: e } = el
  const inner = text.value.slice(s, e)
  replaceRange(s, e, `${mark}${inner}${mark}`, inner ? s + inner.length + mark.length * 2 : s + mark.length)
}

function insertEmoji(emoji: string) {
  emojiAnchor.value = null
  const el = ta.value
  const at = el?.selectionStart ?? text.value.length
  replaceRange(at, el?.selectionEnd ?? at, emoji.startsWith(':') ? ` ${emoji} ` : emoji)
}

function onKeydown(e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey) || e.isComposing) return
  if (e.key === 'b') {
    e.preventDefault()
    wrap('**')
  }
}
function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    save()
  }
}
onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

// --- Images ---

async function uploadImages(list: FileList | File[]) {
  for (const file of Array.from(list)) {
    uploading.value++
    try {
      const f = await uploadDriveFile(props.account, file)
      files.value.push(f)
      insertLines([`![이미지](file:${f.id})`])
    }
    catch (e) {
      toast.error(e)
    }
    finally {
      uploading.value--
    }
  }
}

async function uploadCover(list: FileList | null) {
  const file = list?.[0]
  if (!file) return
  uploading.value++
  try {
    cover.value = await uploadDriveFile(props.account, file)
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    uploading.value--
  }
}

function onDrivePick(picked: DriveFile[]) {
  if (drivePick.value === 'cover') {
    cover.value = picked[0] ?? cover.value
  }
  else {
    files.value.push(...picked.filter(f => !files.value.some(k => k.id === f.id)))
    insertLines(picked.map(f => `![이미지](file:${f.id})`))
  }
  drivePick.value = null
}

function onPaste(e: ClipboardEvent) {
  const pasted = Array.from(e.clipboardData?.files ?? [])
  if (pasted.length) {
    e.preventDefault()
    uploadImages(pasted)
  }
}
function onDrop(e: DragEvent) {
  if (e.dataTransfer?.files.length) uploadImages(e.dataTransfer.files)
}

// --- Notes ---

const resolvingNote = ref(false)
async function addNote() {
  const raw = noteQuery.value?.trim()
  if (!raw) return
  resolvingNote.value = true
  try {
    const local = new RegExp(`^https?://${escapeRegExp(props.account.host)}/notes/([a-zA-Z0-9]+)`, 'i').exec(raw)
    let id = local?.[1] ?? (/^[a-zA-Z0-9]+$/.test(raw) ? raw : null)
    // A note on another server: let this server fetch it and give us its local id
    if (!id && /^https?:\/\//.test(raw)) {
      const res = await api<{ type: string, object: Note }>('ap/show', { uri: raw })
      if (res.type === 'Note') id = res.object.id
    }
    if (!id) throw new Error('노트 링크를 찾지 못했어요')
    insertLines([`![노트](note:${id})`])
    noteQuery.value = null
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    resolvingNote.value = false
  }
}

// --- Save ---

const canSave = computed(() => ready.value && !saving.value && uploading.value === 0 && !!title.value.trim())

async function save() {
  if (!canSave.value) {
    if (ready.value && !title.value.trim()) {
      toast.error('제목을 입력해 주세요')
      titleEl.value?.focus()
    }
    return
  }
  const pageName = name.value.trim() || original.value?.name || Date.now().toString(36)
  if (!PAGE_NAME_RE.test(pageName)) {
    advancedOpen.value = true
    toast.error('URL 이름에는 공백이나 / ? # @ 같은 기호를 쓸 수 없어요')
    return
  }
  const params = {
    title: title.value.trim(),
    name: pageName,
    summary: summary.value.trim() || null,
    content: pageTextToBlocks(text.value, { keep, host: props.account.host }),
    variables: original.value?.variables ?? [],
    script: original.value?.script ?? '',
    eyeCatchingImageId: cover.value?.id ?? null,
    font: font.value,
    alignCenter: alignCenter.value,
    hideTitleWhenPinned: original.value?.hideTitleWhenPinned ?? false,
  }
  saving.value = true
  try {
    let id = props.pageId
    if (id) await api('pages/update', { pageId: id, ...params })
    else id = (await api<Page>('pages/create', params)).id
    saved = true
    clearTimeout(draftTimer)
    removeKey(draftKey)
    feeds.value = {}
    toast.show(props.pageId ? '저장했어요' : '페이지를 게시했어요')
    await navigateTo(channelPath(props.account.key, { kind: 'page', id }), { replace: true })
  }
  catch (e) {
    if (e instanceof MisskeyApiError && e.code === 'NAME_ALREADY_EXISTS') {
      advancedOpen.value = true
      toast.error('같은 URL 이름의 페이지가 이미 있어요. 고급 설정에서 바꿔 주세요.')
    }
    else if (e instanceof MisskeyApiError && e.code === 'PERMISSION_DENIED') {
      toast.error('페이지를 쓰려면 다시 로그인해서 권한을 추가해 주세요')
    }
    else {
      toast.error(e)
    }
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="editor">
    <ViewHeader icon="edit" :title="props.pageId ? '페이지 편집' : '새 페이지'" topic="작성 중인 내용은 자동으로 임시 저장돼요" :back="props.pageId ? { kind: 'page', id: props.pageId } : { kind: 'pages' }">
      <template #actions>
        <span v-if="uploading" class="status">업로드 중 {{ uploading }}개…</span>
        <div class="tabs pane-tabs" role="tablist">
          <button class="tab" role="tab" :aria-selected="pane === 'write'" :class="{ on: pane === 'write' }" @click="pane = 'write'">작성</button>
          <button class="tab" role="tab" :aria-selected="pane === 'preview'" :class="{ on: pane === 'preview' }" @click="pane = 'preview'">미리보기</button>
        </div>
        <button class="btn small" :disabled="!canSave" title="Ctrl/⌘ + S" @click="save">
          {{ saving ? '저장 중…' : props.pageId ? '저장' : '게시' }}
        </button>
      </template>
    </ViewHeader>

    <p v-if="loadError" class="err pad">{{ loadError }}</p>
    <p v-else-if="!ready" class="muted pad">불러오는 중…</p>

    <div v-else class="panes" :class="`show-${pane}`">
      <!-- Write -->
      <section class="write" @dragover.prevent @drop.prevent="onDrop">
        <div v-if="restored" class="banner">
          <Icon name="edit" :size="14" />
          <span>저장하지 않은 작성 내용을 불러왔어요.</span>
          <button @click="discardDraft">버리기</button>
        </div>

        <div class="cover-pick" :class="{ has: cover }">
          <template v-if="cover">
            <img :src="cover.thumbnailUrl ?? cover.url" alt="">
            <div class="cover-tools">
              <button class="chip" @click="coverInput?.click()"><Icon name="image" :size="14" /> 바꾸기</button>
              <button class="chip" @click="drivePick = 'cover'"><Icon name="drive" :size="14" /> 드라이브</button>
              <button class="chip" @click="cover = null"><Icon name="x" :size="14" /> 제거</button>
            </div>
          </template>
          <div v-else class="cover-add">
            <Icon name="image" :size="16" />
            <span>커버 이미지 <span class="hint">(갤러리 카드에 표시돼요)</span></span>
            <span class="spacer" />
            <button @click="coverInput?.click()">올리기</button>
            <button @click="drivePick = 'cover'">드라이브에서</button>
          </div>
          <input ref="coverInput" type="file" accept="image/*" hidden @change="uploadCover(($event.target as HTMLInputElement).files); ($event.target as HTMLInputElement).value = ''">
        </div>

        <input ref="titleEl" v-model="title" class="title-in" placeholder="제목" maxlength="256" @keydown.enter.prevent="ta?.focus()">
        <input v-model="summary" class="summary-in" placeholder="한 줄 소개 (선택)" maxlength="200">

        <div class="toolbar">
          <button class="tool" title="섹션 제목 (# → ## → ###)" @click="cycleHeading"><Icon name="heading" :size="16" /></button>
          <button class="tool" title="굵게 (Ctrl/⌘ + B)" @click="wrap('**')"><Icon name="bold" :size="16" /></button>
          <button class="tool" title="이미지 올리기" @click="fileInput?.click()"><Icon name="image" :size="16" /></button>
          <button class="tool" title="드라이브에서 이미지 넣기" @click="drivePick = 'body'"><Icon name="drive" :size="16" /></button>
          <button class="tool" :class="{ on: noteQuery !== null }" title="노트 넣기" @click="noteQuery = noteQuery === null ? '' : null"><Icon name="quote" :size="16" /></button>
          <button class="tool" title="이모지" @click="emojiAnchor = emojiAnchor ? null : ($event.currentTarget as HTMLElement)"><Icon name="smile" :size="16" /></button>
          <span class="spacer" />
          <button class="tool help" :class="{ on: helpOpen }" title="작성 방법" @click="helpOpen = !helpOpen">작성 방법</button>
          <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="uploadImages(($event.target as HTMLInputElement).files!); ($event.target as HTMLInputElement).value = ''">
        </div>

        <form v-if="noteQuery !== null" class="note-row" @submit.prevent="addNote">
          <input v-model="noteQuery" class="field" placeholder="노트 링크 (다른 서버 링크도 돼요) 또는 노트 ID" autofocus @keydown.esc="noteQuery = null">
          <button class="btn small" :disabled="resolvingNote || !noteQuery.trim()">{{ resolvingNote ? '찾는 중…' : '넣기' }}</button>
        </form>

        <div v-if="helpOpen" class="help-box">
          <dl>
            <dt><code># 제목</code></dt><dd>섹션 제목 (<code>##</code>, <code>###</code>은 하위 섹션)</dd>
            <dt>그냥 쓴 글</dt><dd>본문. 노트처럼 MFM이 그대로 돼요 (<code>**굵게**</code>, <code>:이모지:</code>, <code>$[x2 크게]</code> …)</dd>
            <dt>이미지</dt><dd>붙여넣기 · 끌어다 놓기 · 버튼으로 올리거나 드라이브에서 고르면 <code>![이미지](file:…)</code> 줄이 생겨요. 줄을 옮기면 위치가 바뀌어요</dd>
            <dt>노트</dt><dd>이 서버 노트 링크를 한 줄에 붙여넣으면 노트가 들어가요. <code>![자세히](note:…)</code>로 바꾸면 강조 표시</dd>
          </dl>
        </div>

        <textarea
          ref="ta"
          v-model="text"
          class="body-in"
          placeholder="여기에 내용을 쓰세요.&#10;&#10;# 으로 시작하는 줄은 섹션 제목이 돼요.&#10;이미지는 붙여넣거나 끌어다 놓으면 올라가요."
          spellcheck="false"
          @keydown="onKeydown"
          @paste="onPaste"
        />

        <details class="advanced" :open="advancedOpen" @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open">
          <summary>고급 설정</summary>
          <label class="row">
            <span>URL 이름</span>
            <span class="url-in">
              <span class="prefix">/@{{ props.account.user.username }}/pages/</span>
              <input v-model="name" class="field" :placeholder="original?.name ?? '비워 두면 자동으로 정해져요'" maxlength="256">
            </span>
          </label>
          <label class="row">
            <span>글꼴</span>
            <select v-model="font" class="field">
              <option value="sans-serif">고딕 (sans-serif)</option>
              <option value="serif">명조 (serif)</option>
            </select>
          </label>
          <label class="row check"><input v-model="alignCenter" type="checkbox"> 가운데 정렬</label>
        </details>
      </section>

      <!-- Preview -->
      <section class="preview">
        <div class="preview-label">미리보기</div>
        <article class="article" :class="{ serif: font === 'serif', center: alignCenter }">
          <img v-if="cover" class="cover" :src="cover.url" alt="">
          <h1 class="page-title" :class="{ placeholder: !title.trim() }">{{ title.trim() || '제목' }}</h1>
          <p v-if="summary.trim()" class="summary">{{ summary.trim() }}</p>
          <PageBlocks v-if="previewBlocks.length" :blocks="previewBlocks" :files="previewFiles" />
          <p v-else class="muted">내용을 쓰면 여기에 보여요.</p>
        </article>
      </section>
    </div>

    <DrivePicker
      v-if="drivePick"
      :account="props.account"
      type="image/*"
      :max="drivePick === 'cover' ? 1 : 20"
      @pick="onDrivePick"
      @close="drivePick = null"
    />
    <EmojiPicker v-if="emojiAnchor" :account="props.account" :anchor="emojiAnchor" @pick="insertEmoji" @close="emojiAnchor = null" />
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  container-type: inline-size;
}
.spacer {
  flex: 1;
}
.status {
  font-size: 12px;
  color: var(--fg-faint);
  white-space: nowrap;
}
.pad {
  padding: 16px;
}
.panes {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
.write,
.preview {
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 48px;
}
.show-write .preview,
.show-preview .write {
  display: none;
}
.write {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--accent-soft);
  color: var(--fg);
  font-size: 13px;
}
.banner button {
  margin-left: auto;
  color: var(--accent);
  font-weight: 600;
}
.cover-pick {
  position: relative;
  border-radius: var(--radius);
  overflow: hidden;
}
.cover-pick img {
  display: block;
  width: 100%;
  height: 160px;
  object-fit: cover;
  background: var(--bg-active);
}
.cover-tools {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}
.cover-add {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 14px;
  border: 1px dashed var(--bg-active);
  border-radius: var(--radius);
  color: var(--fg-muted);
  font-size: 14px;
}
.cover-add button {
  padding: 4px 10px;
  border-radius: 4px;
  background: var(--bg-active);
  color: var(--fg);
  font-size: 13px;
  font-weight: 600;
}
.cover-add button:hover {
  background: var(--accent-soft);
  color: var(--accent);
}
.hint {
  color: var(--fg-faint);
  font-size: 12px;
}
.title-in,
.summary-in,
.body-in {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--fg);
  font: inherit;
}
.title-in {
  font-size: 28px;
  font-weight: 800;
  color: var(--fg-strong);
}
.summary-in {
  font-size: 15px;
  color: var(--fg-muted);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 0;
  background: var(--bg-main);
}
.tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border-radius: 4px;
  color: var(--fg-muted);
}
.tool:hover,
.tool.on {
  color: var(--fg-strong);
  background: var(--bg-hover);
}
.tool.help {
  font-size: 13px;
  font-weight: 600;
}
.note-row {
  display: flex;
  gap: 8px;
}
.note-row .btn {
  height: 40px;
}
.help-box {
  padding: 10px 14px;
  border-radius: var(--radius);
  background: var(--bg-embed);
  font-size: 13px;
  color: var(--fg-muted);
}
.help-box dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 14px;
  margin: 0;
}
.help-box dt {
  font-weight: 600;
  color: var(--fg);
}
.help-box dd {
  margin: 0;
}
.help-box code {
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--bg-active);
  font-family: var(--font-mono);
  font-size: 12px;
}
.body-in {
  min-height: 320px;
  resize: none;
  overflow: hidden;
  font-size: 15px;
  line-height: 1.7;
}
.body-in::placeholder,
.title-in::placeholder,
.summary-in::placeholder {
  color: var(--fg-faint);
}
.advanced {
  margin-top: 8px;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: var(--bg-sidebar);
  font-size: 14px;
}
.advanced summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--fg-muted);
}
.advanced[open] summary {
  margin-bottom: 10px;
}
.row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  color: var(--fg-muted);
}
.row.check {
  display: flex;
  gap: 6px;
}
.url-in {
  display: flex;
  align-items: center;
  min-width: 0;
}
.prefix {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--fg-faint);
  margin-right: 6px;
}
.url-in .field {
  flex: 1;
  min-width: 120px;
}
.preview {
  background: var(--bg-main);
}
.preview-label {
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--fg-faint);
}
.article {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.article.serif {
  font-family: 'Noto Serif KR', 'Nanum Myeongjo', Georgia, serif;
}
.article.center {
  text-align: center;
}
.article.center :deep(.image),
.article.center :deep(.attach),
.article.center :deep(.missing) {
  align-self: center;
}
.cover {
  width: 100%;
  max-height: 260px;
  object-fit: cover;
  border-radius: var(--radius);
}
.page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 800;
  line-height: 1.25;
  color: var(--fg-strong);
  overflow-wrap: anywhere;
}
.page-title.placeholder {
  color: var(--fg-faint);
}
.summary {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: var(--bg-embed);
  color: var(--fg-muted);
  font-size: 14px;
  white-space: pre-wrap;
}
.muted,
.err {
  font-size: 14px;
  color: var(--fg-muted);
}
.err {
  color: var(--danger);
}

/* Wide enough: write and preview side by side */
@container (min-width: 860px) {
  .panes {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .panes .write {
    display: flex;
  }
  .panes .preview {
    display: block;
    border-left: 1px solid var(--border);
  }
  .pane-tabs {
    display: none;
  }
}

@media (max-width: 768px) {
  .write,
  .preview {
    padding: 12px 16px 40px;
  }
  .title-in {
    font-size: 22px;
  }
}
</style>
