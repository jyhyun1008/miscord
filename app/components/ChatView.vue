<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { Antenna, Clip, MisskeyChannel, Note, UserDetailed, UserList } from '~/types/misskey'

const props = defineProps<{ account: Account, channel: TimelineChannel }>()
const emit = defineEmits<{ addTag: [] }>()

const GROUP_MS = 5 * 60 * 1000

const ui = useUi()
const api = useApi(props.account)
const toast = useToast()
const { prefs, addTag } = usePrefs(props.account.key)
const mod = useModeration(props.account)
onMounted(mod.load)

const scroller = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const composer = ref<{ focus: () => void } | null>(null)
const stick = ref(true)
const unread = ref(0)

const replyTo = ref<Note | null>(null)
const quoteOf = ref<Note | null>(null)
const picker = ref<{ note: Note, anchor: HTMLElement } | null>(null)

const tl = useTimeline(props.account, props.channel, () => {
  if (stick.value) nextTick(toBottom)
  else unread.value++
})

// ---- channel title / topic ----
const extra = ref<{ channel?: MisskeyChannel, antenna?: Antenna, list?: UserList, user?: UserDetailed, clip?: Clip }>({})
const meta = computed(() => {
  const ch = props.channel
  switch (ch.kind) {
    case 'channel': {
      const c = extra.value.channel
      return { icon: 'tv', title: c?.name ?? prefs.value.channels.find(x => x.id === ch.id)?.name ?? '채널', topic: c?.description || 'Misskey 채널' }
    }
    case 'antenna': {
      const name = prefs.value.antennas.find(a => a.id === ch.id)?.name ?? extra.value.antenna?.name ?? '안테나'
      return { icon: 'antenna', title: name, topic: '안테나 타임라인' }
    }
    case 'clip': {
      const c = extra.value.clip
      return { icon: 'clip', title: c?.name ?? '클립', topic: c?.description || '클립에 모은 노트' }
    }
    case 'list': {
      const name = prefs.value.lists.find(l => l.id === ch.id)?.name ?? extra.value.list?.name ?? '리스트'
      return { icon: 'list', title: name, topic: '리스트 타임라인' }
    }
    case 'tag':
      return { icon: 'hash', title: ch.tag, topic: `#${ch.tag} 해시태그가 포함된 노트` }
    case 'user': {
      const u = extra.value.user
      return { icon: 'at', title: u ? displayName(u) : '유저', topic: u ? acct(u) : '' }
    }
    default: {
      const b = BUILTIN_CHANNELS.find(c => c.kind === ch.kind)!
      return { icon: 'hash', title: b.label, topic: b.topic }
    }
  }
})
const tagSaved = computed(() =>
  props.channel.kind === 'tag' && prefs.value.tags.some(t => t.toLowerCase() === (props.channel as { tag: string }).tag.toLowerCase()),
)

onMounted(async () => {
  const ch = props.channel
  try {
    if (ch.kind === 'channel') extra.value.channel = await api<MisskeyChannel>('channels/show', { channelId: ch.id })
    if (ch.kind === 'antenna' && !prefs.value.antennas.some(a => a.id === ch.id)) extra.value.antenna = await api<Antenna>('antennas/show', { antennaId: ch.id })
    if (ch.kind === 'clip') extra.value.clip = await api<Clip>('clips/show', { clipId: ch.id })
    if (ch.kind === 'list' && !prefs.value.lists.some(l => l.id === ch.id)) extra.value.list = await api<UserList>('users/lists/show', { listId: ch.id })
    if (ch.kind === 'user') extra.value.user = await api<UserDetailed>('users/show', { userId: ch.id })
  }
  catch {
    // header just falls back to a generic title
  }
})

// ---- message list with Discord-style grouping ----
const items = computed(() => {
  // Notes already on screen when someone gets muted/blocked; the server filters new ones.
  // A user's own channel still shows everything they wrote.
  const list = props.channel.kind === 'user' ? tl.notes.value : tl.notes.value.filter(n => !mod.hides(n))
  return list.map((note, i) => {
    const prev = list[i - 1]
    const divider = !prev || !sameDay(prev.createdAt, note.createdAt)
    const grouped = !!prev
      && !divider
      && !isPureRenote(prev)
      && !isPureRenote(note)
      && !note.reply
      && prev.userId === note.userId
      && new Date(note.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_MS
    return { note, divider, grouped }
  })
})

// ---- scrolling ----
function toBottom() {
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

async function loadOlderKeepingPosition() {
  const el = scroller.value
  if (!el || tl.loading.value || tl.done.value) return
  const fromBottom = el.scrollHeight - el.scrollTop
  await tl.loadOlder()
  await nextTick()
  el.scrollTop = el.scrollHeight - fromBottom
}

function onScroll() {
  if (!tl.ready.value) return
  const el = scroller.value!
  stick.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 200
  if (stick.value) unread.value = 0
  if (el.scrollTop < 400) loadOlderKeepingPosition()
}

function jumpToPresent() {
  unread.value = 0
  stick.value = true
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: 'smooth' })
}

