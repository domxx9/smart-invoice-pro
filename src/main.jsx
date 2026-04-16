import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark })
  StatusBar.setBackgroundColor({ color: '#0a0a0b' })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  if (Capacitor.isNativePlatform()) {
    // Unregister any cached service workers — they interfere with native HTTP
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister())
    })
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
    })
  }
}
