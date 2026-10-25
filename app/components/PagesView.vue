<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { PagesTab } from '~/composables/usePages'
import type { Page } from '~/types/misskey'

const props = defineProps<{ account: Account }>()

const toast = useToast()
const { tab, feeds, load, loadMore, setLiked } = usePages(props.account)

const TABS: { value: PagesTab, label: string }[] = [
  { value: 'featured', label: '인기' },
  { value: 'mine', label: '내 페이지' },
  { value: 'liked', label: '좋아요' },
]

const error = ref('')
const denied = ref(false)
const loading = ref(false)
const q = ref('')

const feed = computed(() => feeds.value[tab.value])
const shown = computed(() => {
  const items = feed.value?.items ?? []
  const s = q.value.trim().toLowerCase()
  if (!s) return items
  return items.filter(p => [p.title, p.summary, p.user.name, p.user.username].some(v => v?.toLowerCase().includes(s)))
})

async function run(fn: () => Promise<void>) {
  error.value = ''
  denied.value = false
  loading.value = true
  try {
    await fn()
  }
  catch (e) {
    denied.value = e instanceof MisskeyApiError && e.code === 'PERMISSION_DENIED'
    error.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    loading.value = false
  }
}

watch(tab, t => run(() => load(t)), { immediate: true })

// Infinite scroll for the paginated tabs
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | undefined
onMounted(() => {
  observer = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting && feed.value?.cursor && !loading.value) run(() => loadMore(tab.value))
  }, { rootMargin: '400px' })
  watch(sentinel, (el, prev) => {
    if (prev) observer?.unobserve(prev)
    if (el) observer?.observe(el)
  }, { immediate: true })
})
onBeforeUnmount(() => observer?.disconnect())

function open(p: Page) {
  return navigateTo(channelPath(props.account.key, { kind: 'page', id: p.id }))
}

async function toggleLike(p: Page) {
  try {
    await setLiked(p, !p.isLiked)
  }
  catch (e) {
    toast.error(e)
  }
}

function excerpt(p: Page) {
  return p.summary?.trim() || pageExcerpt(p.content)
}
</script>

<template>
  <div class="pages">
    <ViewHeader icon="page" title="페이지" :topic="`${props.account.host}의 Misskey 페이지`" />

    <div class="scroll">
      <div class="toolbar">
        <div class="search">
          <input v-model="q" class="field" type="search" placeholder="페이지 검색" aria-label="페이지 검색">
        </div>
        <NuxtLink class="btn" :to="channelPath(props.account.key, { kind: 'page-edit', id: null })">
          <Icon name="plus" :size="16" /> 새 페이지
        </NuxtLink>
      </div>

      <nav class="tabs" role="tablist">
        <button
          v-for="t in TABS"
          :key="t.value"
          class="tab"
          role="tab"
          :aria-selected="tab === t.value"
          :class="{ on: tab === t.value }"
          @click="tab = t.value"
        >
          {{ t.label }}
        </button>
        <span class="spacer" />
        <button class="icon-btn" title="새로고침" :disabled="loading" @click="run(() => load(tab, true))">
          <Icon name="renote" :size="16" />
        </button>
      </nav>

      <ReloginHint v-if="denied" :host="props.account.host">페이지를 보려면</ReloginHint>
      <p v-else-if="error && !feed" class="err">{{ error }} <button @click="run(() => load(tab, true))">다시 시도</button></p>
      <p v-else-if="!feed" class="muted">불러오는 중…</p>
      <EmptyState v-else-if="!shown.length" :icon="tab === 'liked' && !q.trim() ? 'heart' : 'page'">
        <template v-if="q.trim()">"{{ q.trim() }}"에 맞는 페이지가 없어요.</template>
        <template v-else-if="tab === 'mine'">아직 쓴 페이지가 없어요.</template>
        <template v-else-if="tab === 'liked'">좋아요한 페이지가 없어요.</template>
        <template v-else>이 서버에 인기 페이지가 없어요.</template>
        <template v-if="tab === 'mine' && !q.trim()" #action>
          <NuxtLink class="btn" :to="channelPath(props.account.key, { kind: 'page-edit', id: null })">첫 페이지 쓰기</NuxtLink>
        </template>
      </EmptyState>

      <div v-if="shown.length" class="grid">
        <article
          v-for="p in shown"
          :key="p.id"
          class="card"
          role="button"
          tabindex="0"
          @click="open(p)"
          @keydown.enter="open(p)"
        >
          <div class="cover" :class="{ blank: !pageCover(p) }">
            <img
              v-if="pageCover(p)"
              :class="{ sensitive: pageCover(p)!.isSensitive }"
              :src="pageCover(p)!.thumbnailUrl ?? pageCover(p)!.url"
              alt=""
              loading="lazy"
            >
            <span v-else class="initial">{{ [...(p.title || '?')][0] }}</span>
          </div>
          <div class="body">
            <h2 class="name">{{ p.title || '제목 없음' }}</h2>
            <div class="author">
              <UserAvatar class="avatar" :user="p.user" />
              <MfmText class="dn" :text="displayName(p.user)" :emojis="p.user.emojis" plain />
            </div>
            <p v-if="excerpt(p)" class="desc">{{ excerpt(p) }}</p>
            <footer class="meta">
              <button
                class="count-pill"
                :class="{ on: p.isLiked }"
                :disabled="p.userId === props.account.user.id"
                :title="p.isLiked ? '좋아요 취소' : '좋아요'"
                @click.stop="toggleLike(p)"
              >
                <Icon name="heart" :size="14" /> {{ p.likedCount }}
              </button>
              <span class="time">{{ formatStamp(p.updatedAt ?? p.createdAt) }}</span>
            </footer>
          </div>
        </article>
      </div>

      <div v-if="feed?.cursor && !q.trim()" ref="sentinel" class="more">
        <span v-if="loading" class="muted">불러오는 중…</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pages {
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
  padding: 16px;
}
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}
.search {
  flex: 1;
  min-width: 0;
}
.toolbar .btn {
  white-space: nowrap;
  text-decoration: none;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 12px 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: 16px;
}
.card {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius);
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
  overflow: hidden;
  cursor: pointer;
  min-width: 0;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
}
.card:hover {
  background: var(--bg-embed);
  border-color: var(--bg-active);
}
.card:focus-visible {
  outline: 2px solid var(--accent);
}
.cover {
  aspect-ratio: 16 / 10;
  background: var(--bg-active);
  overflow: hidden;
}
.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s;
}
.card:hover .cover img {
  transform: scale(1.03);
}
.cover img.sensitive {
  filter: blur(16px);
}
.cover.blank {
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--accent-soft), var(--bg-active));
}
.initial {
  font-size: 44px;
  font-weight: 800;
  color: var(--accent);
  opacity: 0.8;
}
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  min-width: 0;
}
.name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--fg-strong);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.author {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
}
.avatar {
  position: relative;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}
.dn {
  font-weight: 600;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--fg-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 4px;
  font-size: 12px;
  color: var(--fg-faint);
}
.time {
  margin-left: auto;
}
.more {
  display: grid;
  place-items: center;
  min-height: 48px;
}
.muted,
.err {
  font-size: 14px;
  color: var(--fg-muted);
}
.err {
  color: var(--danger);
}
.err button {
  text-decoration: underline;
}

@media (max-width: 768px) {
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 160px), 1fr));
    gap: 10px;
  }
}
</style>