// Keep pinned to the bottom when new notes arrive or images finish loading
let ro: ResizeObserver | null = null
onMounted(() => {
  ro = new ResizeObserver(() => {
    if (stick.value) toBottom()
  })
  if (inner.value) ro.observe(inner.value)
})
onBeforeUnmount(() => ro?.disconnect())

// After the first page(s): jump to the bottom, and keep fetching until the view is filled
watch(tl.ready, async (ready) => {
  if (!ready) return
  await nextTick()
  stick.value = true
  unread.value = 0
  toBottom()
})

watch(() => tl.notes.value.length, async () => {
  await nextTick()
  const el = scroller.value
  if (!el) return
  if (stick.value) toBottom()
  if (el.scrollHeight <= el.clientHeight + 400 && !tl.done.value && !tl.loading.value) loadOlderKeepingPosition()
})

// ---- note actions (provided to every NoteMessage) ----
// Reactions are applied optimistically; the stream echo is ignored by applyReaction
const me = props.account.user.id

async function react(note: Note, reaction: string) {
  const prev = note.myReaction ?? null
  try {
    if (prev) {
      tl.applyReaction(note.id, prev, -1, me)
      await api('notes/reactions/delete', { noteId: note.id })
    }
    tl.applyReaction(note.id, reaction, 1, me)
    await api('notes/reactions/create', { noteId: note.id, reaction })
  }
  catch (e) {
    // roll back to what the server most likely has
    if (note.myReaction) tl.applyReaction(note.id, note.myReaction, -1, me)
    if (prev) tl.applyReaction(note.id, prev, 1, me)
    toast.error(e)
  }
}

async function unreact(note: Note) {
  const prev = note.myReaction
  if (!prev) return
  tl.applyReaction(note.id, prev, -1, me)
  try {
    await api('notes/reactions/delete', { noteId: note.id })
  }
  catch (e) {
    tl.applyReaction(note.id, prev, 1, me)
    toast.error(e)
  }
}

provide(NOTE_ACTIONS, {
  reply(note) {
    quoteOf.value = null
    replyTo.value = note
    composer.value?.focus()
  },
  quote(note) {
    replyTo.value = null
    quoteOf.value = note
    composer.value?.focus()
  },
  async renote(note) {
    try {
      await api('notes/create', { renoteId: note.id, visibility: note.visibility === 'home' ? 'home' : prefs.value.defaultVisibility })
      toast.show('리노트했습니다')
    }
    catch (e) {
      toast.error(e)
    }
  },
  async toggleReaction(note, reaction) {
    if (note.myReaction === normalizeReaction(reaction)) await unreact(note)
    else await react(note, reaction)
  },
  pickReaction(note, anchor) {
    picker.value = { note, anchor }
  },
  async remove(note) {
    try {
      await api('notes/delete', { noteId: note.id })
      tl.remove(note.id)
    }
    catch (e) {
      toast.error(e)
    }
  },
})

function onPicked(reaction: string) {
  const p = picker.value
  picker.value = null
  if (p) react(p.note, reaction)
}

const live = computed(() => !!streamRequest(props.channel))

async function onPosted(note: Note) {
  replyTo.value = null
  quoteOf.value = null
  stick.value = true
  // Clips have no stream: posting here clips the new note and shows it right away
  if (props.channel.kind === 'clip') {
    try {
      await api('clips/add-note', { clipId: props.channel.id, noteId: note.id })
      tl.push(note)
    }
    catch (e) {
      toast.error(e)
    }
  }
}

function saveTag() {
  if (props.channel.kind === 'tag') {
    addTag(props.channel.tag)
    toast.show(`#${props.channel.tag} 채널을 추가했습니다`)
  }
}
</script>

