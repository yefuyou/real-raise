import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  // CI/Cloudflare deploys commonly inject VITE_* at process level instead of
  // writing an environment file. Keep local .env precedence while honoring
  // the injected production API origin.
  const runtimeEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> }
  }).process?.env
  const analysisApiUrl = env.VITE_ANALYSIS_API_URL || runtimeEnv?.VITE_ANALYSIS_API_URL || ''

  return {
    define: {
      __REAL_RAISE_ANALYSIS_API_URL__: JSON.stringify(analysisApiUrl),
    },
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:8787',
      },
    },
  }
})
