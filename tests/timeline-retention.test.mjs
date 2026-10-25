import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

test('trimming releases old subscriptions and allows discarded history to be loaded again', async () => {
  const source = await readFile(new URL('../app/composables/useTimeline.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const released = []
  const requests = []
  let page = []
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    ref: value => ({ value }),
    useApi: () => async (_endpoint, params) => { requests.push(params); return page },
    getStream: () => ({ subNote: id => () => released.push(id) }),
    timelineRequest: () => ({ endpoint: 'notes/timeline', params: {} }),
    onMounted() {},
    onBeforeUnmount() {},
  })
  const tl = exports.useTimeline({ user: { id: 'me' } }, {})
  for (let i = 0; i < 305; i++) tl.push({ id: String(i), userId: 'other' })
  tl.done.value = true
  tl.loading.value = true
  assert.equal(tl.trimOlder(), false)
  tl.loading.value = false
  assert.equal(tl.trimOlder(), true)
  assert.equal(tl.notes.value.length, 300)
  assert.equal(tl.notes.value[0].id, '5')
  assert.equal(tl.notes.value.at(-1).id, '304')
  assert.deepEqual(released, ['0', '1', '2', '3', '4'])
  assert.equal(tl.done.value, false)
  page = [{ id: '4', userId: 'other' }]
  await tl.loadOlder()
  assert.equal(requests[0].untilId, '5')
  assert.equal(tl.notes.value[0].id, '4')
  assert.equal(tl.notes.value.length, 301)
})
