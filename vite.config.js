import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    if (!env.VITE_GOOGLE_CLIENT_ID?.trim()) {
      throw new Error('VITE_GOOGLE_CLIENT_ID is required for production builds. Set the public Google OAuth client ID in your build environment or .env.local. See README.md for setup and synthetic CI checks.')
    }
  }

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/setupTests.ts']
    }
  }
})
