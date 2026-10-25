<script setup lang="ts">
import type { Account } from '~/composables/useAccounts'
import { OPTIONAL_SECTIONS } from '~/composables/usePrefs'
import { ACCENT_PRESETS, DEFAULT_ACCENT, type EmojiStyle, type ThemeMode } from '~/composables/useUi'

const props = defineProps<{ account: Account }>()
const emit = defineEmits<{ close: [] }>()

const ui = useUi()
const toast = useToast()
const { accounts, remove, upsert } = useAccounts()
const { prefs, save, setSectionHidden } = usePrefs(props.account.key)
const { state: sync, syncNow, setEnabled: setSyncEnabled } = usePrefsSync(props.account)

const themes: { value: ThemeMode, label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'dark', label: '다크' },
  { value: 'light', label: '라이트' },
]
const tabs = [
  { key: 'appearance', label: '화면' },
  { key: 'general', label: '일반' },
  { key: 'sync', label: '동기화' },
  { key: 'accounts', label: '계정' },
] as const
const tab = ref<typeof tabs[number]['key']>('appearance')

const emojiStyles: { value: EmojiStyle, label: string }[] = [
  { value: 'twemoji', label: 'Twemoji' },
  { value: 'native', label: '시스템' },
]

async function refreshProfile() {
  try {
    const user = await apiCall<Account['user']>(props.account.host, 'i', {}, props.account.token)
    upsert({ ...props.account, user })
    toast.show('프로필 정보를 갱신했습니다')
  }
  catch (e) {
    toast.error(e)
  }
}

async function logout(key: string) {
  if (!confirm(`${key} 계정을 로그아웃할까요?\n(이 기기에서 토큰과 채널 설정이 삭제됩니다)`)) return
  if (key === props.account.key) {
    // Leave the account's page before removing it; removing first blanks the page
    // and its own fallback redirect races with this one.
    emit('close')
    const next = accounts.value.find(a => a.key !== key)
    await navigateTo(next ? `/${next.key}/home` : '/login', { replace: true })
  }
  closeStream(key)
  remove(key)
}
</script>

<template>
  <BaseModal title="설정" :width="520" @close="emit('close')">
    <nav class="tabs settings-tabs" role="tablist">
      <button
        v-for="t in tabs" :key="t.key" class="tab" role="tab" :aria-selected="tab === t.key" :class="{ on: tab === t.key }"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </nav>

    <div v-if="tab === 'appearance'" class="panel">
      <section>
        <h3>테마</h3>
        <div class="seg">
          <button v-for="t in themes" :key="t.value" :class="{ on: ui.theme === t.value }" @click="ui.theme = t.value">
            {{ t.label }}
          </button>
        </div>
      </section>

      <section>
        <h3>테마 색 <span class="hint">모든 계정 공통</span></h3>
        <div class="swatches">
          <button
            v-for="c in ACCENT_PRESETS" :key="c" class="swatch" :class="{ on: ui.accent.toLowerCase() === c }"
            :style="{ background: c }" :title="c" @click="ui.accent = c"
          />
          <label class="swatch custom" :class="{ on: !ACCENT_PRESETS.includes(ui.accent.toLowerCase()) }" title="직접 고르기">
            <input v-model="ui.accent" type="color" class="sr-only">
            <Icon name="plus" :size="16" />
          </label>
          <button v-if="ui.accent.toLowerCase() !== DEFAULT_ACCENT" class="btn ghost reset" @click="ui.accent = DEFAULT_ACCENT">기본값</button>
        </div>
      </section>

      <section>
        <h3>이모지 스타일 <span class="hint">모든 계정 공통</span></h3>
        <div class="seg">
          <button v-for="s in emojiStyles" :key="s.value" :class="{ on: ui.emojiStyle === s.value }" @click="ui.emojiStyle = s.value">
            {{ s.label }}
          </button>
        </div>
      </section>

      <section>
        <h3>고양이 모드 <span class="hint">모든 계정 공통</span></h3>
        <ul class="toggles">
          <li>
            <label class="toggle">
              <span>고양이 계정의 노트를 고양이 말투로 보기 <small class="hint">나→냐, 다→다냥</small></span>
              <input v-model="ui.catSpeak" type="checkbox" class="sr-only">
              <span class="switch" aria-hidden="true" />
            </label>
          </li>
        </ul>
      </section>

      <section>
        <h3>MFM <span class="hint">모든 계정 공통</span></h3>
        <ul class="toggles">
          <li>
            <label class="toggle">
              <span>움직이는 MFM 재생 <small class="hint">$[spin] $[jump] $[shake]…</small></span>
              <input v-model="ui.mfmAnimation" type="checkbox" class="sr-only">
              <span class="switch" aria-hidden="true" />
            </label>
          </li>
        </ul>
      </section>

    </div>

    <div v-else-if="tab === 'general'" class="panel">
      <section>
        <h3>기본 공개 범위</h3>
        <select v-model="prefs.defaultVisibility" class="field" @change="save">
          <option value="public">공개</option>
          <option value="home">홈</option>
          <option value="followers">팔로워 전용</option>
        </select>
      </section>

      <section>
        <h3>사이드바 항목</h3>
        <ul class="toggles two-col">
          <li v-for="s in OPTIONAL_SECTIONS" :key="s.key">
            <label class="toggle">
              <span>{{ s.label }}</span>
              <input
                type="checkbox" class="sr-only" :checked="!prefs.hiddenSections[s.key]"
                @change="setSectionHidden(s.key, !($event.target as HTMLInputElement).checked)"
              >
              <span class="switch" aria-hidden="true" />
            </label>
          </li>
        </ul>
      </section>

    </div>

    <div v-else-if="tab === 'sync'" class="panel">
      <section>
        <h3>설정 동기화 <span class="hint">즐겨찾기 이모지·그룹·해시태그·사이드바</span></h3>
        <ul class="toggles">
          <li>
            <label class="toggle">
              <span>이 기기에서 기기 간 동기화 사용</span>
              <input
                type="checkbox" class="sr-only" :checked="sync.status !== 'off'"
                @change="setSyncEnabled(($event.target as HTMLInputElement).checked)"
              >
              <span class="switch" aria-hidden="true" />
            </label>
          </li>
        </ul>
        <template v-if="sync.status !== 'off'">
          <ReloginHint v-if="sync.status === 'denied'" :host="props.account.host">설정을 동기화하려면</ReloginHint>
          <p v-else-if="sync.status === 'unsupported'" class="sync-line">이 서버는 비공개 Play를 지원하지 않아서 이 기기에만 저장돼요.</p>
          <div v-else class="sync-line">
            <span v-if="sync.status === 'syncing'">동기화 중…</span>
            <span v-else-if="sync.status === 'synced'">{{ formatStamp(new Date(sync.at!).toISOString()) }}에 동기화했어요</span>
            <span v-else-if="sync.status === 'error'" class="sync-err">동기화하지 못했어요 · {{ sync.error }}</span>
            <span v-else>아직 동기화하지 않았어요</span>
            <button class="btn small ghost" :disabled="sync.status === 'syncing'" @click="syncNow()">지금 동기화</button>
          </div>
        </template>
        <p class="sync-note">켜면 내 비공개 Play 「Miscord 설정」에 저장해서 다른 기기와 맞춰요. 동기화할 기기마다 켜 주세요.</p>
      </section>
    </div>

    <div v-else class="panel">
      <section>
        <h3>계정</h3>
        <ul class="accounts">
          <li v-for="a in accounts" :key="a.key">
            <UserAvatar class="account-avatar" :user="a.user" />
            <div class="who">
              <MfmText class="dn" :text="displayName(a.user)" :emojis="a.user.emojis" plain />
              <span class="key">@{{ a.key }}</span>
            </div>
            <span v-if="a.key === props.account.key" class="current">현재</span>
            <button class="icon-btn danger" title="로그아웃" @click="logout(a.key)">
              <Icon name="logout" :size="18" />
            </button>
          </li>
        </ul>
        <div class="row">
          <NuxtLink class="btn ghost" to="/login" @click="emit('close')"><Icon name="plus" :size="16" /> 계정 추가</NuxtLink>
          <button class="btn ghost" @click="refreshProfile">프로필 새로고침</button>
        </div>
      </section>

      <p class="about">
        Miscord — 디스코드 스타일 Misskey 클라이언트. 토큰은 이 브라우저의 localStorage에만 저장됩니다.
      </p>
    </div>
  </BaseModal>
