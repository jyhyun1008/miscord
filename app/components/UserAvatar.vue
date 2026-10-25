<script setup lang="ts">
import type { UserLite } from '~/types/misskey'

const props = defineProps<{ user: UserLite }>()
const root = ref<HTMLElement | null>(null)
const visible = ref(false)
const decorations = useAvatarDecorations(() => props.user, visible)
const failed = ref(new Set<string>())
const shown = computed(() => decorations.value.filter(d =>
  d && typeof d.url === 'string' && /^https?:\/\//i.test(d.url) && !failed.value.has(d.url),
))
let observer: IntersectionObserver | undefined

onMounted(() => {
  if (!('IntersectionObserver' in window)) {
    visible.value = true
    return
  }
  observer = new IntersectionObserver(([entry]) => { visible.value = !!entry?.isIntersecting })
  if (root.value) observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())

function finite(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
</script>

<template>
  <span ref="root" class="user-avatar">
    <img class="portrait" :src="props.user.avatarUrl || undefined" alt="" loading="lazy" draggable="false">
    <img
      v-for="(decoration, index) in shown"
      :key="`${decoration.url}:${index}`"
      class="decoration"
      :src="decoration.url"
      :style="{
        rotate: `${finite(decoration.angle) * 360}deg`,
        scale: decoration.flipH ? '-1 1' : undefined,
        translate: `${finite(decoration.offsetX) * 100}% ${finite(decoration.offsetY) * 100}%`,
      }"
      alt=""
      loading="lazy"
      draggable="false"
      @error="failed.add(decoration.url)"
    >
    <slot />
  </span>
</template>

<style scoped>
:where(.user-avatar) {
  position: relative;
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  isolation: isolate;
}
.portrait {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg-active);
}
.decoration {
  position: absolute;
  z-index: 1;
  top: -50%;
  left: -50%;
  width: 200%;
  max-width: none;
  pointer-events: none;
}
</style>
