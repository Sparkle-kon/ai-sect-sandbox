import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep framework code and independent rule modules cacheable between gameplay updates.
        manualChunks: {
          'react-runtime': ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
          'interface-icons': ['lucide-react'],
          'resource-journal': ['./src/engine/resourceFlowEngine.ts'],
          'cognitive-response-guide': ['./src/engine/llmCognitiveResponseGuide.ts'],
          'institution-rules': ['./src/engine/estateEngine.ts', './src/engine/sectCreditEngine.ts', './src/engine/serviceRetirementEngine.ts'],
          'provenance-rules': ['./src/engine/relicEngine.ts', './src/engine/witnessEngine.ts', './src/engine/competitionEngine.ts'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
