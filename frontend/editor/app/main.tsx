import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from '../../deployment/gui/kit/ui/ErrorBoundary'
import '../../deployment/gui/kit/index.css'
import { startEditorScheme } from '../document/store/editorScheme'

// The colours are on the page before it is drawn, so it never shows in Night first.
startEditorScheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
