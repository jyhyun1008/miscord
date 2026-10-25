/** localStorage helpers that never throw (private mode, quota, blocked storage). */
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  }
  catch {
    return fallback
  }
}

export function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  }
  catch {
    // ignore
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(key)
  }
  catch {
    // ignore
  }
}
