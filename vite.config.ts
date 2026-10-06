/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Node's environment (this file runs in Node; the app's tsconfig has no Node types)
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  // GitHub Pages serves the project under /<repo>/ (the Pages workflow sets BASE_PATH)
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: {
    // Native file events are unreliable for this (non-ASCII) Windows path; polling is.
    watch: { usePolling: true, interval: 300 },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
