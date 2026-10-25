<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { UserDetailed } from '~/types/misskey'

const props = defineProps<{ account: Account }>()

const W = 340
const { state, close } = useProfilePopout()
const api = useApi(props.account)
const toast = useToast()
const { prefs, togglePin, groupOf, setUserGroup } = usePrefs(props.account.key)
const mod = useModeration(props.account)
const ui = useUi()

const MUTE_DURATIONS = [
  { label: '영구', ms: null },
  { label: '1시간', ms: 60 * 60 * 1000 },
  { label: '1일', ms: 24 * 60 * 60 * 1000 },
  { label: '7일', ms: 7 * 24 * 60 * 60 * 1000 },
]
const muteMenu = ref(false)
const actionsMenu = ref(false)
const actionsRoot = ref<HTMLElement | null>(null)
const actionsButton = ref<HTMLButtonElement | null>(null)

function closeActions() {
  actionsMenu.value = false
  muteMenu.value = false
}

function toggleActions() {
  if (actionsMenu.value) closeActions()
  else actionsMenu.value = true
}

const user = ref<UserDetailed | null>(null)
const error = ref('')
const busy = ref(false)
const root = ref<HTMLElement | null>(null)
const height = ref(420)

watch(() => state.value.target, async (t, _previous, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true })
  user.value = null
  error.value = ''
  closeActions()
  if (!t) return
  try {
    const result = await api<UserDetailed>('users/show', 'userId' in t ? { userId: t.userId } : { username: t.username, host: t.host })
    if (cancelled) return
    user.value = result
    mod.sync(result)
    await nextTick()
    height.value = root.value?.offsetHeight ?? height.value
  }
  catch (e) {
    if (cancelled) return
    error.value = e instanceof Error ? e.message : String(e)
  }
})

const style = computed(() => {
  const s = state.value
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (vw <= 768) return { left: '8px', right: '8px', bottom: '8px', width: 'auto' }
  const left = s.side === 'right' ? s.x : s.x - W
  return {
    left: `${Math.max(8, Math.min(left, vw - W - 8))}px`,
    top: `${Math.max(8, Math.min(s.y, vh - height.value - 8))}px`,
    width: `${W}px`,
  }
})

const isMe = computed(() => user.value?.id === props.account.user.id)
const isPinned = computed(() => !!user.value && prefs.value.pinnedUserIds.includes(user.value.id))
const isMutedUser = computed(() => !!user.value && mod.isMuted(user.value.id))
const isBlockedUser = computed(() => !!user.value && mod.isBlocked(user.value.id))
const group = computed(() => user.value && groupOf(user.value.id))
const emojis = computed(() => user.value?.emojis)
const remoteUrl = computed(() => user.value && `https://${props.account.host}/${acct(user.value)}`)

async function toggleFollow() {
  const u = user.value
  if (!u) return
  busy.value = true
  try {
    await api(u.isFollowing ? 'following/delete' : 'following/create', { userId: u.id })
    u.isFollowing = !u.isFollowing
    resetFollowing(props.account.key)
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    busy.value = false
    closeActions()
  }
}

function toggleGroup(groupId: string) {
  const u = user.value
  if (u) setUserGroup(u.id, group.value?.id === groupId ? null : groupId)
}

function openGroups() {
  close()
  ui.groupsOpen = true
}

async function moderate(fn: () => Promise<boolean>, done: string) {
  busy.value = true
  try {
    if (await fn()) toast.show(done)
  }
  finally {
    busy.value = false
    closeActions()
  }
}

function doMute(ms: number | null) {
  const u = user.value!
  moderate(() => mod.mute(u.id, ms), `${acct(u)}님을 뮤트했어요`)
}
function doUnmute() {
  const u = user.value!
  moderate(() => mod.unmute(u.id), `${acct(u)}님의 뮤트를 해제했어요`)
}
function doBlock() {
  const u = user.value!
  if (!confirm(`${acct(u)}님을 차단할까요?\n서로의 팔로우가 해제되고, 상대는 나를 팔로우하거나 내 노트에 반응할 수 없어요.`)) return
  moderate(async () => {
    const ok = await mod.block(u.id)
    if (ok) u.isFollowing = u.isFollowed = false
    return ok
  }, `${acct(u)}님을 차단했어요`)
}
function doUnblock() {
  const u = user.value!
  moderate(() => mod.unblock(u.id), `${acct(u)}님의 차단을 해제했어요`)
}

