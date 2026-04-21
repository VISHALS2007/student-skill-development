import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const configDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, configDir, "")
  const preferLocalProxy = String(env.VITE_DEV_PROXY_PREFER_LOCAL || "true").toLowerCase() !== "false"
  const explicitProxyTarget = String(env.VITE_DEV_PROXY_TARGET || "").trim()
  const proxyTarget = mode === "development" && preferLocalProxy
    ? "http://localhost:4000"
    : (explicitProxyTarget || "http://localhost:4000")
  const devPort = Number(env.VITE_DEV_PORT || 5175)

  return {
    plugins: [react()],
    server: {
      port: devPort,
      strictPort: true,
      proxy: {
        "/api": proxyTarget,
      },
    },
    build: {
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
    },
  }
})
