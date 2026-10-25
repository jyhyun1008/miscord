<script setup lang="ts">
// Shared page links pass the server they came from
const host = ref(String(useRoute().query.host ?? ''))
const busy = ref(false)
const error = ref('')
const { accounts } = useAccounts()

const suggestions = ['misskey.io', 'misskey.design', 'mi.yumechi.jp', 'misskey.niri.la']

async function submit() {
  if (busy.value || !host.value.trim()) return
  let h = host.value.trim()
  busy.value = true
  error.value = ''
  try {
    h = normalizeHost(h)
    // Make sure it's actually a Misskey server before redirecting
    await apiCall(h, 'meta', { detail: false })
    startMiAuth(h)
  }
  catch {
    error.value = `${h} 에 연결할 수 없거나 Misskey 서버가 아닙니다.`
    busy.value = false
  }
}
</script>

<template>
  <div class="login">
    <form class="card" @submit.prevent="submit">
      <div class="logo">
        <img src="/icons/miscord.svg" width="64" height="64" alt="Miscord">
      </div>
      <h1>돌아오신 걸 환영해요!</h1>
      <p class="sub">Misskey 인스턴스로 로그인하세요</p>

      <label class="label" for="host">인스턴스 주소 <span class="req">*</span></label>
      <input
        id="host"
        v-model="host"
        class="field"
        placeholder="misskey.io"
        autocomplete="url"
        autocapitalize="off"
        spellcheck="false"
        autofocus
      >
      <div class="chips">
        <button v-for="s in suggestions" :key="s" type="button" class="chip" @click="host = s">
          {{ s }}
        </button>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <button class="btn wide" :disabled="busy || !host.trim()">
        {{ busy ? '연결 중…' : 'MiAuth로 로그인' }}
      </button>

      <p v-if="accounts.length" class="back">
        <NuxtLink to="/">← 앱으로 돌아가기</NuxtLink>
      </p>
    </form>
  </div>
</template>

<style scoped>
.login {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--accent-base) 35%, transparent), transparent 50%),
    radial-gradient(circle at 80% 80%, color-mix(in srgb, color-mix(in srgb, var(--accent-base), black 30%) 30%, transparent), transparent 55%),
    var(--bg-rail);
  overflow: auto;
}
.card {
  width: min(480px, 100%);
  padding: 32px;
  border-radius: var(--radius);
  background: var(--bg-main);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
}
.logo {
  color: var(--accent);
  align-self: center;
}
.logo img {
  display: block;
  border-radius: 16px;
}
h1 {
  margin: 8px 0 4px;
  text-align: center;
  font-size: 24px;
  color: var(--fg-strong);
}
.sub {
  margin: 0 0 20px;
  text-align: center;
  color: var(--fg-muted);
}
.label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--fg-muted);
  margin-bottom: 8px;
}
.req {
  color: var(--danger);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 16px;
}
.chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg-input);
  color: var(--fg-muted);
  font-size: 13px;
}
.chip:hover {
  color: var(--fg);
  background: var(--accent-soft);
}
.error {
  color: var(--danger);
  font-size: 14px;
  margin: 0 0 12px;
}
.wide {
  width: 100%;
  height: 44px;
}
.back {
  margin: 16px 0 0;
  text-align: center;
  font-size: 14px;
}
</style>
