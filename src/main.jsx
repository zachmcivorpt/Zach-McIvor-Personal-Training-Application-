import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import './lib/nativeBridge.js'
import { setupServiceWorkerUpdateChecks } from './lib/swUpdateCheck.js'

// See src/lib/swUpdateCheck.js for the full reasoning (update-check
// scheduling, the anti-flash reload gating, duplicate-call/overlapping-
// check guards) — split out purely so it's independently testable.
setupServiceWorkerUpdateChecks()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
