<script setup lang="ts">
/** A unicode emoji drawn as Twemoji (default) or the system font, per the user's setting. */
const props = defineProps<{ emoji: string }>()

const ui = useUi()
const failed = ref(false)
watch(() => props.emoji, () => (failed.value = false))
</script>

<template>
  <img
    v-if="ui.emojiStyle === 'twemoji' && !failed"
    class="twemoji"
    :src="twemojiUrl(props.emoji)"
    :alt="props.emoji"
    :title="props.emoji"
    draggable="false"
    loading="lazy"
    decoding="async"
    @error="failed = true"
  >
  <span v-else>{{ emojiPresentation(props.emoji) }}</span>
</template>

<style scoped>
/* em-sized so it follows whatever text it sits in (body, reaction pill, picker grid) */
.twemoji {
  display: inline-block;
  width: 1.25em;
  height: 1.25em;
  vertical-align: -0.25em;
}
</style>
