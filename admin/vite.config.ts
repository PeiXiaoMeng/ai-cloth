import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true 让手机通过局域网 IP 访问（手机和电脑需在同一 WiFi）
    host: true,
    port: 5173,
    // 开发时把 /admin 和 /static 代理到本地 server，避免跨域
    proxy: {
      '/admin': 'http://localhost:3000',
      '/static': 'http://localhost:3000',
    },
  },
})
