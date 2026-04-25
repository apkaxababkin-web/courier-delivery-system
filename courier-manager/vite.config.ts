import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '5173-ihmyu88ootxbwj06vzwt5-0c1a1b20.us2.manus.computer',
      '5175-ihmyu88ootxbwj06vzwt5-0c1a1b20.us2.manus.computer',
    ],
  },
})
