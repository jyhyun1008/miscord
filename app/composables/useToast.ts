interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

let seq = 0

export function useToast() {
  const toasts = useState<Toast[]>('toasts', () => [])

  function push(text: string, kind: Toast['kind']) {
    const id = ++seq
    toasts.value.push({ id, text, kind })
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, kind === 'error' ? 5000 : 2500)
  }

  return {
    toasts,
    show: (text: string) => push(text, 'info'),
    error: (e: unknown) => push(e instanceof Error ? e.message : String(e), 'error'),
  }
}
