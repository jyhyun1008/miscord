<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { Note, UserLite } from '~/types/misskey'

const props = defineProps<{ account: Account }>()

interface MetaDetail {
  name: string | null
  description: string | null
  version: string
  iconUrl: string | null
  bannerUrl: string | null
  themeColor: string | null
  maintainerName: string | null
  serverRules?: string[]
  tosUrl?: string | null
  privacyPolicyUrl?: string | null
}
interface Stats {
  notesCount: number
  originalNotesCount: number
  usersCount: number
  originalUsersCount: number
  instances: number
}
interface TrendTag {
  tag: string
  /** usage per 10-minute window, newest first */
  chart: number[]
  usersCount: number
}

const ui = useUi()
const api = useApi(props.account)
const profile = useProfilePopout()
const { prefs, addTag } = usePrefs(props.account.key)

const meta = ref<MetaDetail | null>(null)
const stats = ref<Stats | null>(null)
const online = ref<number | null>(null)
const trends = ref<TrendTag[] | null>(null)
const featured = ref<Note[] | null>(null)
const pinnedUsers = ref<UserLite[] | null>(null)

// Each section fills in on its own; one failing endpoint shouldn't blank the page
onMounted(() => {
  api<MetaDetail>('meta', { detail: true }).then(m => (meta.value = m)).catch(() => {})
  api<Stats>('stats').then(s => (stats.value = s)).catch(() => {})
  api<{ count: number }>('get-online-users-count').then(r => (online.value = r.count)).catch(() => {})
  api<TrendTag[]>('hashtags/trend').then(t => (trends.value = t)).catch(() => (trends.value = []))
  api<Note[]>('notes/featured', { limit: 10 }).then(n => (featured.value = n)).catch(() => (featured.value = []))
  api<UserLite[]>('pinned-users').then(u => (pinnedUsers.value = u)).catch(() => (pinnedUsers.value = []))
})

const name = computed(() => meta.value?.name ?? props.account.meta.name ?? props.account.host)
const icon = computed(() => safeHttpUrl(meta.value?.iconUrl ?? props.account.meta.iconUrl))
const banner = computed(() => safeHttpUrl(meta.value?.bannerUrl))

/** Admins often write HTML line breaks in the description; never render it as HTML. */
const description = computed(() => {
  const d = meta.value?.description ?? props.account.meta.description
  return d ? d.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : ''
})

const statItems = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: '이 서버 유저', value: s.originalUsersCount },
    { label: '이 서버 노트', value: s.originalNotesCount },
    { label: '알고 있는 유저', value: s.usersCount },
    { label: '연합 서버', value: s.instances },
  ]
})

function num(n: number) {
  return n.toLocaleString('ko-KR')
}

/** Sparkline points (oldest → newest, left → right) in a 100×24 box. */
function sparkline(chart: number[]) {
  const values = [...chart].reverse()
  const peak = Math.max(1, ...values)
  const step = values.length > 1 ? 100 / (values.length - 1) : 100
  return values.map((v, i) => `${(i * step).toFixed(1)},${(22 - (v / peak) * 20).toFixed(1)}`).join(' ')
}

function openTag(tag: string) {
  return navigateTo(channelPath(props.account.key, { kind: 'tag', tag }))
}
function tagSaved(tag: string) {
  return prefs.value.tags.some(t => t.toLowerCase() === tag.toLowerCase())
}

function noteUrl(note: Note) {
  return `https://${props.account.host}/notes/${note.id}`
}
function reactionTotal(note: Note) {
  return Object.values(note.reactions).reduce((a, b) => a + b, 0)
}
</script>

