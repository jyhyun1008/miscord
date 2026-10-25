<script setup lang="ts">
const props = defineProps<{ name: string, url: string, animate?: boolean }>()
const failed = ref(false)
const anchor = ref<HTMLElement | null>(null)
const visible = ref(false)
const position = ref<Record<string, string>>({})
let holdTimer: ReturnType<typeof setTimeout> | undefined
let pointer: { id: number, x: number, y: number } | null = null
let held = false
const enlarged = ref(false)
let scaleTimer: ReturnType<typeof setTimeout> | undefined

function resetScale() {
  clearTimeout(scaleTimer)
  enlarged.value = false
}

function enlarge(temporary = false) {
  if (!props.animate) return
  clearTimeout(scaleTimer)
  enlarged.value = true
  if (temporary) scaleTimer = setTimeout(resetScale, 800)
}

function onPointerEnter(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  enlarge()
  show()
}

function onPointerLeave(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  resetScale()
  hide()
}

function cancelHold() {
  clearTimeout(holdTimer)
  pointer = null
}

function hide() {
  cancelHold()
  visible.value = false
}

function show() {
  const rect = anchor.value?.getBoundingClientRect()
  if (!rect) return
  const below = rect.top < 48
  position.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 288))}px`,
    top: `${below ? rect.bottom + 8 : rect.top - 8}px`,
    transform: below ? 'none' : 'translateY(-100%)',
  }
  visible.value = true
}

function onPointerDown(event: PointerEvent) {
  cancelHold()
  held = false
  if (event.pointerType === 'mouse' || !event.isPrimary) return
  enlarge(true)
  visible.value = false
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
  holdTimer = setTimeout(() => {
    held = true
    show()
  }, 500)
}

function onPointerMove(event: PointerEvent) {
  if (pointer?.id !== event.pointerId) return
  if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) {
    resetScale()
    hide()
  }
}

function onPointerEnd(event: PointerEvent) {
  if (pointer?.id !== event.pointerId) return
  if (event.type === 'pointercancel') {
    resetScale()
    hide()
  }
  else cancelHold()
}

function onClick(event: MouseEvent) {
  if (held) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function onOutsidePointerDown(event: PointerEvent) {
  if (!anchor.value?.contains(event.target as Node)) hide()
}

function removeListeners() {
  document.removeEventListener('pointerdown', onOutsidePointerDown)
  document.removeEventListener('scroll', hide, true)
  window.removeEventListener('resize', hide)
}

watch(visible, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onOutsidePointerDown)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
  }
  else removeListeners()
})
watch(() => [props.url, props.name], () => {
  failed.value = false
  resetScale()
  hide()
})
onBeforeUnmount(() => {
  resetScale()
  hide()
  removeListeners()
})
</script>

<template>
  <span
    ref="anchor"
    class="mfm-emoji-anchor"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @contextmenu.prevent
    @click="onClick"
    @keydown.esc="hide"
  >
    <span v-if="failed" class="mfm-emoji-text">:{{ props.name }}:</span>
    <img
      v-else
      class="mfm-emoji"
      :class="{ enlarged, animated: props.animate }"
      :src="props.url"
      :alt="`:${props.name}:`"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      draggable="false"
      @error="failed = true"
    >
    <Teleport to="body">
      <span v-if="visible" class="mfm-emoji-tooltip" role="tooltip" :style="position">:{{ props.name }}:</span>
    </Teleport>
  </span>
</template>

<style scoped>
.mfm-emoji-anchor {
  -webkit-touch-callout: none;
  user-select: none;
  touch-action: pan-y;
}
.mfm-emoji-anchor img {
  -webkit-touch-callout: none;
  user-select: none;
}
.mfm-emoji.animated {
  transform: scale(1);
  transform-origin: center;
  transition: transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.mfm-emoji.animated.enlarged {
  transform: scale(1.2);
}
@media (prefers-reduced-motion: reduce) {
  .mfm-emoji.animated { transition: none; }
}
.mfm-emoji-tooltip {
  position: fixed;
  z-index: 1000;
  width: max-content;
  max-width: min(280px, calc(100vw - 16px));
  padding: 6px 9px;
  border-radius: 6px;
  background: var(--bg-float);
  color: var(--fg);
  box-shadow: var(--shadow);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
  overflow-wrap: anywhere;
  pointer-events: none;
}
</style>
