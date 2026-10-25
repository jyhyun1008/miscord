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
    await navigator.clipboard.writeText(pageShareUrl(props.account, page.value))
    toast.show('Miscord 링크를 복사했어요')
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
        <button class="icon-btn" title="Miscord 링크 복사 (로그인 없이도 열려요)" @click="copyLink">
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
      <PageArticle v-else :page="page" @author="profile.open({ userId: page.user.id }, $event)" />
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

</style>
