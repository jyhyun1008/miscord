export type ProfileTarget = { userId: string } | { username: string, host: string | null }

interface PopoutState {
  target: ProfileTarget | null
  x: number
  y: number
  /** which side of the anchor to open on */
  side: 'left' | 'right'
}

/** Global "user profile popout" like Discord's, opened from avatars, names and mentions. */
export function useProfilePopout() {
  const state = useState<PopoutState>('profile-popout', () => ({ target: null, x: 0, y: 0, side: 'right' }))

  function open(target: ProfileTarget, anchor?: HTMLElement | null) {
    const r = anchor?.getBoundingClientRect()
    const side = r && r.left > window.innerWidth / 2 ? 'left' : 'right'
    state.value = {
      target,
      x: r ? (side === 'right' ? r.right + 8 : r.left - 8) : window.innerWidth / 2,
      y: r ? r.top : 80,
      side,
    }
  }

  function close() {
    state.value = { ...state.value, target: null }
  }

  return { state, open, close }
}