<template>
  <div class="chat">
    <header class="head">
      <button class="icon-btn nav-btn" title="채널 목록" @click="ui.navOpen = true">
        <Icon name="menu" />
      </button>
      <Icon :name="meta.icon" :size="22" class="ch-icon" />
      <h1 class="title">{{ meta.title }}</h1>
      <span v-if="meta.topic" class="divider" />
      <span class="topic">{{ meta.topic }}</span>
      <span class="spacer" />
      <span v-if="live && tl.streamState.value !== 'open'" class="live off" title="실시간 연결 끊김 — 재연결 중">
        재연결 중…
      </span>
      <button v-if="props.channel.kind === 'tag' && !tagSaved" class="btn small" @click="saveTag">
        <Icon name="plus" :size="14" /> 채널로 추가
      </button>
      <button class="icon-btn" :class="{ on: ui.membersOpen }" title="멤버 목록" @click="ui.membersOpen = !ui.membersOpen">
        <Icon name="users" />
      </button>
    </header>

    <div ref="scroller" class="scroller" @scroll.passive="onScroll">
      <div ref="inner" class="inner">
        <div v-if="tl.done.value" class="welcome">
          <div class="welcome-icon"><Icon :name="meta.icon" :size="40" /></div>
          <h2>#{{ meta.title }}에 오신 것을 환영합니다!</h2>
          <p>이 채널의 시작이에요.</p>
        </div>
        <div v-else-if="tl.loading.value" class="loading">
          <div class="skeleton" v-for="i in 3" :key="i">
            <span class="sk-avatar" />
            <span class="sk-lines"><span /><span /></span>
          </div>
        </div>
        <div v-if="tl.error.value" class="error">
          <Icon name="warn" :size="18" /> {{ tl.error.value }}
          <button class="btn small" @click="loadOlderKeepingPosition">다시 시도</button>
        </div>

        <template v-for="item in items" :key="item.note.id">
          <div v-if="item.divider" class="date">
            <span>{{ formatDate(item.note.createdAt) }}</span>
          </div>
          <NoteMessage :note="item.note" :grouped="item.grouped" :account="props.account" />
        </template>

        <div class="tail" />
      </div>
    </div>

    <button v-if="unread > 0" class="unread" @click="jumpToPresent">
      새 노트 {{ unread }}개 <span>최신으로 이동 ↓</span>
    </button>

    <Composer
      ref="composer"
      :account="props.account"
      :channel="props.channel"
      :placeholder="`#${meta.title}에 메시지 보내기`"
      :reply-to="replyTo"
      :quote-of="quoteOf"
      @cancel="replyTo = null; quoteOf = null"
      @posted="onPosted"
    />

    <EmojiPicker
      v-if="picker"
      :account="props.account"
      :anchor="picker.anchor"
      @pick="onPicked"
      @close="picker = null"
    />
  </div>
</template>

<style scoped>
.chat {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.head {
  height: var(--header-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
  min-width: 0;
}
.nav-btn {
  display: none;
  margin-left: -8px;
}
.ch-icon {
  color: var(--fg-faint);
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--fg-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40%;
}
.divider {
  width: 1px;
  height: 24px;
  margin: 0 4px;
  background: var(--bg-active);
}
.topic {
  font-size: 14px;
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.spacer {
  flex: 1;
}
.live.off {
  font-size: 12px;
  color: var(--danger);
  white-space: nowrap;
}
.icon-btn.on {
  color: var(--fg-strong);
}
.btn.small {
  height: 28px;
  padding: 0 10px;
  font-size: 13px;
  white-space: nowrap;
}
.scroller {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}
.inner {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding-bottom: 8px;
}
.tail {
  /* + the composer's top padding keeps the old gap above the input */
  height: 4px;
  flex-shrink: 0;
}
.welcome {
  padding: 32px 16px 8px;
}
.welcome-icon {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--bg-input);
  color: var(--fg-strong);
}
.welcome h2 {
  margin: 8px 0;
  font-size: 28px;
  color: var(--fg-strong);
}
.welcome p {
  margin: 0;
  color: var(--fg-muted);
}
.loading {
  padding: 16px;
}
.skeleton {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  opacity: 0.6;
}
.sk-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-active);
}
.sk-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}
.sk-lines span {
  height: 12px;
  border-radius: 6px;
  background: var(--bg-active);
  width: 30%;
}
.sk-lines span + span {
  width: 70%;
}
.error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 16px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: rgba(236, 66, 69, 0.12);
  color: var(--danger);
  font-size: 14px;
}
.date {
  position: relative;
  display: flex;
  justify-content: center;
  margin: 24px 16px 8px;
  height: 0;
  border-top: 1px solid var(--bg-active);
}
.date span {
  position: relative;
  top: -9px;
  padding: 0 6px;
  background: var(--bg-main);
  font-size: 12px;
  font-weight: 600;
  color: var(--fg-faint);
  line-height: 18px;
}
.unread {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 84px;
  display: flex;
  justify-content: space-between;
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 14px;
  font-weight: 600;
  box-shadow: var(--shadow);
  z-index: 5;
}

@media (max-width: 768px) {
  .nav-btn {
    display: inline-flex;
  }
  .divider,
  .topic {
    display: none;
  }
  .title {
    max-width: none;
    flex: 1;
  }
}
</style>
