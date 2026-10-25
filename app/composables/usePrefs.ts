export interface UserGroup {
  id: string
  name: string
  color: string
}

/** Discord-like role colors offered when creating a group. */
export const GROUP_COLORS = ['#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e91e63', '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6']

interface NamedRef { id: string, name: string }

export interface AccountPrefs {
  /** Cached from the server (all of them, in the user's sidebar order) */
  channels: NamedRef[]
  antennas: NamedRef[]
  lists: NamedRef[]
  tags: string[]
  pinnedUserIds: string[]
  /** Local follow groups, shown as member list sections (like Discord's hoisted roles) */
  groups: UserGroup[]
  /** userId → groupId; one group per user, so the name color is unambiguous */
  userGroups: Record<string, string>
  collapsed: Record<string, boolean>
  defaultVisibility: 'public' | 'home' | 'followers'
}

function defaults(): AccountPrefs {
  return { channels: [], antennas: [], lists: [], tags: [], pinnedUserIds: [], groups: [], userGroups: {}, collapsed: {}, defaultVisibility: 'public' }
}

/** Per-account personalization (custom channels, pinned users), persisted in localStorage. */
export function usePrefs(accountKey: string) {
  const storageKey = `miscord:prefs:${accountKey}`
  const prefs = useState<AccountPrefs>(`prefs:${accountKey}`, () => ({
    ...defaults(),
    ...loadJson<Partial<AccountPrefs>>(storageKey, {}),
  }))

  const save = () => saveJson(storageKey, prefs.value)

  /** Mirror the server's lists/antennas: keep the local order, drop deleted ones, append new ones. */
  function syncFromServer(key: 'channels' | 'lists' | 'antennas', items: NamedRef[]) {
    const fresh = new Map(items.map(i => [i.id, i.name]))
    const kept = prefs.value[key].filter(i => fresh.has(i.id)).map(i => ({ id: i.id, name: fresh.get(i.id)! }))
    const known = new Set(kept.map(i => i.id))
    prefs.value[key] = [...kept, ...items.filter(i => !known.has(i.id)).map(i => ({ id: i.id, name: i.name }))]
    save()
  }
  function addList(list: NamedRef) {
    if (!prefs.value.lists.some(l => l.id === list.id)) prefs.value.lists.push({ id: list.id, name: list.name })
    save()
  }
  function addTag(raw: string) {
    const tag = raw.trim().replace(/^#/, '')
    if (tag && !prefs.value.tags.some(t => t.toLowerCase() === tag.toLowerCase())) prefs.value.tags.push(tag)
    save()
    return tag
  }
  function removeTag(tag: string) {
    prefs.value.tags = prefs.value.tags.filter(t => t !== tag)
    save()
  }
  function togglePin(userId: string) {
    const ids = prefs.value.pinnedUserIds
    prefs.value.pinnedUserIds = ids.includes(userId) ? ids.filter(i => i !== userId) : [...ids, userId]
    save()
  }
  function toggleCollapsed(section: string) {
    prefs.value.collapsed[section] = !prefs.value.collapsed[section]
    save()
  }
  function addGroup(name: string, color: string) {
    const group = { id: crypto.randomUUID(), name: name.trim(), color }
    prefs.value.groups.push(group)
    save()
    return group
  }
  function updateGroup(id: string, patch: Partial<Omit<UserGroup, 'id'>>) {
    const g = prefs.value.groups.find(g => g.id === id)
    if (g) Object.assign(g, patch)
    save()
  }
  function removeGroup(id: string) {
    prefs.value.groups = prefs.value.groups.filter(g => g.id !== id)
    for (const [userId, groupId] of Object.entries(prefs.value.userGroups)) {
      if (groupId === id) delete prefs.value.userGroups[userId]
    }
    save()
  }
  /** Put a user in a group, or take them out with `null`. */
  function setUserGroup(userId: string, groupId: string | null) {
    if (groupId) prefs.value.userGroups[userId] = groupId
    else delete prefs.value.userGroups[userId]
    save()
  }
  function groupOf(userId: string): UserGroup | undefined {
    const id = prefs.value.userGroups[userId]
    return id ? prefs.value.groups.find(g => g.id === id) : undefined
  }
  function moveItem<K extends 'channels' | 'antennas' | 'lists' | 'tags' | 'groups'>(key: K, from: number, to: number) {
    const arr = prefs.value[key] as unknown[]
    if (to < 0 || to >= arr.length) return
    const [item] = arr.splice(from, 1)
    arr.splice(to, 0, item)
    save()
  }

  return {
    prefs, save, syncFromServer, addList, addTag, removeTag, togglePin, toggleCollapsed, moveItem,
    addGroup, updateGroup, removeGroup, setUserGroup, groupOf,
  }
}
