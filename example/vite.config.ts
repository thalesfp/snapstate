import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const snapstate = path.resolve(__dirname, '..')

export default defineConfig({
  resolve: {
    alias: {
      'snapstate/react': path.join(snapstate, 'dist/react/index.js'),
      'snapstate/form': path.join(snapstate, 'dist/form/index.js'),
      'snapstate': path.join(snapstate, 'dist/index.js'),
    },
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
