import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

async function loadModule(path, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const exports = {}
  vm.runInNewContext(outputText, { exports, URL, AbortSignal, ...globals })
  return exports
}

test('untrusted links only allow absolute HTTP(S) URLs', async () => {
  const { safeHttpUrl } = await loadModule('../app/utils/url.ts')
  for (const url of ['javascript:alert(1)', '\njavascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,test', '//evil.example', 'https://user:pass@example.com', '/local']) {
    assert.equal(safeHttpUrl(url), undefined, url)
  }
  assert.equal(safeHttpUrl('https://example.com/note'), 'https://example.com/note')
})

test('host and endpoint validation cannot change the request destination', async () => {
  const requests = []
  const { normalizeHost, apiCall } = await loadModule('../app/utils/misskey.ts', {
    fetch: async (...args) => { requests.push(args); return { status: 200, ok: true, json: async () => ({ ok: true }) } },
  })
  assert.equal(normalizeHost(' HTTPS://Example.COM/path '), 'example.com')
  for (const host of ['https://good.example@evil.example', 'example.com\\@evil.example', 'example.com?x=1', 'javascript:alert(1)', '']) {
    assert.throws(() => normalizeHost(host), undefined, host)
  }
  await assert.rejects(apiCall('example.com', '../outside', {}, 'secret'))
  assert.equal(requests.length, 0)
  await apiCall('example.com', 'notes/create', { text: 'hello' }, 'secret')
  const [url, options] = requests[0]
  assert.equal(url, 'https://example.com/api/notes/create')
  assert.equal(options.redirect, 'error')
  assert.equal(options.credentials, 'omit')
  assert.equal(options.referrerPolicy, 'no-referrer')
  assert.equal(JSON.parse(options.body).i, 'secret')
})

test('hashtag metacharacters remain literal', async () => {
  const { escapeRegExp } = await loadModule('../app/utils/url.ts')
  for (const tag of ['a+b', '(', '[x]', '.*', 'a\\b', '${x}']) {
    const pattern = new RegExp(`^${escapeRegExp(tag)}$`, 'u')
    assert.equal(pattern.test(tag), true)
    assert.equal(pattern.test(`${tag}other`), false)
  }
})

test('leaving a timeline before its request finishes cannot recreate subscriptions', async () => {
  let mount, unmount, resolvePage
  let tracked = 0
  const page = new Promise(resolve => { resolvePage = resolve })
  const { useTimeline } = await loadModule('../app/composables/useTimeline.ts', {
    ref: value => ({ value }),
    useApi: () => () => page,
    getStream: () => ({ subNote: () => { tracked++; return () => {} }, onNoteUpdated: () => () => {}, state: {} }),
    timelineRequest: () => ({ endpoint: 'notes/timeline', params: {} }),
    streamRequest: () => null,
    onMounted: fn => { mount = fn },
    onBeforeUnmount: fn => { unmount = fn },
  })
  const timeline = useTimeline({ user: { id: 'me' } }, { kind: 'home' })
  mount()
  unmount()
  resolvePage([{ id: '1' }])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(tracked, 0)
  assert.equal(timeline.notes.value.length, 0)
})

test('deleted notes release subscriptions and shared note objects update once', async () => {
  let unmount, active = 0
  const { useTimeline } = await loadModule('../app/composables/useTimeline.ts', {
    ref: value => ({ value }), useApi: () => async () => [],
    getStream: () => ({ subNote: () => { active++; return () => { active-- } }, state: {} }),
    onMounted: () => {}, onBeforeUnmount: fn => { unmount = fn },
  })
  const tl = useTimeline({ user: { id: 'me' } }, { kind: 'home' })
  const original = { id: 'original', text: 'hello', reactions: { '👍': 1 } }
  tl.push(original)
  tl.push({ id: 'renote', renote: original })
  assert.equal(active, 1)
  tl.patch('original', note => { note.reactions['👍']++ })
  assert.equal(original.reactions['👍'], 2)
  tl.remove('original')
  assert.equal(active, 0)
  assert.equal(tl.notes.value.length, 0)
  unmount()
})
