<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { MisskeyNotification, Note } from '~/types/misskey'

const props = defineProps<{ account: Account }>()

const PAGE = 30
const MENTION_TYPES = ['mention', 'reply', 'quote']

const api = useApi(props.account)
const toast = useToast()
const profile = useProfilePopout()
const { unread, onNotification } = useNotifications(props.account)
const emojiStore = useEmojis(props.account)

const filter = ref<'all' | 'mentions'>('all')
const items = ref<MisskeyNotification[]>([])
const loading = ref(false)
const done = ref(false)
const error = ref('')
// Logins from before notifications were added lack `read:notifications`
const denied = ref(false)
// Follow requests already answered here: userId -> result
const answered = ref<Record<string, 'accepted' | 'rejected'>>({})

async function load(reset = false) {
  if (loading.value || (done.value && !reset)) return
  loading.value = true
  error.value = ''
  try {
    const untilId = reset ? undefined : items.value.at(-1)?.id
    const page = await api<MisskeyNotification[]>('i/notifications', {
      limit: PAGE,
      ...(untilId ? { untilId } : {}),
      ...(filter.value === 'mentions' ? { includeTypes: MENTION_TYPES } : {}),
    })
    items.value = reset ? page : [...items.value, ...page.filter(n => !items.value.some(m => m.id === n.id))]
    done.value = page.length < PAGE
    // i/notifications marks everything read on the server; mirror that right away
    unread.value = 0
  }
  catch (e) {
    denied.value = e instanceof MisskeyApiError && e.code === 'PERMISSION_DENIED'
    error.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    loading.value = false
  }
}

watch(filter, () => {
  done.value = false
  load(true)
})

let stopLive: (() => void) | null = null
onMounted(() => {
  load(true)
  stopLive = onNotification((n) => {
    if (filter.value === 'mentions' && !MENTION_TYPES.includes(n.type)) return
    if (!items.value.some(m => m.id === n.id)) items.value = [n, ...items.value]
    // Seen as it arrives, so don't leave a badge behind
    unread.value = 0
    api('notifications/mark-all-as-read').catch(() => {})
  })
})
onBeforeUnmount(() => stopLive?.())

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) load()
}

const ACTIONS: Record<string, { icon: string, text: string }> = {
  follow: { icon: 'user-plus', text: '님이 팔로우했어요' },
  receiveFollowRequest: { icon: 'user-plus', text: '님이 팔로우를 요청했어요' },
  followRequestAccepted: { icon: 'check', text: '님이 팔로우 요청을 수락했어요' },
  mention: { icon: 'at', text: '님이 멘션했어요' },
  reply: { icon: 'reply', text: '님이 답글을 남겼어요' },
  renote: { icon: 'renote', text: '님이 리노트했어요' },
  quote: { icon: 'quote', text: '님이 인용했어요' },
  reaction: { icon: 'smile', text: '님이 반응했어요' },
  pollEnded: { icon: 'poll', text: '님의 투표가 끝났어요' },
  note: { icon: 'bell', text: '님이 새 노트를 올렸어요' },
}

function describe(n: MisskeyNotification): { icon: string, text: string } {
  if (ACTIONS[n.type]) return ACTIONS[n.type]!
  switch (n.type) {
    case 'achievementEarned':
      return { icon: 'star', text: `업적을 달성했어요${n.achievement ? ` · ${n.achievement}` : ''}` }
    case 'roleAssigned':
      return { icon: 'star', text: `역할이 부여됐어요${n.role ? ` · ${n.role.name}` : ''}` }
    case 'login':
      return { icon: 'lock', text: '계정에 새 로그인이 있었어요' }
    case 'createToken':
      return { icon: 'lock', text: '새 액세스 토큰이 만들어졌어요' }
    case 'exportCompleted':
      return { icon: 'check', text: '내보내기가 끝났어요' }
    case 'test':
      return { icon: 'bell', text: '테스트 알림이에요' }
    case 'app':
      return { icon: 'bell', text: n.header ?? '앱 알림' }
    default:
      return { icon: 'bell', text: n.type }
  }
}

/** Notifications whose note is someone else's post shown in full; the rest quote my note in one line. */
function showsFullNote(n: MisskeyNotification) {
  return ['mention', 'reply', 'quote', 'note'].includes(n.type)
}

/** For a renote the notification's note is the renote itself; the one worth previewing is mine. */
function targetNote(n: MisskeyNotification): Note | null {
  if (!n.note) return null
  return n.type === 'renote' ? (n.note.renote ?? n.note) : n.note
}

function snippet(note: Note) {
  return note.cw ?? note.text ?? (note.files.length ? `파일 ${note.files.length}개` : '')
}

function noteUrl(note: Note) {
  return `https://${props.account.host}/notes/${note.id}`
}

function reaction(n: MisskeyNotification) {
  return n.reaction && n.note ? reactionInfo(n.reaction, n.note, props.account.host, emojiStore.byName.value) : null
}

