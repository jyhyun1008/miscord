// Dev-server stand-in for the /url-preview relay in docker/nginx.conf (the generated site has no server).
// Misskey's /url (summaly) sends no CORS headers, so the browser can't call it from another origin.
export default defineEventHandler(async (event) => {
  if (getHeader(event, 'x-miscord-preview') !== '1') throw createError({ statusCode: 403 })
  const { host, url } = getQuery(event)
  if (typeof host !== 'string' || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || /^[\d.]+$/.test(host)) {
    throw createError({ statusCode: 400 })
  }
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw createError({ statusCode: 400 })

  const res = await fetch(`https://${host}/url?url=${encodeURIComponent(url)}&lang=ko`, {
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw createError({ statusCode: 502 })
  setHeader(event, 'Content-Type', 'application/json')
  setHeader(event, 'Cache-Control', 'public, max-age=86400')
  return await res.json()
})
