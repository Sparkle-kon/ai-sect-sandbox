import { createInitialWorld } from '../data/initialWorld';
import type { Cultivator, LLMDecisionPayload, WorldEvent, WorldState } from '../types/world';
import { sectRelation } from './diplomacyEngine';
import { builtinScenarioOriginFor, highDramaPreset, type BuiltinScenarioPresetId } from './highDramaPresetTerms';
import { availableOccasionJoins } from './occasionEngine';
import { availableSettlementActions, SETTLEMENT_RECRUIT_STIPEND } from './settlementEngine';
import { advanceWorldTick } from './worldEngine';

export interface HighDramaPresetOpening {
  world: WorldState;
  focusActorId?: string;
  focusLocationId: string;
}

const waiting: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '静候本月。' };
const order = (chosenAction: LLMDecisionPayload['chosenAction'], fields: Partial<LLMDecisionPayload> = {}):
    LLMDecisionPayload => ({ ...fields, chosenAction, innerMonologue: '按在场实况行事。' });
const sameIds = (actual: readonly string[], expected: readonly string[]) =>
  actual.length === expected.length && new Set(actual).size === actual.length &&
  new Set(expected).size === expected.length && expected.every(id => actual.includes(id));
const exact = <T>(list: readonly T[], matches: (row: T) => boolean): T | undefined => {
  let found: T | undefined;
  for (const row of list) {
    if (!matches(row)) continue;
    if (found !== undefined) return undefined;
    found = row;
  }
  return found;
};
const living = (world: WorldState, id: string): Cultivator | undefined => {
  const actor = exact(world.cultivators, row => row.id === id);
  return actor?.alive && actor.hp > 0 && actor.positionPlane === undefined ? actor : undefined;
};
const event = (world: WorldState, id: string, tick: number, site: string): WorldEvent | undefined => {
  const row = exact(world.events, item => item.id === id);
  return world.tick === tick && row?.tick === tick && row.year === world.year && row.month === world.month &&
    row.locationId === site && row.witnessScope === undefined ? row : undefined;
};

// Off-camera actors rest during the authored prologue. No RNG is injected: actual months,
// commitment guards, world resources and events use the same seeded production reducer as play.
function month(world: WorldState, cast: Readonly<Record<string, LLMDecisionPayload>> = {}, last = false): WorldState {
  if (Object.keys(cast).some(id => !living(world, id))) throw new Error('Missing preset cast member');
  const choices = Object.fromEntries(world.cultivators.map(({ id }) => [id, Object.hasOwn(cast, id) ? cast[id] : waiting]));
  const next = advanceWorldTick(world, choices, undefined, 'deferred', undefined,
    { captureTrace: false, capturePresentation: last });
  if (next.tick !== world.tick + 1) throw new Error('Preset month did not settle');
  return next;
}

function siegeOpening(start: WorldState): HighDramaPresetOpening | undefined {
  const attacker = 'sect-qingyun', defender = 'sect-bloodmoon', commander = 'npc-1', patriarch = 'npc-3';
  const home = 'loc-taixu', destination = 'loc-blood', ally = 'sect-danxia';
  const declared = month(start, {
    [commander]: order('DECLARE_WAR', { targetSectId: defender }),
    'npc-5': order('OFFER_ALLIANCE', { targetSectId: attacker }),
    [patriarch]: order('BUILD_FACILITY', { facilityKind: 'defense_array' }),
  });
  const fix = exact(declared.sects, row => row.id === defender);
  const war = event(declared, 'evt-2-dip-sect-qingyun-sect-bloodmoon-declare_war', 2, home);
  if (!war || !sameIds(war.actorIds, [commander, patriarch]) || sectRelation(declared, attacker, defender)?.pact !== 'war' ||
      sectRelation(declared, attacker, ally)?.pact !== 'alliance' ||
      fix?.facilities.defense_array !== 1 || fix.arrayHp !== 200 || fix.arrayMaxHp !== 200) return undefined;

  const settled = month(declared, { 'npc-4': order('EXPLORE', { targetLocationId: destination }) });
  if (living(settled, 'npc-4')?.locationId !== destination) return undefined;
  const prepared = month(settled);
  const launched = month(prepared, { [commander]: order('LAUNCH_SIEGE', { targetSectId: defender }) });
  const id = 'siege-5-sect-qingyun-sect-bloodmoon';
  const deployed = exact(launched.sieges, row => row.id === id);
  const call = event(launched, 'evt-5-dip-sect-qingyun-sect-bloodmoon-launch_siege', 5, home);
  if (deployed?.status !== 'marching' || !call || !sameIds(call.actorIds, deployed.participantIds) ||
      deployed.participantIds.length < 5 || deployed.destinationId !== destination) return undefined;
  const gathered = month(launched);
  const gathering = event(gathered, `evt-6-dip-${id}`, 6, home);
  if (!gathering || !sameIds(gathering.actorIds, deployed.participantIds) ||
      !deployed.participantIds.every(actorId => living(gathered, actorId)?.locationId === home)) return undefined;
  const world = month(gathered, {}, true);
  const opening = exact(world.sieges, row => row.id === id);
  const arrival = event(world, `evt-7-dip-${id}`, 7, destination);
  if (opening?.status !== 'sieging' || opening.rounds !== 0 || opening.destinationId !== destination ||
      opening.attackerSectId !== attacker || opening.defenderSectId !== defender || opening.theatre?.arrivedTick !== 7 ||
      !arrival || !sameIds(arrival.actorIds, opening.participantIds) ||
      ![patriarch, ...opening.participantIds].every(actorId => living(world, actorId)?.locationId === destination)) return undefined;
  return { world, focusActorId: patriarch, focusLocationId: destination };
}

