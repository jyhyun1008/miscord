export default defineNuxtPlugin(() => {
  // Skip in dev so HMR isn't served from cache.
  if (import.meta.dev || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
})
