<script setup lang="ts">
import type { UserLite } from '~/types/misskey'

const props = defineProps<{ user: UserLite, pinned: boolean, color?: string, self?: boolean }>()
const emit = defineEmits<{ open: [anchor: HTMLElement], pin: [] }>()

const offline = computed(() => props.user.onlineStatus === 'offline')
</script>

<template>
  <div
    class="member"
    :class="{ offline }"
    role="button"
    tabindex="0"
    @click="emit('open', $event.currentTarget as HTMLElement)"
    @keydown.enter="emit('open', $event.currentTarget as HTMLElement)"
  >
    <UserAvatar class="avatar" :user="props.user">
      <span v-if="props.user.onlineStatus && props.user.onlineStatus !== 'unknown'" class="status" :class="props.user.onlineStatus" />
    </UserAvatar>
    <span class="text">
      <MfmText class="name" :style="props.color ? { color: props.color } : undefined" :text="displayName(props.user)" :emojis="props.user.emojis" plain />
      <span class="acct">{{ acct(props.user) }}</span>
    </span>
    <span v-if="props.self" class="me">나</span>
    <button v-else class="pin" :class="{ on: props.pinned }" :title="props.pinned ? '고정 해제' : '고정'" @click.stop="emit('pin')">
      <Icon name="pin" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.member {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  margin: 1px 0;
  padding: 0 8px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--fg-muted);
}
.member:hover {
  background: var(--bg-hover);
  color: var(--fg);
}
.member.offline {
  opacity: 0.5;
}
.member.offline:hover {
  opacity: 1;
}
.avatar {
  position: relative;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
}
.status {
  z-index: 2;
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--bg-sidebar);
  background: var(--fg-faint);
}
.status.online {
  background: var(--accent);
}
.status.active {
  background: #f0b232;
}
.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.member:hover .name {
  color: var(--fg-strong);
}
.acct {
  font-size: 11px;
  color: var(--fg-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.me {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--bg-active);
  font-size: 11px;
  font-weight: 600;
  color: var(--fg-muted);
}
.pin {
  display: none;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 4px;
  color: var(--fg-muted);
}
.pin:hover {
  background: var(--bg-active);
  color: var(--fg-strong);
}
.pin.on {
  color: var(--accent);
}
.member:hover .pin,
.member:focus-within .pin {
  display: grid;
}
@media (hover: none) {
  .pin {
    display: grid;
  }
}
</style>
