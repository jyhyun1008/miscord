<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'

const props = defineProps<{ account: Account }>()
const emit = defineEmits<{ close: [] }>()

const api = useApi(props.account)
const { addTag } = usePrefs(props.account.key)

const tag = ref('')
const trending = ref<{ tag: string, usersCount: number }[]>([])

onMounted(async () => {
  try {
    trending.value = await api<{ tag: string, usersCount: number }[]>('hashtags/trend')
  }
  catch {
    // trend is optional
  }
})

function submit(value = tag.value) {
  const saved = addTag(value)
  if (!saved) return
  emit('close')
  navigateTo(channelPath(props.account.key, { kind: 'tag', tag: saved }))
}
</script>

<template>
  <BaseModal title="해시태그 채널 추가" subtitle="해시태그를 채널처럼 실시간으로 구독합니다" @close="emit('close')">
    <form @submit.prevent="submit()">
      <label for="tag">해시태그</label>
      <div class="input">
        <span>#</span>
        <input id="tag" v-model="tag" placeholder="misskey" autofocus autocomplete="off">
      </div>
    </form>

    <template v-if="trending.length">
      <h3>지금 뜨는 태그</h3>
      <div class="chips">
        <button v-for="t in trending" :key="t.tag" class="chip" @click="submit(t.tag)">
          #{{ t.tag }} <small>{{ t.usersCount }}</small>
        </button>
      </div>
    </template>

    <template #footer>
      <button class="btn ghost" @click="emit('close')">취소</button>
      <button class="btn" :disabled="!tag.trim().replace(/^#/, '')" @click="submit()">채널 만들기</button>
    </template>
  </BaseModal>
</template>

<style scoped>
label,
h3 {
  display: block;
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--fg-muted);
}
h3 {
  margin-top: 20px;
}
.input {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding: 0 10px;
  border-radius: 4px;
  background: var(--bg-rail);
  color: var(--fg-muted);
}
:root[data-theme='light'] .input {
  background: var(--bg-input);
}
.input input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--fg);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg-input);
  font-size: 13px;
}
.chip:hover {
  background: var(--accent-soft);
}
.chip small {
  color: var(--fg-faint);
}
</style>