function tournamentOpening(start: WorldState): HighDramaPresetOpening | undefined {
  const stage = 'loc-market', id = 'occasion-60-tournament';
  const participants = ['npc-2', 'npc-4', 'npc-6'] as const;
  let world = start;
  while (world.tick < 60) world = month(world);
  const opening = exact(world.occasions, row => row.id === id);
  if (opening?.kind !== 'tournament' || opening.status !== 'registration' ||
      opening.startedTick !== 60 || opening.registrationClosesTick !== 63 || opening.locationId !== stage ||
      !event(world, `evt-60-${id}-open`, 60, stage)) return undefined;
  const cast: Record<string, LLMDecisionPayload> = {};
  for (const actorId of participants) {
    const actor = living(world, actorId);
    if (!actor || !availableOccasionJoins(actor, world, 61).some(row => row.targetOccasionId === id)) return undefined;
    cast[actorId] = order('JOIN_OCCASION', { targetOccasionId: id });
  }
  const enlisted = month(world, cast);
  if (!participants.every(actorId => {
    const actor = living(enlisted, actorId);
    const proof = actor && event(enlisted, `evt-61-${id}-join-${actorId}`, 61, actor.locationId);
    return proof?.category === 'diplomacy' && sameIds(proof.actorIds, [actorId]);
  })) return undefined;
  world = month(enlisted, {}, true);
  const eve = exact(world.occasions, row => row.id === id);
  if (eve?.status !== 'registration' || eve.locationId !== stage || eve.registrationClosesTick !== world.tick + 1 ||
      !sameIds(eve.participantIds, participants) || eve.bouts.length || eve.remainingIds.length || eve.round !== 0 ||
      eve.championId !== undefined || participants.some(id => !living(world, id))) return undefined;
  return { world, focusActorId: participants[0], focusLocationId: stage };
}

function coldJadeOpening(start: WorldState): HighDramaPresetOpening | undefined {
  const sponsorId = 'elder-danxia-1', site = 'loc-vein-north', villageId = 'village-loc-vein-north';
  const volunteerId = 'village-loc-vein-north-vol-1', recruitId = `recruit-${volunteerId}`;
  // North is not known from Danxia at birth. The native blind trek with this seed truly reaches it.
  const reached = month(start, { [sponsorId]: order('EXPLORE') });
  const sponsor = living(reached, sponsorId);
  const village = exact(reached.settlements.villages, row => row.id === villageId);
  if (sponsor?.locationId !== site || village?.locationId !== site ||
      !availableSettlementActions(sponsor, reached).some(row => row.action === 'RECRUIT_SETTLER' &&
        row.targetSettlementId === villageId && row.targetVolunteerId === volunteerId)) return undefined;
  const world = month(reached, {
    [sponsorId]: order('RECRUIT_SETTLER', { targetSettlementId: villageId, targetVolunteerId: volunteerId }),
  }, true);
  const actor = living(world, recruitId);
  const record = exact(world.settlements.records, row => row.id === `settlement-3-recruitment-${villageId}-${volunteerId}`);
  const native = record && event(world, `evt-${record.id}`, 3, site);
  const household = exact(world.households.members, row => row.recruitedId === recruitId);
  if (actor?.locationId !== site || actor.realm !== '练气' || actor.realmStage !== 1 || actor.sectId !== sponsor.sectId ||
      actor.spiritStones !== SETTLEMENT_RECRUIT_STIPEND || record?.kind !== 'recruitment' || record.people !== 1 ||
      record.actorId !== sponsorId || record.sectId !== sponsor.sectId || record.settlementId !== villageId ||
      record.volunteerId !== volunteerId || record.cultivatorId !== recruitId || record.tick !== 3 ||
      record.stones !== SETTLEMENT_RECRUIT_STIPEND || !native || !sameIds(native.actorIds, [sponsorId, recruitId]) ||
      household?.status !== 'recruited' || household.settlementId !== villageId ||
      household.volunteerId !== volunteerId || household.settledTick !== 3) return undefined;
  return { world, focusActorId: recruitId, focusLocationId: site };
}

const openingByPreset = {
  'storm-at-blood-moon': siegeOpening,
  'tournament-eve': tournamentOpening,
  'cold-jade-disciple': coldJadeOpening,
} satisfies Record<BuiltinScenarioPresetId, (start: WorldState) => HighDramaPresetOpening | undefined>;

/** Replays a catalogued lawful opening offline into a fresh world. No input save or current timeline is read. */
export function buildHighDramaPreset(presetId: unknown): HighDramaPresetOpening | undefined {
  const preset = highDramaPreset(presetId);
  if (!preset) return undefined;
  const origin = builtinScenarioOriginFor(preset.id);
  if (!origin) return undefined;
  try {
    const start = createInitialWorld(preset.seed, preset.profileId);
    const opening = openingByPreset[preset.id](start);
    if (!opening || opening.world.tick !== origin.openedTick || opening.world.interventionSequence !== 0 ||
        opening.world.scenarioOrigin || opening.world.authoredEraOrigin || opening.world.playerAvatar.possessedId) return undefined;
    opening.world.builtinScenarioOrigin = origin;
    return opening;
  } catch {
    return undefined;
  }
}
