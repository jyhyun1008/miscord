<script setup lang="ts">
import type { MetaLite, Page } from '~/types/misskey'

/**
 * Public share link for a page. Someone logged in to that server lands in the app;
 * anyone else gets a read-only view in Miscord's layout.
 */
const route = useRoute()
const pageId = String(route.params.pageId ?? '')
let host = ''
try {
  host = normalizeHost(String(route.params.host ?? ''))
}
catch {}

const { accounts, lastUsed } = useAccounts()
const last = lastUsed()
const member = last?.host === host ? last : accounts.value.find(a => a.host === host)
if (member && pageId) {
  await navigateTo(channelPath(member.key, { kind: 'page', id: pageId }), { replace: true })
}

const guest = provideGuestAccount(host)
const page = ref<Page | null>(null)
const server = ref<MetaLite | null>(null)
const error = ref(host ? '' : '올바르지 않은 링크예요.')

useHead(() => ({ title: page.value ? `${page.value.title} · Miscord` : 'Miscord' }))

onMounted(() => {
  if (!host) return
  apiCall<Page>(host, 'pages/show', { pageId })
    .then(p => (page.value = p))
    .catch(e => (error.value = e instanceof MisskeyApiError && e.code === 'NO_SUCH_PAGE' ? '페이지를 찾을 수 없어요. 지워졌거나 링크가 잘못됐을 수 있어요.' : `${host} 에서 페이지를 불러오지 못했어요.`))
  apiCall<MetaLite>(host, 'meta', { detail: false }).then(m => (server.value = m)).catch(() => {})
  useEmojis(guest).load()
})

const misskeyUrl = computed(() => (page.value ? pageUrl(guest, page.value) : `https://${host}`))
const authorUrl = computed(() => (page.value ? `https://${page.value.user.host ?? host}/@${page.value.user.username}` : undefined))
</script>

<template>
  <div class="shared">
    <header class="bar">
      <NuxtLink class="brand" to="/">
        <img src="/icons/miscord.svg" alt="" width="28" height="28">
        <span>Miscord</span>
      </NuxtLink>
      <span v-if="host" class="server">
        <img v-if="safeHttpUrl(server?.iconUrl)" :src="safeHttpUrl(server?.iconUrl)" alt="" referrerpolicy="no-referrer">
        {{ server?.name ?? host }}
      </span>
      <span class="spacer" />
      <a v-if="host" class="btn ghost small" :href="misskeyUrl" target="_blank" rel="noopener noreferrer">
        Misskey에서 열기 <Icon name="external" :size="12" />
      </a>
      <NuxtLink class="btn small" :to="{ path: '/login', query: host ? { host } : {} }">로그인</NuxtLink>
    </header>

    <main class="scroll">
      <p v-if="error" class="state err">{{ error }}</p>
      <p v-else-if="!page" class="state">불러오는 중…</p>
      <PageArticle v-else :page="page" :author-href="authorUrl" />
    </main>
  </div>
</template>

<style scoped>
.shared {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-main);
}
.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--footer-h, 52px);
  padding: env(safe-area-inset-top) 16px 0;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  color: var(--fg-strong);
}
.brand:hover {
  text-decoration: none;
}
.server {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 2px 10px 2px 2px;
  border-radius: 12px;
  background: var(--bg-active);
  font-size: 13px;
  color: var(--fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.server img {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  object-fit: cover;
}
.spacer {
  flex: 1;
}
.btn :deep(.icon) {
  vertical-align: -1px;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px 16px calc(48px + env(safe-area-inset-bottom));
}
.state {
  max-width: 760px;
  margin: 40px auto;
  text-align: center;
  font-size: 14px;
  color: var(--fg-muted);
}
.state.err {
  color: var(--danger);
}

@media (max-width: 560px) {
  .brand span,
  .server {
    display: none;
  }
}
</style>
