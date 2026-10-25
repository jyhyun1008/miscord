<script setup lang="ts">
import type { DriveFile } from '~/types/misskey'

const props = defineProps<{ images: DriveFile[], initialIndex: number }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const index = ref(props.initialIndex)
const current = computed(() => props.images[index.value])
const loadedSizes = ref<Record<string, { width: number, height: number }>>({})
const isPortrait = computed(() => {
  const image = current.value
  if (!image) return false
  const size = loadedSizes.value[image.id] ?? image.properties
  return !!size.width && !!size.height && size.height > size.width
})
function onImageLoad(event: Event) {
  const image = event.target as HTMLImageElement
  if (current.value) {
    loadedSizes.value[current.value.id] = { width: image.naturalWidth, height: image.naturalHeight }
  }
}
let gesture: { id: number, x: number, y: number } | null = null
let swiped = false

function move(delta: number) {
  index.value = Math.max(0, Math.min(props.images.length - 1, index.value + delta))
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    move(event.key === 'ArrowLeft' ? -1 : 1)
  }
}
function onPointerDown(event: PointerEvent) {
  swiped = false
  if (!event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button')) {
    gesture = null
    return
  }
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY }
}
function onPointerUp(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  gesture = null
  if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    swiped = true
    move(dx < 0 ? 1 : -1)
  }
}
function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget && !swiped) emit('close')
  swiped = false
}
onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => dialog.value?.close())
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="image-lightbox"
      aria-label="이미지 확대 보기"
      @cancel.prevent="emit('close')"
      @keydown="onKeydown"
      @click="onBackdropClick"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @pointercancel="gesture = null"
    >
      <button class="close" aria-label="이미지 닫기" autofocus @click="emit('close')">
        <Icon name="x" :size="24" />
      </button>
      <template v-if="images.length > 1">
        <span class="counter" aria-live="polite">{{ index + 1 }} / {{ images.length }}</span>
        <button class="previous" aria-label="이전 이미지" :disabled="index === 0" @click="move(-1)">‹</button>
        <button class="next" aria-label="다음 이미지" :disabled="index === images.length - 1" @click="move(1)">›</button>
      </template>
      <img v-if="current" :key="current.id" :src="current.url" :alt="current.comment ?? current.name" :class="{ portrait: isPortrait }" draggable="false" @load="onImageLoad">
    </dialog>
  </Teleport>
</template>

<style scoped>
.image-lightbox {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  overflow: hidden;
  overscroll-behavior: contain;
  touch-action: pan-y pinch-zoom;
}
.image-lightbox[open] {
  display: flex;
  align-items: center;
  justify-content: center;
}
.image-lightbox::backdrop {
  background: transparent;
  backdrop-filter: blur(6px);
}
.image-lightbox img {
  display: block;
  max-width: 80vw;
  max-height: 80vh;
  max-height: 80dvh;
  width: auto;
  height: auto;
  object-fit: contain;
  user-select: none;
  box-shadow: 0 12px 48px #0006;
}
button {
  position: absolute;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #0006;
  color: #fff;
  cursor: pointer;
}
button:hover { background: #ffffff30; }
button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
button:disabled { opacity: 0.25; cursor: default; }
.close { top: 16px; right: 16px; }
.previous, .next { top: calc(50% - 22px); font-size: 36px; line-height: 1; }
.previous { left: 12px; }
.next { right: 12px; }
.counter { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); font-size: 14px; }
@media (max-width: 768px) {
  .image-lightbox img {
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 112px);
    max-height: calc(100dvh - 112px);
  }
  .image-lightbox img.portrait {
    max-height: 80vh;
    max-height: 80dvh;
  }
  .previous, .next { top: auto; bottom: 10px; }
}
</style>
