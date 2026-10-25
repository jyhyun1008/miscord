<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import type { UserList } from '~/types/misskey'

const props = defineProps<{ account: Account }>()
const emit = defineEmits<{ close: [] }>()

const api = useApi(props.account)
const toast = useToast()
const { addList } = usePrefs(props.account.key)

const newName = ref('')
const creating = ref(false)

async function create() {
  const name = newName.value.trim()
  if (!name) return
  creating.value = true
  try {
    const list = await api<UserList>('users/lists/create', { name })
    toast.show(`리스트 "${name}"을(를) 만들었습니다. Misskey에서 멤버를 추가하세요.`)
    addList(list)
    emit('close')
    navigateTo(channelPath(props.account.key, { kind: 'list', id: list.id }))
  }
  catch (e) {
    toast.error(e)
  }
  finally {
    creating.value = false
  }
}
</script>

<template>
  <BaseModal title="새 리스트 만들기" subtitle="Misskey 리스트는 모두 채널로 표시돼요" @close="emit('close')">
    <form @submit.prevent="create">
      <label for="newlist">리스트 이름</label>
      <div class="row">
        <input id="newlist" v-model="newName" class="field" placeholder="리스트 이름" maxlength="100">
        <button class="btn" :disabled="creating || !newName.trim()">만들기</button>
      </div>
    </form>
  </BaseModal>
</template>

<style scoped>
label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--fg-muted);
}
.row {
  display: flex;
  gap: 8px;
}
</style>
