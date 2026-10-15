import project from './prototype.project.json'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const mode = (project as { deliveryMode?: string }).deliveryMode ?? 'single-html'
if (!['single-html', 'web'].includes(mode)) throw new Error('无效 deliveryMode')
const single = mode === 'single-html'
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  build: {
    assetsInlineLimit: single ? 100_000_000 : 4096,
    cssCodeSplit: !single,
    modulePreload: !single,
    target: 'es2022',
  },
})