async function answer(n: MisskeyNotification, accept: boolean) {
  if (!n.user) return
  try {
    await api(accept ? 'following/requests/accept' : 'following/requests/reject', { userId: n.user.id })
    answered.value[n.user.id] = accept ? 'accepted' : 'rejected'
  }
  catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div class="notifs">
    <ViewHeader icon="bell" title="알림" topic="멘션·답글·반응·팔로우 소식" />

    <div class="scroll" @scroll.passive="onScroll">
      <nav class="tabs filter" role="tablist">
        <button class="tab" role="tab" :aria-selected="filter === 'all'" :class="{ on: filter === 'all' }" @click="filter = 'all'">전체</button>
        <button class="tab" role="tab" :aria-selected="filter === 'mentions'" :class="{ on: filter === 'mentions' }" @click="filter = 'mentions'">멘션</button>
      </nav>

      <ReloginHint v-if="denied" class="pad" :host="props.account.host">알림을 보려면</ReloginHint>
      <p v-else-if="error && !items.length" class="err">{{ error }} <button @click="load(true)">다시 시도</button></p>
      <EmptyState v-else-if="!loading && !items.length" icon="bell">{{ filter === 'mentions' ? '아직 멘션이 없어요.' : '아직 알림이 없어요.' }}</EmptyState>

      <article v-for="n in items" :key="n.id" class="item">
        <div class="avatar-wrap">
          <UserAvatar
            v-if="n.user"
            class="avatar"
            :user="n.user"
            @click="profile.open({ userId: n.user!.id }, $event.currentTarget as HTMLElement)"
          />
          <span v-else class="avatar sys"><Icon :name="describe(n).icon" :size="20" /></span>
          <span v-if="n.user" class="badge" :class="n.type">
            <template v-if="n.type === 'reaction' && reaction(n)">
              <img v-if="reaction(n)!.url" :src="reaction(n)!.url!" :alt="reaction(n)!.label" referrerpolicy="no-referrer">
              <span v-else-if="reaction(n)!.label.startsWith(':')" class="badge-text">?</span>
              <UnicodeEmoji v-else :emoji="reaction(n)!.label" />
            </template>
            <Icon v-else :name="describe(n).icon" :size="12" />
          </span>
        </div>

        <div class="main">
          <div class="line">
            <MfmText v-if="n.user" class="who" :text="displayName(n.user)" :emojis="n.user.emojis" plain />
            <span class="what">{{ describe(n).text }}</span>
            <time class="stamp" :title="formatFull(n.createdAt)">{{ formatStamp(n.createdAt) }}</time>
          </div>

          <p v-if="n.type === 'app' && n.body" class="app-body">{{ n.body }}</p>

          <a
            v-if="n.note?.reply && showsFullNote(n)"
            class="quote-line reply-to"
            :href="noteUrl(n.note.reply)"
            target="_blank"
            rel="noopener noreferrer"
            title="원노트 열기"
          >
            <Icon name="reply" :size="12" />
            <MfmText class="reply-name" :text="displayName(n.note.reply.user)" :emojis="n.note.reply.user.emojis" plain />
            <MfmText :text="snippet(n.note.reply)" :emojis="n.note.reply.emojis" plain />
          </a>
          <NoteBody v-if="n.note && showsFullNote(n)" class="full" :note="n.note" />
          <a
            v-else-if="targetNote(n)"
            class="quote-line"
            :href="noteUrl(targetNote(n)!)"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MfmText :text="snippet(targetNote(n)!)" :emojis="targetNote(n)!.emojis" plain />
          </a>

          <div v-if="n.type === 'receiveFollowRequest' && n.user" class="actions">
            <span v-if="answered[n.user.id]" class="muted small">
              {{ answered[n.user.id] === 'accepted' ? '수락했어요' : '거절했어요' }}
            </span>
            <template v-else>
              <button class="btn small" @click="answer(n, true)">수락</button>
              <button class="btn small ghost" @click="answer(n, false)">거절</button>
            </template>
          </div>
        </div>
      </article>

      <p v-if="loading" class="muted center">불러오는 중…</p>
      <p v-else-if="error && items.length" class="err center">{{ error }} <button @click="load()">다시 시도</button></p>
    </div>
  </div>
</template>

<style scoped>
.notifs {
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
  padding: 8px 0 16px;
}
/* Same tab row as the page gallery */
.filter {
  margin: 4px 16px 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.item {
  display: flex;
  gap: 12px;
  padding: 10px 16px;
  min-width: 0;
}
.item:hover {
  background: var(--bg-hover);
}
.avatar-wrap {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
}
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
}
.avatar.sys {
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
  cursor: default;
}
.badge {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--bg-main);
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 12px;
}
.badge.reaction {
  background: var(--bg-main);
  font-size: 13px;
}
.badge img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.badge.follow,
.badge.receiveFollowRequest,
.badge.followRequestAccepted {
  background: #3ba55d;
  color: #fff;
}
.badge.renote {
  background: #3ba55d;
  color: #fff;
}
.badge-text {
  color: var(--fg-muted);
}
.main {
  flex: 1;
  min-width: 0;
}
.line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  column-gap: 2px;
  row-gap: 0;
  min-width: 0;
}
.who {
  font-weight: 600;
  color: var(--fg-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}
.what {
  color: var(--fg-muted);
}
.stamp {
  margin-left: 8px;
  font-size: 12px;
  color: var(--fg-faint);
}
.app-body {
  margin: 2px 0 0;
  color: var(--fg);
}
.full {
  display: block;
  margin-top: 2px;
}
.quote-line {
  display: block;
  margin-top: 4px;
  padding: 2px 0 2px 10px;
  border-left: 3px solid var(--bg-active);
  color: var(--fg-muted);
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quote-line :deep(.mfm) {
  white-space: nowrap;
}
.reply-to {
  margin: 2px 0 4px;
}
.reply-to .reply-name {
  margin: 0 4px 0 2px;
  font-weight: 600;
}
.quote-line:hover {
  color: var(--fg);
  text-decoration: none;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
.muted,
.err {
  padding: 0 16px;
  font-size: 14px;
  color: var(--fg-muted);
}
.muted.small {
  padding: 0;
  font-size: 13px;
}
.err {
  color: var(--danger);
}
.err button {
  text-decoration: underline;
}
.center {
  text-align: center;
}
.pad {
  padding: 8px 16px;
}
</style>
