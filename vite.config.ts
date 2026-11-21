import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep the stable React runtime cacheable between gameplay updates.
        manualChunks: { 'react-runtime': ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
