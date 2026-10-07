import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
// room.css first, so Tailwind's utilities win over its single-class pieces.
import '@/styles/room.css'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
