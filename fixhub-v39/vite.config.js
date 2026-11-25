import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // Dos entradas: la app (index.html) y la página aislada del proveedor (t.html, ruta /t/<token>)
      input: { main: 'index.html', t: 't.html' },
      output: {
        manualChunks: {
          vendor:   ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          lucide:   ['lucide-react'],
        }
      }
    },
    chunkSizeWarningLimit: 600,
  }
})
