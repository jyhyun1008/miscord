import type { PageBlock } from '~/types/misskey'

/*
 * Misskey Pages store content as a tree of blocks, and its own editor makes you add
 * each block as a separate card. Here a page is written as one plain text document instead:
 *
 *   # Section title          → section block (## nests one level deeper, up to ######)
 *   Any other lines (MFM)    → text block
 *   ![이미지](file:<id>)      → image block
 *   ![노트](note:<id>)        → note block (`![자세히](note:<id>)` for a detailed one)
 *   https://<host>/notes/<id> on its own line → note block as well
 *   ![<type>](block:<id>)    → a block this editor doesn't understand, kept as-is
 *
 * Lines inside ``` fences are always text, so code can contain `#`.
 */

const HEADING = /^(#{1,6})[ \t]+(\S.*?)[ \t]*$/
const EMBED = /^!\[([^\]\n]*)\]\((file|note|block):([^\s)]+)\)[ \t]*$/
const FENCE = /^```/
const MAX_DEPTH = 6

export interface PageTextOptions {
  /** Blocks referenced by `block:<id>` lines; filled by pageBlocksToText. */
  keep?: Map<string, PageBlock>
  /** Local host, so pasted note URLs from it become note blocks. */
  host?: string
  newId?: () => string
}

export function pageBlocksToText(blocks: PageBlock[], keep: Map<string, PageBlock> = new Map(), depth = 0): string {
  const out: string[] = []
  for (const b of blocks) {
    switch (b.type) {
      case 'text':
        if (b.text?.trim()) out.push(b.text.replace(/\s+$/, ''))
        break
      case 'section': {
        out.push(`${'#'.repeat(Math.min(depth + 1, MAX_DEPTH))} ${b.title?.trim() || '제목 없음'}`)
        const inner = pageBlocksToText(b.children ?? [], keep, depth + 1)
        if (inner) out.push(inner)
        break
      }
      case 'image':
        if (b.fileId) out.push(`![이미지](file:${b.fileId})`)
        break
      case 'note':
        if (b.note) out.push(`![${b.detailed ? '자세히' : '노트'}](note:${b.note})`)
        break
      default:
        keep.set(b.id, b)
        out.push(`![${b.type}](block:${b.id})`)
    }
  }
  return out.join('\n\n')
}

export function pageTextToBlocks(src: string, opts: PageTextOptions = {}): PageBlock[] {
  const newId = opts.newId ?? (() => crypto.randomUUID())
  const noteUrl = opts.host
    ? new RegExp(`^https?://${opts.host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/notes/([a-zA-Z0-9]+)[ \\t]*$`)
    : null
  const root: PageBlock[] = []
  const stack: { level: number, children: PageBlock[] }[] = [{ level: 0, children: root }]
  const top = () => stack[stack.length - 1]!.children
  let buf: string[] = []
  let fenced = false

  function flush() {
    const text = buf.join('\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '')
    buf = []
    if (!text) return
    // Text split only by blank lines stays one block
    const prev = top().at(-1)
    if (prev?.type === 'text') prev.text = `${prev.text}\n\n${text}`
    else top().push({ id: newId(), type: 'text', text })
  }

  for (const line of src.split(/\r?\n/)) {
    if (fenced || FENCE.test(line)) {
      if (FENCE.test(line)) fenced = !fenced
      buf.push(line)
      continue
    }
    const h = HEADING.exec(line)
    if (h) {
      flush()
      const level = h[1]!.length
      while (stack.length > 1 && stack[stack.length - 1]!.level >= level) stack.pop()
      const section: PageBlock = { id: newId(), type: 'section', title: h[2]!, children: [] }
      top().push(section)
      stack.push({ level, children: section.children! })
      continue
    }
    const e = EMBED.exec(line)
    if (e && (e[2] !== 'block' || opts.keep?.has(e[3]!))) {
      const [, label, kind, ref] = e
      flush()
      top().push(kind === 'file'
        ? { id: newId(), type: 'image', fileId: ref! }
        : kind === 'note'
          ? { id: newId(), type: 'note', note: ref!, detailed: label === '자세히' }
          : opts.keep!.get(ref!)!)
      continue
    }
    const n = noteUrl?.exec(line)
    if (n) {
      flush()
      top().push({ id: newId(), type: 'note', note: n[1]!, detailed: false })
      continue
    }
    buf.push(line)
  }
  flush()
  return root
}

/** Plain-ish preview text for a gallery card. */
export function pageExcerpt(blocks: PageBlock[]): string {
  for (const b of blocks) {
    if (b.type === 'text' && b.text?.trim()) return b.text.trim()
    if (b.children) {
      const inner = pageExcerpt(b.children)
      if (inner) return inner
    }
  }
  return ''
}

/** First image block's file id, used as the card cover when the page has no eye-catching image. */
export function pageFirstImageId(blocks: PageBlock[]): string | null {
  for (const b of blocks) {
    if (b.type === 'image' && b.fileId) return b.fileId
    if (b.children) {
      const inner = pageFirstImageId(b.children)
      if (inner) return inner
    }
  }
  return null
}

/** Misskey's own constraint on page names (they are URL path segments). */
export const PAGE_NAME_RE = /^[^\s:/?#[\]@!$&'()*+,;=\\%]{1,256}$/
