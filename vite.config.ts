/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
