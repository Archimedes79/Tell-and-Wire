import React from 'react'
import ReactDOM from 'react-dom/client'
import GuiApp from './GuiApp'
import ErrorBoundary from './kit/ui/ErrorBoundary'
import './kit/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GuiApp />
    </ErrorBoundary>
  </React.StrictMode>,
)
