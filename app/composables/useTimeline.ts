import type { Account } from './useAccounts'
import type { Note } from '~/types/misskey'

const PAGE = 30
const RETAINED_NOTES = 300

export function isPureRenote(n: Note): n is Note & { renote: Note } {
  return !!n.renote && !n.text && !n.cw && !n.files?.length && !n.poll
}

/** The note whose reactions/buttons are shown for a timeline entry. */
export function appearNote(n: Note): Note {
  return isPureRenote(n) ? n.renote : n
}

/**
 * Chat-ordered timeline for one channel: `notes` is oldest → newest.
 * Older pages are prepended with `loadOlder()`, live notes are appended.
 */
export function useTimeline(account: Account, channel: TimelineChannel, onIncoming?: (n: Note) => void) {
  const api = useApi(account)
  const stream = getStream(account)

  const notes = ref<Note[]>([])
  const loading = ref(false)
  const done = ref(false)
  const error = ref<string | null>(null)
  const ready = ref(false)

  let stopped = false
  const noteSubs = new Map<string, () => void>()
  const cleanups: (() => void)[] = []

  function track(list: Note[]) {
    for (const n of list) {
      const id = appearNote(n).id
      if (!noteSubs.has(id)) noteSubs.set(id, stream.subNote(id))
    }
    // Our own renotes on screen already tell us which notes we've renoted
    const renoted = new Set(list.filter(n => n.userId === account.user.id && isPureRenote(n)).map(n => n.renote!.id))
    for (const id of renoted) patch(id, (n) => { n.myRenoted = true })
  }

  async function loadOlder() {
    if (stopped || loading.value || done.value) return
    loading.value = true
    error.value = null
    try {
      const { endpoint, params } = timelineRequest(channel)
      const untilId = notes.value[0]?.id
      const page = await api<Note[]>(endpoint, { ...params, limit: PAGE, ...(untilId ? { untilId } : {}) })
      if (stopped) return
      const known = new Set(notes.value.map(n => n.id))
      const fresh = page.filter(n => {
        if (known.has(n.id)) return false
        known.add(n.id)
        return true
      }).reverse()
      notes.value = [...fresh, ...notes.value]
      track(fresh)
      if (page.length < PAGE || fresh.length === 0) done.value = true
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
    finally {
      loading.value = false
      ready.value = true
    }
  }

  function push(note: Note) {
    if (notes.value.some(n => n.id === note.id)) return
    notes.value.push(note)
    track([note])
    onIncoming?.(note)
  }

  function remove(noteId: string) {
    notes.value = notes.value.filter(n => n.id !== noteId && appearNote(n).id !== noteId)
    releaseUnusedSubscriptions()
  }

  function releaseUnusedSubscriptions() {
    const retained = new Set(notes.value.map(n => appearNote(n).id))
    for (const [id, unsubscribe] of noteSubs) {
      if (!retained.has(id)) {
        unsubscribe()
        noteSubs.delete(id)
      }
    }
  }

  // Only called at the present: history being read must stay in place.
  function trimOlder() {
    if (loading.value || notes.value.length <= RETAINED_NOTES) return false
    notes.value = notes.value.slice(-RETAINED_NOTES)
    done.value = false // Discarded history can be fetched again using untilId.
    releaseUnusedSubscriptions()
    return true
  }

  /** Apply a mutation to every loaded copy of a note (it can appear as itself or as a renote/quote target). */
  function patch(noteId: string, fn: (n: Note) => void) {
    const visited = new Set<Note>()
    for (const entry of notes.value) {
      for (const n of [entry, entry.renote, entry.reply]) {
        if (n?.id === noteId && !visited.has(n)) {
          visited.add(n)
          fn(n)
        }
      }
    }
  }

  /**
   * Our own reactions are applied optimistically, then echoed back by the stream —
   * so for our user this is idempotent (skip if myReaction already matches).
   */
  function applyReaction(noteId: string, rawReaction: string, delta: 1 | -1, userId?: string, emoji?: { name: string, url: string }) {
    const reaction = normalizeReaction(rawReaction)
    const mine = userId === account.user.id
    patch(noteId, (n) => {
      if (mine && delta > 0 && n.myReaction === reaction) return
      if (mine && delta < 0 && n.myReaction !== reaction) return
      // Our reaction changed elsewhere (or the server swapped it, e.g. like-only notes): drop the old one
      if (mine && delta > 0 && n.myReaction) {
        const old = n.myReaction
        if ((n.reactions[old] ?? 0) > 1) n.reactions[old]!--
        else delete n.reactions[old]
      }
      const count = (n.reactions[reaction] ?? 0) + delta
      if (count > 0) n.reactions[reaction] = count
      else delete n.reactions[reaction]
      if (emoji) n.reactionEmojis = { ...n.reactionEmojis, [emoji.name]: emoji.url }
      if (mine) n.myReaction = delta > 0 ? reaction : null
    })
  }

  function start() {
    const req = streamRequest(channel)
    if (req) {
      cleanups.push(stream.connect(req.channel, req.params, (type, body) => {
        if (type === 'note') push(body as Note)
      }))
    }
    cleanups.push(stream.onNoteUpdated((id, type, body) => {
      if (type === 'reacted') applyReaction(id, body.reaction, 1, body.userId, body.emoji)
      else if (type === 'unreacted') applyReaction(id, body.reaction, -1, body.userId)
      else if (type === 'deleted') remove(id)
    }))
    loadOlder()
  }

  function stop() {
    stopped = true
    cleanups.forEach(f => f())
    cleanups.length = 0
    noteSubs.forEach(f => f())
    noteSubs.clear()
  }

  onMounted(start)
  onBeforeUnmount(stop)

  return { notes, loading, done, error, ready, loadOlder, push, remove, trimOlder, patch, applyReaction, streamState: stream.state }
}
