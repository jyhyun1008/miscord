<script setup lang="ts">
const props = defineProps<{ title: string, subtitle?: string, width?: number }>()
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @mousedown.self="emit('close')">
      <div class="modal" role="dialog" :aria-label="props.title" :style="{ width: `${props.width ?? 440}px` }">
        <header>
          <h2>{{ props.title }}</h2>
          <p v-if="props.subtitle">{{ props.subtitle }}</p>
          <button class="close icon-btn" title="닫기" @click="emit('close')"><Icon name="x" /></button>
        </header>
        <div class="content">
          <slot />
        </div>
        <footer v-if="$slots.footer">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.7);
}
.modal {
  max-width: 100%;
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  background: var(--bg-main);
  box-shadow: var(--shadow);
  overflow: hidden;
}
header {
  position: relative;
  padding: 20px 48px 12px 16px;
}
h2 {
  margin: 0;
  font-size: 20px;
  color: var(--fg-strong);
}
header p {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--fg-muted);
}
.close {
  position: absolute;
  right: 12px;
  top: 14px;
}
.content {
  padding: 0 16px 16px;
  overflow-y: auto;
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px;
  background: var(--bg-sidebar);
}
</style>
