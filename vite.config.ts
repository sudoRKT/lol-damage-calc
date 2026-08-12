import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static single-page app. No server, no API routes — the calculation runs entirely in the
// browser (SPECIFICATION §1). `vite build` emits a folder of static files for a CDN (§14).
export default defineConfig({
  plugins: [react()],
});
