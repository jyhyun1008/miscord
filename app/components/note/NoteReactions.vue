<script setup lang="ts">
import type { Note, UserLite } from '~/types/misskey'

const props = defineProps<{ note: Note, host: string, canRenote?: boolean }>()
const emit = defineEmits<{ toggle: [reaction: string], renote: [], add: [anchor: HTMLElement] }>()

const account = useCurrentAccount()
const emojiStore = account.value ? useEmojis(account.value) : null
const localEmojis = computed(() => emojiStore?.byName.value)

const hovered = ref<string | null>(null)
const reactors = ref<UserLite[]>([])
const loadingReactors = ref(false)
const reactorsError = ref(false)
let hoverTimer: ReturnType<typeof setTimeout> | undefined
let requestId = 0
const root = ref<HTMLElement | null>(null)
let holdTimer: ReturnType<typeof setTimeout> | undefined
let touchPointer: { id: number, x: number, y: number } | null = null
let suppressClick = false
let pointerType = 'mouse'
// Pseudo reaction key for the renote chip, so it shares the reactors tooltip
const RENOTE = '\0renote'

function cancelHold() {
  clearTimeout(holdTimer)
  touchPointer = null
}

function onPointerDown(event: PointerEvent, reaction: string) {
  pointerType = event.pointerType
  cancelHold()
  suppressClick = false
  if (event.pointerType === 'mouse' || !event.isPrimary) return
  hideReactors()
  touchPointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
  holdTimer = setTimeout(() => {
    suppressClick = true
    showReactors(reaction)
  }, 500)
}

function onPointerMove(event: PointerEvent) {
  if (!touchPointer || touchPointer.id !== event.pointerId) return
  if (Math.hypot(event.clientX - touchPointer.x, event.clientY - touchPointer.y) > 10) {
    cancelHold()
    suppressClick = true
  }
}

function onPointerEnd(event: PointerEvent) {
  if (event.pointerId !== touchPointer?.id) return
  if (event.type === 'pointercancel') suppressClick = true
  cancelHold()
}

function onReactionClick(event: MouseEvent, reaction: string | null | undefined) {
  if (suppressClick) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if (reaction === RENOTE) emit('renote')
  else if (reaction) emit('toggle', reaction)
}

function onOutsidePointerDown(event: PointerEvent) {
  if (hovered.value && !root.value?.contains(event.target as Node)) hideReactors()
}

function onFocus(reaction: string) {
  if (pointerType === 'mouse') showReactors(reaction)
}

function onKeydown(event: KeyboardEvent) {
  pointerType = 'mouse'
  suppressClick = false
  if (event.key === 'Escape') hideReactors()
}

function hideReactors() {
  clearTimeout(hoverTimer)
  requestId++
  hovered.value = null
}

function showReactors(reaction: string) {
  if (hovered.value === reaction) return
  hideReactors()
  hovered.value = reaction
  reactors.value = []
  reactorsError.value = false
  loadingReactors.value = true
  const id = requestId
  const noteId = props.note.id
  hoverTimer = setTimeout(async () => {
    try {
      const token = account.value?.host === props.host ? account.value.token : undefined
      const rows = reaction === RENOTE
        ? await apiCall<{ user: UserLite }[]>(props.host, 'notes/renotes', { noteId, limit: 30 }, token)
        : await apiCall<{ user: UserLite }[]>(props.host, 'notes/reactions', { noteId, type: reaction, limit: 30 }, token)
      if (id === requestId) reactors.value = rows.map(row => row.user)
    }
    catch {
      if (id === requestId) reactorsError.value = true
    }
    finally {
      if (id === requestId) loadingReactors.value = false
    }
  }, 200)
}

watch(() => [props.note.id, props.host], () => {
  cancelHold()
  hideReactors()
})
onMounted(() => document.addEventListener('pointerdown', onOutsidePointerDown))
onBeforeUnmount(() => {
  cancelHold()
  hideReactors()
  document.removeEventListener('pointerdown', onOutsidePointerDown)
})

const broken = ref<Record<string, boolean>>({})

const items = computed(() =>
  Object.entries(props.note.reactions)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([r, count]) => ({ ...reactionInfo(r, props.note, props.host, localEmojis.value), count, mine: props.note.myReaction === r })),
)
</script>

