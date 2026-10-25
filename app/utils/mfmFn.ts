/**
 * Styles for MFM `$[fn …]`, following Misskey's MkMisskeyFlavoredMarkdown so notes look the same.
 * Every argument is validated before it reaches a style, since note authors control them.
 */

type Args = Record<string, string | true>

export interface FnRender {
  style?: Record<string, string>
  /** Extra class next to `mfm-fn mfm-fn-{name}` */
  cls?: string
}

const TIME = /^\d+(?:\.\d+)?m?s$/
const COLOR = /^[0-9a-f]{3,6}$/i
const FONTS = ['serif', 'monospace', 'cursive', 'fantasy', 'emoji', 'math']
const BORDER_STYLES = ['hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset']

const time = (v: string | true | undefined, fallback: string) => (typeof v === 'string' && TIME.test(v) ? v : fallback)
const color = (v: string | true | undefined) => (typeof v === 'string' && COLOR.test(v) ? `#${v}` : null)
function num(v: string | true | undefined, fallback: number, min: number, max: number) {
  const n = typeof v === 'string' ? Number.parseFloat(v) : Number.NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

function animation(keyframes: string, args: Args, speed: string, extra = '') {
  return {
    animation: `${keyframes} ${time(args.speed, speed)} linear infinite ${extra}`.trim(),
    animationDelay: time(args.delay, '0s'),
    ...(typeof args.loop === 'string' && /^\d+$/.test(args.loop) ? { animationIterationCount: args.loop } : {}),
  }
}

/** `null` means Miscord doesn't know the function: show the content unstyled. */
export function renderFn(name: string, args: Args, animate: boolean): FnRender | null {
  switch (name) {
    case 'x2':
    case 'x3':
    case 'x4':
    case 'blur':
      return {}
    case 'tada':
      return { style: { fontSize: '150%', ...(animate ? animation('mfm-tada', args, '1s', 'both') : {}) }, cls: 'mfm-anim' }
    case 'jelly':
      return { style: animate ? animation('mfm-rubberBand', args, '1s', 'both') : {}, cls: 'mfm-anim' }
    case 'twitch':
      return { style: animate ? animation('mfm-twitch', args, '0.5s') : {}, cls: 'mfm-anim' }
    case 'shake':
      return { style: animate ? animation('mfm-shake', args, '0.5s') : {}, cls: 'mfm-anim' }
    case 'spin': {
      if (!animate) return {}
      const keyframes = args.x ? 'mfm-spinX' : args.y ? 'mfm-spinY' : 'mfm-spin'
      const direction = args.left ? 'reverse' : args.alternate ? 'alternate' : 'normal'
      return { style: { ...animation(keyframes, args, '1.5s'), animationDirection: direction }, cls: 'mfm-anim' }
    }
    case 'jump':
      return { style: animate ? animation('mfm-jump', args, '0.75s') : {}, cls: 'mfm-anim' }
    case 'bounce':
      return { style: animate ? { ...animation('mfm-bounce', args, '0.75s'), transformOrigin: 'center bottom' } : {}, cls: 'mfm-anim' }
    case 'rainbow':
      return animate ? { style: animation('mfm-rainbow', args, '1s'), cls: 'mfm-anim' } : {}
    case 'sparkle':
      return animate ? { cls: 'mfm-sparkle mfm-anim' } : {}
    case 'flip': {
      const transform = args.h && args.v ? 'scale(-1, -1)' : args.v ? 'scaleY(-1)' : 'scaleX(-1)'
      return { style: { transform } }
    }
    case 'rotate':
      return { style: { transform: `rotate(${num(args.deg, 90, -360, 360)}deg)`, transformOrigin: 'center center' } }
    case 'position':
      return { style: { transform: `translate(${num(args.x, 0, -5, 5)}em, ${num(args.y, 0, -5, 5)}em)` } }
    case 'scale':
      return { style: { transform: `scale(${num(args.x, 1, -5, 5)}, ${num(args.y, 1, -5, 5)})` } }
    case 'crop':
      return { style: { clipPath: `inset(${['top', 'right', 'bottom', 'left'].map(k => `${num(args[k], 0, 0, 100)}%`).join(' ')})` } }
    case 'fg': {
      const c = color(args.color)
      return { style: c ? { color: c, overflowWrap: 'anywhere' } : {} }
    }
    case 'bg': {
      const c = color(args.color)
      return { style: c ? { backgroundColor: c, overflowWrap: 'anywhere' } : {} }
    }
    case 'border': {
      const style = typeof args.style === 'string' && BORDER_STYLES.includes(args.style) ? args.style : 'solid'
      return {
        style: {
          border: `${num(args.width, 1, 0, 20)}px ${style} ${color(args.color) ?? 'var(--accent)'}`,
          borderRadius: `${num(args.radius, 0, 0, 100)}px`,
          ...(args.noclip ? {} : { overflow: 'clip' }),
        },
      }
    }
    case 'font': {
      const family = FONTS.find(f => args[f])
      return { style: family ? { fontFamily: family } : {} }
    }
    default:
      return null
  }
}
