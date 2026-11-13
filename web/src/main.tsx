import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Installable app: the service worker only runs over HTTPS or on localhost.
if ('serviceWorker' in navigator && import.meta.env.PROD && !import.meta.env.VITE_PREVIEW) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
