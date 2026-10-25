export type ThemeMode = 'system' | 'dark' | 'light'
export type EmojiStyle = 'twemoji' | 'native'

/** Misskey's lime green; the default theme color. */
export const DEFAULT_ACCENT = '#86b300'
/** Presets offered in settings (any color can still be picked). */
export const ACCENT_PRESETS = [DEFAULT_ACCENT, '#5865f2', '#3498db', '#1abc9c', '#9b59b6', '#e91e63', '#e74c3c', '#e67e22', '#f1c40f']

interface UiState {
  navOpen: boolean
  membersOpen: boolean
  settingsOpen: boolean
  groupsOpen: boolean
  theme: ThemeMode
  /** Theme color shared by every account */
  accent: string
  /** How unicode emoji are drawn */
  emojiStyle: EmojiStyle
}

/** Transient UI state shared across layout pieces (drawers, modals, theme). */
export function useUi() {
  return useState<UiState>('ui', () => reactive({
    navOpen: false,
    membersOpen: false,
    settingsOpen: false,
    groupsOpen: false,
    theme: loadJson<ThemeMode>('miscord:theme', 'system'),
    accent: loadJson<string>('miscord:accent', DEFAULT_ACCENT),
    emojiStyle: loadJson<EmojiStyle>('miscord:emoji-style', 'twemoji'),
  })).value
}

export function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && !matchMedia('(prefers-color-scheme: light)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  saveJson('miscord:theme', mode)
}

/** Set the theme color; CSS derives hover/soft/link shades from --accent-base. */
export function applyAccent(color: string) {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_ACCENT
  const root = document.documentElement.style
  root.setProperty('--accent-base', hex)
  root.setProperty('--accent-fg', isLight(hex) ? '#060607' : '#ffffff')
  saveJson('miscord:accent', hex)
}

/** Whether dark text reads better than white on this color (WCAG relative luminance). */
function isLight(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.4
}
