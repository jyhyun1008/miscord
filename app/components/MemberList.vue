<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { Following, UserDetailed } from '~/types/misskey'

const props = defineProps<{ account: Account }>()

const PAGE = 100

const api = useApi(props.account)
const profile = useProfilePopout()
const { prefs, togglePin, toggleCollapsed, groupOf } = usePrefs(props.account.key)
const mod = useModeration(props.account)
const ui = useUi()

const following = useState<UserDetailed[]>(`following:${props.account.key}`, () => [])
const cursor = useState<string | null>(`following-cursor:${props.account.key}`, () => null)
const done = useState<boolean>(`following-done:${props.account.key}`, () => false)
const extraCache = ref<Record<string, UserDetailed>>({})
const loading = ref(false)
const error = ref('')
const filter = ref('')

// Muted users are moved to a folded section at the bottom
const mutedOpen = ref(false)

async function loadMore() {
  if (loading.value || done.value) return
  loading.value = true
  error.value = ''
  try {
    const page = await api<Following[]>('users/following', {
      userId: props.account.user.id,
      limit: PAGE,
      ...(cursor.value ? { untilId: cursor.value } : {}),
    })
    const known = new Set(following.value.map(u => u.id))
    following.value.push(...page.map(f => f.followee).filter(u => u && !known.has(u.id)))
    cursor.value = page.at(-1)?.id ?? cursor.value
    if (page.length < PAGE) done.value = true
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    loading.value = false
  }
}

// Pinned and grouped users may not be in the loaded following pages (or not followed at all)
const wantedIds = computed(() => [...new Set([...prefs.value.pinnedUserIds, ...Object.keys(prefs.value.userGroups)])])

async function loadExtra() {
  const known = new Set([...following.value.map(u => u.id), ...Object.keys(extraCache.value)])
  const missing = wantedIds.value.filter(id => !known.has(id))
  for (let i = 0; i < missing.length; i += 100) {
    try {
      const users = await api<UserDetailed[]>('users/show', { userIds: missing.slice(i, i + 100) })
      for (const u of users) extraCache.value[u.id] = u
    }
    catch {
      // leave them out
    }
  }
}

onMounted(async () => {
  mod.load()
  if (!following.value.length) await loadMore()
  loadExtra()
})
watch(() => wantedIds.value.length, loadExtra)
// The profile popout clears the cache after follow/unfollow
watch(() => following.value.length === 0 && !done.value, (empty) => {
  if (empty) loadMore()
})

function byId(id: string) {
  return following.value.find(u => u.id === id) ?? extraCache.value[id]
}

function match(u: UserDetailed) {
  const q = filter.value.trim().toLowerCase()
  return !q || u.username.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q) || (u.host ?? '').includes(q)
}

const rank = (u: UserDetailed) => ({ online: 0, active: 1, offline: 2, unknown: 3 })[u.onlineStatus ?? 'unknown']

const pinnedSet = computed(() => new Set(prefs.value.pinnedUserIds))
const pinned = computed(() => prefs.value.pinnedUserIds.map(byId).filter((u): u is UserDetailed => !!u && match(u)))

// Each user shows up once: pinned → muted → their group → plain following
const groups = computed(() => prefs.value.groups.map((g) => {
  const ids = Object.entries(prefs.value.userGroups).filter(([, gid]) => gid === g.id).map(([uid]) => uid)
  const users = ids
    .filter(id => !pinnedSet.value.has(id) && !mod.isMuted(id) && !mod.isBlocked(id))
    .map(byId)
    .filter((u): u is UserDetailed => !!u && match(u))
    .sort((a, b) => rank(a) - rank(b))
  return { group: g, users, collapsed: !!prefs.value.collapsed[`group:${g.id}`] }
}))
const rest = computed(() => following.value
  .filter(u => !pinnedSet.value.has(u.id) && !mod.isMuted(u.id) && !groupOf(u.id) && match(u))
  .sort((a, b) => rank(a) - rank(b)))
const muted = computed(() => following.value.filter(u => !pinnedSet.value.has(u.id) && mod.isMuted(u.id) && match(u)))

// You always show up first, as online — your own cached onlineStatus is stale
const me = computed(() => ({ ...props.account.user, onlineStatus: 'online' as const }))

const colorOf = (u: UserDetailed) => groupOf(u.id)?.color

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) loadMore()
}
</script>

