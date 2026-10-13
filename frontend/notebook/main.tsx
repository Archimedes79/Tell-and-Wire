import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyLook, savedLook } from './look'

// Before the first paint, so a dark notebook never flashes white.
applyLook(savedLook())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
