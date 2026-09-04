import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
