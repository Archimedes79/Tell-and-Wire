import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from '../../deployment/gui/kit/ui/ErrorBoundary'
import '../../deployment/gui/kit/index.css'
import { applyLook, savedLook } from '../document/store/look'

// The editor's own look (white, unless chosen otherwise) is on the page before anything is drawn.
applyLook(savedLook())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
