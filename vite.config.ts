import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/** Must match the GitHub repo name for default Pages hosting. If the repo is still `smarter-than-5th-grader`, use that path until you rename. */
export default defineConfig({
  base: '/class-room-trivia-game/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'react-vendor';
          if (id.includes('node_modules/motion')) return 'motion';
          if (id.includes('node_modules/canvas-confetti')) return 'confetti';
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
