<script setup lang="ts">
const route = useRoute()
const account = useCurrentAccount()
const channel = useCurrentChannel()
const { markUsed } = useAccounts()
const ui = useUi()

const addListOpen = ref(false)
const addTagOpen = ref(false)

// Bad account → back to the picker; bad channel → home of this account
watchEffect(() => {
  if (!account.value) {
    navigateTo('/', { replace: true })
    return
  }
  markUsed(account.value.key)
  useEmojis(account.value).load()
  if (!channel.value) navigateTo(channelPath(account.value.key, { kind: 'home' }), { replace: true })
})

// Close drawers whenever the route changes
watch(() => route.fullPath, () => {
  ui.navOpen = false
})
</script>

<template>
  <AppShell v-if="account">
    <template #rail>
      <ServerRail :current-key="account.key" />
    </template>
    <template #sidebar>
      <ChannelSidebar
        :key="account.key"
        :account="account"
        :channel="channel"
        @add-list="addListOpen = true"
        @add-tag="addTagOpen = true"
      />
    </template>

    <ClipsView v-if="channel?.kind === 'clips'" :key="`${account.key}:clips`" :account="account" />
    <ChatView
      v-else-if="channel"
      :key="`${account.key}:${channelId(channel)}`"
      :account="account"
      :channel="channel"
      @add-tag="addTagOpen = true"
    />

    <template #members>
      <MemberList :key="account.key" :account="account" />
    </template>
  </AppShell>

  <template v-if="account">
    <AddListModal :key="account.key" v-if="addListOpen" :account="account" @close="addListOpen = false" />
    <AddTagModal :key="account.key" v-if="addTagOpen" :account="account" @close="addTagOpen = false" />
    <ProfilePopout :key="account.key" :account="account" />
    <GroupsModal :key="account.key" v-if="ui.groupsOpen" :account="account" @close="ui.groupsOpen = false" />
    <SettingsModal :key="account.key" v-if="ui.settingsOpen" :account="account" @close="ui.settingsOpen = false" />
  </template>
</template>
