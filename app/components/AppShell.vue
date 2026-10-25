<script setup lang="ts">
const ui = useUi()
</script>

<template>
  <div
    class="shell"
    :class="{ 'nav-open': ui.navOpen, 'members-open': ui.membersOpen }"
  >
    <aside class="rail">
      <slot name="rail" />
    </aside>
    <aside class="sidebar">
      <slot name="sidebar" />
    </aside>
    <main class="main">
      <slot />
    </main>
    <aside class="members">
      <slot name="members" />
    </aside>
    <div class="scrim" @click="ui.navOpen = false; ui.membersOpen = false" />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: var(--rail-w) var(--sidebar-w) minmax(0, 1fr) var(--members-w);
  height: 100dvh;
  overflow: hidden;
}
.rail {
  background: var(--bg-rail);
  overflow: hidden;
}
.sidebar {
  background: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.main {
  background: var(--bg-main);
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.members {
  background: var(--bg-sidebar);
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.scrim {
  display: none;
}

/* Hide the member list by default on mid-width screens, toggle from the header */
@media (max-width: 1100px) {
  .shell {
    grid-template-columns: var(--rail-w) var(--sidebar-w) minmax(0, 1fr);
  }
  .members {
    display: none;
  }
  .shell.members-open {
    grid-template-columns: var(--rail-w) var(--sidebar-w) minmax(0, 1fr) var(--members-w);
  }
  .shell.members-open .members {
    display: flex;
  }
}

/* Mobile: rail + sidebar become a left drawer, members a right drawer */
@media (max-width: 768px) {
  .shell,
  .shell.members-open {
    grid-template-columns: minmax(0, 1fr);
  }
  .main {
    grid-column: 1;
    grid-row: 1;
  }
  .rail,
  .sidebar,
  .members,
  .shell.members-open .members {
    display: flex;
    position: fixed;
    top: 0;
    bottom: 0;
    z-index: 30;
    transition: transform 0.2s ease;
  }
  .rail {
    left: 0;
    width: var(--rail-w);
    transform: translateX(calc(-1 * (var(--rail-w) + var(--sidebar-w))));
  }
  .sidebar {
    left: var(--rail-w);
    width: min(var(--sidebar-w), calc(100vw - var(--rail-w) - 48px));
    transform: translateX(calc(-1 * (var(--rail-w) + var(--sidebar-w))));
  }
  .members {
    right: 0;
    width: min(var(--members-w), calc(100vw - 48px));
    transform: translateX(100%);
  }
  .nav-open .rail,
  .nav-open .sidebar,
  .members-open .members {
    transform: none;
  }
  .nav-open .scrim,
  .members-open .scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 20;
    background: rgba(0, 0, 0, 0.5);
  }
}
</style>
