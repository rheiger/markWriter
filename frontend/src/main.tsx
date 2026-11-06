import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Vite removes this branch and module from ordinary production builds.
// https://vite.dev/guide/env-and-mode#production
if (import.meta.env.MODE === 'acceptance') {
  void import('./test/nativeBridge').then(({ installNativeBridge }) => installNativeBridge())
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