<template>
  <div class="explore">
    <header class="head">
      <button class="icon-btn nav-btn" title="채널 목록" @click="ui.navOpen = true">
        <Icon name="menu" />
      </button>
      <Icon name="compass" :size="22" class="ch-icon" />
      <h1 class="title">서버 훑어보기</h1>
      <span class="spacer" />
      <button class="icon-btn" :class="{ on: ui.membersOpen }" title="멤버 목록" @click="ui.membersOpen = !ui.membersOpen">
        <Icon name="users" />
      </button>
    </header>

    <div class="scroll">
      <!-- Hero -->
      <section class="hero" :style="{ '--server-color': meta?.themeColor ?? 'var(--accent)' }">
        <div class="banner">
          <img v-if="banner" :src="banner" alt="" referrerpolicy="no-referrer">
        </div>
        <div class="hero-body">
          <img v-if="icon" class="server-icon" :src="icon" alt="" referrerpolicy="no-referrer">
          <div v-else class="server-icon fallback">{{ name.slice(0, 1) }}</div>
          <div class="hero-text">
            <h2 class="server-name">{{ name }}</h2>
            <p class="server-host">
              {{ props.account.host }}
              <span v-if="meta?.version" class="chip">Misskey {{ meta.version }}</span>
              <span v-if="online != null" class="chip online"><i />지금 {{ num(online) }}명 접속 중</span>
            </p>
          </div>
        </div>
        <MfmText v-if="description" class="server-desc" :text="description" />
        <div v-if="statItems.length" class="stats">
          <div v-for="s in statItems" :key="s.label" class="stat">
            <strong>{{ num(s.value) }}</strong>
            <span>{{ s.label }}</span>
          </div>
        </div>
      </section>

      <div class="columns">
        <!-- Featured notes -->
        <section class="col-main">
          <h3 class="sec-title"><Icon name="star" :size="16" /> 인기 노트</h3>
          <p v-if="featured === null" class="muted">불러오는 중…</p>
          <p v-else-if="!featured.length" class="muted">아직 인기 노트가 없어요.</p>
          <article v-for="note in featured ?? []" :key="note.id" class="note-card">
            <header class="note-head">
              <UserAvatar class="note-avatar" :user="note.user" @click="profile.open({ userId: note.user.id }, $event.currentTarget as HTMLElement)" />
              <MfmText class="note-name" :text="displayName(note.user)" :emojis="note.user.emojis" plain />
              <span class="note-acct">{{ acct(note.user) }}</span>
              <a class="note-time" :href="noteUrl(note)" target="_blank" rel="noopener noreferrer" :title="formatFull(note.createdAt)">
                {{ formatStamp(note.createdAt) }}
              </a>
            </header>
            <NoteBody :note="note" />
            <footer class="note-meta">
              <span title="답글"><Icon name="reply" :size="14" /> {{ num(note.repliesCount) }}</span>
              <span title="리노트"><Icon name="renote" :size="14" /> {{ num(note.renoteCount) }}</span>
              <span title="반응"><Icon name="smile" :size="14" /> {{ num(reactionTotal(note)) }}</span>
            </footer>
          </article>
        </section>

        <aside class="col-side">
          <!-- Trending hashtags -->
          <section class="card">
            <h3 class="sec-title"><Icon name="hash" :size="16" /> 트렌드</h3>
            <p v-if="trends === null" class="muted">불러오는 중…</p>
            <p v-else-if="!trends.length" class="muted">지금 뜨는 해시태그가 없어요.</p>
            <div
              v-for="t in trends ?? []"
              :key="t.tag"
              class="trend"
              role="button"
              tabindex="0"
              @click="openTag(t.tag)"
              @keydown.enter="openTag(t.tag)"
            >
              <div class="trend-text">
                <span class="trend-tag">#{{ t.tag }}</span>
                <span class="trend-users">{{ num(t.usersCount) }}명이 이야기 중</span>
              </div>
              <svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                <polyline :points="sparkline(t.chart)" />
              </svg>
              <button
                class="icon-btn small"
                :title="tagSaved(t.tag) ? '이미 채널에 있어요' : '해시태그 채널로 추가'"
                :disabled="tagSaved(t.tag)"
                @click.stop="addTag(t.tag)"
              >
                <Icon :name="tagSaved(t.tag) ? 'check' : 'plus'" :size="14" />
              </button>
            </div>
          </section>

          <!-- Pinned users -->
          <section v-if="pinnedUsers?.length" class="card">
            <h3 class="sec-title"><Icon name="pin" :size="16" /> 추천 유저</h3>
            <button
              v-for="u in pinnedUsers"
              :key="u.id"
              class="person"
              @click="profile.open({ userId: u.id }, $event.currentTarget as HTMLElement)"
            >
              <UserAvatar class="person-avatar" :user="u" />
              <span class="person-text">
                <MfmText class="person-name" :text="displayName(u)" :emojis="u.emojis" plain />
                <span class="person-acct">{{ acct(u) }}</span>
              </span>
            </button>
          </section>

          <!-- Rules & about -->
          <section v-if="meta" class="card">
            <h3 class="sec-title"><Icon name="list" :size="16" /> 서버 정보</h3>
            <ol v-if="meta.serverRules?.length" class="rules">
              <li v-for="(r, i) in meta.serverRules" :key="i"><MfmText :text="r" /></li>
            </ol>
            <dl class="about">
              <template v-if="meta.maintainerName">
                <dt>관리자</dt>
                <dd>{{ meta.maintainerName }}</dd>
              </template>
            </dl>
            <div class="links">
              <a v-if="safeHttpUrl(meta.tosUrl)" :href="safeHttpUrl(meta.tosUrl)" target="_blank" rel="noopener noreferrer">이용약관 <Icon name="external" :size="12" /></a>
              <a v-if="safeHttpUrl(meta.privacyPolicyUrl)" :href="safeHttpUrl(meta.privacyPolicyUrl)" target="_blank" rel="noopener noreferrer">개인정보처리방침 <Icon name="external" :size="12" /></a>
              <a :href="`https://${props.account.host}/about`" target="_blank" rel="noopener noreferrer">Misskey에서 보기 <Icon name="external" :size="12" /></a>
            </div>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.explore {
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
}
.spacer {
  flex: 1;
}
.icon-btn.on {
  color: var(--fg-strong);
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* ---- hero ---- */
.hero {
  max-width: 1100px;
  margin: 0 auto 16px;
  border-radius: var(--radius);
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
  overflow: hidden;
}
.banner {
  height: 160px;
  background: linear-gradient(135deg, var(--server-color), color-mix(in srgb, var(--server-color), black 45%));
}
.banner img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/* Only the icon overlaps the banner; the name sits fully below it so it never lands on the photo */
.hero-body {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 0 20px;
}
.server-icon {
  flex-shrink: 0;
  width: 80px;
  height: 80px;
  margin-top: -40px;
  border-radius: 22px;
  border: 5px solid var(--bg-sidebar);
  background: var(--bg-sidebar);
  object-fit: cover;
}
.server-icon.fallback {
  display: grid;
  place-items: center;
  font-size: 30px;
  font-weight: 700;
  color: var(--accent-fg);
  background: var(--accent);
}
.hero-text {
  min-width: 0;
  padding-top: 10px;
}
.server-name {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--fg-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.server-host {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--fg-muted);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--bg-active);
  font-size: 12px;
}
.chip.online i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3ba55d;
}
.server-desc {
  display: block;
  padding: 12px 20px 0;
  color: var(--fg);
  font-size: 14px;
  word-break: keep-all;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  margin-top: 16px;
  border-top: 1px solid var(--border);
  background: var(--border);
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 8px;
  background: var(--bg-sidebar);
}
.stat strong {
  font-size: 18px;
  color: var(--fg-strong);
}
.stat span {
  font-size: 12px;
  color: var(--fg-muted);
}

