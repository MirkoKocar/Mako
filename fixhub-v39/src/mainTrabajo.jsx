// Entrada propia de la página del proveedor (/t/<token>): no carga la app, ni Firebase, ni Supabase, ni el router.
import React from 'react'
import ReactDOM from 'react-dom/client'
import TrabajoLink from './pages/TrabajoLink'

ReactDOM.createRoot(document.getElementById('root')).render(<TrabajoLink />)
