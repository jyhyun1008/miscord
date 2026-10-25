<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { CustomEmoji } from '~/types/misskey'

const props = defineProps<{ account: Account }>()

interface EmojiDetail extends CustomEmoji {
  license: string | null
  isSensitive: boolean
  localOnly: boolean
}

const PAGE = 240
const FAVORITES = '\u0000favorites'

const api = useApi(props.account)
const toast = useToast()
const { list, load } = useEmojis(props.account)
const { prefs, toggleFavoriteEmoji, moveFavoriteEmoji } = usePrefs(props.account.key)
const dragging = ref<string | null>(null)
onMounted(load)

const q = ref('')
const category = ref<string | null>(null)
// Big instances have 10k+ emojis; render a page at a time
const shown = ref(PAGE)

const categories = computed(() => {
  const counts = new Map<string, number>()
  for (const e of list.value ?? []) counts.set(e.category || '기타', (counts.get(e.category || '기타') ?? 0) + 1)
  return [...counts].map(([name, count]) => ({ name, count }))
})

const favoriteNames = computed(() => new Set(
  prefs.value.favoriteEmojis.filter(e => e.startsWith(':')).map(e => e.slice(1, -1)),
))

// Favorites keep the user's order, so they can be rearranged here too
const favoriteEmojis = computed(() => {
  const byName = new Map((list.value ?? []).map(e => [e.name, e]))
  return [...favoriteNames.value].map(n => byName.get(n)).filter((e): e is CustomEmoji => !!e)
})
const reordering = computed(() => category.value === FAVORITES && !q.value.trim())

const filtered = computed(() => {
  const s = q.value.trim().toLowerCase().replace(/^:|:$/g, '')
  const pool = category.value === FAVORITES ? favoriteEmojis.value : (list.value ?? [])
  return pool.filter((e) => {
    if (category.value && category.value !== FAVORITES && (e.category || '기타') !== category.value) return false
    return !s || e.name.toLowerCase().includes(s) || e.aliases?.some(a => a.toLowerCase().includes(s))
  })
})
watch([q, category], () => (shown.value = PAGE))

const selected = ref<CustomEmoji | null>(null)
const detail = ref<EmojiDetail | null>(null)

async function open(e: CustomEmoji) {
  selected.value = e
  detail.value = null
  try {
    const d = await api<EmojiDetail>('emoji', { name: e.name })
    if (selected.value?.name === e.name) detail.value = d
  }
  catch {}
}

