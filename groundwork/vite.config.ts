/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    // Frontend unit tests only; the API's standalone Node tests run
    // separately (see the "test" npm script).
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
