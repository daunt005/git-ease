import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // relative asset paths let the same build work at a domain root or a subfolder
  // (e.g. https://you.github.io/git-ease/)
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