<template>
  <div v-if="items.length || props.note.renoteCount > 0" ref="root" class="reactions">
    <div
      v-if="props.note.renoteCount > 0"
      class="reaction-wrap"
      @pointerenter="$event.pointerType === 'mouse' && showReactors(RENOTE)"
      @pointerleave="$event.pointerType === 'mouse' && hideReactors()"
      @focusin="onFocus(RENOTE)"
      @focusout="hideReactors"
      @keydown="onKeydown"
    >
      <button
        class="pill renotes"
        :class="{ mine: props.note.myRenoted }"
        :aria-disabled="!props.canRenote"
        :aria-pressed="props.canRenote ? !!props.note.myRenoted : undefined"
        :aria-label="`리노트 ${props.note.renoteCount}회${props.canRenote ? (props.note.myRenoted ? ' (누르면 리노트 취소)' : ' (누르면 리노트)') : ''}`"
        @pointerdown="onPointerDown($event, RENOTE)"
        @pointermove="onPointerMove"
        @pointerup="onPointerEnd"
        @pointercancel="onPointerEnd"
        @contextmenu.prevent
        @click="onReactionClick($event, props.canRenote ? RENOTE : null)"
      >
        <Icon name="renote" :size="16" />
        <span class="count">{{ props.note.renoteCount }}</span>
      </button>
      <div v-if="hovered === RENOTE" class="reactors" role="tooltip">
        <div class="reactors-heading">리노트 · {{ props.note.renoteCount }}회</div>
        <span v-if="loadingReactors" class="reactors-status">불러오는 중…</span>
        <span v-else-if="reactorsError" class="reactors-status">리노트한 사용자를 불러오지 못했어요</span>
        <template v-else>
          <div v-for="user in reactors" :key="user.id" class="reactor">
            <UserAvatar class="reactor-avatar" :user="user" />
            <span class="reactor-name">{{ displayName(user) }} <span class="reactor-acct">{{ acct(user) }}</span></span>
          </div>
          <span v-if="!reactors.length" class="reactors-status">표시할 사용자가 없어요</span>
        </template>
      </div>
    </div>
    <div
      v-for="r in items"
      :key="r.reaction"
      class="reaction-wrap"
      @pointerenter="$event.pointerType === 'mouse' && showReactors(r.reaction)"
      @pointerleave="$event.pointerType === 'mouse' && hideReactors()"
      @focusin="onFocus(r.reaction)"
      @focusout="hideReactors"
      @keydown="onKeydown"
    >
    <button
      class="pill"
      :class="{ mine: r.mine }"
      :aria-disabled="!r.sendAs && !r.mine"
      :aria-label="r.sendAs || r.mine ? r.label : `${r.label} (다른 서버의 이모지라 사용할 수 없어요)`"
      @pointerdown="onPointerDown($event, r.reaction)"
      @pointermove="onPointerMove"
      @pointerup="onPointerEnd"
      @pointercancel="onPointerEnd"
      @contextmenu.prevent
      @click="onReactionClick($event, r.mine ? r.reaction : r.sendAs)"
    >
      <img v-if="r.url && !broken[r.reaction]" :src="r.url" :alt="r.label" class="emoji" loading="lazy" referrerpolicy="no-referrer" @error="broken[r.reaction] = true">
      <span v-else-if="r.label.startsWith(':')" class="uni">{{ r.label }}</span>
      <UnicodeEmoji v-else class="uni" :emoji="r.label" />
      <span class="count">{{ r.count }}</span>
    </button>
    <div v-if="hovered === r.reaction" class="reactors" role="tooltip">
      <div class="reactors-heading">{{ r.label }} · {{ r.count }}명</div>
      <span v-if="loadingReactors" class="reactors-status">불러오는 중…</span>
      <span v-else-if="reactorsError" class="reactors-status">리액션한 사용자를 불러오지 못했어요</span>
      <template v-else>
        <div v-for="user in reactors" :key="user.id" class="reactor">
          <UserAvatar class="reactor-avatar" :user="user" />
          <span class="reactor-name">{{ displayName(user) }} <span class="reactor-acct">{{ acct(user) }}</span></span>
        </div>
        <span v-if="!reactors.length" class="reactors-status">표시할 사용자가 없어요</span>
        <span v-if="r.count > reactors.length && reactors.length" class="reactors-status">외 {{ r.count - reactors.length }}명</span>
      </template>
    </div>
    </div>
    <button class="pill add" title="반응 추가" @click="emit('add', $event.currentTarget as HTMLElement)">
      <Icon name="smile" :size="16" />
      <Icon name="plus" :size="10" class="plus" />
    </button>
  </div>
</template>

<style scoped>
.reaction-wrap {
  position: relative;
}
.reactors {
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 10;
  width: max-content;
  max-width: min(300px, 80vw);
  max-height: 280px;
  overflow-y: auto;
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-float);
  box-shadow: var(--shadow);
  color: var(--fg);
  font-size: 13px;
}
.reactors-heading { font-weight: 600; margin-bottom: 6px; }
.reactor { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
.reactor-avatar { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; }
.reactor-name { overflow-wrap: anywhere; }
.reactor-acct, .reactors-status { color: var(--fg-muted); }

.reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.pill {
  -webkit-touch-callout: none;
  user-select: none;
  touch-action: pan-y;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 7px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--bg-input);
  font-size: 14px;
  transition: border-color 0.1s;
}
.pill:hover:not([aria-disabled="true"]) {
  border-color: var(--fg-faint);
}
.pill[aria-disabled="true"] {
  cursor: default;
}
.pill.renotes {
  background: transparent;
  border-color: var(--bg-active);
  color: var(--accent);
}
.pill.mine {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.emoji {
  height: 18px;
  width: auto;
  max-width: 48px;
  object-fit: contain;
}
.uni {
  font-size: 16px;
  line-height: 1;
}
.count {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-muted);
}
.mine .count {
  color: var(--fg-link);
}
.add {
  position: relative;
  color: var(--fg-muted);
  opacity: 0;
}
.reactions:hover .add,
.add:focus-visible {
  opacity: 1;
}
.plus {
  position: absolute;
  right: 2px;
  top: 3px;
}
</style>
