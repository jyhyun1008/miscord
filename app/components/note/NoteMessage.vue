<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { Note } from '~/types/misskey'

const props = defineProps<{ note: Note, grouped: boolean, account: Account }>()

const actions = useNoteActions()
const profile = useProfilePopout()
const toast = useToast()
const { groupOf } = usePrefs(props.account.key)
const mod = useModeration(props.account)
const menuOpen = ref(false)
const clipMenu = ref(false)
watch(menuOpen, (open) => {
  clipMenu.value = false
  actions.setMenuOpen(open)
})
onBeforeUnmount(() => {
  if (menuOpen.value) actions.setMenuOpen(false)
})

// Open the menu upward when there isn't room below it inside the timeline
const menuEl = ref<HTMLElement | null>(null)
const menuUp = ref(false)
watch([menuOpen, clipMenu], async () => {
  await nextTick()
  const menu = menuEl.value
  const toolbar = menu?.parentElement
  if (!menu || !toolbar) return
  const bounds = (toolbar.closest('.scroller') ?? document.documentElement).getBoundingClientRect()
  const bar = toolbar.getBoundingClientRect()
  const below = Math.min(bounds.bottom, window.innerHeight) - bar.bottom
  const above = bar.top - Math.max(bounds.top, 0)
  const need = menu.offsetHeight + 4
  menuUp.value = below < need && above > below
})

const renoter = computed(() => (isPureRenote(props.note) ? props.note.user : null))
const n = computed(() => appearNote(props.note))
const canRenote = computed(() => n.value.visibility === 'public' || n.value.visibility === 'home')
const isMine = computed(() => n.value.userId === props.account.user.id)
const mentionsMe = computed(() =>
  !isMine.value && (n.value.mentions?.includes(props.account.user.id) || n.value.reply?.userId === props.account.user.id),
)
const visibilityIcon = computed(() => ({ public: '', home: 'home', followers: 'lock', specified: 'at' })[n.value.visibility])
const detailUrl = computed(() => `https://${props.account.host}/notes/${n.value.id}`)
// Only remote notes have a separate original on another server
const originalUrl = computed(() => (n.value.user.host ? safeHttpUrl(n.value.url) ?? safeHttpUrl(n.value.uri) : null))

const nameColor = (userId: string) => {
  const c = groupOf(userId)?.color
  return c ? { color: c } : undefined
}

function openProfile(e: Event, userId: string) {
  profile.open({ userId }, e.currentTarget as HTMLElement)
}

function snippet(note: Note) {
  if (note.cw != null) return `⚠ ${note.cw}`
  if (note.text) return note.text.replace(/\s+/g, ' ').slice(0, 120)
  if (note.files.length) return '🖼 첨부 파일'
  return '…'
}

async function copyLink() {
  menuOpen.value = false
  await navigator.clipboard?.writeText(detailUrl.value)
}

async function copyText() {
  menuOpen.value = false
  try {
    await navigator.clipboard.writeText(n.value.text ?? '')
    toast.show('노트 내용을 복사했어요')
  }
  catch (e) {
    toast.error(e)
  }
}

async function onMute() {
  menuOpen.value = false
  const u = n.value.user
  if (await mod.mute(u.id)) toast.show(`${acct(u)}님을 뮤트했어요 — 프로필에서 해제할 수 있어요`)
}

async function onBlock() {
  menuOpen.value = false
  const u = n.value.user
  if (!confirm(`${acct(u)}님을 차단할까요?\n서로의 팔로우가 해제돼요.`)) return
  if (await mod.block(u.id)) toast.show(`${acct(u)}님을 차단했어요`)
}

function onDelete() {
  menuOpen.value = false
  if (confirm('이 노트를 삭제할까요?')) actions.remove(n.value)
}

function onRedraft() {
  menuOpen.value = false
  if (confirm('이 노트를 삭제하고 다시 편집할까요?\n받은 반응과 리노트는 사라져요.')) actions.redraft(n.value)
}

function onToggleRenote() {
  menuOpen.value = false
  actions.toggleRenote(n.value)
}

// Look up whether we've renoted it before the pill, toolbar or menu needs to show it
function onHover() {
  if (canRenote.value) actions.checkRenoted(n.value).catch(() => {})
}
</script>

