// Render the actual app with fictional data; no Misskey account or network is needed.
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseURL = process.env.MISCORD_URL || 'http://localhost:3223'
const output = new URL('../docs/images/', import.meta.url)
await mkdir(output, { recursive: true })

function avatar(label, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="24" fill="${color}"/><circle cx="48" cy="37" r="17" fill="white" opacity=".9"/><path d="M17 89a31 31 0 0 1 62 0" fill="white" opacity=".9"/><text x="79" y="25" font-family="sans-serif" font-size="18" fill="white">${label}</text></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
const users = [
  ['haru', '하루', '#86b300', 'online'],
  ['sora', '소라', '#6199da', 'online'],
  ['nabi', '나비', '#c68dd7', 'active'],
  ['maru', '마루', '#e6a362', 'offline'],
  ['yuna', '유나', '#48b6a0', 'online'],
].map(([username, name, color, onlineStatus], i) => ({
  id: `user-${i}`, username, name, host: null, avatarUrl: avatar('', color),
  onlineStatus, description: '작은 일상을 나누고 새로운 이야기를 만나요.\n개발과 그림, 그리고 고양이를 좋아합니다.',
  bannerUrl: null, followersCount: 128, followingCount: 56, notesCount: 1024,
  createdAt: '2025-01-01T00:00:00Z', isFollowing: i !== 0, isMuted: false, isBlocking: false,
  fields: [{ name: '관심사', value: '웹 개발 · 일러스트' }],
}))
const accounts = [
  { key: 'haru@demo.example', host: 'demo.example', token: 'fictional-demo-token', user: users[0], meta: { name: '우리들의 작은 정원', iconUrl: avatar('', '#86b300'), description: '예시 서버', themeColor: '#86b300' } },
  { key: 'haru@social.example', host: 'social.example', token: 'fictional-demo-token', user: users[0], meta: { name: '크리에이터 라운지', iconUrl: avatar('', '#7c83db') } },
]
function note(i, user, text, extra = {}) {
  return { id: `note-${i}`, createdAt: `2026-10-25T05:${String(i + 10).padStart(2, '0')}:00Z`, userId: user.id, user,
    text, cw: null, visibility: 'public', renoteCount: 0, repliesCount: 0,
    reactions: {}, files: [], fileIds: [], replyId: null, renoteId: null, ...extra }
}
const notes = [
  note(0, users[1], '주말 오후의 작은 작업실에 오신 걸 환영해요! 🌿\n오늘은 다들 어떤 걸 만들고 있나요?', { reactions: { '🌿': 4, '✨': 3 } }),
  note(1, users[1], '완성하지 않아도 좋아요. 작업 중인 이야기도 편하게 나눠 주세요.'),
  note(4, users[2], '저는 개인 홈페이지 색상을 고르고 있어요.\n**라임 그린**이랑 보라색 조합이 마음에 들어요! 🎨', { reactions: { '💚': 5, '🎨': 2 }, myReaction: '💚' }),
  note(6, users[0], '저는 Misskey를 채팅처럼 읽을 수 있는 화면을 만들고 있어요.\n계정도, 관심 있는 주제도 왼쪽에서 바로 바꿀 수 있어요. #개발', { replyId: 'note-0', reply: null, reactions: { '👍': 3, '🚀': 2 } }),
  note(8, users[4], '사람을 색상으로 분류할 수 있는 것도 좋네요. 자주 보는 친구는 위에 고정해 뒀어요!'),
  note(10, users[2], '이번 주에 기억하고 싶은 문장 ✨', { renoteId: 'quote-1', renote: note(2, users[3], '작은 변화도 매일 쌓이면 나만의 풍경이 된다. 🌱') }),
  note(12, users[1], '다음에는 함께 만든 것들을 클립에 모아 봐요.\n좋아하는 이모지로 반응해 주셔도 좋아요 ☕', { reactions: { '☕': 4, '✨': 2 } }),
]
notes[3].reply = notes[0]
const prefs = {
  channels: [{ id: 'garden', name: '작업실 수다' }], antennas: [{ id: 'design', name: '디자인 소식' }],
  lists: [{ id: 'friends', name: '친구들의 이야기' }], tags: ['개발', '일러스트', '일상'],
  pinnedUserIds: [users[1].id], groups: [{ id: 'create', name: '함께 만드는 사람들', color: '#c68dd7' }],
  userGroups: { [users[2].id]: 'create', [users[4].id]: 'create' }, collapsed: {}, defaultVisibility: 'public',
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
  await context.addInitScript(({ accounts, prefs }) => {
    localStorage.setItem('miscord:accounts', JSON.stringify(accounts))
    localStorage.setItem(`miscord:prefs:${accounts[0].key}`, JSON.stringify(prefs))
    localStorage.setItem('miscord:theme', JSON.stringify('dark'))
    localStorage.setItem('miscord:emoji-style', JSON.stringify('native'))
    // Keep streams local, including the connection indicator.
    window.WebSocket = class extends EventTarget {
      static OPEN = 1
      readyState = 1
      constructor() { super(); setTimeout(() => this.onopen?.({}), 0) }
      send() {}
      close() { this.readyState = 3 }
    }
  }, { accounts, prefs })
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === new URL(baseURL).origin) return route.continue()
    if (!['demo.example', 'social.example'].includes(url.hostname)) return route.abort()
    const endpoint = url.pathname.replace('/api/', '')
    const params = route.request().postDataJSON() || {}
    let data = []
    if (endpoint === 'i') data = { ...users[0], unreadNotificationsCount: url.hostname === 'social.example' ? 3 : 0 }
    else if (endpoint === 'users/show') data = params.userIds ? users.filter(u => params.userIds.includes(u.id)) : users.find(u => u.id === params.userId) || users[1]
    else if (endpoint === 'users/following') data = params.untilId ? [] : users.slice(1).map((u, i) => ({ id: `follow-${i}`, followeeId: u.id, followee: u }))
    else if (endpoint === 'channels/followed') data = prefs.channels
    else if (endpoint === 'antennas/list') data = prefs.antennas
    else if (endpoint === 'users/lists/list') data = prefs.lists
    else if (endpoint === 'notes/timeline') data = params.untilId ? [] : [...notes].reverse()
    await route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${baseURL}/haru@demo.example/home`)
  await page.getByText('다음에는 함께 만든 것들을 클립에 모아 봐요.', { exact: false }).waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: new URL('desktop-dark.png', output).pathname })
  await page.getByTitle('설정', { exact: true }).click()
  await page.getByRole('button', { name: '라이트', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.mouse.move(0, 0)
  await page.waitForTimeout(300)
  await page.screenshot({ path: new URL('desktop-light.png', output).pathname })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  await page.locator('.chat .scroll').evaluateAll(elements => elements.forEach(el => { el.scrollTop = el.scrollHeight }))
  await page.screenshot({ path: new URL('mobile-light.png', output).pathname })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log('Saved desktop-dark.png, desktop-light.png, mobile-light.png in docs/images')
} finally {
  await browser.close()
}
