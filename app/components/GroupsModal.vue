<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'

const props = defineProps<{ account: Account }>()
const emit = defineEmits<{ close: [] }>()

const { prefs, addGroup, updateGroup, removeGroup, moveItem } = usePrefs(props.account.key)

const colors = GROUP_COLORS
const name = ref('')
const color = ref(GROUP_COLORS[prefs.value.groups.length % GROUP_COLORS.length]!)

const counts = computed(() => {
  const c: Record<string, number> = {}
  for (const gid of Object.values(prefs.value.userGroups)) c[gid] = (c[gid] ?? 0) + 1
  return c
})

function submit() {
  if (!name.value.trim()) return
  addGroup(name.value, color.value)
  name.value = ''
  color.value = GROUP_COLORS[prefs.value.groups.length % GROUP_COLORS.length]!
}

function rename(id: string, e: Event) {
  const v = (e.target as HTMLInputElement).value.trim()
  if (v) updateGroup(id, { name: v })
}

function onRemove(id: string, groupName: string) {
  if (confirm(`'${groupName}' 분류를 삭제할까요? 사람들은 '그 외 팔로잉'으로 돌아가요.`)) removeGroup(id)
}
</script>

<template>
  <BaseModal title="팔로잉 분류" subtitle="멤버 목록을 분류별로 나누고 이름에 색을 입혀요. 이 브라우저에만 저장돼요." :width="480" @close="emit('close')">
    <ul v-if="prefs.groups.length" class="groups">
      <li v-for="(g, i) in prefs.groups" :key="g.id">
        <label class="swatch" :style="{ background: g.color }" title="색상 바꾸기">
          <input type="color" :value="g.color" @input="updateGroup(g.id, { color: ($event.target as HTMLInputElement).value })">
        </label>
        <input class="name" :value="g.name" :style="{ color: g.color }" @change="rename(g.id, $event)">
        <span class="count">{{ counts[g.id] ?? 0 }}명</span>
        <button class="icon-btn" title="위로" :disabled="i === 0" @click="moveItem('groups', i, i - 1)"><Icon name="up" :size="16" /></button>
        <button class="icon-btn" title="아래로" :disabled="i === prefs.groups.length - 1" @click="moveItem('groups', i, i + 1)"><Icon name="down" :size="16" /></button>
        <button class="icon-btn del" title="삭제" @click="onRemove(g.id, g.name)"><Icon name="trash" :size="16" /></button>
      </li>
    </ul>
    <p v-else class="empty">아직 분류가 없어요. 아래에서 만들고, 프로필 팝아웃에서 사람을 분류에 넣어주세요.</p>

    <form class="new" @submit.prevent="submit">
      <label for="group-name">새 분류</label>
      <div class="row">
        <input id="group-name" v-model="name" class="field" placeholder="예: 친구, 작가, 뉴스" autocomplete="off">
        <button class="btn" :disabled="!name.trim()">만들기</button>
      </div>
      <div class="palette">
        <button
          v-for="c in colors"
          :key="c"
          type="button"
          class="chip"
          :class="{ on: color === c }"
          :style="{ background: c }"
          :title="c"
          @click="color = c"
        />
        <label class="chip custom" :class="{ on: !colors.includes(color) }" :style="{ background: color }" title="직접 고르기">
          <input v-model="color" type="color">
          <Icon name="plus" :size="14" />
        </label>
      </div>
    </form>

    <template #footer>
      <button class="btn" @click="emit('close')">완료</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.groups {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.groups li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 8px;
  border-radius: 4px;
  background: var(--bg-sidebar);
}
.swatch,
.chip {
  position: relative;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  cursor: pointer;
}
.swatch input,
.chip input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.name {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 6px;
  border: none;
  border-radius: 3px;
  background: transparent;
  font-weight: 600;
  outline: none;
}
.name:focus {
  background: var(--bg-rail);
}
.count {
  font-size: 12px;
  color: var(--fg-faint);
  white-space: nowrap;
}
.icon-btn:disabled {
  opacity: 0.3;
  pointer-events: none;
}
.del:hover {
  color: var(--danger);
}
.empty {
  margin: 0 0 16px;
  font-size: 14px;
  color: var(--fg-muted);
}
.new label {
  display: block;
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--fg-muted);
}
.row {
  display: flex;
  gap: 8px;
}
.palette {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.chip.on {
  box-shadow: 0 0 0 2px var(--bg-main), 0 0 0 4px var(--fg-strong);
}
.chip.custom {
  display: grid;
  place-items: center;
  color: #fff;
}
</style>
