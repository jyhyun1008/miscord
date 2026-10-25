import type { Account } from './useAccounts'
import type { DriveFile, Page } from '~/types/misskey'

export type PagesTab = 'featured' | 'mine' | 'liked'

interface Feed {
  items: Page[]
  /** untilId for the next request; null once exhausted */
  cursor: string | null
}

const PAGE_SIZE = 30

/** Page gallery feeds, kept per account so going back from a page doesn't refetch. */
export function usePages(account: Account) {
  const api = useApi(account)
  const tab = useState<PagesTab>(`pages-tab:${account.key}`, () => 'featured')
  const feeds = useState<Partial<Record<PagesTab, Feed>>>(`pages:${account.key}`, () => ({}))

  async function fetchFeed(t: PagesTab, untilId?: string): Promise<Feed> {
    switch (t) {
      case 'featured':
        return { items: await api<Page[]>('pages/featured'), cursor: null }
      case 'mine': {
        const items = await api<Page[]>('i/pages', { limit: PAGE_SIZE, untilId })
        return { items, cursor: items.length >= PAGE_SIZE ? items.at(-1)!.id : null }
      }
      case 'liked': {
        const likes = await api<{ id: string, page: Page }[]>('i/page-likes', { limit: PAGE_SIZE, untilId })
        return { items: likes.map(l => l.page), cursor: likes.length >= PAGE_SIZE ? likes.at(-1)!.id : null }
      }
    }
  }

  async function load(t: PagesTab, force = false) {
    if (feeds.value[t] && !force) return
    feeds.value[t] = await fetchFeed(t)
  }

  async function loadMore(t: PagesTab) {
    const feed = feeds.value[t]
    if (!feed?.cursor) return
    const next = await fetchFeed(t, feed.cursor)
    const seen = new Set(feed.items.map(p => p.id))
    feed.items.push(...next.items.filter(p => !seen.has(p.id)))
    feed.cursor = next.cursor
  }

  /** Apply a change to every cached copy of a page. */
  function patch(pageId: string, fn: (p: Page) => void) {
    for (const feed of Object.values(feeds.value)) feed?.items.filter(p => p.id === pageId).forEach(fn)
  }

  function forget(pageId: string) {
    for (const feed of Object.values(feeds.value)) {
      if (feed) feed.items = feed.items.filter(p => p.id !== pageId)
    }
  }

  async function setLiked(page: Page, liked: boolean) {
    await api(liked ? 'pages/like' : 'pages/unlike', { pageId: page.id })
    const apply = (p: Page) => {
      if (!!p.isLiked === liked) return
      p.isLiked = liked
      p.likedCount += liked ? 1 : -1
    }
    apply(page)
    patch(page.id, apply)
    // The liked feed's order is like-time based; refetch next time it's opened
    delete feeds.value.liked
  }

  return { tab, feeds, load, loadMore, patch, forget, setLiked }
}

/** Public URL of a page on its home server. */
export function pageUrl(account: Account, page: Page) {
  const host = page.user.host ?? account.host
  return `https://${host}/@${page.user.username}/pages/${encodeURIComponent(page.name)}`
}

/** Miscord link anyone can open: in the app if they're logged in to that server, read-only otherwise. */
export function pageShareUrl(account: Account, page: Page) {
  return `${location.origin}/p/${account.host}/${page.id}`
}

/** Cover image for cards: eye-catching image, else the first image in the body. */
export function pageCover(page: Page) {
  if (page.eyeCatchingImage) return page.eyeCatchingImage
  const id = pageFirstImageId(page.content)
  return id ? page.attachedFiles.find(f => f.id === id) ?? null : null
}

/** Upload a file to the account's drive. */
export async function uploadDriveFile(account: Account, file: File) {
  const fd = new FormData()
  fd.append('i', account.token)
  fd.append('file', file)
  fd.append('name', file.name)
  const res = await fetch(`https://${normalizeHost(account.host)}/api/drive/files/create`, { method: 'POST', body: fd, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(120_000) })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error?.message ?? `업로드 실패 (${res.status})`)
  return body as DriveFile
}
