<script setup lang="ts">
/** "…하려면 다시 로그인해서 권한을 추가해 주세요" — shown wherever an older login lacks a MiAuth permission. */
const props = defineProps<{ host: string, compact?: boolean }>()
</script>

<template>
  <p class="relogin" :class="{ compact: props.compact }">
    <Icon name="lock" :size="14" />
    <span><slot /> <button @click="startMiAuth(props.host)">다시 로그인</button>해서 권한을 추가해 주세요</span>
  </p>
</template>

<style scoped>
.relogin {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--fg-muted);
}
.relogin.compact {
  font-size: 12px;
}
.relogin .icon {
  flex-shrink: 0;
  align-self: center;
  color: var(--fg-faint);
}
button {
  color: var(--fg-link);
  font-weight: 600;
  text-decoration: underline;
}
</style>
