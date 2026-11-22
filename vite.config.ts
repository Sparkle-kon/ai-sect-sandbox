import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync,readFileSync } from 'node:fs';
import { join,relative,sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot=fileURLToPath(new URL('.',import.meta.url));
function ruleSourceFiles(directory:string):string[]{
  return readdirSync(directory,{withFileTypes:true}).flatMap((entry)=>{
    const path=join(directory,entry.name);
    return entry.isDirectory()?ruleSourceFiles(path):entry.isFile()&&entry.name.endsWith('.ts')?[path]:[];
  });
}
const normalized=(path:string)=>relative(sourceRoot,path).split(sep).join('/');
const ruleFiles=['src/engine','src/data','src/types'].flatMap((path)=>ruleSourceFiles(join(sourceRoot,path)))
  .concat(join(sourceRoot,'package-lock.json')).sort((a,b)=>normalized(a)<normalized(b)?-1:normalized(a)>normalized(b)?1:0);
const ruleHash=createHash('sha256');
for(const file of ruleFiles) {
  ruleHash.update(normalized(file)).update('\0').update(createHash('sha256').update(readFileSync(file)).digest('hex')).update('\0');
}
const utilityRuleVersion=ruleHash.digest('hex');

export default defineConfig({
  plugins: [react()],
  define: { __SECT_UTILITY_RULE_VERSION__: JSON.stringify(utilityRuleVersion) },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        // Keep framework code and independent rule modules cacheable between gameplay updates.
        manualChunks: {
          'react-runtime': ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
          'interface-icons': ['lucide-react'],
          'resource-journal': ['./src/engine/resourceFlowEngine.ts'],
          'scripture-circulation': ['./src/engine/pavilionLoanEngine.ts','./src/engine/scriptureEngine.ts','./src/engine/techniqueEngine.ts'],
          'village-supply-rules': ['./src/engine/villageGranaryEngine.ts', './src/engine/villageSupplyAccounting.ts',
            './src/engine/villageSupplyEngine.ts'],
          'agreement-rules': ['./src/engine/oathEngine.ts', './src/engine/oathArbitrationEngine.ts'],
          'cognitive-protocol': ['./src/engine/llmCognitiveResponseGuide.ts', './src/engine/llmScheduler.ts', './src/engine/fairModelTurnEngine.ts'],
          'furnace-rules': ['./src/engine/furnaceReservationEngine.ts'],
          // Shared leaf callbacks never put historical custody into the native action chunks.
          'heritage-capture': ['./src/engine/eraHeritageCapture.ts'],
          'cold-water-rules': ['./src/engine/waterVeinTerms.ts'],
          'north-charter-terms': ['./src/engine/northMiningCharterTerms.ts'],
          'household-register': ['./src/engine/householdNameEngine.ts','./src/engine/mortalAgeCohorts.ts'],
          'institution-terms': ['./src/engine/sectActivity.ts','./src/engine/sectCreditTerms.ts'],
          'institution-rules': ['./src/engine/estateEngine.ts', './src/engine/sectCreditEngine.ts', './src/engine/serviceRetirementEngine.ts', './src/engine/relicExhibitEngine.ts'],
          // Both native settlement and portable scenario verification use the same small leaf proofs.
          'danxia-review-proof': ['./src/engine/danxiaSeasonTerms.ts','./src/engine/danxiaMedicineTerms.ts',
            './src/engine/danxiaShortageTerms.ts','./src/engine/settlementReliefTerms.ts'],
          'archive-rules': ['./src/engine/coldHistoryEngine.ts', './src/engine/memoryEngine.ts', './src/engine/scenarioObjectiveEngine.ts', './src/engine/chronicleScene.ts',
            './src/engine/chronicleLead.ts', './src/engine/protagonistSuccession.ts', './src/engine/novelGenerator.ts',
            './src/engine/publicDialogueProvenance.ts', './src/engine/chroniclePublicProse.ts'],
          'personal-rules': ['./src/engine/artifactEngine.ts', './src/engine/reincarnationEngine.ts', './src/engine/schemeEngine.ts', './src/engine/elementalEngine.ts'],
          'world-identity': ['./src/engine/worldRandom.ts', './src/engine/worldIdentity.ts', './src/engine/worldgenProfiles.ts'],
          'travel-checkpoints': ['./src/engine/expeditionRescueCheckpoint.ts', './src/engine/boundaryReliefCheckpoint.ts'],
          'journey-rules': ['./src/engine/terrainEngine.ts', './src/engine/mapMotionEngine.ts', './src/engine/roadEngine.ts',
            './src/engine/sealedCourierEngine.ts', './src/engine/escortEngine.ts', './src/engine/pilgrimageEngine.ts', './src/engine/expeditionRescueEngine.ts',
            './src/engine/boundaryReliefEngine.ts','./src/engine/routeWarningProof.ts','./src/engine/routeWarningEngine.ts'],
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
