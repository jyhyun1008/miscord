<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { UnicodeEmojiEntry } from '~/composables/useEmojis'

const props = defineProps<{ account: Account, anchor: HTMLElement }>()
const emit = defineEmits<{ pick: [emoji: string], close: [] }>()

const { list, recent, load, use } = useEmojis(props.account)
const { prefs, toggleFavoriteEmoji, moveFavoriteEmoji } = usePrefs(props.account.key)
const dragging = ref<string | null>(null)
const favorites = computed(() => prefs.value.favoriteEmojis)
// Last emoji under the pointer, shown in the footer so it can be starred (stays after the pointer leaves)
const hovered = ref<string | null>(null)
const q = ref('')
const input = ref<HTMLInputElement | null>(null)
const root = ref<HTMLElement | null>(null)
const pos = ref({ left: 0, top: 0 })

const W = 360
const H = 460

function place() {
  const r = props.anchor.getBoundingClientRect()
  const left = Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8))
  const top = r.top - H - 8 > 8 ? r.top - H - 8 : Math.min(r.bottom + 8, window.innerHeight - H - 8)
  pos.value = { left, top: Math.max(8, top) }
}

// Big instances have 10k+ emojis — categories stay folded until opened
const openCats = ref<Record<string, boolean>>({})

const customByCategory = computed(() => {
  const groups = new Map<string, { name: string, url: string }[]>()
  for (const e of list.value ?? []) {
    const cat = e.category || '기타'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(e)
  }
  return [...groups].map(([category, emojis]) => ({ category, emojis }))
})

const unicodeIndex = shallowRef<UnicodeEmojiEntry[]>([])
loadUnicodeEmojiIndex().then(index => (unicodeIndex.value = index))

const query = computed(() => q.value.trim().toLowerCase().replace(/^:|:$/g, ''))
const results = computed(() => {
  const s = query.value
  if (!s) return null
  return (list.value ?? [])
    .filter(e => e.name.toLowerCase().includes(s) || e.aliases?.some(a => a.toLowerCase().includes(s)))
    .slice(0, 120)
})
const unicodeResults = computed(() => query.value ? searchUnicodeEmojis(unicodeIndex.value, query.value) : [])

function pickFirstResult() {
  const custom = results.value?.[0]
  if (custom) pick(`:${custom.name}:`)
  else if (unicodeResults.value[0]) pick(unicodeResults.value[0])
}

function emojiUrl(token: string) {
  const name = token.replace(/^:|:$/g, '').replace(/@\.$/, '')
  return list.value?.find(e => e.name === name)?.url ?? `https://${props.account.host}/emoji/${name}.webp`
}

function pick(emoji: string) {
  use(emoji)
  emit('pick', emoji)
}

function toggleFavorite(emoji: string) {
  toggleFavoriteEmoji(emoji)
  hovered.value = emoji
}

