import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = 'http://localhost:3000';
const paths = ['/auth', '/me', '/admin', '/assets', '/work-orders', '/projects', '/tasks', '/health'];
const proxy = Object.fromEntries(paths.map((p) => [p, { target: backend, changeOrigin: true }]));

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
});
