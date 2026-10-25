<script setup lang="ts">
const ui = useUi()

onMounted(() => {
  applyTheme(ui.theme)
  applyAccent(ui.accent)
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyTheme(ui.theme))
})
watch(() => ui.theme, applyTheme)
watch(() => ui.accent, applyAccent)
watch(() => ui.emojiStyle, style => saveJson('miscord:emoji-style', style))
watch(() => ui.catSpeak, on => saveJson('miscord:cat-speak', on))
</script>

<template>
  <NuxtPage />
  <Toasts />
</template>