function onDocDown(e: MouseEvent) {
  if (root.value && !root.value.contains(e.target as Node) && !props.anchor.contains(e.target as Node)) emit('close')
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  place()
  load()
  input.value?.focus()
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
    <div ref="root" class="picker" :style="{ left: `${pos.left}px`, top: `${pos.top}px`, width: `${W}px`, height: `${H}px` }">
      <!-- :value + @input instead of v-model, which waits for IME composition to end (Hangul) -->
      <input
        ref="input" :value="q" class="search" placeholder="이모지 검색 (이름, 한국어 키워드)"
        @input="q = ($event.target as HTMLInputElement).value" @keydown.enter="!$event.isComposing && pickFirstResult()"
      >
      <div class="scroll">
        <template v-if="results">
          <div class="grid">
            <button v-for="e in results" :key="e.name" :title="`:${e.name}:`" @mouseenter="hovered = `:${e.name}:`" @contextmenu.prevent="toggleFavorite(`:${e.name}:`)" @click="pick(`:${e.name}:`)">
              <img :src="e.url" :alt="e.name" loading="lazy" referrerpolicy="no-referrer">
            </button>
            <button v-for="e in unicodeResults" :key="e" :title="e" @mouseenter="hovered = e" @contextmenu.prevent="toggleFavorite(e)" @click="pick(e)">
              <UnicodeEmoji :emoji="e" />
            </button>
          </div>
          <p v-if="!results.length && !unicodeResults.length" class="none">검색 결과가 없어요</p>
        </template>
        <template v-else>
          <section v-if="favorites.length">
            <h4>즐겨찾기 <small>끌어서 순서 바꾸기</small></h4>
            <div class="grid">
              <button
                v-for="e in favorites" :key="e" :title="e" draggable="true" :class="{ dragging: dragging === e }"
                @dragstart="dragging = e" @dragend="dragging = null" @dragenter="dragging && moveFavoriteEmoji(dragging, e)" @dragover.prevent
                @mouseenter="hovered = e" @contextmenu.prevent="toggleFavorite(e)" @click="pick(e)"
              >
                <img v-if="e.startsWith(':')" :src="emojiUrl(e)" :alt="e" loading="lazy" referrerpolicy="no-referrer">
                <UnicodeEmoji v-else :emoji="e" />
              </button>
            </div>
          </section>
          <section v-if="recent.length">
            <h4>최근 사용</h4>
            <div class="grid">
              <button v-for="e in recent" :key="e" :title="e" @mouseenter="hovered = e" @contextmenu.prevent="toggleFavorite(e)" @click="pick(e)">
                <img v-if="e.startsWith(':')" :src="emojiUrl(e)" :alt="e" loading="lazy" referrerpolicy="no-referrer">
                <UnicodeEmoji v-else :emoji="e" />
              </button>
            </div>
          </section>
          <section v-for="g in customByCategory" :key="`c-${g.category}`">
            <h4 class="fold" @click="openCats[g.category] = !openCats[g.category]">
              <Icon name="chevron" :size="12" :class="{ rot: !openCats[g.category] }" />
              {{ g.category }} <small>{{ g.emojis.length }}</small>
            </h4>
            <div v-if="openCats[g.category]" class="grid">
              <button v-for="e in g.emojis" :key="e.name" :title="`:${e.name}:`" @mouseenter="hovered = `:${e.name}:`" @contextmenu.prevent="toggleFavorite(`:${e.name}:`)" @click="pick(`:${e.name}:`)">
                <img :src="e.url" :alt="e.name" loading="lazy" referrerpolicy="no-referrer">
              </button>
            </div>
          </section>
          <p v-if="list === null" class="none">커스텀 이모지 불러오는 중…</p>
          <section v-for="g in UNICODE_EMOJIS" :key="g.category">
            <h4>{{ g.category }}</h4>
            <div class="grid">
              <button v-for="e in g.emojis" :key="e" :title="e" @mouseenter="hovered = e" @contextmenu.prevent="toggleFavorite(e)" @click="pick(e)">
                <UnicodeEmoji :emoji="e" />
              </button>
            </div>
          </section>
        </template>
      </div>
      <footer class="foot">
        <template v-if="hovered">
          <img v-if="hovered.startsWith(':')" class="foot-emoji" :src="emojiUrl(hovered)" :alt="hovered" referrerpolicy="no-referrer">
          <UnicodeEmoji v-else class="foot-emoji" :emoji="hovered" />
          <span class="foot-name">{{ hovered }}</span>
          <button
            class="star"
            :class="{ on: favorites.includes(hovered) }"
            :title="favorites.includes(hovered) ? '즐겨찾기에서 빼기' : '즐겨찾기에 추가'"
            @click="toggleFavorite(hovered)"
          >
            <Icon name="star" :size="16" />
          </button>
        </template>
        <span v-else class="foot-hint">이모지를 우클릭하면 즐겨찾기에 추가돼요</span>
      </footer>
    </div>
  </Teleport>
</template>

<style scoped>
.picker {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 16px);
  border-radius: 8px;
  background: var(--bg-sidebar);
  box-shadow: var(--shadow), 0 0 0 1px var(--border);
  overflow: hidden;
}
.search {
  margin: 10px;
  height: 34px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  background: var(--bg-rail);
  outline: none;
}
:root[data-theme='light'] .search {
  background: var(--bg-input);
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 10px 10px;
}
h4 {
  position: sticky;
  top: 0;
  margin: 0;
  padding: 6px 0 4px;
  background: var(--bg-sidebar);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--fg-muted);
}
h4.fold {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
h4.fold:hover {
  color: var(--fg);
}
h4.fold small {
  font-weight: 400;
  color: var(--fg-faint);
}
h4 .rot {
  transform: rotate(-90deg);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
}
.grid button {
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  font-size: 24px;
  line-height: 1;
}
.grid button:hover {
  background: var(--bg-active);
}
.grid button.dragging {
  opacity: 0.4;
}
h4 small {
  margin-left: 4px;
  font-weight: 400;
  text-transform: none;
  color: var(--fg-faint);
}
.grid img {
  width: 30px;
  height: 30px;
  object-fit: contain;
}
.foot {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  flex-shrink: 0;
  padding: 0 10px;
  border-top: 1px solid var(--border);
  background: var(--bg-rail);
}
:root[data-theme='light'] .foot {
  background: var(--bg-input);
}
.foot-emoji {
  width: 26px;
  height: 26px;
  object-fit: contain;
  font-size: 22px;
  line-height: 1;
}
.foot-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
}
.foot-hint {
  font-size: 12px;
  color: var(--fg-faint);
}
.star {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 4px;
  color: var(--fg-muted);
}
.star:hover {
  background: var(--bg-active);
  color: var(--fg);
}
.star.on {
  color: #f0b232;
}
.star.on :deep(path) {
  fill: currentColor;
}
.none {
  text-align: center;
  color: var(--fg-muted);
  font-size: 14px;
}
</style>
