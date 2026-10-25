<script setup lang="ts">
const account = useAccounts().lastUsed()
await navigateTo(account ? `/${account.key}/home` : '/login', { replace: true })
</script>

<template>
  <div />
</template>
