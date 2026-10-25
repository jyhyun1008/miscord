<script setup lang="ts">
/** Big icon + message (+ optional action) for an empty list. */
const props = defineProps<{ icon: string }>()
</script>

<template>
  <div class="empty-state">
    <Icon :name="props.icon" :size="40" />
    <p><slot /></p>
    <div v-if="$slots.action" class="action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 16px;
  color: var(--fg-faint);
  text-align: center;
}
p {
  margin: 0;
  font-size: 14px;
  color: var(--fg-muted);
}
.action {
  margin-top: 8px;
}
.action :deep(.btn) {
  text-decoration: none;
}
</style>