<template>
  <article
    class="msg"
    :data-note-id="n.id"
    :class="{ grouped: props.grouped && !renoter, mention: mentionsMe, 'menu-open': menuOpen }"
    @mouseenter="onHover"
    @mouseleave="menuOpen = false"
  >
    <!-- Renote system line -->
    <div v-if="renoter" class="sys">
      <Icon name="renote" :size="16" class="sys-icon" />
      <UserAvatar class="sys-avatar" :user="renoter" @click="openProfile($event, renoter.id)" />
      <button class="sys-name" :style="nameColor(renoter.id)" @click="openProfile($event, renoter.id)">
        <MfmText :text="displayName(renoter)" :emojis="renoter.emojis" plain />
      </button>
      <span>님이 리노트했습니다</span>
      <time class="stamp" :title="formatFull(props.note.createdAt)">{{ formatStamp(props.note.createdAt) }}</time>
    </div>

    <!-- Reply reference -->
    <div v-if="n.reply" class="replyref" title="원노트로 이동" @click="actions.jumpTo(n.reply.id)">
      <span class="spine" />
      <UserAvatar class="reply-avatar" :user="n.reply.user" @click.stop="openProfile($event, n.reply.user.id)" />
      <button class="rname" :style="nameColor(n.reply.user.id)" @click.stop="openProfile($event, n.reply.user.id)">
        <MfmText :text="displayName(n.reply.user)" :emojis="n.reply.user.emojis" plain />
      </button>
      <span class="rtext">{{ snippet(n.reply) }}</span>
    </div>

    <div class="row">
      <div class="gutter">
        <UserAvatar
          v-if="!props.grouped || renoter"
          class="avatar"
          :user="n.user"
          @click="openProfile($event, n.user.id)"
        />
        <time v-else class="hover-time" :title="formatFull(n.createdAt)">{{ formatTime(n.createdAt) }}</time>
      </div>

      <div class="content">
        <header v-if="!props.grouped || renoter" class="head">
          <button class="name" :style="nameColor(n.user.id)" @click="openProfile($event, n.user.id)">
            <MfmText :text="displayName(n.user)" :emojis="n.user.emojis" plain />
          </button>
          <span v-if="n.user.isBot" class="tag">BOT</span>
          <span v-if="n.user.host" class="acct">{{ acct(n.user) }}</span>
          <time class="stamp" :title="formatFull(n.createdAt)">{{ formatStamp(n.createdAt) }}</time>
          <Icon v-if="visibilityIcon" :name="visibilityIcon" :size="12" class="vis" />
        </header>

        <NoteBody :note="n" />

        <NoteReactions
          :note="n"
          :host="props.account.host"
          :can-renote="canRenote"
          @renote="actions.toggleRenote(n)"
          @toggle="actions.toggleReaction(n, $event)"
          @add="actions.pickReaction(n, $event)"
        />
      </div>
    </div>

    <!-- Hover toolbar -->
    <div class="toolbar">
      <button title="반응 추가" @click="actions.pickReaction(n, $event.currentTarget as HTMLElement)">
        <Icon name="smile" :size="18" />
      </button>
      <button title="답장" @click="actions.reply(n)">
        <Icon name="reply" :size="18" />
      </button>
      <button
        v-if="canRenote"
        :class="{ on: n.myRenoted }"
        :title="n.myRenoted ? '리노트 취소' : '리노트'"
        @click="actions.toggleRenote(n)"
      >
        <Icon name="renote" :size="18" />
      </button>
      <button title="인용" @click="actions.quote(n)">
        <Icon name="quote" :size="16" />
      </button>
      <button title="더 보기" @click="menuOpen = !menuOpen">
        <Icon name="more" :size="18" />
      </button>

      <div v-if="menuOpen && clipMenu" ref="menuEl" class="menu" :class="{ up: menuUp }">
        <NoteClipMenu :account="props.account" :note="n" @back="clipMenu = false" />
      </div>
      <div v-else-if="menuOpen" ref="menuEl" class="menu" :class="{ up: menuUp }">
        <button @click="clipMenu = true">
          <span>클립에 추가</span><Icon name="clip" :size="16" />
        </button>
        <button v-if="n.text" @click="copyText">
          <span>내용 복사</span><Icon name="copy" :size="16" />
        </button>
        <button @click="copyLink">
          <span>링크 복사</span><Icon name="link" :size="16" />
        </button>
        <a :href="detailUrl" target="_blank" rel="noopener noreferrer" @click="menuOpen = false">
          <span>노트 상세보기</span><Icon name="external" :size="16" />
        </a>
        <a v-if="originalUrl" :href="originalUrl" target="_blank" rel="noopener noreferrer" @click="menuOpen = false">
          <span>원문 열기</span><Icon name="global" :size="16" />
        </a>
        <template v-if="!isMine">
          <button @click="onMute">
            <span>유저 뮤트</span><Icon name="mute" :size="16" />
          </button>
          <button class="danger" @click="onBlock">
            <span>유저 차단</span><Icon name="block" :size="16" />
          </button>
        </template>
        <button v-if="canRenote && n.myRenoted" class="danger" @click="onToggleRenote">
          <span>리노트 취소</span><Icon name="trash" :size="16" />
        </button>
        <button v-else-if="canRenote" @click="onToggleRenote">
          <span>리노트</span><Icon name="renote" :size="16" />
        </button>
        <button v-if="isMine && n.visibility !== 'specified'" class="danger" @click="onRedraft">
          <span>삭제 후 편집</span><Icon name="edit" :size="16" />
        </button>
        <button v-if="isMine" class="danger" @click="onDelete">
          <span>노트 삭제</span><Icon name="trash" :size="16" />
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.msg {
  position: relative;
  padding: 2px 48px 2px 16px;
  margin-top: 16px;
}
.msg.grouped {
  margin-top: 0;
}
.msg:hover,
.msg.menu-open {
  background: var(--bg-hover);
}
.msg.flash {
  animation: flash 1.6s ease-out;
}
@keyframes flash {
  0%, 30% {
    background: var(--mention-bg);
    box-shadow: inset 2px 0 0 var(--accent);
  }
}
.msg.mention {
  background: var(--mention-bg);
  box-shadow: inset 2px 0 0 var(--accent);
}
.row {
  display: flex;
  gap: 16px;
}
.gutter {
  width: 40px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}
