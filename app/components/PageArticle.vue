<script setup lang="ts">
import type { Page } from '~/types/misskey'

/** A page's cover, title, author and blocks; shared by the in-app view and the public share link. */
const props = defineProps<{ page: Page, authorHref?: string }>()
const emit = defineEmits<{ author: [el: HTMLElement] }>()
</script>

<template>
  <article class="article" :class="{ serif: props.page.font === 'serif', center: props.page.alignCenter }">
    <img
      v-if="props.page.eyeCatchingImage"
      class="cover"
      :src="props.page.eyeCatchingImage.url"
      alt=""
    >
    <h1 class="page-title">{{ props.page.title }}</h1>
    <component
      :is="props.authorHref ? 'a' : 'button'"
      class="author"
      v-bind="props.authorHref ? { href: props.authorHref, target: '_blank', rel: 'noopener noreferrer' } : {}"
      @click="!props.authorHref && emit('author', $event.currentTarget as HTMLElement)"
    >
      <UserAvatar class="avatar" :user="props.page.user" />
      <span class="who">
        <MfmText class="dn" :text="displayName(props.page.user)" :emojis="props.page.user.emojis" plain />
        <span class="stamp">
          {{ formatStamp(props.page.createdAt) }}<template v-if="props.page.updatedAt !== props.page.createdAt"> · 수정됨 {{ formatStamp(props.page.updatedAt) }}</template>
        </span>
      </span>
    </component>
    <p v-if="props.page.summary" class="summary">{{ props.page.summary }}</p>
    <PageBlocks class="content" :blocks="props.page.content" :files="props.page.attachedFiles" />
  </article>
</template>

<style scoped>
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
a.author,
a.author:hover {
  color: inherit;
  text-decoration: none;
}

@media (max-width: 768px) {
  .page-title {
    font-size: 24px;
  }
}
</style>
