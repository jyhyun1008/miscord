<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { Antenna, MisskeyChannel, UserList } from '~/types/misskey'

const props = defineProps<{ account: Account, channel: Channel | null }>()
const emit = defineEmits<{ addList: [], addTag: [] }>()

const ui = useUi()
const profile = useProfilePopout()
const api = useApi(props.account)
const { prefs, toggleCollapsed, syncFromServer, removeTag, moveItem } = usePrefs(props.account.key)
const { unread } = useNotifications(props.account)

// Channels, antennas and lists always mirror the server; only their order is local
const serverSections = [
  { key: 'channels', kind: 'channel', label: '채널', icon: 'tv', addHref: '/channels', addTitle: 'Misskey에서 채널 찾기' },
  { key: 'antennas', kind: 'antenna', label: '안테나', icon: 'antenna', addHref: '/my/antennas/create', addTitle: 'Misskey에서 안테나 만들기' },
  { key: 'lists', kind: 'list', label: '리스트', icon: 'list', addHref: null, addTitle: '새 리스트 만들기' },
] as const

const visibleServerSections = computed(() => serverSections.filter(s => !prefs.value.hiddenSections[s.key]))

// Older logins lack `read:channels`
const channelsDenied = ref(false)

onMounted(() => {
  Promise.all([
    api<MisskeyChannel[]>('channels/followed', { limit: 100 }),
    api<MisskeyChannel[]>('channels/my-favorites'),
  ]).then(([followed, favorites]) => {
    const seen = new Set<string>()
    syncFromServer('channels', [...favorites, ...followed].filter(c => !seen.has(c.id) && seen.add(c.id)))
  }).catch((e) => {
    channelsDenied.value = e instanceof MisskeyApiError && e.code === 'PERMISSION_DENIED'
  })
  api<Antenna[]>('antennas/list').then(a => syncFromServer('antennas', a)).catch(() => {})
  api<UserList[]>('users/lists/list').then(l => syncFromServer('lists', l)).catch(() => {})
})

// Empty categories stay folded (except to show the re-login hint)
function isCollapsed(key: 'channels' | 'antennas' | 'lists' | 'tags') {
  if (key === 'channels' && channelsDenied.value) return !!prefs.value.collapsed[key]
  return !prefs.value[key].length || !!prefs.value.collapsed[key]
}

const builtinIcon: Record<BuiltinKind, string> = { home: 'home', local: 'local', social: 'social', global: 'global' }

function isActive(ch: Channel) {
  return sameChannel(ch, props.channel)
}
const clipsActive = computed(() => props.channel?.kind === 'clips' || props.channel?.kind === 'clip')
const pagesActive = computed(() => ['pages', 'page', 'page-edit'].includes(props.channel?.kind ?? ''))

function go(ch: Channel) {
  ui.navOpen = false
  return navigateTo(channelPath(props.account.key, ch))
}

async function onRemoveTag(tag: string) {
  removeTag(tag)
  if (props.channel?.kind === 'tag' && props.channel.tag === tag) await go({ kind: 'home' })
}
</script>

