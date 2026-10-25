import type { Account } from './useAccounts'
import type { Clip } from '~/types/misskey'

/** My clips, shared between the clip overview and the "add to clip" menu. */
export function useClips(account: Account) {
  const api = useApi(account)
  const clips = useState<Clip[] | null>(`clips:${account.key}`, () => null)

  async function load(force = false) {
    if (clips.value && !force) return clips.value
    const list = await api<Clip[]>('clips/list')
    clips.value = list.sort((a, b) => (b.lastClippedAt ?? b.createdAt).localeCompare(a.lastClippedAt ?? a.createdAt))
    return clips.value
  }

  async function create(name: string, isPublic = false) {
    const clip = await api<Clip>('clips/create', { name, isPublic })
    clips.value = [clip, ...(clips.value ?? [])]
    return clip
  }

  /** Bump a clip's count/recency locally after adding or removing a note. */
  function touch(clipId: string, delta: 1 | -1) {
    const c = clips.value?.find(c => c.id === clipId)
    if (!c) return
    if (c.notesCount != null) c.notesCount += delta
    if (delta > 0) c.lastClippedAt = new Date().toISOString()
  }

  return { clips, load, create, touch }
}
