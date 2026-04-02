import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'
import { SkillsProvider } from './lib/SkillsContext.jsx'
import { ThemeProvider } from './lib/ThemeContext.jsx'
import { ToastContainer } from 'react-toastify'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import AppCrashOverlay from './components/AppCrashOverlay.jsx'
import 'react-toastify/dist/ReactToastify.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <SkillsProvider>
            <App />
          </SkillsProvider>
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
    <AppCrashOverlay />
    <ToastContainer
      position="top-center"
      autoClose={2500}
      newestOnTop
      closeOnClick
      pauseOnHover={false}
      draggable
      theme="colored"
      style={{ zIndex: 9999 }}
    />
  </React.StrictMode>
)
