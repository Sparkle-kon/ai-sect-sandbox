import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep framework code and shared icons cacheable between gameplay updates.
        manualChunks: {
          'react-runtime': ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
          'interface-icons': ['lucide-react'],
          'resource-journal': ['./src/engine/resourceFlowEngine.ts'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
