import type { InjectionKey } from 'vue'
import type { Note } from '~/types/misskey'

export interface NoteActions {
  reply: (note: Note) => void
  quote: (note: Note) => void
  renote: (note: Note) => Promise<void>
  toggleReaction: (note: Note, reaction: string) => Promise<void>
  pickReaction: (note: Note, anchor: HTMLElement) => void
  remove: (note: Note) => Promise<void>
}

export const NOTE_ACTIONS: InjectionKey<NoteActions> = Symbol('note-actions')

export function useNoteActions(): NoteActions {
  const actions = inject(NOTE_ACTIONS)
  if (!actions) throw new Error('NoteActions not provided')
  return actions
}
