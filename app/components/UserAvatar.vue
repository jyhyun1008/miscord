<script setup lang="ts">
import type { UserLite } from '~/types/misskey'

const props = defineProps<{ user: UserLite }>()
const portraitFailed = ref(false)
const portraitUrl = computed(() => portraitFailed.value ? '/icons/miscord.svg' : props.user.avatarUrl || '/icons/miscord.svg')
watch(() => props.user.avatarUrl, () => { portraitFailed.value = false })
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

// Cat ears are cut from the avatar itself, like Misskey's
const earStyle = computed(() => ({ '--ear-image': `url(${JSON.stringify(portraitUrl.value)})` }))

function finite(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
</script>

<template>
  <span ref="root" class="user-avatar" :class="{ cat: props.user.isCat }">
    <template v-if="props.user.isCat">
      <span class="ear left" :style="earStyle" aria-hidden="true" />
      <span class="ear right" :style="earStyle" aria-hidden="true" />
    </template>
    <img class="portrait" :src="portraitUrl" alt="" loading="lazy" draggable="false" @error="portraitFailed = true">
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
.ear {
  position: absolute;
  z-index: -1;
  top: 0;
  width: 50%;
  height: 50%;
  border: 2px solid var(--bg-active);
  background: var(--bg-active) var(--ear-image) center / 200% 200% no-repeat;
  box-sizing: border-box;
}
.ear.left {
  left: 0;
  border-radius: 0 75% 75% 75%;
  background-position: 0 0;
  transform: rotate(37.5deg) skew(30deg);
}
.ear.right {
  right: 0;
  border-radius: 75% 0 75% 75%;
  background-position: 100% 0;
  transform: rotate(-37.5deg) skew(-30deg);
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
