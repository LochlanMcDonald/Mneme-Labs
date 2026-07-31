import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // The local runtime (server.mjs) does the vendor polling; in dev, vite
    // forwards those calls to it so connectors work without a build.
    proxy: { '/panel-api': 'http://localhost:7439' },
  },
});
