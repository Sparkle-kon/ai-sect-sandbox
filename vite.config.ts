import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        // Keep framework code and independent rule modules cacheable between gameplay updates.
        manualChunks: {
          'react-runtime': ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
          'interface-icons': ['lucide-react'],
          'resource-journal': ['./src/engine/resourceFlowEngine.ts'],
          'agreement-rules': ['./src/engine/oathEngine.ts', './src/engine/oathArbitrationEngine.ts'],
          'cognitive-protocol': ['./src/engine/llmCognitiveResponseGuide.ts', './src/engine/llmScheduler.ts', './src/engine/fairModelTurnEngine.ts'],
          'furnace-rules': ['./src/engine/furnaceReservationEngine.ts'],
          'institution-rules': ['./src/engine/estateEngine.ts', './src/engine/sectCreditEngine.ts', './src/engine/serviceRetirementEngine.ts', './src/engine/relicExhibitEngine.ts'],
          'archive-rules': ['./src/engine/coldHistoryEngine.ts', './src/engine/memoryEngine.ts', './src/engine/scenarioObjectiveEngine.ts'],
          'personal-rules': ['./src/engine/artifactEngine.ts', './src/engine/reincarnationEngine.ts', './src/engine/schemeEngine.ts', './src/engine/elementalEngine.ts'],
          'world-identity': ['./src/engine/worldRandom.ts', './src/engine/worldIdentity.ts', './src/engine/worldgenProfiles.ts'],
          'travel-checkpoints': ['./src/engine/expeditionRescueCheckpoint.ts', './src/engine/boundaryReliefCheckpoint.ts'],
          'workspace-shell': ['./src/components/SandboxWorkspace.tsx', './src/components/workspacePreferences.ts'],
          'map-controls': ['./src/components/mapCamera.ts', './src/components/mapKeyboard.ts', './src/components/mapActorClusters.ts',
            './src/components/mapBrushView.ts', './src/components/mapTouchGesture.ts'],
          'provenance-rules': ['./src/engine/relicEngine.ts', './src/engine/witnessEngine.ts', './src/engine/competitionEngine.ts',
            './src/engine/seasonReviewEngine.ts'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
