import { validateBattlefieldAftermathSave } from '../battlefieldAftermath';
import { validateVillageReunionSave } from '../villageReunion';
import { validateAnomalyRelaySave } from '../anomalyRelay';
import { validateVacantGateSave } from '../vacantGate';
import { validateWildMigrationSave } from '../wildMigration';
import { validateFarewellLandingSave } from '../farewellLanding';
import { validateMercyReunionSave } from '../mercyReunion';
import { validatePavilionFireSave } from '../pavilionFire';
import { validateSchoolFormDuelSave } from '../schoolFormDuel';
import { validateBeastDuelContacts } from '../beastDuelProtection';
import { validateGrandSiegeHistory } from '../storageGrandSiegeValidation';
import { validateForbiddenArtHistory } from '../storageForbiddenArtValidation';
import { validateHeartDemonTrials } from '../storageHeartDemonValidation';
import { validateDestinyTraitHistory } from '../storageDestinyTraitValidation';
import { validateRoguelikeEncounterHistory } from '../storageRoguelikeValidation';
import { isOrdinaryActionEvidence } from '../ordinaryActionEvidence';
import { createAlignedWeatherState } from '../alignedWeatherEngine';
import { createExpeditionOmensState } from '../expeditionOmenEngine';
import { createWitnessedPersonalStoryState } from '../witnessedPersonalStory';
import { createProtagonistSuccessionState } from '../protagonistSuccession';
import { createCompetitionReviewState } from '../seasonReviewEngine';
import { createFieldObservatoriesState } from '../fieldObservatoryEngine';
import { createOathArbitrationState } from '../oathArbitrationEngine';
import { createVillageCensusesState } from '../villageCensusEngine';
import { createRoadState } from '../roadEngine';
import { createProbationState } from '../probationEngine';
import { createRelicExhibitState } from '../relicExhibitEngine';
import { createArtifactSalvageState } from '../artifactSalvageEngine';
import { createWorkshopState } from '../workshopEngine';
import { createDamageAssuranceState } from '../damageAssuranceEngine';
import { createFurnaceSafetyState } from '../furnaceSafetyEngine';
import { createFurnaceReservationState } from '../furnaceReservationEngine';
import { createSparringState } from '../sparringEngine';
import { createExpeditionRescueState } from '../expeditionRescueEngine';
import { createShortShiftState } from '../shortShiftEngine';
import { createBoundaryReliefState } from '../boundaryReliefEngine';
import { createApprenticeCohortState } from '../apprenticeCohortEngine';
import { createHouseholdNameState } from '../householdNameEngine';
import { createVillageSupplyState } from '../villageSupplyEngine';
import { createRouteWarningsState } from '../routeWarningEngine';
import { createPavilionLoansState } from '../pavilionLoanEngine';
import { createCivicMemorialsState } from '../civicMemorialEngine';
import { createVillageFairsState } from '../villageFairEngine';
import { createSectStipendsState } from '../sectStipendEngine';
import { createSeedCultureState } from '../seedCultureEngine';
import { createCareFollowupsState } from '../careFollowupEngine';
import { createDanxiaShortagesState } from '../danxiaShortageEngine';
import { createToolLoansState } from '../toolLoanEngine';
import { createVillageGranariesState } from '../villageGranaryEngine';
import { createCaravanRestitutionState } from '../caravanRestitutionEngine';
import { createTerrainSuccessionState } from '../terrainSuccessionEngine';
import { createResourceFlowState } from '../resourceFlowEngine';
import { createSharedCommonsState } from '../sharedCommonsEngine';
import { createServiceRetirementState } from '../serviceRetirementEngine';
import { createColdHistoryState, freezeColdHistory } from '../coldHistoryEngine';
import { createSealedCourierState } from '../sealedCourierEngine';
import { createWatchlistState } from '../watchlistEngine';
import { createVillageWorksState } from '../villageWorksEngine';
import { createHouseholdState } from '../householdEngine';
import { createTerritorialLeaseState } from '../territorialLeaseEngine';
import { createFormationNetworkState } from '../formationNetworkEngine';
import { createInfirmaryState } from '../infirmaryEngine';
import { createHabitatState } from '../habitatEngine';
import { createChronicleErrataState } from '../chronicleErrataEngine';
import { createCausalChronicleState } from '../chronicleCausalityEngine';
import { createPilgrimageState } from '../pilgrimageEngine';
import { createSectCreditState } from '../sectCreditEngine';
import { createSanctuaryState } from '../sanctuaryEngine';
import { createResearchState } from '../researchEngine';
import { createCeasefireState } from '../ceasefireEngine';
import { createAnnotationState } from '../annotationState';
import { createEscortState } from '../escortEngine';
import { createCompetitionState } from '../competitionEngine';
import { createScriptureState } from '../scriptureEngine';
import { createRelicState } from '../relicEngine';
import { createReincarnationState } from '../reincarnationEngine';
import { createRelocationState } from '../relocationEngine';
import { createDoctrineState } from '../doctrineEngine';
import { createSettlementState } from '../settlementEngine';
import type { WorldState } from '../../types/world';
import { fail } from './primitives';
import { shape } from './worldSchema';
import { unique } from './semanticShared';
import { validateCausalTerrain } from './causalTerrainValidation';
import { validateLocalInstitutions } from './localInstitutionsValidation';
import { validateLocalServices } from './localServicesValidation';
import { validateJourneys } from './journeyGovernanceValidation';
import { validatePoliticalGovernance } from './politicalGovernanceValidation';
import { validateCultivationHouseholds } from './cultivationHouseholdsValidation';
import { validateContinuity } from './continuityValidation';
import { validateFrontier } from './frontierValidation';

