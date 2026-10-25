<script setup lang="ts">
/** Top bar shared by every main view: [drawer] [back] icon title | topic … actions [members] */
const props = withDefaults(defineProps<{
  icon: string
  title: string
  topic?: string | null
  /** Show a back button; goes back in history, or here when there is no in-app history */
  back?: Channel | null
}>(), { topic: null, back: null })

const ui = useUi()
const router = useRouter()
const account = useCurrentAccount()

function goBack() {
  if (window.history.state?.back) return router.back()
  if (account.value && props.back) return navigateTo(channelPath(account.value.key, props.back))
}
</script>

<template>
  <header class="head">
    <button class="icon-btn nav-btn" title="채널 목록" @click="ui.navOpen = true">
      <Icon name="menu" />
    </button>
    <button v-if="props.back" class="icon-btn back-btn" title="돌아가기" @click="goBack">
      <Icon name="back" />
    </button>
    <Icon :name="props.icon" :size="22" class="ch-icon" />
    <h1 class="title">{{ props.title }}</h1>
    <template v-if="props.topic">
      <span class="divider" />
      <span class="topic">{{ props.topic }}</span>
    </template>
    <slot />
    <span class="spacer" />
    <slot name="actions" />
    <button class="icon-btn" :class="{ on: ui.membersOpen }" title="멤버 목록" @click="ui.membersOpen = !ui.membersOpen">
      <Icon name="users" />
    </button>
  </header>
</template>

<style scoped>
.head {
  height: var(--header-h);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
  min-width: 0;
}
.nav-btn {
  display: none;
  margin-left: -8px;
}
.back-btn {
  margin-left: -8px;
}
.ch-icon {
  color: var(--fg-faint);
}
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--fg-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40%;
}
.divider {
  flex-shrink: 0;
  width: 1px;
  height: 24px;
  margin: 0 4px;
  background: var(--bg-active);
}
.topic {
  font-size: 14px;
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.spacer {
  flex: 1;
}
.icon-btn.on {
  color: var(--fg-strong);
}

@media (max-width: 768px) {
  .nav-btn {
    display: inline-flex;
  }
  .nav-btn + .back-btn {
    margin-left: 0;
  }
  .divider,
  .topic {
    display: none;
  }
  .title {
    max-width: none;
    flex: 1;
    min-width: 0;
  }
}
</style>
