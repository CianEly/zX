import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['ssh2', 'cpu-features', 'node-pty'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.cts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            lib: {
              entry: 'electron/preload.cts',
              formats: ['cjs'],
              fileName: () => 'preload.cjs',
            },
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
})
