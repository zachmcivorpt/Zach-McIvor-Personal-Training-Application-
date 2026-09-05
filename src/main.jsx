import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

// skipWaiting + clientsClaim (see vite.config.js) make a freshly-deployed
// service worker take over quickly in the background, but that alone never
// reloads a tab that's already open — it just keeps running whatever JS it
// already loaded into memory, no matter how many times the page itself is
// refreshed. This is the missing piece: the moment a new service worker
// actually takes control, force this tab to reload once so it's always
// running the latest deploy.
if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  // Opening the app from its home-screen icon is usually the OS resuming an
  // already-loaded instance, not a fresh network request — so the browser
  // never gets a natural moment to notice a new deploy exists, and a fix
  // can sit on the server indefinitely without ever reaching the device.
  // Explicitly ask the service worker to check for an update every time the
  // app is opened or brought back to the foreground; if one's found, the
  // controllerchange listener above reloads to it immediately.
  const checkForUpdate = () => {
    navigator.serviceWorker.getRegistration().then((reg) => reg?.update())
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate()
  })
  window.addEventListener('focus', checkForUpdate)
  checkForUpdate()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
