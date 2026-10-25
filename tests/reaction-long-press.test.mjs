import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

async function setup() {
  const source = await readFile(new URL('../app/components/note/NoteReactions.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const timers = new Map()
  const emitted = []
  let timerId = 0
  const exports = {}
  const { outputText } = ts.transpileModule(`${script}\nexport { onPointerDown, onPointerMove, onPointerEnd, onReactionClick, onKeydown, hovered };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  vm.runInNewContext(outputText, {
    exports, Math,
    defineProps: () => ({ note: { id: 'note', reactions: {} }, host: 'example.com' }),
    defineEmits: () => (...args) => emitted.push(args),
    useCurrentAccount: () => ({ value: null }),
    ref: value => ({ value }), computed: fn => ({ get value() { return fn() } }),
    watch() {}, onMounted() {}, onBeforeUnmount() {},
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId },
    clearTimeout: id => timers.delete(id),
  })
  return { ...exports, emitted, fireHold() {
    for (const [id, timer] of timers) {
      if (timer.delay === 500) { timers.delete(id); timer.fn() }
    }
  } }
}

const down = { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 0, clientY: 0 }
const up = { pointerId: 1, type: 'pointerup' }
const click = () => ({ preventDefault() {}, stopPropagation() {} })

test('short touch toggles the reaction without opening the user list', async () => {
  const s = await setup()
  s.onPointerDown(down, '👍')
  s.onPointerEnd(up)
  s.fireHold()
  s.onReactionClick(click(), '👍')
  assert.equal(s.hovered.value, null)
  assert.deepEqual(s.emitted.map(args => [...args]), [['toggle', '👍']])
})

test('long press keeps the list open after release and suppresses the following click', async () => {
  const s = await setup()
  s.onPointerDown(down, '👍')
  s.fireHold()
  s.onPointerEnd(up)
  s.onReactionClick(click(), '👍')
  assert.equal(s.hovered.value, '👍')
  assert.equal(s.emitted.length, 0)
  s.onPointerDown(down, '👍')
  s.onPointerEnd(up)
  s.onReactionClick(click(), '👍')
  assert.equal(s.emitted.length, 1)
})

for (const kind of ['move', 'cancel']) {
  test(`${kind} cancels the hold and prevents accidental reactions while scrolling`, async () => {
    const s = await setup()
    s.onPointerDown(down, '👍')
    if (kind === 'move') s.onPointerMove({ ...down, clientY: 20 })
    else s.onPointerEnd({ ...up, type: 'pointercancel' })
    s.fireHold()
    s.onReactionClick(click(), '👍')
    assert.equal(s.hovered.value, null)
    assert.equal(s.emitted.length, 0)
  })
}

test('keyboard activation works after a long press', async () => {
  const s = await setup()
  s.onPointerDown(down, '👍')
  s.fireHold()
  s.onPointerEnd(up)
  s.onKeydown({ key: 'Enter' })
  s.onReactionClick(click(), '👍')
  assert.equal(s.emitted.length, 1)
})
