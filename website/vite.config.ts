import { fileURLToPath } from 'node:url';
import { cpSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), {
    name: 'copy-legacy-site-assets',
    closeBundle() {
      const root = fileURLToPath(new URL('.', import.meta.url));
      mkdirSync(resolve(root, 'dist'), { recursive: true });
      cpSync(resolve(root, 'assets'), resolve(root, 'dist/assets'), { recursive: true, force: true });
      copyFileSync(resolve(root, 'site.js'), resolve(root, 'dist/site.js'));
    },
  }],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
});