<template>
  <div class="sidebar">
    <header class="head">
      <span class="name">{{ props.account.meta.name ?? props.account.host }}</span>
      <span class="host">{{ props.account.host }}</span>
    </header>

    <div class="scroll">
      <!-- Server-wide entries above the categories, like Discord's Events / Browse Channels -->
      <section class="top">
        <button class="ch" :class="{ active: props.channel?.kind === 'explore' }" @click="go({ kind: 'explore' })">
          <Icon name="compass" :size="18" />
          <span class="label">서버 훑어보기</span>
        </button>
        <button class="ch" :class="{ active: props.channel?.kind === 'notifications', unread: unread > 0 }" @click="go({ kind: 'notifications' })">
          <Icon name="bell" :size="18" />
          <span class="label">알림</span>
          <span v-if="unread > 0" class="count">{{ unread > 99 ? '99+' : unread }}</span>
        </button>
      </section>

      <!-- Built-in timelines -->
      <section>
        <button class="cat" @click="toggleCollapsed('timelines')">
          <Icon name="chevron" :size="12" :class="{ rot: prefs.collapsed.timelines }" />
          <span>타임라인</span>
        </button>
        <template v-for="b in BUILTIN_CHANNELS" :key="b.kind">
          <button
            v-if="!prefs.collapsed.timelines || isActive({ kind: b.kind })"
            class="ch"
            :class="{ active: isActive({ kind: b.kind }) }"
            @click="go({ kind: b.kind })"
          >
            <Icon :name="builtinIcon[b.kind]" :size="18" />
            <span class="label">{{ b.label }}</span>
          </button>
        </template>
      </section>

      <!-- Misskey channels, antennas, lists -->
      <section v-for="sec in visibleServerSections" :key="sec.key">
        <div class="cat-row">
          <button class="cat" @click="toggleCollapsed(sec.key)">
            <Icon name="chevron" :size="12" :class="{ rot: isCollapsed(sec.key) }" />
            <span>{{ sec.label }}</span>
          </button>
          <a
            v-if="sec.addHref"
            class="add"
            :href="`https://${props.account.host}${sec.addHref}`"
            target="_blank"
            rel="noopener noreferrer"
            :title="sec.addTitle"
          >
            <Icon name="plus" :size="16" />
          </a>
          <button v-else class="add" :title="sec.addTitle" @click="emit('addList')">
            <Icon name="plus" :size="16" />
          </button>
        </div>
        <template v-for="(item, i) in prefs[sec.key]" :key="item.id">
          <div
            v-if="!isCollapsed(sec.key) || isActive({ kind: sec.kind, id: item.id })"
            class="ch"
            :class="{ active: isActive({ kind: sec.kind, id: item.id }) }"
            role="button"
            tabindex="0"
            @click="go({ kind: sec.kind, id: item.id })"
            @keydown.enter="go({ kind: sec.kind, id: item.id })"
          >
            <Icon :name="sec.icon" :size="18" />
            <span class="label">{{ item.name }}</span>
            <span class="tools" @click.stop>
              <button title="위로" @click="moveItem(sec.key, i, i - 1)"><Icon name="up" :size="14" /></button>
              <button title="아래로" @click="moveItem(sec.key, i, i + 1)"><Icon name="down" :size="14" /></button>
            </span>
          </div>
        </template>
        <ReloginHint v-if="sec.key === 'channels' && channelsDenied && !isCollapsed('channels')" class="side-hint" compact :host="props.account.host">
          채널을 보려면
        </ReloginHint>
      </section>

      <!-- Hashtags -->
      <section v-if="!prefs.hiddenSections.tags">
        <div class="cat-row">
          <button class="cat" @click="toggleCollapsed('tags')">
            <Icon name="chevron" :size="12" :class="{ rot: isCollapsed('tags') }" />
            <span>해시태그</span>
          </button>
          <button class="add" title="해시태그 채널 추가" @click="emit('addTag')">
            <Icon name="plus" :size="16" />
          </button>
        </div>
        <template v-for="(t, i) in prefs.tags" :key="t">
          <div
            v-if="!isCollapsed('tags') || isActive({ kind: 'tag', tag: t })"
            class="ch"
            :class="{ active: isActive({ kind: 'tag', tag: t }) }"
            role="button"
            tabindex="0"
            @click="go({ kind: 'tag', tag: t })"
            @keydown.enter="go({ kind: 'tag', tag: t })"
          >
            <Icon name="hash" :size="18" />
            <span class="label">{{ t }}</span>
            <span class="tools" @click.stop>
              <button title="위로" @click="moveItem('tags', i, i - 1)"><Icon name="up" :size="14" /></button>
              <button title="아래로" @click="moveItem('tags', i, i + 1)"><Icon name="down" :size="14" /></button>
              <button title="채널 삭제" @click="onRemoveTag(t)"><Icon name="x" :size="14" /></button>
            </span>
          </div>
        </template>
      </section>

      <!-- My collections, below a divider like Discord's bottom-of-list extras -->
      <section v-if="!prefs.hiddenSections.clips || !prefs.hiddenSections.pages" class="bottom">
        <button v-if="!prefs.hiddenSections.clips" class="ch" :class="{ active: clipsActive }" @click="go({ kind: 'clips' })">
          <Icon name="clip" :size="18" />
          <span class="label">클립</span>
        </button>
        <button v-if="!prefs.hiddenSections.pages" class="ch" :class="{ active: pagesActive }" @click="go({ kind: 'pages' })">
          <Icon name="page" :size="18" />
          <span class="label">페이지</span>
        </button>
      </section>
    </div>

    <!-- User panel -->
    <footer class="me">
      <button
        class="my-profile"
        title="내 프로필 보기"
        aria-label="내 프로필 보기"
        @click="profile.open({ userId: props.account.user.id }, $event.currentTarget as HTMLElement)"
      >
        <UserAvatar class="avatar" :user="props.account.user" />
        <span class="who">
          <MfmText class="dn" :text="displayName(props.account.user)" :emojis="props.account.user.emojis" plain />
          <span class="un">@{{ props.account.user.username }}</span>
        </span>
      </button>
      <button class="icon-btn" title="설정" @click="ui.settingsOpen = true">
        <Icon name="settings" :size="18" />
      </button>
    </footer>
  </div>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
}
.head {
  height: var(--header-h);
  flex-shrink: 0;
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
}
.name {
  font-weight: 700;
  color: var(--fg-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.host {
  font-size: 11px;
  color: var(--fg-faint);
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 16px;
}
section {
  margin-top: 12px;
}
section.top {
  margin-top: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
section.bottom {
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.ch.unread {
  color: var(--fg-strong);
}
.ch.unread .label {
  font-weight: 600;
}
/* Discord-style mention badge */
.count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--danger);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
.cat-row {
  display: flex;
  align-items: center;
}
.cat {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 0 4px 2px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--fg-muted);
  text-align: left;
}
.cat:hover {
  color: var(--fg);
}
.cat .icon {
  transition: transform 0.15s;
}
.cat .rot {
  transform: rotate(-90deg);
}
.add {
  color: var(--fg-muted);
  padding: 2px 4px;
}
.add:hover {
  color: var(--fg);
}
a.add {
  display: grid;
  place-items: center;
}
.ch {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  margin: 1px 0;
  padding: 0 8px;
  border-radius: 4px;
  color: var(--fg-muted);
  cursor: pointer;
  text-align: left;
}
.ch:hover {
  background: var(--bg-hover);
  color: var(--fg);
}
.ch.active {
  background: var(--bg-active);
  color: var(--fg-strong);
}
.ch.active .icon {
  color: var(--accent);
}
.label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.tools {
  display: none;
  gap: 2px;
}
.tools button {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  color: var(--fg-muted);
  border-radius: 3px;
}
.tools button:hover {
  color: var(--fg-strong);
  background: var(--bg-active);
}
.ch:hover .tools,
.ch:focus-within .tools {
  display: flex;
}
.side-hint {
  margin: 2px 0;
  padding: 6px 8px;
}
.me {
  flex-shrink: 0;
  height: var(--footer-h);
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-panel);
}
.avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg-active);
}
.my-profile {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 4px;
  text-align: left;
}
.my-profile:hover,
.my-profile:focus-visible {
  background: var(--bg-hover);
}
.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.dn {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.un {
  font-size: 12px;
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
