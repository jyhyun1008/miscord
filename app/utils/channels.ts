export type BuiltinKind = 'home' | 'local' | 'social' | 'global'

export type Channel =
  | { kind: BuiltinKind }
  | { kind: 'channel', id: string }
  | { kind: 'antenna', id: string }
  | { kind: 'list', id: string }
  | { kind: 'tag', tag: string }
  | { kind: 'user', id: string }
  | { kind: 'clip', id: string }
  /** Card overview of my clips (like Discord's thread/forum view), not a timeline */
  | { kind: 'clips' }

export type TimelineChannel = Exclude<Channel, { kind: 'clips' }>

export const BUILTIN_CHANNELS: { kind: BuiltinKind, label: string, topic: string }[] = [
  { kind: 'home', label: '홈', topic: '내가 팔로우한 사람들의 노트' },
  { kind: 'local', label: '로컬', topic: '이 서버의 모든 공개 노트' },
  { kind: 'social', label: '소셜', topic: '홈 + 로컬' },
  { kind: 'global', label: '글로벌', topic: '연합된 모든 서버의 공개 노트' },
]

export function parseChannel(parts: string[] | string | undefined): Channel | null {
  const [kind, arg] = Array.isArray(parts) ? parts : parts ? [parts] : []
  switch (kind) {
    case 'home':
    case 'local':
    case 'social':
    case 'global':
      return { kind }
    case 'clips':
      return { kind }
    case 'channel':
    case 'antenna':
    case 'clip':
    case 'list':
      return arg ? { kind, id: arg } : null
    case 'tag':
      return arg ? { kind, tag: decodeURIComponent(arg) } : null
    case 'user':
      return arg ? { kind, id: arg } : null
    default:
      return null
  }
}

export function channelPath(accountKey: string, ch: Channel): string {
  const base = `/${accountKey}`
  switch (ch.kind) {
    case 'channel':
    case 'antenna':
    case 'clip':
    case 'list':
    case 'user':
      return `${base}/${ch.kind}/${ch.id}`
    case 'tag':
      return `${base}/tag/${encodeURIComponent(ch.tag)}`
    default:
      return `${base}/${ch.kind}`
  }
}

export function sameChannel(a: Channel | null, b: Channel | null): boolean {
  return !!a && !!b && channelId(a) === channelId(b)
}

export function channelId(ch: Channel): string {
  switch (ch.kind) {
    case 'channel':
    case 'antenna':
    case 'clip':
    case 'list':
    case 'user':
      return `${ch.kind}:${ch.id}`
    case 'tag':
      return `tag:${ch.tag.toLowerCase()}`
    default:
      return ch.kind
  }
}

/** REST endpoint + params for fetching a page of this channel. */
export function timelineRequest(ch: TimelineChannel): { endpoint: string, params: Record<string, unknown> } {
  switch (ch.kind) {
    case 'home':
      return { endpoint: 'notes/timeline', params: {} }
    case 'local':
      return { endpoint: 'notes/local-timeline', params: {} }
    case 'social':
      return { endpoint: 'notes/hybrid-timeline', params: {} }
    case 'global':
      return { endpoint: 'notes/global-timeline', params: {} }
    case 'channel':
      return { endpoint: 'channels/timeline', params: { channelId: ch.id } }
    case 'antenna':
      return { endpoint: 'antennas/notes', params: { antennaId: ch.id } }
    case 'list':
      return { endpoint: 'notes/user-list-timeline', params: { listId: ch.id } }
    case 'tag':
      return { endpoint: 'notes/search-by-tag', params: { tag: ch.tag } }
    case 'user':
      return { endpoint: 'users/notes', params: { userId: ch.id, withReplies: false } }
    case 'clip':
      return { endpoint: 'clips/notes', params: { clipId: ch.id } }
  }
}

/** Streaming channel to subscribe to, or null if the channel has no live stream. */
export function streamRequest(ch: TimelineChannel): { channel: string, params: Record<string, unknown> } | null {
  switch (ch.kind) {
    case 'home':
      return { channel: 'homeTimeline', params: {} }
    case 'local':
      return { channel: 'localTimeline', params: {} }
    case 'social':
      return { channel: 'hybridTimeline', params: {} }
    case 'global':
      return { channel: 'globalTimeline', params: {} }
    case 'channel':
      return { channel: 'channel', params: { channelId: ch.id } }
    case 'antenna':
      return { channel: 'antenna', params: { antennaId: ch.id } }
    case 'list':
      return { channel: 'userList', params: { listId: ch.id } }
    case 'tag':
      return { channel: 'hashtag', params: { q: [[ch.tag]] } }
    case 'user':
    case 'clip':
      return null
  }
}
