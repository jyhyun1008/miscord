<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { Page } from '~/types/misskey'

const props = defineProps<{ account: Account, pageId: string }>()

const api = useApi(props.account)
const toast = useToast()
const profile = useProfilePopout()
const { setLiked, forget } = usePages(props.account)

const page = ref<Page | null>(null)
const error = ref('')
const busy = ref(false)

const mine = computed(() => page.value?.userId === props.account.user.id)

async function load() {
  error.value = ''
  try {
    page.value = await api<Page>('pages/show', { pageId: props.pageId })
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
onMounted(load)

function back() {
  return navigateTo(channelPath(props.account.key, { kind: 'pages' }))
}

async function toggleLike() {
  if (!page.value || busy.value) return
  busy.value = true
  try {
    await setLiked(page.value, !page.value.isLiked)
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    busy.value = false
  }
}

async function copyLink() {
  if (!page.value) return
  try {
    await navigator.clipboard.writeText(pageUrl(props.account, page.value))
    toast.show('링크를 복사했어요')
  }
  catch (e) {
    toast.error(e)
  }
}

async function remove() {
  if (!page.value || !confirm(`"${page.value.title}" 페이지를 삭제할까요? 되돌릴 수 없어요.`)) return
  try {
    await api('pages/delete', { pageId: page.value.id })
    forget(page.value.id)
    toast.show('페이지를 삭제했어요')
    await back()
  }
  catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div class="page-view">
    <ViewHeader icon="page" :title="page?.title ?? '페이지'" :back="{ kind: 'pages' }">
      <template v-if="page" #actions>
        <button
          class="count-pill"
          :class="{ on: page.isLiked }"
          :disabled="mine || busy"
          :title="mine ? '내 페이지에는 좋아요할 수 없어요' : page.isLiked ? '좋아요 취소' : '좋아요'"
          @click="toggleLike"
        >
          <Icon name="heart" :size="14" /> {{ page.likedCount }}
        </button>
        <NuxtLink v-if="mine" class="icon-btn" title="편집" :to="channelPath(props.account.key, { kind: 'page-edit', id: page.id })">
          <Icon name="edit" :size="18" />
        </NuxtLink>
        <button class="icon-btn" title="링크 복사" @click="copyLink">
          <Icon name="link" :size="18" />
        </button>
        <a class="icon-btn" title="Misskey에서 열기" :href="pageUrl(props.account, page)" target="_blank" rel="noopener noreferrer">
          <Icon name="external" :size="18" />
        </a>
        <button v-if="mine" class="icon-btn danger" title="삭제" @click="remove">
          <Icon name="trash" :size="18" />
        </button>
      </template>
    </ViewHeader>

    <div class="scroll">
      <p v-if="error" class="err">{{ error }} <button @click="load">다시 시도</button></p>
      <p v-else-if="!page" class="muted">불러오는 중…</p>
      <article v-else class="article" :class="{ serif: page.font === 'serif', center: page.alignCenter }">
        <img
          v-if="page.eyeCatchingImage"
          class="cover"
          :src="page.eyeCatchingImage.url"
          alt=""
        >
        <h1 class="page-title">{{ page.title }}</h1>
        <button class="author" @click="profile.open({ userId: page.user.id }, $event.currentTarget as HTMLElement)">
          <UserAvatar class="avatar" :user="page.user" />
          <span class="who">
            <MfmText class="dn" :text="displayName(page.user)" :emojis="page.user.emojis" plain />
            <span class="stamp">
              {{ formatStamp(page.createdAt) }}<template v-if="page.updatedAt !== page.createdAt"> · 수정됨 {{ formatStamp(page.updatedAt) }}</template>
            </span>
          </span>
        </button>
        <p v-if="page.summary" class="summary">{{ page.summary }}</p>
        <PageBlocks class="content" :blocks="page.content" :files="page.attachedFiles" />
      </article>
    </div>
  </div>
</template>

<style scoped>
.page-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.icon-btn.danger:hover {
  color: var(--danger);
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px 16px 48px;
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
  max-height: 320px;
  object-fit: cover;
  border-radius: var(--radius);
  background: var(--bg-active);
}
.page-title {
  margin: 4px 0 0;
  font-size: 30px;
  font-weight: 800;
  line-height: 1.25;
  color: var(--fg-strong);
  overflow-wrap: anywhere;
}
.author {
  display: flex;
  align-items: center;
  gap: 10px;
  align-self: flex-start;
  padding: 4px 8px 4px 4px;
  margin-left: -4px;
  border-radius: 6px;
  text-align: left;
}
.center .author {
  align-self: center;
}
.author:hover {
  background: var(--bg-hover);
}
.avatar {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
}
.who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}
.dn {
  font-weight: 600;
  color: var(--fg-strong);
}
.stamp {
  font-size: 12px;
  color: var(--fg-faint);
}
.summary {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: var(--bg-embed);
  color: var(--fg-muted);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}
.content {
  margin-top: 8px;
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
  .page-title {
    font-size: 24px;
  }
}
</style>
