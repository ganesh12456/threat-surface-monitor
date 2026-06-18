import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0f1629',
            color: '#e2e8f0',
            border: '1px solid #1e2d4e',
            fontFamily: 'Inter, sans-serif',
          },
          success: {
            iconTheme: { primary: '#00ff88', secondary: '#0f1629' },
          },
          error: {
            iconTheme: { primary: '#ff3366', secondary: '#0f1629' },
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
)
