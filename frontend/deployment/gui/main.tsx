import React from 'react'
import ReactDOM from 'react-dom/client'
import GuiApp from './GuiApp'
import ErrorBoundary from './kit/ui/ErrorBoundary'
import './kit/index.css'

// A file dropped beside a picker would be opened by the browser in place of the tool: a drop is the page's to take or to refuse.
for (const type of ['dragover', 'drop']) window.addEventListener(type, (event) => { if ((event as DragEvent).dataTransfer?.types.includes('Files')) event.preventDefault(); });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <GuiApp />
    </ErrorBoundary>
  </React.StrictMode>,
)