function viewNotes() {
  const u = user.value
  if (!u) return
  close()
  navigateTo(channelPath(props.account.key, { kind: 'user', id: u.id }))
}

function onDocDown(e: MouseEvent) {
  if (actionsMenu.value && !actionsRoot.value?.contains(e.target as Node)) closeActions()
  if (state.value.target && root.value && !root.value.contains(e.target as Node)) close()
}
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (actionsMenu.value) {
    closeActions()
    actionsButton.value?.focus()
  }
  else close()
}
onMounted(() => {
  document.addEventListener('mousedown', onDocDown, true)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDown, true)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="state.target" ref="root" class="popout" :style="style" @mousedown.stop>
      <div v-if="error" class="pad err">{{ error }}</div>
      <div v-else-if="!user" class="pad muted">불러오는 중…</div>
      <template v-else>
        <div class="banner" :style="safeHttpUrl(user.bannerUrl) ? { backgroundImage: `url(${JSON.stringify(safeHttpUrl(user.bannerUrl))})` } : {}" />
        <UserAvatar class="avatar" :user="user" />
        <div class="actions">
          <button class="icon-btn" :class="{ on: isPinned }" :title="isPinned ? '고정 해제' : '멤버 목록에 고정'" @click="togglePin(user.id)">
            <Icon name="pin" :size="18" />
          </button>
          <a v-if="remoteUrl" class="icon-btn" :href="remoteUrl" target="_blank" rel="noopener noreferrer" title="Misskey에서 열기">
            <Icon name="external" :size="18" />
          </a>
        </div>
        <div class="card">
          <MfmText class="name" :style="group ? { color: group.color } : undefined" :text="displayName(user)" :emojis="emojis" plain />
          <div class="acct">
            {{ acct(user) }}
            <span v-if="user.isFollowed" class="badge">나를 팔로우함</span>
            <span v-if="isMutedUser" class="badge">뮤트됨</span>
            <span v-if="isBlockedUser" class="badge warn">차단됨</span>
          </div>

          <div v-if="user.description" class="section">
            <h4>소개</h4>
            <MfmText class="desc" :text="user.description" :emojis="emojis" />
          </div>

          <dl v-if="user.fields?.length" class="fields">
            <template v-for="f in user.fields" :key="f.name">
              <dt><MfmText :text="f.name" :emojis="emojis" plain /></dt>
              <dd><MfmText :text="f.value" :emojis="emojis" /></dd>
            </template>
          </dl>

          <div class="stats">
            <span><b>{{ user.notesCount.toLocaleString() }}</b> 노트</span>
            <span><b>{{ user.followingCount.toLocaleString() }}</b> 팔로잉</span>
            <span><b>{{ user.followersCount.toLocaleString() }}</b> 팔로워</span>
          </div>

          <div class="section">
            <h4>가입일</h4>
            <span class="since">{{ formatDate(user.createdAt) }}</span>
          </div>

          <div class="section">
            <h4>분류</h4>
            <div class="groups">
              <button
                v-for="g in prefs.groups"
                :key="g.id"
                class="gchip"
                :class="{ on: group?.id === g.id }"
                :style="{ '--c': g.color }"
                @click="toggleGroup(g.id)"
              >
                <span class="dot" />{{ g.name }}
              </button>
              <button class="gchip add" @click="openGroups">
                <Icon :name="prefs.groups.length ? 'settings' : 'plus'" :size="12" />
                {{ prefs.groups.length ? '관리' : '분류 만들기' }}
              </button>
            </div>
          </div>

          <div class="buttons">
            <button class="btn" @click="viewNotes">노트 보기</button>
            <div v-if="!isMe" ref="actionsRoot" class="more-actions" @focusout="!actionsRoot?.contains($event.relatedTarget as Node) && closeActions()">
              <button
                ref="actionsButton"
                class="icon-btn more-button"
                title="더보기"
                aria-label="프로필 더보기"
                :aria-expanded="actionsMenu"
                @click="toggleActions"
              >
                <Icon name="more" :size="20" />
              </button>
              <div v-if="actionsMenu" class="actions-menu" aria-label="프로필 작업">
                <template v-if="muteMenu">
                  <span class="mod-label">뮤트 기간</span>
                  <button v-for="d in MUTE_DURATIONS" :key="d.label" class="menu-item" :disabled="busy" @click="doMute(d.ms)">{{ d.label }}</button>
                  <button class="menu-item" :disabled="busy" @click="muteMenu = false">뒤로</button>
                </template>
                <template v-else>
                  <button v-if="!isBlockedUser" class="menu-item" :disabled="busy" @click="toggleFollow">
                    <Icon name="user" :size="16" /> {{ user.isFollowing ? '언팔로우' : '팔로우' }}
                  </button>
                  <button class="menu-item" :disabled="busy" @click="isMutedUser ? doUnmute() : (muteMenu = true)">
                    <Icon name="mute" :size="16" /> {{ isMutedUser ? '뮤트 해제' : '뮤트' }}
                  </button>
                  <button class="menu-item danger" :disabled="busy" @click="isBlockedUser ? doUnblock() : doBlock()">
                    <Icon name="block" :size="16" /> {{ isBlockedUser ? '차단 해제' : '차단' }}
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.popout {
  position: fixed;
  z-index: 70;
  max-height: calc(100dvh - 16px);
  overflow-y: auto;
  border-radius: 8px;
  background: var(--bg-sidebar);
  box-shadow: var(--shadow), 0 0 0 1px var(--border);
}
.pad {
  padding: 24px;
}
.muted {
  color: var(--fg-muted);
}
.err {
  color: var(--danger);
}
.banner {
  height: 100px;
  background: var(--accent) center / cover no-repeat;
}
.avatar {
  position: absolute;
  top: 56px;
  left: 16px;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 6px solid var(--bg-sidebar);
  object-fit: cover;
  background: var(--bg-sidebar);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 8px 8px 0;
  min-height: 44px;
}
.actions .on {
  color: var(--accent);
}
.card {
  margin: 0 16px 16px;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-rail);
}
:root[data-theme='light'] .card {
  background: var(--bg-main);
}
.name {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--fg-strong);
}
.acct {
  font-size: 14px;
  color: var(--fg-muted);
  word-break: break-all;
}
.badge {
  display: inline-block;
  margin-left: 4px;
  padding: 0 6px;
  border-radius: 3px;
  background: var(--bg-active);
  font-size: 11px;
}
.section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
h4 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--fg-strong);
}
.desc {
  display: block;
  font-size: 14px;
  max-height: 160px;
  overflow-y: auto;
}
.fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 12px 0 0;
  font-size: 13px;
}
.fields dt {
  color: var(--fg-muted);
  font-weight: 600;
}
.fields dd {
  margin: 0;
  min-width: 0;
}
.stats {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--fg-muted);
}
.stats b {
  color: var(--fg-strong);
}
.since {
  font-size: 14px;
}
.buttons {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.buttons .btn {
  flex: 1;
}
.badge.warn {
  background: var(--danger);
  color: #fff;
}
.groups {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gchip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  background: var(--bg-active);
  font-size: 12px;
  font-weight: 500;
  color: var(--fg);
}
.gchip .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--c);
}
.gchip:hover {
  box-shadow: inset 0 0 0 1px var(--c, var(--fg-faint));
}
.gchip.on {
  box-shadow: inset 0 0 0 2px var(--c);
  color: var(--fg-strong);
  font-weight: 700;
}
.gchip.add {
  background: transparent;
  color: var(--fg-muted);
  box-shadow: inset 0 0 0 1px var(--border);
}
.more-actions {
  position: relative;
  flex-shrink: 0;
}
.more-button {
  height: 100%;
  min-width: 36px;
  background: var(--bg-active);
}
.actions-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 1;
  min-width: 160px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-sidebar);
  box-shadow: var(--shadow);
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 6px 10px;
  border-radius: 4px;
  text-align: left;
  font-size: 13px;
  color: var(--fg);
}
.menu-item:hover,
.menu-item:focus-visible {
  background: var(--bg-hover);
}
.menu-item.danger {
  color: var(--danger);
}
.menu-item.danger:hover,
.menu-item.danger:focus-visible {
  background: var(--danger);
  color: #fff;
}
.menu-item:disabled {
  opacity: 0.5;
  pointer-events: none;
}
.mod-label {
  display: block;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--fg-muted);
}
</style>
