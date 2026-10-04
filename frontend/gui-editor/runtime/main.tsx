import React from 'react'
import ReactDOM from 'react-dom/client'
import RuntimeApp from './RuntimeApp'
import ErrorBoundary from '../../app/ui/ErrorBoundary'
import '../../app/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RuntimeApp />
    </ErrorBoundary>
  </React.StrictMode>,
)
