import React from 'react'
import ReactDOM from 'react-dom/client'
import NotebookApp from './NotebookApp'
import ErrorBoundary from '../../deployment/gui/kit/ui/ErrorBoundary'
import '../../deployment/gui/kit/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <NotebookApp />
    </ErrorBoundary>
  </React.StrictMode>,
)
