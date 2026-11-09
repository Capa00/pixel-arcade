import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/base.css'
import App from './App.jsx'
import { applyMode, resolveMode, storedMode, systemPrefersDark } from './lib/modes.js'

// Colori dell'ultima modalità salvata già dallo splash; la finestra in partita resta notte.
if (new URLSearchParams(window.location.search).get('overlay') !== '1') {
  applyMode(resolveMode(storedMode(), systemPrefersDark()))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