// Validate in the original diagnostic order: failed saves report the first invalid field, and
// later stages consume only indices established by earlier validation.
export function verifyWorld(value: unknown): WorldState {
  const candidate = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? { ...value,
      ...(!Object.hasOwn(value, 'mentorTransfers') ? { mentorTransfers: { releases:[], transfers:[], nextId:1 } } : {}),
      ...(!Object.hasOwn(value, 'seasonalHousing') ? { seasonalHousing: { claims:[], nextId:1 } } : {}),
      ...(!Object.hasOwn(value, 'mentorship') ? { mentorship: { offers: [], lineage: [], budgets: [] } } : {}),
      ...(!Object.hasOwn(value, 'decisionTrace') ? { decisionTrace: { records: [] } } : {}),
      ...(!Object.hasOwn(value, 'coldHistory') ? { coldHistory: createColdHistoryState() } : {}),
      ...(!Object.hasOwn(value, 'eraHistory') ? { eraHistory:{receipts:[]} } : {}),
      ...(!Object.hasOwn(value, 'competitionReviews') ? { competitionReviews: createCompetitionReviewState() } : {}),
      ...(!Object.hasOwn(value, 'fieldObservatories') ? { fieldObservatories: createFieldObservatoriesState() } : {}),
      ...(!Object.hasOwn(value, 'alignedWeather') ? { alignedWeather: createAlignedWeatherState() } : {}),
      ...(!Object.hasOwn(value, 'oathArbitrations') ? { oathArbitrations: createOathArbitrationState() } : {}),
      ...(!Object.hasOwn(value, 'villageCensuses') ? { villageCensuses: createVillageCensusesState() } : {}),
      ...(!Object.hasOwn(value, 'roads') ? { roads: createRoadState() } : {}),
      ...(!Object.hasOwn(value, 'probation') ? { probation: createProbationState() } : {}),
      ...(!Object.hasOwn(value, 'relicExhibits') ? { relicExhibits: createRelicExhibitState() } : {}),
      ...(!Object.hasOwn(value, 'workshopDisbandments') ? { workshopDisbandments: {closures:[]} } : {}),
      ...(!Object.hasOwn(value, 'workshops') ? { workshops: createWorkshopState() } : {}),
      ...(!Object.hasOwn(value, 'artifactSalvages') ? { artifactSalvages: createArtifactSalvageState() } : {}),
      ...(!Object.hasOwn(value, 'furnaceSafety') ? { furnaceSafety: createFurnaceSafetyState() } : {}),
      ...(!Object.hasOwn(value, 'damageAssurance') ? { damageAssurance: createDamageAssuranceState() } : {}),
      ...(!Object.hasOwn(value, 'furnaceReservations') ? { furnaceReservations: createFurnaceReservationState() } : {}),
      ...(!Object.hasOwn(value, 'sparring') ? { sparring: createSparringState() } : {}),
      ...(!Object.hasOwn(value, 'expeditionOmens') ? { expeditionOmens: createExpeditionOmensState() } : {}),
      ...(!Object.hasOwn(value, 'expeditionRescues') ? { expeditionRescues: createExpeditionRescueState() } : {}),
      ...(!Object.hasOwn(value, 'shortShifts') ? { shortShifts: createShortShiftState() } : {}),
      ...(!Object.hasOwn(value, 'boundaryReliefs') ? { boundaryReliefs: createBoundaryReliefState() } : {}),
      ...(!Object.hasOwn(value, 'apprenticeCohorts') ? { apprenticeCohorts: createApprenticeCohortState() } : {}),
      ...(!Object.hasOwn(value, 'householdNames') ? { householdNames: createHouseholdNameState() } : {}),
      ...(!Object.hasOwn(value, 'villageGranaries') ? { villageGranaries: createVillageGranariesState() } : {}),
      ...(!Object.hasOwn(value, 'villageSupply') ? { villageSupply: createVillageSupplyState() } : {}),
      ...(!Object.hasOwn(value, 'routeWarnings') ? { routeWarnings: createRouteWarningsState() } : {}),
      ...(!Object.hasOwn(value, 'pavilionLoans') ? { pavilionLoans: createPavilionLoansState() } : {}),
      ...(!Object.hasOwn(value, 'civicMemorials') ? { civicMemorials: createCivicMemorialsState() } : {}),
      ...(!Object.hasOwn(value, 'villageFairs') ? { villageFairs: createVillageFairsState() } : {}),
      ...(!Object.hasOwn(value, 'sectStipends') ? { sectStipends: createSectStipendsState() } : {}),
      ...(!Object.hasOwn(value, 'seedCulture') ? { seedCulture: createSeedCultureState() } : {}),
      ...(!Object.hasOwn(value, 'toolLoans') ? { toolLoans: createToolLoansState() } : {}),
      ...(!Object.hasOwn(value, 'caravanRestitution') ? { caravanRestitution: createCaravanRestitutionState() } : {}),
      ...(!Object.hasOwn(value, 'terrainSuccession') ? { terrainSuccession: createTerrainSuccessionState() } : {}),
      ...(!Object.hasOwn(value, 'resourceFlow') ? { resourceFlow: createResourceFlowState() } : {}),
      ...(!Object.hasOwn(value, 'sharedCommons') ? { sharedCommons: createSharedCommonsState() } : {}),
      ...(!Object.hasOwn(value, 'serviceRetirement') ? { serviceRetirement: createServiceRetirementState() } : {}),
      ...(!Object.hasOwn(value, 'couriers') ? { couriers: createSealedCourierState() } : {}),
      ...(!Object.hasOwn(value, 'protagonistSuccession') ? { protagonistSuccession: createProtagonistSuccessionState() } : {}),
      ...(!Object.hasOwn(value, 'witnessedPersonalStory') ? { witnessedPersonalStory: createWitnessedPersonalStoryState() } : {}),
      ...(!Object.hasOwn(value, 'watchlists') ? { watchlists: createWatchlistState() } : {}),
      ...(!Object.hasOwn(value, 'villageWorks') ? { villageWorks: createVillageWorksState() } : {}),
      ...(!Object.hasOwn(value, 'households') ? { households: createHouseholdState() } : {}),
      ...(!Object.hasOwn(value, 'territorialLeases') ? { territorialLeases: createTerritorialLeaseState() } : {}),
      ...(!Object.hasOwn(value, 'formations') ? { formations: createFormationNetworkState() } : {}),
      ...(!Object.hasOwn(value, 'infirmaries') ? { infirmaries: createInfirmaryState() } : {}),
      ...(!Object.hasOwn(value, 'villageEvolution') ? { villageEvolution: { villages:[],migrations:[] } } : {}),
      ...(!Object.hasOwn(value, 'danxiaReviews') ? { danxiaReviews: { reviews:[] } } : {}),
      ...(!Object.hasOwn(value, 'danxiaMedicine') ? { danxiaMedicine: { commitments:[] } } : {}),
      ...(!Object.hasOwn(value, 'danxiaShortages') ? { danxiaShortages: createDanxiaShortagesState() } : {}),
      ...(!Object.hasOwn(value, 'careFollowups') ? { careFollowups: createCareFollowupsState() } : {}),
      ...(!Object.hasOwn(value, 'habitats') ? { habitats: createHabitatState() } : {}),
      ...(!Object.hasOwn(value, 'chronicleErrata') ? { chronicleErrata: createChronicleErrataState() } : {}),
      ...(!Object.hasOwn(value, 'chronicleCausality') ? { chronicleCausality: createCausalChronicleState() } : {}),
      ...(!Object.hasOwn(value, 'pilgrimages') ? { pilgrimages: createPilgrimageState() } : {}),
      ...(!Object.hasOwn(value, 'credit') ? { credit: createSectCreditState() } : {}),
      ...(!Object.hasOwn(value, 'sanctuary') ? { sanctuary: createSanctuaryState() } : {}),
      ...(!Object.hasOwn(value, 'research') ? { research: createResearchState() } : {}),
      ...(!Object.hasOwn(value, 'ceasefires') ? { ceasefires: createCeasefireState() } : {}),
      ...(!Object.hasOwn(value, 'annotations') ? { annotations: createAnnotationState() } : {}),
      ...(!Object.hasOwn(value, 'escorts') ? { escorts: createEscortState() } : {}),
      ...(!Object.hasOwn(value, 'competitions') ? { competitions: { seasons: [], entries: [], scores: [], honors: [], optOutActorIds: [] } } : {}),
      ...(!Object.hasOwn(value, 'scriptures') ? { scriptures: createScriptureState() } : {}),
      ...(!Object.hasOwn(value, 'relics') ? { relics: { fragments: [] } } : {}),
      ...(!Object.hasOwn(value, 'reincarnation') ? { reincarnation: createReincarnationState() } : {}),
      ...(!Object.hasOwn(value, 'relocations') ? { relocations: createRelocationState() } : {}),
      ...(!Object.hasOwn(value, 'doctrineFoundings') ? {doctrineFoundings:{foundings:[]}} : {}),
      ...(!Object.hasOwn(value, 'doctrines') ? { doctrines: createDoctrineState() } : {}),
      ...(!Object.hasOwn(value, 'estates') ? { estates: { entries: [] } } : {}),
      ...(!Object.hasOwn(value, 'witnesses') ? { witnesses: { facts: [], claims: [], nextId: 1 } } : {}),
      ...(!Object.hasOwn(value, 'settlements') ? { settlements: { villages: [], records: [] } } : {}),
      ...(!Object.hasOwn(value, 'markets') ? { markets: { orders: [], shipments: [], receipts: [], nextId: 1 } } : {}),
      ...(!Object.hasOwn(value, 'oaths') ? { oaths: { contracts: [], nextId: 1 } } : {}),
    } : value;
  shape(candidate, 'world');
  const w = candidate as WorldState;
  if (!w.cultivators.length || !w.locations.length) fail('world.minimum_entities');
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'settlements')) {
    // Only a first-tick modern creation with an explicitly authored roster can
    // reconstruct missing newborn metadata. Older incomplete worlds stay neutral.
    const modernGenesis=w.tick===1&&w.worldgen?.birthTick===1&&w.cultivators.length>=16&&
      w.cultivators.some(actor=>actor.id==='npc-1')&&w.cultivators.every(actor=>actor.gender!==undefined);
    w.settlements = createSettlementState(w.locations, w.random.seed, modernGenesis?{generatedPersonMetadata:true}:undefined);
  }
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'relics')) {
    w.relics = createRelicState(w.locations, w.random.seed);
  }
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'competitions')) {
    w.competitions = createCompetitionState(w.year, w.tick);
  }
  const actor = unique(w.cultivators, (item) => item.id, 'cultivators.id');
  validateRoguelikeEncounterHistory(w,actor,fail);
  validateDestinyTraitHistory(w,fail);
  validateHeartDemonTrials(w,actor,fail);
  validateForbiddenArtHistory(w,fail);
  validateBeastDuelContacts(w,fail);
  validateSchoolFormDuelSave(w,fail);
  validatePavilionFireSave(w,fail);
  validateMercyReunionSave(w,fail);
  validateFarewellLandingSave(w,fail);
  validateWildMigrationSave(w,fail);
  validateVillageReunionSave(w,fail);
  validateVacantGateSave(w,fail);
  validateAnomalyRelaySave(w,fail);
  validateGrandSiegeHistory(w,fail);
  validateBattlefieldAftermathSave(w,fail);
  const ordinaryTrace = new Map(w.decisionTrace.records.map(row=>[row.id,row]));
  for(const person of w.cultivators){
    const receipt=person.ordinaryActionEvidence;
    if(receipt===undefined)continue;
    if(!isOrdinaryActionEvidence(receipt,w.tick))fail('cultivators.ordinaryActionEvidence');
    // Retained conflicting traces fail closed. Their intentional global retention cap
    // is not authority to erase a previously committed per-actor receipt.
    const trace=ordinaryTrace.get(`decision-${receipt.tick}-${person.id}`);
    if(trace&&(trace.tick!==receipt.tick||trace.actorId!==person.id||!trace.applied||trace.source==='avatar'||
        trace.chosenAction!==(receipt.action==='GATHER_HERBS'?'redacted':receipt.action)))fail('cultivators.ordinaryActionEvidence.trace');
  }
  const sector = unique(w.sects, (item) => item.id, 'sects.id');
  const locations = unique(w.locations, (item) => item.id, 'locations.id');
  const map = validateCausalTerrain(w, actor, sector);
  const villagers = validateLocalInstitutions(w, actor, sector, locations);
  validateLocalServices(w, actor, sector, locations);
  validateJourneys(w, actor, sector, locations, map);
  validatePoliticalGovernance(w, actor, sector, locations, map, value);
  const { settlementIds, volunteerIds } = validateCultivationHouseholds(w, actor, sector, locations, villagers, value);
  validateContinuity(w, actor, sector, locations, map, settlementIds, volunteerIds);
  validateFrontier(w);
  w.coldHistory = freezeColdHistory(w.coldHistory);
  return w;
}
