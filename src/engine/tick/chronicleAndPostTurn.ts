import {ensureManagedSectQuirks} from '../sectQuirkAssignment';
import { advanceStorytellerDirector, canonicalStorytellerFocus, STORYTELLER_STYLES } from '../storytellerDirector';
import { advanceDirectorHighlights } from '../director/directorHighlights';
import { recordBanquetSeatInvitation } from '../banquetSeats';
import { recordPilgrimageForkArrival } from '../pilgrimageFork';
import { recordBattlefieldAftermathTerminal } from '../battlefieldAftermath';
import { deadSchoolFormContacts } from '../schoolFormDuel';
import { pruneInvalidBeastDuelContacts } from '../beastDuelProtection';
import { publishTianjiGazette } from '../tianjiGazetteEngine';
import { expireRingAudiences } from '../ringAudienceEngine';
import { pruneInvalidForbiddenDuelContacts } from '../forbiddenArtEngine';
import { settleFrontierMortality } from '../frontierMovementEngine';
import { settleUpperPassageMortality } from '../upperPassageEngine';
import { recordRegionalTurnRegistry } from '../regionalSimulationEngine';
import { recordEraHistoryTurn } from '../eraHistoryIndex';
import { advanceAlignedWeather } from '../alignedWeatherEngine';
import { advanceFieldObservatories } from '../fieldObservatoryEngine';
import { closeVillageCensusPeriod } from '../villageCensusEngine';
import { settleFurnaceTurn } from '../furnaceReservationEngine';
import { compactColdHistory } from '../coldHistoryEngine';
import { advanceCausalChronicle } from '../chronicleCausalityEngine';
import { captureWatchDigests } from '../watchlistEngine';
import { advanceChronicleErrata } from '../chronicleErrataEngine';
import { reconcileRelicCustody } from '../relicEngine';
import { advanceReincarnation } from '../reincarnationEngine';
import { recordNewDeathsForReincarnation } from '../reincarnationRuntime';
import { maintainPlayerAvatar } from '../avatarEngine';
import { finalizeRoguelikeEncounters } from '../roguelikeEncounterEngine';
import { finalizeDestinyTraitOffers } from '../destinyTraitEngine';
import { archiveChronicleEvents } from '../novelGenerator';
import { advanceWitnessedPersonalStory } from '../witnessedPersonalStory';
import { finalizeProtagonistFlightTurn } from '../protagonistFlightEngine';
import { settleChronicleOffline } from '../chronicleRuntime';
import { settleAnnualCouncilOffline } from '../councilRuntime';
import { spreadRumors } from '../rumorEngine';
import { noteTerrainVisit } from '../terrainEngine';
import { deriveMapPresentation } from '../mapMotionEngine';
import type { WorldTickContext } from './tickContext';
import { defineTickPlugins, runTickPlugins } from './tickPlugins';

const collectRawChronicle = defineTickPlugins<WorldTickContext>([
  { id: 'advanceChronicleErrata', run: ({ nextState }) => advanceChronicleErrata(nextState) },
  { id: 'recordTerrainVisits', run: ({ nextState }) => {
    for (const actor of nextState.cultivators) if (actor.alive) noteTerrainVisit(nextState, actor);
  } },
  { id: 'maintainPlayerAvatar', run: ({ nextState }) => maintainPlayerAvatar(nextState) },
  { id: 'finalizeRoguelikeEncounters', run: ({ nextState }) => finalizeRoguelikeEncounters(nextState) },
  { id: 'spreadRumors', run: ({ nextState }) => spreadRumors(nextState) },
  { id: 'reconcileRelicCustody', run: ({ nextState }) => reconcileRelicCustody(nextState) },
  { id: 'advanceReincarnation', run: ({ nextState }) => advanceReincarnation(nextState) },
  { id: 'recordNewDeathsForReincarnation', run: ({ prevState, nextState, newEvents }) =>
    recordNewDeathsForReincarnation(prevState, nextState, newEvents) },
  { id: 'archiveChronicleEvents', run: ({ nextState, newEvents }) => archiveChronicleEvents(nextState, newEvents) },
]);

/** Settle native history and publish the final views without substituting the capped live feed for raw events. */
export function runChronicleAndPostTurn(context: WorldTickContext): void {
  const { prevState, nextState, newEvents, councilMode, traceOptions } = context;
  runTickPlugins(context, collectRawChronicle);
  nextState.events = [...newEvents, ...nextState.events].slice(0, 120);
  recordBattlefieldAftermathTerminal(nextState,newEvents);
  recordPilgrimageForkArrival(nextState,newEvents);
  recordBanquetSeatInvitation(nextState,newEvents);
  advanceWitnessedPersonalStory(nextState);
  if (councilMode === 'utility') {
    settleAnnualCouncilOffline(nextState);
    settleChronicleOffline(nextState);
  }
  advanceAlignedWeather(nextState);
  advanceFieldObservatories(nextState);
  closeVillageCensusPeriod(nextState);
  settleFurnaceTurn(nextState);
  compactColdHistory(nextState);
  advanceCausalChronicle(nextState);
  if (nextState.watchlists.watches.length) {
    if (traceOptions?.onWatchBatch) traceOptions.onWatchBatch(newEvents);
    else {
      const ids = new Set(newEvents.map(({ id }) => id));
      const endingCouncil = councilMode === 'utility'
        ? nextState.events.filter(({ id, tick }) => tick === nextState.tick && !ids.has(id)) : [];
      captureWatchDigests(nextState, [...newEvents, ...endingCouncil]);
    }
  }
  const mainEventIds=new Set(newEvents.map(({id})=>id));
  const completedEvents=[...newEvents,...nextState.events.filter(({id,tick})=>tick===nextState.tick&&!mainEventIds.has(id))];
  settleUpperPassageMortality(nextState);
  settleFrontierMortality(nextState);
  ensureManagedSectQuirks(nextState);
  expireRingAudiences(nextState);
  finalizeDestinyTraitOffers(nextState);
  pruneInvalidForbiddenDuelContacts(nextState);
  pruneInvalidBeastDuelContacts(nextState);
  deadSchoolFormContacts(nextState);
  finalizeProtagonistFlightTurn(prevState,nextState,completedEvents);
  recordEraHistoryTurn(prevState,nextState,completedEvents);
  publishTianjiGazette(prevState,nextState,completedEvents);
  recordRegionalTurnRegistry(nextState);
  const director=nextState.storyteller;
  const directorStyle=director&&STORYTELLER_STYLES.find(row=>row.id===director.style);
  const highlight=director&&directorStyle&&nextState.tick>director.configuredTick&&nextState.tick>(director.lastAdvancedTick??-1)
    ? advanceDirectorHighlights(nextState,director,canonicalStorytellerFocus(nextState,director),directorStyle.cadence) : undefined;
  advanceStorytellerDirector(nextState,completedEvents,highlight);
  traceOptions?.onCompletedEvents?.(completedEvents);
  nextState.mapPresentation = traceOptions?.capturePresentation === false
    ? { tick: nextState.tick, trails: [], effects: [] }
    : deriveMapPresentation(prevState, nextState, newEvents);
}