async function copy(name: string) {
  try {
    await navigator.clipboard.writeText(`:${name}:`)
    toast.show(`:${name}: 를 복사했어요`)
  }
  catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div class="gallery">
    <input
      :value="q" class="field search" placeholder="이모지 이름이나 별칭으로 검색"
      @input="q = ($event.target as HTMLInputElement).value"
    >

    <div class="cats">
      <button class="cat" :class="{ on: category === null }" @click="category = null">
        전체 <small>{{ list?.length ?? 0 }}</small>
      </button>
      <button class="cat" :class="{ on: category === FAVORITES }" @click="category = FAVORITES">
        <Icon name="star" :size="12" /> 즐겨찾기 <small>{{ favoriteNames.size }}</small>
      </button>
      <button v-for="c in categories" :key="c.name" class="cat" :class="{ on: category === c.name }" @click="category = c.name">
        {{ c.name }} <small>{{ c.count }}</small>
      </button>
    </div>

    <p v-if="list === null" class="muted">불러오는 중…</p>
    <EmptyState v-else-if="!filtered.length" icon="smile">
      {{ category === FAVORITES && !q ? '즐겨찾기한 이모지가 없어요. 이모지를 눌러 추가해 보세요.' : '맞는 이모지가 없어요.' }}
    </EmptyState>

    <p v-if="reordering && filtered.length > 1" class="muted hint">끌어서 순서를 바꿀 수 있어요. 이모지 피커에도 이 순서로 나와요.</p>

    <div class="grid">
      <button
        v-for="e in filtered.slice(0, shown)" :key="e.name" class="tile" :class="{ dragging: dragging === e.name }" :title="`:${e.name}:`"
        :draggable="reordering"
        @dragstart="dragging = e.name" @dragend="dragging = null" @dragover.prevent
        @dragenter="reordering && dragging && moveFavoriteEmoji(`:${dragging}:`, `:${e.name}:`)"
        @click="open(e)"
      >
        <img :src="e.url" :alt="e.name" loading="lazy" referrerpolicy="no-referrer">
        <span class="tile-name">{{ e.name }}</span>
        <Icon v-if="favoriteNames.has(e.name)" class="tile-star" name="star" :size="12" />
      </button>
    </div>
    <button v-if="filtered.length > shown" class="btn ghost more" @click="shown += PAGE">
      더 보기 ({{ filtered.length - shown }}개 남음)
    </button>

    <BaseModal v-if="selected" :title="`:${selected.name}:`" :width="400" @close="selected = null">
      <div class="detail">
        <img class="big" :src="selected.url" :alt="selected.name" referrerpolicy="no-referrer">
        <dl>
          <dt>카테고리</dt>
          <dd>{{ selected.category || '기타' }}</dd>
          <template v-if="selected.aliases?.filter(Boolean).length">
            <dt>별칭</dt>
            <dd>{{ selected.aliases.filter(Boolean).join(', ') }}</dd>
          </template>
          <template v-if="detail?.license">
            <dt>라이선스</dt>
            <dd><MfmText :text="detail.license" /></dd>
          </template>
        </dl>
        <p v-if="detail?.isSensitive || detail?.localOnly" class="flags">
          <span v-if="detail.isSensitive" class="flag">민감한 이모지</span>
          <span v-if="detail.localOnly" class="flag">이 서버 전용</span>
        </p>
      </div>
      <template #footer>
        <button class="btn ghost" @click="copy(selected.name)"><Icon name="copy" :size="16" /> 복사</button>
        <button class="btn" @click="toggleFavoriteEmoji(`:${selected.name}:`)">
          <Icon name="star" :size="16" />
          {{ favoriteNames.has(selected.name) ? '즐겨찾기에서 빼기' : '즐겨찾기에 추가' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.search {
  width: 100%;
  margin-bottom: 10px;
}
.cats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 96px;
  overflow-y: auto;
  margin-bottom: 12px;
}
.cat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 12px;
  background: var(--bg-active);
  font-size: 13px;
  color: var(--fg-muted);
}
.cat:hover {
  color: var(--fg);
}
.cat.on {
  background: var(--accent);
  color: var(--accent-fg);
}
.cat small {
  opacity: 0.7;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 6px;
}
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 10px 4px 6px;
  border-radius: var(--radius);
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
}
.tile:hover {
  background: var(--bg-hover);
}
.tile.dragging {
  opacity: 0.4;
}
.hint {
  margin: 0 0 8px;
  font-size: 13px;
}
.tile img {
  width: 40px;
  height: 40px;
  object-fit: contain;
}
.tile-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--fg-muted);
}
.tile-star {
  position: absolute;
  top: 4px;
  right: 4px;
  color: #f0b232;
}
.tile-star :deep(path) {
  fill: currentColor;
}
.more {
  display: block;
  margin: 12px auto 0;
}
.detail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.big {
  width: 128px;
  height: 128px;
  object-fit: contain;
}
.detail dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  width: 100%;
  margin: 0;
  font-size: 14px;
}
.detail dt {
  color: var(--fg-muted);
}
.detail dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--fg);
}
.flags {
  display: flex;
  gap: 6px;
  margin: 0;
}
.flag {
  padding: 1px 8px;
  border-radius: 10px;
  background: var(--bg-active);
  font-size: 12px;
  color: var(--fg-muted);
}
.btn :deep(.icon) {
  vertical-align: -3px;
}
.muted {
  font-size: 14px;
  color: var(--fg-muted);
}
</style>
