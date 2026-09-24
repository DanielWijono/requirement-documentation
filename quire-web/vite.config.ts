import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The API runs on :3000 in development; the browser only ever talks to this origin.
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/collab': { target: 'ws://localhost:3000', ws: true },
    },
  },
})
