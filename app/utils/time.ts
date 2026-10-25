const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' })
const dateFmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
const fullFmt = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full', timeStyle: 'short' })
const shortDateFmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })

function dayDiff(d: Date, now = new Date()) {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((b - a) / 86_400_000)
}

/** "오늘 오후 2:03" / "어제 오후 2:03" / "2026. 10. 20. 오후 2:03" — Discord message header style */
export function formatStamp(iso: string): string {
  const d = new Date(iso)
  const diff = dayDiff(d)
  const t = timeFmt.format(d)
  if (diff === 0) return `오늘 ${t}`
  if (diff === 1) return `어제 ${t}`
  return `${shortDateFmt.format(d)} ${t}`
}

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

export function formatFull(iso: string): string {
  return fullFmt.format(new Date(iso))
}

export function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}
