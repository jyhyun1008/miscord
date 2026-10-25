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
  /** Client-side: whether we've renoted it (undefined = not checked yet). */
  myRenoted?: boolean
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

export interface MisskeyNotification {
  id: string
  createdAt: string
  /** follow, mention, reply, renote, quote, reaction, pollEnded, receiveFollowRequest, ... */
  type: string
  user?: UserLite | null
  note?: Note | null
  reaction?: string | null
  achievement?: string
  role?: { name: string } | null
  /** type 'app' */
  header?: string | null
  body?: string | null
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

/** Misskey Page content block. Current servers emit text/section/image/note; older pages may hold others. */
export interface PageBlock {
  id: string
  type: string
  text?: string
  title?: string
  children?: PageBlock[]
  fileId?: string | null
  note?: string | null
  detailed?: boolean
  [key: string]: unknown
}

export interface Page {
  id: string
  createdAt: string
  updatedAt: string
  userId: string
  user: UserLite
  title: string
  /** URL slug: https://{host}/@{username}/pages/{name} */
  name: string
  summary: string | null
  content: PageBlock[]
  variables: unknown[]
  script: string
  font: 'serif' | 'sans-serif'
  alignCenter: boolean
  hideTitleWhenPinned: boolean
  eyeCatchingImageId: string | null
  eyeCatchingImage: DriveFile | null
  attachedFiles: DriveFile[]
  likedCount: number
  isLiked?: boolean
}

export interface DriveFolder {
  id: string
  name: string
  parentId: string | null
}
