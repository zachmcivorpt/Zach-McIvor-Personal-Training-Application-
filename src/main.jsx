import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import './lib/nativeBridge.js'

// skipWaiting + clientsClaim (see vite.config.js) make a freshly-deployed
// service worker take over quickly in the background, but that alone never
// reloads a tab that's already open — it just keeps running whatever JS it
// already loaded into memory, no matter how many times the page itself is
// refreshed. This used to reload the instant a new service worker took
// control, which sounds right but isn't: checking for updates on *resume*
// (the app coming back to the foreground, e.g. tapping its home-screen
// icon) meant that whenever an update was found, this fired a hard
// `location.reload()` while the user was mid-resume, actively looking at
// the screen that had just started rendering — a forced reload racing the
// app's own resume paint, which is exactly what produced a visible flash
// of unstyled/stale content (iOS's own resume transition caught mid-frame,
// Tailwind not yet applied, the previous screen still half-visible)
// instead of a clean handoff. A refresh "fixed" it because by then the
// race was long over.
//
// The actual fix: only ever reload while nobody is looking. Check for
// updates when the app is being backgrounded, not when it's resumed, and
// if a controllerchange happens to land while the tab is visible anyway,
// hold the reload until the next time it's hidden. The swap to a new
// version then always happens invisibly — the next time the app is
// opened, it's simply already current, with no mid-resume interruption.
if ('serviceWorker' in navigator) {
  let reloading = false
  const reloadNow = () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (document.visibilityState === 'hidden') {
      reloadNow()
      return
    }
    const reloadWhenHidden = () => {
      if (document.visibilityState !== 'hidden') return
      document.removeEventListener('visibilitychange', reloadWhenHidden)
      reloadNow()
    }
    document.addEventListener('visibilitychange', reloadWhenHidden)
  })

  const checkForUpdate = () => {
    navigator.serviceWorker.getRegistration().then((reg) => reg?.update())
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') checkForUpdate()
  })
  window.addEventListener('blur', checkForUpdate)
  checkForUpdate()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
