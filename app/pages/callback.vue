<script setup lang="ts">
const route = useRoute()
const error = ref('')

onMounted(async () => {
  const session = String(route.query.session ?? '')
  try {
    if (!session) throw new Error('세션 정보가 없습니다.')
    const account = await finishMiAuth(session)
    useAccounts().markUsed(account.key)
    await navigateTo(`/${account.key}/home`, { replace: true })
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})
</script>

<template>
  <div class="cb">
    <template v-if="error">
      <p class="err">{{ error }}</p>
      <NuxtLink class="btn" to="/login">다시 로그인</NuxtLink>
    </template>
    <template v-else>
      <div class="spinner" />
      <p>로그인 중…</p>
    </template>
  </div>
</template>

<style scoped>
.cb {
  height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--bg-rail);
  color: var(--fg-muted);
}
.err {
  color: var(--danger);
}
.spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid var(--bg-active);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
