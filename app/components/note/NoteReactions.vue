<script setup lang="ts">
import type { Note } from '~/types/misskey'

const props = defineProps<{ note: Note, host: string }>()
const emit = defineEmits<{ toggle: [reaction: string], add: [anchor: HTMLElement] }>()

const account = useCurrentAccount()
const emojiStore = account.value ? useEmojis(account.value) : null
const localEmojis = computed(() => emojiStore?.byName.value)

const broken = ref<Record<string, boolean>>({})

const items = computed(() =>
  Object.entries(props.note.reactions)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([r, count]) => ({ ...reactionInfo(r, props.note, props.host, localEmojis.value), count, mine: props.note.myReaction === r })),
)
</script>

<template>
  <div v-if="items.length" class="reactions">
    <button
      v-for="r in items"
      :key="r.reaction"
      class="pill"
      :class="{ mine: r.mine }"
      :disabled="!r.sendAs && !r.mine"
      :title="r.sendAs || r.mine ? r.label : `${r.label} (다른 서버의 이모지라 사용할 수 없어요)`"
      @click="emit('toggle', r.mine ? r.reaction : r.sendAs!)"
    >
      <img v-if="r.url && !broken[r.reaction]" :src="r.url" :alt="r.label" class="emoji" loading="lazy" referrerpolicy="no-referrer" @error="broken[r.reaction] = true">
      <span v-else class="uni">{{ r.label }}</span>
      <span class="count">{{ r.count }}</span>
    </button>
    <button class="pill add" title="반응 추가" @click="emit('add', $event.currentTarget as HTMLElement)">
      <Icon name="smile" :size="16" />
      <Icon name="plus" :size="10" class="plus" />
    </button>
  </div>
</template>

<style scoped>
.reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 7px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--bg-input);
  font-size: 14px;
  transition: border-color 0.1s;
}
.pill:hover:not(:disabled) {
  border-color: var(--fg-faint);
}
.pill:disabled {
  cursor: default;
}
.pill.mine {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.emoji {
  height: 18px;
  width: auto;
  max-width: 48px;
  object-fit: contain;
}
.uni {
  font-size: 16px;
  line-height: 1;
}
.count {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-muted);
}
.mine .count {
  color: var(--fg-link);
}
.add {
  position: relative;
  color: var(--fg-muted);
  opacity: 0;
}
.reactions:hover .add,
.add:focus-visible {
  opacity: 1;
}
.plus {
  position: absolute;
  right: 2px;
  top: 3px;
}
</style>
