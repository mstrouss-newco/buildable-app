import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import BuildableKids from './BuildableKids.jsx'
import HelperReactions from './HelperReactions.jsx'
import { installAudioUnlock } from './lib/audioUnlock.js'

installAudioUnlock()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
      <BuildableKids />
      <HelperReactions />
        </React.StrictMode>,
        )
