import type { Ref } from 'vue'

export interface MfmSyntax {
  group: '기본' | '움직임' | '꾸미기'
  label: string
  /** Shown rendered in the palette */
  sample: string
  before: string
  after: string
  /** Inserted (and left selected) when nothing is selected */
  placeholder: string
  /** Needs its own line (center, quote, code block) */
  block?: boolean
}

const fn = (group: MfmSyntax['group'], label: string, head: string, placeholder = label): MfmSyntax =>
  ({ group, label, sample: `$[${head} ${placeholder}]`, before: `$[${head} `, after: ']', placeholder })

/** What Miscord renders (see utils/mfmFn.ts), grouped for the palette. */
export const MFM_SYNTAX: MfmSyntax[] = [
  { group: '기본', label: '굵게', sample: '**굵게**', before: '**', after: '**', placeholder: '굵게' },
  { group: '기본', label: '기울임', sample: '<i>기울임</i>', before: '<i>', after: '</i>', placeholder: '기울임' },
  { group: '기본', label: '취소선', sample: '~~취소선~~', before: '~~', after: '~~', placeholder: '취소선' },
  { group: '기본', label: '작게', sample: '<small>작게</small>', before: '<small>', after: '</small>', placeholder: '작게' },
  fn('기본', '크게', 'x2'),
  fn('기본', '더 크게', 'x3', '더'),
  fn('기본', '아주 크게', 'x4', '왕'),
  { group: '기본', label: '코드', sample: '`code`', before: '`', after: '`', placeholder: 'code' },
  { group: '기본', label: '링크', sample: '[링크](https://example.com)', before: '[', after: '](https://)', placeholder: '링크 글자' },
  { group: '기본', label: '검색창', sample: 'Misskey Search', before: '', after: ' Search', placeholder: '검색어', block: true },
  { group: '기본', label: '가운데', sample: '<center>가운데</center>', before: '<center>', after: '</center>', placeholder: '가운데', block: true },
  { group: '기본', label: '인용', sample: '> 인용', before: '> ', after: '', placeholder: '인용할 글', block: true },
  { group: '기본', label: '코드 블록', sample: '```\ncode\n```', before: '```\n', after: '\n```', placeholder: 'code', block: true },

  fn('움직임', '빙글빙글', 'spin'),
  fn('움직임', '반대로 빙글', 'spin.left', '빙글'),
  fn('움직임', '옆으로 빙글', 'spin.y', '빙글'),
  fn('움직임', '폴짝', 'jump'),
  fn('움직임', '통통', 'bounce'),
  fn('움직임', '부들부들', 'shake'),
  fn('움직임', '덜덜', 'twitch'),
  fn('움직임', '말랑', 'jelly'),
  fn('움직임', '짜잔', 'tada'),
  fn('움직임', '무지개', 'rainbow'),
  fn('움직임', '반짝', 'sparkle'),

  fn('꾸미기', '좌우 뒤집기', 'flip', '뒤집기'),
  fn('꾸미기', '상하 뒤집기', 'flip.v', '뒤집기'),
  fn('꾸미기', '기울이기', 'rotate.deg=30', '기울기'),
  fn('꾸미기', '글자색', 'fg.color=f55', '빨강'),
  fn('꾸미기', '배경색', 'bg.color=ff0', '형광펜'),
  fn('꾸미기', '테두리', 'border.radius=6', '테두리'),
  fn('꾸미기', '명조', 'font.serif', '명조체'),
  fn('꾸미기', '고정폭', 'font.monospace', 'mono'),
  fn('꾸미기', '흐리게', 'blur', '스포일러'),
  { group: '꾸미기', label: '루비(후리가나)', sample: '$[ruby 漢字 かんじ]', before: '$[ruby ', after: ' 읽는법]', placeholder: '글자' },
]

/**
 * Wrap the selection in `before…after` (or insert a selected placeholder),
 * putting block syntax on its own line.
 */
export function wrapSelection(el: HTMLTextAreaElement | null, text: Ref<string>, syntax: MfmSyntax) {
  const s = el?.selectionStart ?? text.value.length
  const e = el?.selectionEnd ?? s
  const inner = text.value.slice(s, e) || syntax.placeholder
  const lead = syntax.block && s > 0 && text.value[s - 1] !== '\n' ? '\n' : ''
  const trail = syntax.block && e < text.value.length && text.value[e] !== '\n' ? '\n' : ''
  const start = s + lead.length + syntax.before.length
  text.value = text.value.slice(0, s) + lead + syntax.before + inner + syntax.after + trail + text.value.slice(e)
  nextTick(() => {
    if (!el) return
    el.focus()
    el.setSelectionRange(start, start + inner.length)
  })
}

const MIRRORED = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'tabSize'] as const

/** Where the caret at `pos` sits inside the textarea (px from its top-left), via a hidden mirror. */
export function caretOffset(el: HTMLTextAreaElement, pos: number) {
  const cs = getComputedStyle(el)
  const div = document.createElement('div')
  for (const p of MIRRORED) div.style[p] = cs[p]
  Object.assign(div.style, { position: 'absolute', top: '0', left: '-9999px', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' })
  div.textContent = el.value.slice(0, pos)
  const span = document.createElement('span')
  span.textContent = el.value.slice(pos) || '.'
  div.appendChild(span)
  document.body.appendChild(div)
  const r = { top: span.offsetTop, left: span.offsetLeft, height: Number.parseFloat(cs.lineHeight) || span.offsetHeight }
  div.remove()
  return r
}
