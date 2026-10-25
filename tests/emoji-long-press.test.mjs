import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

async function setup() {
  const source = await readFile(new URL('../app/components/MfmEmoji.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const timers = new Map()
  let timerId = 0
  const exports = {}
  const { outputText } = ts.transpileModule(`${script}\nexport { anchor, visible, onPointerDown, onPointerMove, onPointerEnd, onClick, onOutsidePointerDown };`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  vm.runInNewContext(outputText, {
    exports, Math, window: { innerWidth: 390 },
    defineProps: () => ({ name: 'hello', url: 'https://example.com/hello.webp' }),
    ref: value => ({ value }), watch() {}, onBeforeUnmount() {},
    setTimeout: fn => { timers.set(++timerId, fn); return timerId },
    clearTimeout: id => timers.delete(id),
  })
  exports.anchor.value = { getBoundingClientRect: () => ({ left: 100, top: 200, bottom: 224 }), contains: () => false }
  return { ...exports, fireHold() { for (const [id, fn] of timers) { timers.delete(id); fn() } } }
}
const down = { pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 0, clientY: 0 }
const up = { pointerId: 1, type: 'pointerup' }

test('emoji long press opens the name, survives release, and blocks a parent link click', async () => {
  const s = await setup()
  s.onPointerDown(down)
  s.fireHold()
  s.onPointerEnd(up)
  assert.equal(s.visible.value, true)
  let prevented = false
  let stopped = false
  s.onClick({ preventDefault() { prevented = true }, stopPropagation() { stopped = true } })
  assert.equal(prevented, true)
  assert.equal(stopped, true)
  s.onOutsidePointerDown({ target: {} })
  assert.equal(s.visible.value, false)
})

for (const gesture of ['tap', 'scroll', 'cancel']) {
  test(`emoji ${gesture} does not open the name`, async () => {
    const s = await setup()
    s.onPointerDown(down)
    if (gesture === 'scroll') s.onPointerMove({ ...down, clientY: 20 })
    else s.onPointerEnd({ ...up, type: gesture === 'cancel' ? 'pointercancel' : 'pointerup' })
    s.fireHold()
    assert.equal(s.visible.value, false)
  })
}