.avatar {
  width: 40px;
  height: 40px;
  margin-top: 2px;
  border-radius: 50%;
  object-fit: cover;
  cursor: pointer;
  background: var(--bg-active);
}
.avatar:active {
  transform: translateY(1px);
}
.hover-time {
  visibility: hidden;
  font-size: 11px;
  line-height: 22px;
  color: var(--fg-faint);
  white-space: nowrap;
}
.msg:hover .hover-time {
  visibility: visible;
}
.content {
  flex: 1;
  min-width: 0;
}
.head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  line-height: 22px;
}
.name {
  font-weight: 600;
  color: var(--fg-strong);
  white-space: nowrap;
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.name:hover {
  text-decoration: underline;
}
.name :deep(.mfm),
.sys-name :deep(.mfm),
.rname :deep(.mfm) {
  white-space: nowrap;
}
.tag {
  padding: 0 4px;
  border-radius: 3px;
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 10px;
  font-weight: 700;
  line-height: 15px;
  align-self: center;
}
.acct {
  font-size: 12px;
  color: var(--fg-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.stamp {
  font-size: 12px;
  color: var(--fg-faint);
  white-space: nowrap;
}
.vis {
  color: var(--fg-faint);
  align-self: center;
}

.sys {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  padding-left: 12px;
  font-size: 14px;
  color: var(--fg-muted);
  min-width: 0;
}
.sys-icon {
  color: var(--accent);
  margin-right: 10px;
}
.sys-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
  cursor: pointer;
}
.sys-name {
  font-weight: 600;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40%;
}
.sys-name:hover {
  text-decoration: underline;
}

.replyref {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 56px;
  margin-bottom: 2px;
  font-size: 13px;
  color: var(--fg-muted);
  min-width: 0;
  cursor: pointer;
}
.replyref:hover .rtext {
  color: var(--fg);
}
.spine {
  position: absolute;
  left: -36px;
  top: 50%;
  width: 32px;
  height: 12px;
  border-left: 2px solid var(--fg-faint);
  border-top: 2px solid var(--fg-faint);
  border-top-left-radius: 6px;
  opacity: 0.6;
}
.reply-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  object-fit: cover;
  cursor: pointer;
}
.rname {
  font-weight: 600;
  color: var(--fg);
  white-space: nowrap;
  opacity: 0.85;
}
.rname:hover {
  text-decoration: underline;
}
.rtext {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.toolbar {
  position: absolute;
  right: 16px;
  top: -16px;
  display: none;
  align-items: center;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-main);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  z-index: 2;
}
.msg:hover .toolbar,
.msg.menu-open .toolbar,
.toolbar:focus-within {
  display: flex;
}
.toolbar > button {
  width: 32px;
  height: 30px;
  display: grid;
  place-items: center;
  color: var(--fg-muted);
}
.toolbar > button:hover {
  color: var(--fg);
  background: var(--bg-hover);
}
.toolbar > button.on {
  color: var(--accent);
}
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  min-width: 180px;
  padding: 6px;
  border-radius: 6px;
  background: var(--bg-float);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
}
.menu.up {
  top: auto;
  bottom: calc(100% + 4px);
}
.menu > * {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 8px;
  border-radius: 3px;
  color: var(--fg);
  font-size: 14px;
  text-decoration: none;
}
.menu > *:hover {
  background: var(--accent);
  color: var(--accent-fg);
  text-decoration: none;
}
.menu .danger {
  color: var(--danger);
}
.menu .danger:hover {
  background: var(--danger);
  color: #fff;
}

@media (max-width: 768px) {
  .msg {
    padding-right: 12px;
  }
}
</style>
