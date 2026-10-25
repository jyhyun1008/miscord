import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

async function loadPageText() {
  const source = await readFile(new URL('../app/utils/pageText.ts', import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const exports = {}
  vm.runInNewContext(outputText, { exports })
  return exports
}

function ids() {
  let n = 0
  return () => `b${++n}`
}

test('text document becomes nested Misskey page blocks', async () => {
  const { pageTextToBlocks } = await loadPageText()
  const blocks = pageTextToBlocks([
    '인사말 :wave:',
    '',
    '둘째 문단',
    '# 첫 섹션',
    '본문',
    '![이미지](file:f1)',
    '## 하위',
    'https://misskey.example/notes/9abc',
    '# 둘째 섹션',
    '```',
    '# 코드 안의 샵',
    '```',
    '#해시태그',
  ].join('\n'), { host: 'misskey.example', newId: ids() })

  assert.deepEqual(JSON.parse(JSON.stringify(blocks)), [
    { id: 'b1', type: 'text', text: '인사말 :wave:\n\n둘째 문단' },
    { id: 'b2', type: 'section', title: '첫 섹션', children: [
      { id: 'b3', type: 'text', text: '본문' },
      { id: 'b4', type: 'image', fileId: 'f1' },
      { id: 'b5', type: 'section', title: '하위', children: [
        { id: 'b6', type: 'note', note: '9abc', detailed: false },
      ] },
    ] },
    { id: 'b7', type: 'section', title: '둘째 섹션', children: [
      { id: 'b8', type: 'text', text: '```\n# 코드 안의 샵\n```\n#해시태그' },
    ] },
  ])
})

test('blocks survive a round trip, including ones the editor does not understand', async () => {
  const { pageTextToBlocks, pageBlocksToText } = await loadPageText()
  const legacy = { id: 'x1', type: 'button', text: '누르기', action: 'dialog' }
  const original = [
    { id: 'a', type: 'text', text: '앞' },
    { id: 's', type: 'section', title: '섹션', children: [
      { id: 'n', type: 'note', note: 'n1', detailed: true },
      legacy,
    ] },
  ]
  const keep = new Map()
  const text = pageBlocksToText(original, keep)
  assert.equal(text, '앞\n\n# 섹션\n\n![자세히](note:n1)\n\n![button](block:x1)')
  const back = pageTextToBlocks(text, { keep, newId: ids() })
  assert.equal(back[1].children[0].detailed, true)
  assert.equal(back[1].children[1], legacy)
  assert.equal(pageBlocksToText(back), pageBlocksToText(original))
})

test('unknown block references and foreign note URLs stay plain text', async () => {
  const { pageTextToBlocks } = await loadPageText()
  const blocks = pageTextToBlocks('![x](block:missing)\nhttps://other.example/notes/1', { host: 'misskey.example', newId: ids() })
  assert.deepEqual(JSON.parse(JSON.stringify(blocks)), [{ id: 'b1', type: 'text', text: '![x](block:missing)\nhttps://other.example/notes/1' }])
})
