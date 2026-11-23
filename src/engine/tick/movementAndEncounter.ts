import { deadSchoolFormContacts } from '../schoolFormDuel';
import { pruneInvalidBeastDuelContacts } from '../beastDuelProtection';
import { pruneInvalidForbiddenDuelContacts } from '../forbiddenArtEngine';
import { recordRegionalEarlyPromotions } from '../regionalPromotionEngine';
import { beginRegionalSimulationTurn } from '../regionalSimulationEngine';
import { advanceDoctrineMaturity } from '../doctrineMaturityEngine';
import { advanceDanxiaMedicine } from '../danxiaMedicineEngine';
import { advanceDanxiaSeasonReviews } from '../danxiaSeasonReviewEngine';
import { openDanxiaShortage } from '../danxiaShortageEngine';
import { advanceSeasonalHousing } from '../seasonalHousingEngine';
import { advanceRoads } from '../roadEngine';
import { advanceWorkshopInstitutionClosures } from '../workshopEngine';
import { openFurnaceTurn } from '../furnaceReservationEngine';
import { advanceVillageSupply } from '../villageSupplyEngine';
import { advanceVillageFairs } from '../villageFairEngine';
import { advanceSeedCulture } from '../seedCultureEngine';
import { advanceTerrainSuccession } from '../terrainSuccessionEngine';
import { advanceSharedCommons } from '../sharedCommonsEngine';
import { advanceCouriers } from '../sealedCourierEngine';
import { advanceVillageWorks } from '../villageWorksEngine';
import { advanceWaterVein } from '../waterVeinEngine';
import { advanceHouseholds } from '../householdEngine';
import { advanceTerritorialLeases } from '../territorialLeaseEngine';
import { advanceFormations } from '../formationNetworkEngine';
import { advanceInfirmaries, beginClinicDutyTurn } from '../infirmaryEngine';
import { advanceHabitats } from '../habitatEngine';
import { advancePilgrimages } from '../pilgrimageEngine';
import { advanceSanctuaries } from '../sanctuaryEngine';
import { advanceCeasefires } from '../ceasefireEngine';
import { advanceCompetitionSeasons } from '../competitionEngine';
import { advanceRelocations } from '../relocationEngine';
import { advanceSettlements } from '../settlementEngine';
import type { WorldEvent } from '../../types/world';
import { witnessEvent } from '../rumorEngine';
import { advanceMapHazards } from '../mapBrushEngine';
import { advanceSpiritBeasts } from '../spiritBeastEngine';
import type { PreTurnContext, WorldTickContext } from './tickContext';
import { defineTickPlugins, runTickPlugins, type TickPlugin } from './tickPlugins';

function movementEvents(
  id: string,
  advance: (context: PreTurnContext) => readonly WorldEvent[],
): TickPlugin<PreTurnContext, [WorldEvent[]]> {
  return { id, run: (context, events) => { for (const event of advance(context)) events.push(event); } };
}

const movementEventPlugins = defineTickPlugins<PreTurnContext, [WorldEvent[]]>([
  movementEvents('advanceSanctuaries', ({ nextState }) => advanceSanctuaries(nextState)),
  movementEvents('advanceCeasefires', ({ nextState }) => advanceCeasefires(nextState)),
  movementEvents('advanceCompetitionSeasons', ({ nextState }) => advanceCompetitionSeasons(nextState)),
  movementEvents('advanceMapHazards', ({ nextState }) => advanceMapHazards(nextState)),
  movementEvents('advanceTerrainSuccession', ({ nextState }) => advanceTerrainSuccession(nextState)),
  movementEvents('advanceWaterVein', ({ nextState }) => advanceWaterVein(nextState)),
  movementEvents('advanceRoads', ({ nextState }) => advanceRoads(nextState)),
  movementEvents('advanceCouriers', ({ nextState }) => advanceCouriers(nextState)),
  movementEvents('advanceDanxiaMedicine', ({ nextState }) => advanceDanxiaMedicine(nextState)),
  movementEvents('advanceDanxiaSeasonReviews', ({ nextState }) => advanceDanxiaSeasonReviews(nextState)),
  movementEvents('advancePilgrimages', ({ nextState }) => advancePilgrimages(nextState)),
  movementEvents('advanceRelocations', ({ nextState }) => advanceRelocations(nextState)),
  movementEvents('advanceDoctrineMaturity', ({ nextState, prevState }) => advanceDoctrineMaturity(nextState,prevState)),
  movementEvents('advanceWorkshopInstitutionClosures', ({ nextState }) => advanceWorkshopInstitutionClosures(nextState)),
  movementEvents('advanceSettlements', ({ nextState }) => advanceSettlements(nextState)),
  movementEvents('advanceVillageSupply', ({ nextState }) => advanceVillageSupply(nextState)),
  movementEvents('advanceVillageWorks', ({ nextState }) => advanceVillageWorks(nextState)),
  movementEvents('advanceSpiritBeasts', ({ nextState, rng }) => advanceSpiritBeasts(nextState, rng)),
  movementEvents('advanceSeedCulture', ({ nextState }) => advanceSeedCulture(nextState)),
  movementEvents('advanceVillageFairs', ({ nextState }) => advanceVillageFairs(nextState)),
  movementEvents('advanceHabitats', ({ nextState }) => advanceHabitats(nextState)),
  movementEvents('advanceInfirmaries', ({ nextState }) => advanceInfirmaries(nextState)),
  movementEvents('advanceFormations', ({ nextState }) => advanceFormations(nextState)),
  movementEvents('advanceTerritorialLeases', ({ nextState }) => advanceTerritorialLeases(nextState)),
  movementEvents('advanceSharedCommons', ({ nextState }) => advanceSharedCommons(nextState)),
  movementEvents('advanceHouseholds', ({ nextState }) => advanceHouseholds(nextState)),
  movementEvents('advanceSeasonalHousing', ({ nextState }) => advanceSeasonalHousing(nextState)),
  movementEvents('openDanxiaShortage', ({ nextState, danxiaRegrowth }) => openDanxiaShortage(nextState, danxiaRegrowth)),
]);

export function runMovementAndEncounter(context: PreTurnContext): WorldTickContext {
  const { nextState, prevState } = context;
  // Complete the whole native update batch before granting any witnesses.
  const newEvents: WorldEvent[] = [];
  runTickPlugins(context, movementEventPlugins, newEvents);
  for (const event of newEvents) witnessEvent(nextState, event);
  openFurnaceTurn(nextState);
  beginClinicDutyTurn(nextState);
  recordRegionalEarlyPromotions(nextState,prevState);
  const regionalTurn=beginRegionalSimulationTurn(nextState);
  const finishedDuelActors=new Set<string>();
  pruneInvalidForbiddenDuelContacts(nextState);
  pruneInvalidBeastDuelContacts(nextState);
  deadSchoolFormContacts(nextState);
  return { ...context, newEvents, regionalTurn, finishedDuelActors };
}
