// Minimal subset of Misskey entities used by this client.

export interface AvatarDecoration {
  id: string
  url: string
  angle?: number
  flipH?: boolean
  offsetX?: number
  offsetY?: number
}

export interface UserLite {
  id: string
  name: string | null
  username: string
  host: string | null
  avatarUrl: string | null
  avatarBlurhash?: string | null
  avatarDecorations?: AvatarDecoration[]
  isBot?: boolean
  isCat?: boolean
  emojis?: Record<string, string>
  onlineStatus?: 'online' | 'active' | 'offline' | 'unknown'
  instance?: {
    name: string | null
    iconUrl: string | null
    faviconUrl: string | null
    themeColor: string | null
  }
}

export interface UserDetailed extends UserLite {
  description: string | null
  bannerUrl: string | null
  followersCount: number
  followingCount: number
  notesCount: number
  createdAt: string
  isFollowing?: boolean
  isFollowed?: boolean
  isMuted?: boolean
  isBlocking?: boolean
  fields?: { name: string, value: string }[]
}

export interface DriveFile {
  id: string
  name: string
  type: string
  url: string
  thumbnailUrl: string | null
  isSensitive: boolean
  comment: string | null
  properties: { width?: number, height?: number }
}

export type Visibility = 'public' | 'home' | 'followers' | 'specified'

export interface Note {
  id: string
  createdAt: string
  userId: string
  user: UserLite
  text: string | null
  cw: string | null
  visibility: Visibility
  localOnly?: boolean
  renoteCount: number
  repliesCount: number
  reactions: Record<string, number>
  reactionEmojis?: Record<string, string>
  emojis?: Record<string, string>
  myReaction?: string | null
  fileIds: string[]
  files: DriveFile[]
  mentions?: string[]
  replyId: string | null
  renoteId: string | null
  reply?: Note | null
  renote?: Note | null
  uri?: string
  url?: string
  poll?: {
    multiple: boolean
    expiresAt: string | null
    choices: { text: string, votes: number, isVoted: boolean }[]
  } | null
}

export interface UserList {
  id: string
  name: string
  userIds?: string[]
}

export interface MisskeyChannel {
  id: string
  name: string
  description: string | null
}

export interface Antenna {
  id: string
  name: string
}

export interface Clip {
  id: string
  createdAt: string
  lastClippedAt: string | null
  name: string
  description: string | null
  isPublic: boolean
  notesCount?: number
}

export interface CustomEmoji {
  name: string
  url: string
  category: string | null
  aliases: string[]
}

export interface MetaLite {
  name: string | null
  iconUrl: string | null
  themeColor: string | null
  description: string | null
}

export interface Following {
  id: string
  followeeId: string
  followee: UserDetailed
}
