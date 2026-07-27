import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    define: {
      __REAL_RAISE_ANALYSIS_API_URL__: JSON.stringify(env.VITE_ANALYSIS_API_URL ?? ''),
    },
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:8787',
      },
    },
  }
})