/* ---- columns ---- */
.columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  max-width: 1100px;
  margin: 0 auto;
  align-items: start;
}
.col-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sec-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--fg-muted);
}
.card {
  padding: 14px 16px;
  border-radius: var(--radius);
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
}

/* ---- featured notes ---- */
.note-card {
  padding: 12px 16px;
  margin-bottom: 10px;
  border-radius: var(--radius);
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
}
.note-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-bottom: 4px;
}
.note-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
}
.note-name {
  font-weight: 600;
  color: var(--fg-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.note-acct {
  font-size: 12px;
  color: var(--fg-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}
.note-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--fg-faint);
}
.note-meta {
  display: flex;
  gap: 14px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--fg-faint);
}
.note-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ---- trends ---- */
.trend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 -8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.trend:hover {
  background: var(--bg-hover);
}
.trend-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.trend-tag {
  font-weight: 600;
  color: var(--fg-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trend-users {
  font-size: 12px;
  color: var(--fg-faint);
}
.spark {
  flex-shrink: 0;
  width: 64px;
  height: 24px;
}
.spark polyline {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
  stroke-linejoin: round;
}
.icon-btn.small {
  width: 26px;
  height: 26px;
}
.icon-btn.small:disabled {
  color: var(--accent);
  cursor: default;
}

/* ---- people ---- */
.person {
  width: calc(100% + 16px);
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 -8px;
  padding: 6px 8px;
  border-radius: 4px;
  text-align: left;
}
.person:hover {
  background: var(--bg-hover);
}
.person-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
}
.person-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.person-name {
  font-weight: 600;
  color: var(--fg-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.person-acct {
  font-size: 12px;
  color: var(--fg-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- about ---- */
.rules {
  margin: 0 0 12px;
  padding-left: 20px;
  font-size: 14px;
  color: var(--fg);
}
.rules li + li {
  margin-top: 6px;
}
.about {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0 0 10px;
  font-size: 13px;
}
.about dt {
  color: var(--fg-muted);
}
.about dd {
  margin: 0;
  color: var(--fg);
}
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 13px;
}
.links a {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.muted {
  font-size: 14px;
  color: var(--fg-muted);
}

@media (max-width: 1000px) {
  .columns {
    grid-template-columns: minmax(0, 1fr);
  }
  /* Trends and people first on a single column; they're the quick browse */
  .col-side {
    order: -1;
  }
}
@media (max-width: 768px) {
  .nav-btn {
    display: inline-flex;
  }
  .scroll {
    padding: 12px;
  }
  .banner {
    height: 120px;
  }
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