</template>

<style scoped>
.settings-tabs {
  position: sticky;
  top: 0;
  z-index: 1;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-main);
}
/* Keep the modal from jumping in height between short and long tabs */
.panel {
  min-height: 280px;
}
section + section {
  margin-top: 20px;
}
h3 {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--fg-muted);
}
.seg {
  display: inline-flex;
  padding: 3px;
  border-radius: 6px;
  background: var(--bg-rail);
}
:root[data-theme='light'] .seg {
  background: var(--bg-input);
}
.seg button {
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 14px;
  color: var(--fg-muted);
}
.seg button.on {
  background: var(--accent);
  color: var(--accent-fg);
}
.sync-line {
  display: flex;
  margin-top: 8px;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 14px;
  color: var(--fg);
}
.sync-err {
  color: var(--danger);
}
.sync-note {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--fg-faint);
}
.hint {
  margin-left: 6px;
  font-weight: 500;
  text-transform: none;
  color: var(--fg-faint);
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.swatch {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--border);
}
.swatch.on {
  outline: 2px solid var(--fg-strong);
  outline-offset: 2px;
}
.swatch.custom {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--fg-muted);
  background: var(--bg-input);
}
.swatch.custom.on {
  background: var(--accent);
  color: var(--accent-fg);
}
.reset {
  height: 32px;
  padding: 0 10px;
  font-size: 13px;
}
.toggles {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px 16px;
}
/* Short labels like the sidebar sections fit two to a row */
.toggles.two-col {
  grid-template-columns: repeat(2, 1fr);
}
.toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
  color: var(--fg);
}
/* Discord-style switch */
.switch {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--bg-active);
  transition: background 0.15s;
}
.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
input:checked + .switch {
  background: var(--accent);
}
input:checked + .switch::after {
  transform: translateX(16px);
}
input:focus-visible + .switch {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.accounts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.accounts li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 6px;
  background: var(--bg-sidebar);
}
.account-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}
.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.dn {
  font-weight: 600;
  color: var(--fg-strong);
}
.key {
  font-size: 12px;
  color: var(--fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
}
.current {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
}
.danger:hover {
  color: var(--danger);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.about {
  margin: 24px 0 0;
  font-size: 12px;
  color: var(--fg-faint);
}
</style>
