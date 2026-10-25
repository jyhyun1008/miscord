<script setup lang="ts">
const props = defineProps<{ currentKey: string }>()
const { accounts } = useAccounts()

function initials(name: string) {
  return name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'
}
</script>

<template>
  <nav class="rail">
    <ul>
      <li
        v-for="a in accounts"
        :key="a.key"
        class="item"
        :class="{ active: a.key === props.currentKey }"
      >
        <span class="pill" />
        <NuxtLink :to="`/${a.key}/home`" class="server" :title="`${a.meta.name ?? a.host} — @${a.user.username}`">
          <img v-if="a.meta.iconUrl" :src="a.meta.iconUrl" alt="">
          <span v-else class="initials">{{ initials(a.meta.name ?? a.host) }}</span>
          <UserAvatar class="badge" :user="a.user" />
        </NuxtLink>
      </li>
      <li class="sep" />
      <li class="item">
        <span class="pill" />
        <NuxtLink to="/login" class="server add" title="계정 추가">
          <Icon name="plus" :size="24" />
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.rail {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 12px 0;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.item {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}
.pill {
  position: absolute;
  left: 0;
  top: 50%;
  width: 4px;
  height: 0;
  border-radius: 0 4px 4px 0;
  background: var(--fg-strong);
  transform: translateY(-50%);
  transition: height 0.15s;
}
.item:hover .pill {
  height: 20px;
}
.item.active .pill {
  height: 40px;
}
.server {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--bg-main);
  color: var(--fg);
  transition: border-radius 0.15s, background 0.15s;
  text-decoration: none;
}
.server > img:first-child {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}
.item:hover .server,
.item.active .server {
  border-radius: 16px;
  background: var(--accent);
  color: var(--accent-fg);
}
.initials {
  font-weight: 600;
  font-size: 15px;
}
.badge {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 3px solid var(--bg-rail);
  object-fit: cover;
}
.add {
  color: var(--accent);
}
.sep {
  width: 32px;
  height: 2px;
  border-radius: 1px;
  background: var(--bg-active);
}
</style>
