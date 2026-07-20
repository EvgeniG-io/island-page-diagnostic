import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves under /<repo>/
const base =
  process.env.GITHUB_PAGES === 'true' ? '/island-page-diagnostic/' : '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base,
})
