import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base = '/' for local dev, Vercel, Netlify.
// GitHub Pages serves from /<repo>/, so CI sets VITE_BASE=/idle-legion/.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
})
