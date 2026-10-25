<script setup lang="ts">
import { MFM_SYNTAX, type MfmSyntax } from '~/utils/textEdit'

/** Popover of the MFM syntax Miscord renders, each shown as it will look. */
const props = defineProps<{ anchor: HTMLElement }>()
const emit = defineEmits<{ pick: [syntax: MfmSyntax], close: [] }>()

const groups = computed(() => [...new Set(MFM_SYNTAX.map(s => s.group))].map(g => ({ name: g, items: MFM_SYNTAX.filter(s => s.group === g) })))
const root = ref<HTMLElement | null>(null)
const pos = ref({ left: 0, top: 0 })
const W = 320
const H = 420

function place() {
  const r = props.anchor.getBoundingClientRect()
  const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8))
  const top = r.top - H - 8 > 8 ? r.top - H - 8 : Math.min(r.bottom + 8, window.innerHeight - H - 8)
  pos.value = { left, top: Math.max(8, top) }
}

function onDocDown(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node) && !props.anchor.contains(e.target as Node)) emit('close')
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  place()
  document.addEventListener('mousedown', onDocDown)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', place)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDown)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', place)
})
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="palette" :style="{ left: `${pos.left}px`, top: `${pos.top}px`, width: `${W}px`, maxHeight: `${H}px` }">
      <p class="hint">글자를 선택하고 누르면 감싸요</p>
      <template v-for="g in groups" :key="g.name">
        <h4>{{ g.name }}</h4>
        <div class="grid">
          <button v-for="s in g.items" :key="s.label" :title="`${s.before}…${s.after}`" @mousedown.prevent @click="emit('pick', s)">
            <MfmText class="sample" :text="s.sample" />
            <span class="label">{{ s.label }}</span>
          </button>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.palette {
  position: fixed;
  z-index: 60;
  max-width: calc(100vw - 16px);
  padding: 10px;
  overflow-y: auto;
  border-radius: 8px;
  background: var(--bg-sidebar);
  box-shadow: var(--shadow), 0 0 0 1px var(--border);
}
.hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--fg-faint);
}
h4 {
  margin: 10px 0 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--fg-muted);
}
.hint + h4 {
  margin-top: 0;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.grid button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  min-height: 56px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-main);
  text-align: left;
  overflow: hidden;
}
.grid button:hover {
  background: var(--bg-active);
}
.sample {
  max-width: 100%;
  max-height: 44px;
  overflow: hidden;
  color: var(--fg);
  font-size: 14px;
  line-height: 1.3;
  pointer-events: none;
}
.sample :deep(.mfm-pre),
.sample :deep(.mfm-quote),
.sample :deep(.mfm-center) {
  margin: 0;
}
.label {
  font-size: 11px;
  color: var(--fg-faint);
}
</style>
