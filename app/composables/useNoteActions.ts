import type { InjectionKey } from 'vue'
import type { Note } from '~/types/misskey'

export interface NoteActions {
  reply: (note: Note) => void
  quote: (note: Note) => void
  /** Renote once, or take back our renote(s) if we already did. */
  toggleRenote: (note: Note) => Promise<void>
  /** Fill in `note.myRenoted` from the server (cached). */
  checkRenoted: (note: Note) => Promise<boolean>
  toggleReaction: (note: Note, reaction: string) => Promise<void>
  pickReaction: (note: Note, anchor: HTMLElement) => void
  remove: (note: Note) => Promise<void>
  /** Delete the note and load its contents back into the composer. */
  redraft: (note: Note) => Promise<void>
  /** Scroll the timeline to a note (loading older pages if needed). */
  jumpTo: (noteId: string) => Promise<void>
  /** A note's menu opened/closed: the timeline holds its scroll position while one is open. */
  setMenuOpen: (open: boolean) => void
}

export const NOTE_ACTIONS: InjectionKey<NoteActions> = Symbol('note-actions')

export function useNoteActions(): NoteActions {
  const actions = inject(NOTE_ACTIONS)
  if (!actions) throw new Error('NoteActions not provided')
  return actions
}
