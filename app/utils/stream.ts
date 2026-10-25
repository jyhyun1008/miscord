type Handler = (type: string, body: any) => void

interface Sub {
  channel: string
  params: Record<string, unknown>
  handler: Handler
}

/**
 * One WebSocket per account. Channel subscriptions and note subscriptions
 * survive reconnects (re-sent on open). Reconnects with exponential backoff.
 */
export class MisskeyStream {
  private ws: WebSocket | null = null
  private subs = new Map<string, Sub>()
  private notes = new Map<string, number>() // noteId -> refcount
  private noteHandlers = new Set<(noteId: string, type: string, body: any) => void>()
  private retry = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private closed = false
  readonly state = ref<'connecting' | 'open' | 'closed'>('connecting')

  constructor(private host: string, private token: string) {
    this.open()
  }

  private open() {
    if (this.closed) return
    this.state.value = 'connecting'
    const ws = new WebSocket(`wss://${normalizeHost(this.host)}/streaming?i=${encodeURIComponent(this.token)}`)
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.state.value = 'open'
      for (const [id, s] of this.subs) this.send('connect', { channel: s.channel, id, params: s.params })
      for (const id of this.notes.keys()) this.send('subNote', { id })
    }
    ws.onmessage = (ev) => {
      let msg: { type: string, body: any }
      try {
        msg = JSON.parse(ev.data)
      }
      catch {
        return
      }
      if (!msg || typeof msg.body !== 'object' || msg.body === null) return
      if (msg.type === 'channel') {
        this.subs.get(msg.body.id)?.handler(msg.body.type, msg.body.body)
      }
      else if (msg.type === 'noteUpdated') {
        for (const h of this.noteHandlers) h(msg.body.id, msg.body.type, msg.body.body)
      }
    }
    ws.onclose = () => {
      this.ws = null
      if (this.closed) return
      this.state.value = 'closed'
      const delay = Math.min(30_000, 1000 * 2 ** this.retry++)
      this.timer = setTimeout(() => this.open(), delay)
    }
  }

  private send(type: string, body: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type, body }))
  }

  /** Subscribe to a streaming channel. Returns an unsubscribe function. */
  connect(channel: string, params: Record<string, unknown>, handler: Handler): () => void {
    const id = Math.random().toString(36).slice(2)
    this.subs.set(id, { channel, params, handler })
    this.send('connect', { channel, id, params })
    return () => {
      this.subs.delete(id)
      this.send('disconnect', { id })
    }
  }

  /** Receive reaction/delete/poll updates for a note. Returns an unsubscribe function. */
  subNote(noteId: string): () => void {
    const n = this.notes.get(noteId) ?? 0
    this.notes.set(noteId, n + 1)
    if (n === 0) this.send('subNote', { id: noteId })
    return () => {
      const c = (this.notes.get(noteId) ?? 1) - 1
      if (c <= 0) {
        this.notes.delete(noteId)
        this.send('unsubNote', { id: noteId })
      }
      else this.notes.set(noteId, c)
    }
  }

  onNoteUpdated(fn: (noteId: string, type: string, body: any) => void): () => void {
    this.noteHandlers.add(fn)
    return () => this.noteHandlers.delete(fn)
  }

  close() {
    this.closed = true
    if (this.timer) clearTimeout(this.timer)
    this.state.value = 'closed'
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.subs.clear()
    this.notes.clear()
    this.noteHandlers.clear()
  }
}

const streams = new Map<string, MisskeyStream>()

export function getStream(account: { key: string, host: string, token: string }): MisskeyStream {
  let s = streams.get(account.key)
  if (!s) {
    s = new MisskeyStream(account.host, account.token)
    streams.set(account.key, s)
  }
  return s
}

export function closeStream(key: string) {
  streams.get(key)?.close()
  streams.delete(key)
}
