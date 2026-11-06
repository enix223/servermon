import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ApiProvider } from './data/ApiContext'
import { createElectronApi } from './data/electronApi'
import './styles.css'

const api = createElectronApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ApiProvider api={api}>
      <App />
    </ApiProvider>
  </React.StrictMode>
)
