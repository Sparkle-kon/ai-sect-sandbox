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
          // Map-facing agreements depend on route and evidence leaves, not on the live scribe or avatar graph.
          'territorial-accords': ['./src/engine/ceasefireEngine.ts', './src/engine/territorialLeaseEngine.ts',
            './src/engine/sanctuaryEngine.ts'],
          'cognitive-protocol': ['./src/engine/llmCognitiveResponseGuide.ts', './src/engine/llmScheduler.ts', './src/engine/fairModelTurnEngine.ts'],
          'furnace-rules': ['./src/engine/furnaceReservationEngine.ts'],
          // Shared leaf callbacks never put historical custody into the native action chunks.
          'heritage-capture': ['./src/engine/eraHeritageCapture.ts'],
          'cold-water-rules': ['./src/engine/waterVeinTerms.ts'],
          'gate-renewal-proof': ['./src/engine/northGateRenewalTerms.ts'],
          'seed-culture': ['./src/engine/seedCultureEngine.ts','./src/engine/seedCultureTerms.ts'],
          'formation-local': ['./src/engine/formationNetworkEngine.ts'],
          'north-charter-terms': ['./src/engine/northMiningCharterTerms.ts'],
          'old-well-source': ['./src/engine/northWellRevisitTerms.ts','./src/engine/northWellRevisitEvidence.ts'],
          'upper-positions': ['./src/engine/upperPassageTerms.ts','./src/engine/upperPassageIsolation.ts',
            './src/engine/upperArrayFieldTerms.ts','./src/engine/upperArrayFieldLocalTerms.ts','./src/engine/upperArrayFieldTradeTerms.ts'],
          'upper-movement': ['./src/engine/upperArrayFieldMovementEngine.ts'],
          // Geography and economic terms are shared leaves, not the live engine/ledger graph.
          'frontier-region-terms': ['./src/engine/frontierTerms.ts','./src/engine/frontierProductionTerms.ts',
            './src/engine/frontierTradeTerms.ts','./src/engine/frontierPortTerms.ts','./src/engine/frontierPortTradeTerms.ts',
            './src/engine/frontierDrylandTerms.ts','./src/engine/frontierDrylandTradeTerms.ts'],
          'terrain-ecology': ['./src/engine/terrainSuccessionEngine.ts','./src/engine/weatherEngine.ts'],
          'civic-works': ['./src/engine/villageWorksEngine.ts'],
          'household-register': ['./src/engine/householdNameEngine.ts','./src/engine/mortalAgeCohorts.ts'],
          'rural-governance': ['./src/engine/householdEngine.ts','./src/engine/seasonalHousingEngine.ts',
            './src/engine/sharedCommonsEngine.ts','./src/engine/civicMemorialEngine.ts','./src/engine/villageFairEngine.ts'],
          'living-landscape': ['./src/engine/habitatEngine.ts','./src/engine/watchlistEngine.ts'],
          'furnace-damage': ['./src/engine/damageAssuranceEngine.ts'],
          'institution-terms': ['./src/engine/sectActivity.ts','./src/engine/sectCreditTerms.ts'],
          // Small stateless records also used by save validators; don't absorb them into live scripture logic.
          'local-work-terms': ['./src/types/waypostMeal.ts', './src/types/craftTraining.ts', './src/types/scribeCommission.ts',
            './src/engine/staffedDutyEngine.ts', './src/engine/doctrineFoundingTerms.ts', './src/engine/doctrineMaturityTerms.ts',
            './src/engine/alignedWeatherTerms.ts', './src/engine/careFollowupTerms.ts', './src/engine/annotationState.ts'],
          'institution-rules': ['./src/engine/estateEngine.ts', './src/engine/sectCreditEngine.ts', './src/engine/serviceRetirementEngine.ts', './src/engine/relicExhibitEngine.ts'],
          // Both native settlement and portable scenario verification use the same small leaf proofs.
          'danxia-review-proof': ['./src/engine/danxiaSeasonTerms.ts','./src/engine/danxiaMedicineTerms.ts',
            './src/engine/danxiaShortageTerms.ts','./src/engine/settlementReliefTerms.ts'],
          'chronicle-evidence': ['./src/engine/eraHistoryIndex.ts','./src/engine/campaignStopCondition.ts',
            './src/engine/chronicleCausalityEngine.ts','./src/engine/chronicleFocusEngine.ts','./src/engine/witnessedPersonalStory.ts'],
          'market-settlement': ['./src/engine/marketEngine.ts','./src/engine/caravanRestitutionEngine.ts'],
          'village-ecology': ['./src/engine/villageEvolutionEngine.ts','./src/engine/villageEvolutionTerms.ts'],
          'archive-rules': ['./src/engine/coldHistoryEngine.ts', './src/engine/memoryEngine.ts', './src/engine/scenarioObjectiveEngine.ts', './src/engine/chronicleScene.ts',
            './src/engine/chronicleLead.ts', './src/engine/protagonistSuccession.ts', './src/engine/novelGenerator.ts',
            './src/engine/publicDialogueProvenance.ts', './src/engine/chroniclePublicProse.ts'],
          // Private theatre selection and its save proof are shared by UI, native and storage.
          'heart-demon-rules': ['./src/engine/heartDemonEngine.ts', './src/engine/interruptedStoryChoices.ts',
            './src/engine/storageHeartDemonValidation.ts', './src/types/heartDemon.ts', './src/engine/tribulationTerms.ts'],
          'expedition-rooms-live': ['./src/engine/expeditionDungeonEngine.ts','./src/engine/siegeParticipants.ts'],
          'character-records-proof': ['./src/engine/storageWitnessedPersonalStoryValidation.ts','./src/engine/storageProtagonistValidation.ts'],
          'heavenly-alchemy-proof': ['./src/types/heavenlyAlchemy.ts','./src/engine/heavenlyAlchemyTerms.ts','./src/engine/storageHeavenlyAlchemyValidation.ts'],
          'regional-care': ['./src/engine/disasterShelterEngine.ts','./src/engine/danxiaSeasonReviewEngine.ts'],
          'expedition-rooms-proof': ['./src/types/expeditionDungeon.ts','./src/engine/storageExpeditionDungeonValidation.ts'],
          'tournament-state-rules': ['./src/engine/tournamentArenaEngine.ts','./src/engine/tournamentWagerSettlement.ts','./src/engine/tournamentWagerTerms.ts'],
          'tournament-proof': ['./src/engine/storageTournamentArenaValidation.ts'],
          'hall-public-proof': ['./src/engine/alchemyCatalog.ts','./src/engine/storagePublicAlchemyValidation.ts'],
          'ring-audience-proof': ['./src/engine/ringAudienceTerms.ts', './src/engine/storageRingAudienceValidation.ts'],
          // Authored and model-selected voice variants do not pull in the simulation rule graph.
          'wild-persona-voices': ['./src/engine/wildPersonaEngine.ts', './src/engine/dialogueEngine.ts'],
          // Public bond projections share a narrow proof format, independently of raw relationship panels.
          'dramatic-bond-proof': ['./src/types/dramaticBond.ts', './src/engine/dramaticBondTerms.ts', './src/engine/storageDramaticBondValidation.ts'],
          'dramatic-bond-story': ['./src/engine/dramaticBondEngine.ts', './src/components/DramaticBondRead.tsx',
            './src/components/useDramaticBondRead.ts', './src/engine/ringAudienceEngine.ts', './src/engine/ringAudienceDialogue.ts',
            './src/components/RingAudiencePanel.tsx', './src/components/useRingAudienceControls.ts'],
          // Truce and storage need the typed siege proof, not the active combat graph.
          'grand-siege-proof': ['./src/engine/grandSiegeProof.ts', './src/engine/storageGrandSiegeValidation.ts', './src/types/grandSiege.ts'],
          // The game seed depends only on trace state; keep the optional replay rules separate.
          'decision-replay': ['./src/engine/decisionTraceEngine.ts'],
          // One shared chunk for authored arts, native costs and their strict save proof.
          'forbidden-art-rules': ['./src/types/forbiddenArt.ts', './src/engine/forbiddenArtCatalog.ts',
            './src/engine/forbiddenArtEngine.ts', './src/engine/storageForbiddenArtValidation.ts'],
          'personal-rules': ['./src/engine/artifactEngine.ts', './src/engine/reincarnationEngine.ts', './src/engine/schemeEngine.ts', './src/engine/elementalEngine.ts'],
          'world-identity': ['./src/engine/worldRandom.ts', './src/engine/worldIdentity.ts', './src/engine/worldgenProfiles.ts','./src/engine/highDramaPresetTerms.ts','./src/engine/storageBuiltinScenarioValidation.ts'],
          'travel-checkpoints': ['./src/engine/expeditionRescueCheckpoint.ts', './src/engine/boundaryReliefCheckpoint.ts',
            './src/engine/disasterShelterCheckpoint.ts','./src/engine/marketFreightCheckpoint.ts'],
          'journey-rules': ['./src/engine/terrainEngine.ts', './src/engine/simulationRegionGeometry.ts', './src/engine/mapMotionEngine.ts', './src/engine/roadEngine.ts',
            './src/engine/sealedCourierEngine.ts', './src/engine/escortEngine.ts', './src/engine/pilgrimageEngine.ts', './src/engine/expeditionRescueEngine.ts',
            './src/engine/boundaryReliefEngine.ts','./src/engine/routeWarningProof.ts','./src/engine/routeWarningEngine.ts'],
          'story-opening-ui': ['./src/components/HighDramaPresetPicker.tsx','./src/components/PlayerStoryEntry.tsx','./src/components/storyPlayerController.ts','./src/components/useHighDramaOpening.ts'],
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
