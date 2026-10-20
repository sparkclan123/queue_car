import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/noto-sans-thai/400.css'
import '@fontsource/noto-sans-thai/500.css'
import '@fontsource/noto-sans-thai/600.css'
import '@fontsource/noto-sans-thai/700.css'
import './styles.css'
import App from './App'
import { StoreProvider } from './lib/store'
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>,
)
