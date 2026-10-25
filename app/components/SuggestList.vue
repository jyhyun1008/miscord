<script setup lang="ts">
import type { Suggestion } from '~/composables/useAutocomplete'

/** The `@user` / `:emoji` candidate list; the parent positions it. */
const props = defineProps<{ items: Suggestion[], index: number }>()
const emit = defineEmits<{ pick: [item: Suggestion], hover: [index: number] }>()
</script>

<template>
  <ul class="suggest" role="listbox">
    <li
      v-for="(item, i) in props.items" :key="item.kind === 'user' ? item.user.id : item.kind === 'emoji' ? item.name : item.emoji"
      role="option" :aria-selected="i === props.index" :class="{ on: i === props.index }"
      @mousedown.prevent="emit('pick', item)" @mouseenter="emit('hover', i)"
    >
      <template v-if="item.kind === 'user'">
        <UserAvatar class="s-avatar" :user="item.user" />
        <MfmText class="s-name" :text="displayName(item.user)" :emojis="item.user.emojis" plain />
        <span class="s-sub">{{ acct(item.user) }}</span>
      </template>
      <template v-else-if="item.kind === 'unicode'">
        <UnicodeEmoji class="s-emoji s-unicode" :emoji="item.emoji" />
        <span class="s-name">{{ item.label }}</span>
      </template>
      <template v-else>
        <img class="s-emoji" :src="item.url" :alt="item.name" loading="lazy" referrerpolicy="no-referrer">
        <span class="s-name">:{{ item.name }}:</span>
      </template>
    </li>
  </ul>
</template>

<style scoped>
.suggest {
  z-index: 20;
  margin: 0;
  padding: 6px;
  list-style: none;
  border-radius: 8px;
  background: var(--bg-sidebar);
  box-shadow: var(--shadow), 0 0 0 1px var(--border);
}
li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
}
li.on {
  background: var(--bg-active);
}
.s-avatar {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
}
.s-emoji {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  object-fit: contain;
}
.s-unicode {
  display: grid;
  place-items: center;
  font-size: 20px;
  line-height: 1;
}
.s-name {
  font-weight: 600;
  color: var(--fg-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.s-sub {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--fg-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
