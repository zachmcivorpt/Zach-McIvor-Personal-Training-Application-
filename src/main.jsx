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
// The fix: only ever auto-reload while nobody is looking. Check for
// updates when the app is being backgrounded, not when it's resumed, and
// if a controllerchange happens to land while the tab is visible anyway,
// hold the reload until the next time it's hidden. The swap to a new
// version then usually happens invisibly — the next time the app is
// opened, it's simply already current, with no mid-resume interruption.
//
// But that silent path has one real gap: someone who opens the app right
// after a new build ships and then just stays in it — browsing around,
// actively looking for what changed — never backgrounds it, so the
// deferred reload never gets its moment and the update sits ready
// forever without ever applying. That's exactly "I pushed a fix and the
// person testing it still can't see it." So alongside the silent
// background-swap, show a small, unmissable banner the instant an update
// is ready while visible, with its own explicit "Refresh" action — an
// escape hatch for exactly this scenario, without touching the invisible
// path above for everyone else.
if ('serviceWorker' in navigator) {
  let reloading = false
  const reloadNow = () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  }

  function showUpdateBanner() {
    const banner = document.createElement('div')
    banner.setAttribute(
      'style',
      'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
        'background:#0A0A0B;color:#fff;font:600 14px -apple-system,system-ui,sans-serif;' +
        'padding:12px 16px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px));' +
        'display:flex;align-items:center;justify-content:space-between;gap:12px;' +
        'box-shadow:0 -4px 16px rgba(0,0,0,0.25);'
    )
    const label = document.createElement('span')
    label.textContent = 'A new version of APEX is ready.'
    const button = document.createElement('button')
    button.textContent = 'Refresh'
    button.setAttribute(
      'style',
      'background:#2F8FFF;color:#fff;border:none;border-radius:8px;padding:8px 14px;font:700 13px -apple-system,system-ui,sans-serif;flex-shrink:0;'
    )
    button.onclick = reloadNow
    banner.appendChild(label)
    banner.appendChild(button)
    document.body.appendChild(banner)
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (document.visibilityState === 'hidden') {
      reloadNow()
      return
    }
    showUpdateBanner()
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
  // Also poll periodically while the app stays open and in the foreground
  // the whole time — the exact scenario above, where neither a hide nor a
  // blur event ever fires to trigger the checks above.
  setInterval(checkForUpdate, 5 * 60 * 1000)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
