import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Exclude system directories like Address Book and node_modules from triggering HMR loops
      watch: process.env.DISABLE_HMR === 'true'
        ? null
        : {
            ignored: [
              '**/Library/**',
              '**/node_modules/**',
              '**/.git/**',
              '**/data/**',
            ],
          },
    },
  };
});
