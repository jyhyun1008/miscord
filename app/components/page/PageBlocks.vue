<script setup lang="ts">
import type { DriveFile, PageBlock } from '~/types/misskey'

const props = defineProps<{ blocks: PageBlock[], files: DriveFile[], depth?: number }>()

const depth = computed(() => props.depth ?? 0)
const lightbox = ref<DriveFile | null>(null)

function file(id: string | null | undefined) {
  return id ? props.files.find(f => f.id === id) : undefined
}
</script>

<template>
  <div class="blocks">
    <template v-for="b in props.blocks" :key="b.id">
      <MfmText v-if="b.type === 'text' && b.text" class="text" :text="b.text" />

      <section v-else-if="b.type === 'section'" class="section" :class="`d${Math.min(depth, 2)}`">
        <component :is="depth === 0 ? 'h2' : depth === 1 ? 'h3' : 'h4'" class="heading">{{ b.title }}</component>
        <PageBlocks :blocks="b.children ?? []" :files="props.files" :depth="depth + 1" />
      </section>

      <template v-else-if="b.type === 'image'">
        <button v-if="file(b.fileId)?.type.startsWith('image/')" class="image" @click="lightbox = file(b.fileId)!">
          <img :src="file(b.fileId)!.url" :alt="file(b.fileId)!.comment ?? ''" loading="lazy">
        </button>
        <a v-else-if="file(b.fileId)" class="attach" :href="safeHttpUrl(file(b.fileId)!.url)" target="_blank" rel="noopener noreferrer">
          <Icon name="clip" :size="14" /> {{ file(b.fileId)!.name }}
        </a>
        <p v-else class="missing"><Icon name="image" :size="14" /> 이미지 ({{ b.fileId }})</p>
      </template>

      <PageNoteEmbed v-else-if="b.type === 'note' && b.note" :note-id="b.note" :detailed="!!b.detailed" />

      <p v-else-if="b.type !== 'text' && b.type !== 'note'" class="missing">
        <Icon name="warn" :size="14" /> 지원하지 않는 블록 ({{ b.type }})
      </p>
    </template>

    <ImageLightbox v-if="lightbox" :images="[lightbox]" :initial-index="0" @close="lightbox = null" />
  </div>
</template>

<style scoped>
.blocks {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.7;
}
.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
/* Sub-sections sit flush like Misskey's; the heading size carries the hierarchy */
.section.d1,
.section.d2 {
  margin-top: 4px;
}
.heading {
  margin: 0;
  color: var(--fg-strong);
  font-weight: 700;
  line-height: 1.3;
}
h2.heading {
  font-size: 26px;
  font-weight: 800;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
h3.heading {
  font-size: 21px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
h4.heading {
  font-size: 18px;
}
.image {
  display: block;
  align-self: flex-start;
  max-width: 100%;
  padding: 0;
  border-radius: var(--radius);
  overflow: hidden;
  cursor: zoom-in;
}
.image img {
  display: block;
  max-width: 100%;
  max-height: 520px;
  object-fit: contain;
  background: var(--bg-embed);
}
.attach {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--bg-embed);
  color: var(--fg-link);
}
.missing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  margin: 0;
  padding: 8px 12px;
  border-radius: var(--radius);
  border: 1px dashed var(--bg-active);
  font-size: 13px;
  color: var(--fg-faint);
}

/* Stay below the page title, which shrinks to 24px on phones */
@media (max-width: 768px) {
  h2.heading {
    font-size: 22px;
  }
  h3.heading {
    font-size: 19px;
  }
  h4.heading {
    font-size: 17px;
  }
}
</style>