<template>
  <div class="members">
    <div class="filter">
      <input v-model="filter" placeholder="팔로잉 검색" @input="!done && filter && loadMore()">
      <button class="icon-btn" title="분류 관리" @click="ui.groupsOpen = true">
        <Icon name="tag" :size="18" />
      </button>
    </div>

    <div class="scroll" @scroll.passive="onScroll">
      <MemberItem
        v-if="match(me)"
        class="self"
        :user="me"
        :color="colorOf(me)"
        :pinned="false"
        self
        @open="profile.open({ userId: me.id }, $event)"
      />

      <template v-if="pinned.length">
        <h3><Icon name="pin" :size="12" /> 고정됨 — {{ pinned.length }}</h3>
        <MemberItem
          v-for="u in pinned"
          :key="`p-${u.id}`"
          :user="u"
          :color="colorOf(u)"
          pinned
          @open="profile.open({ userId: u.id }, $event)"
          @pin="togglePin(u.id)"
        />
      </template>

      <template v-for="g in groups" :key="g.group.id">
        <h3 class="fold" @click="toggleCollapsed(`group:${g.group.id}`)">
          <Icon name="chevron" :size="12" :class="{ rot: g.collapsed }" />
          <span class="dot" :style="{ background: g.group.color }" />
          {{ g.group.name }} — {{ g.users.length }}
        </h3>
        <template v-if="!g.collapsed">
          <MemberItem
            v-for="u in g.users"
            :key="`g-${u.id}`"
            :user="u"
            :color="g.group.color"
            :pinned="false"
            @open="profile.open({ userId: u.id }, $event)"
            @pin="togglePin(u.id)"
          />
        </template>
      </template>

      <h3>{{ prefs.groups.length ? '그 외 팔로잉' : '팔로잉' }} — {{ prefs.groups.length ? rest.length : (props.account.user.followingCount ?? following.length) }}</h3>
      <MemberItem
        v-for="u in rest"
        :key="u.id"
        :user="u"
        :pinned="false"
        @open="profile.open({ userId: u.id }, $event)"
        @pin="togglePin(u.id)"
      />

      <p v-if="loading" class="muted">불러오는 중…</p>
      <p v-else-if="error" class="err">{{ error }} <button @click="loadMore">다시 시도</button></p>
      <p v-else-if="done && !following.length" class="muted">아직 팔로우한 사람이 없어요.</p>

      <template v-if="muted.length">
        <h3 class="fold" @click="mutedOpen = !mutedOpen">
          <Icon name="chevron" :size="12" :class="{ rot: !mutedOpen }" /> 뮤트됨 — {{ muted.length }}
        </h3>
        <template v-if="mutedOpen">
          <MemberItem
            v-for="u in muted"
            :key="`m-${u.id}`"
            class="is-muted"
            :user="u"
            :pinned="false"
            @open="profile.open({ userId: u.id }, $event)"
            @pin="togglePin(u.id)"
          />
        </template>
      </template>
      <ReloginHint v-if="mod.readDenied.value" class="hint" compact :host="props.account.host">
        뮤트·차단 목록을 읽을 권한이 없어 뮤트한 사람도 함께 표시돼요. 숨기려면
      </ReloginHint>
    </div>
  </div>
</template>

<style scoped>
.members {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
}
.filter {
  height: var(--header-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
}
.filter {
  gap: 4px;
}
.filter input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 4px;
  background: var(--bg-rail);
  outline: none;
  font-size: 14px;
}
:root[data-theme='light'] .filter input {
  background: var(--bg-input);
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 16px;
}
.self {
  margin-top: 8px;
}
h3 {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 20px 0 4px 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--fg-muted);
}
.muted,
.err {
  padding: 8px;
  font-size: 13px;
  color: var(--fg-muted);
}
.err {
  color: var(--danger);
}
.err button {
  text-decoration: underline;
}
.hint {
  margin: 16px 8px 0;
}
h3.fold {
  cursor: pointer;
}
h3.fold:hover {
  color: var(--fg);
}
.dot {
  width: 8px;
  height: 8px;
  margin: 0 2px;
  border-radius: 50%;
  flex-shrink: 0;
}
h3 .rot {
  transform: rotate(-90deg);
}
.is-muted {
  opacity: 0.45;
}
</style>
