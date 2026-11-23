import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicChronicleSceneEvents } from '../src/engine/chronicleLead';
import { availableDoctrineActions } from '../src/engine/doctrineEngine';
import { availableDoctrineFoundingActions } from '../src/engine/doctrineFoundingEngine';
import { availableDoctrineMaturityActions } from '../src/engine/doctrineMaturityEngine';
import { availableLastRosterActions, projectLastRoster } from '../src/engine/lastRoster';
import { requestCultivatorLLMDecision } from '../src/engine/llmBrain';
import { llmScheduler } from '../src/engine/llmScheduler';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import type { DoctrineFoundingMove, DoctrineMaturityMove, WorldState } from '../src/types/world';
import { foundActor as person, foundPayload as order, foundSect as sect, foundSite as site, foundTurn as turn,
  foundingFixture as f, preparedDoctrineFounding } from './fixtures/doctrineFoundingNativeFixture';

afterEach(() => { vi.unstubAllGlobals(); llmScheduler.resetTickBudget(); });

const founder = f.authorId;
const stayer = 'elder-taixu-2';
const sameNameNonmember = 'npc-2';
const visitingDiplomat = 'npc-5';
const homebound = 'recruit-village-loc-market-vol-1';
const homeVillageId = 'village-loc-market';
const homeSiteId = 'loc-market';
const oldSect = 'sect-independent-school-sect-qingyun-community';
const foundingId = 'doctrine-founding-school-sect-qingyun-community-29';
const closureId = 'evt-37-doctrine-founding-school-sect-qingyun-community-29-maturity-merged';
const enlistId = 'settlement-3-recruitment-village-loc-market-village-loc-market-vol-1';
const membership = [founder, stayer, homebound] as const;
const record = (world: WorldState) => world.doctrineFoundings.foundings.find(row => row.id === foundingId)!;
const at = (world: WorldState, id: string) => person(world, id).locationId;
const explore = (targetLocationId: string) => order('EXPLORE', { targetLocationId });
const founding = (doctrineFoundingMove: Exclude<DoctrineFoundingMove, 'propose'>) =>
  order('DOCTRINE_FOUNDING', { doctrineFoundingMove, targetDoctrineFoundingId: foundingId });
const maturity = (doctrineMaturityMove: DoctrineMaturityMove) =>
  order('DOCTRINE_MATURITY', { doctrineMaturityMove, targetDoctrineFoundingId: foundingId });
const reopen = (world: WorldState) => {
  const encoded = encodeEraWorldSave(world);
  const loaded = decodeEraWorldSave(encoded);
  expect(encodeEraWorldSave(loaded)).toBe(encoded);
  return loaded;
};
function weather(world: WorldState, times: number) {
  for (let i = 0; i < times; i++) world = applyMapBrush(world, 'cursed_miasma', [site(world, f.oldSiteId)]);
  return world;
}

/** Old school and paid relocation from the established portable fixture. The only new authored
 * pre-founding contrast is a duplicate display label, never membership, ownership or movement. */
function beforeClosure(duplicate = false) {
  const initial = preparedDoctrineFounding();
  expect(initial.stayedId).toBe(homebound);
  if (duplicate) person(initial.world, sameNameNonmember).name = person(initial.world, founder).name;
  let world = reopen(initial.world);
  expect(world.tick).toBe(16);
  expect(world.settlements.records.find(row => row.id === enlistId)).toMatchObject({
    kind: 'recruitment', cultivatorId: homebound, settlementId: homeVillageId, tick: 3, people: 1, stones: 25,
  });
  expect(world.households.members.find(row => row.recruitedId === homebound)).toMatchObject({
    householdId: 'household-village-loc-market-first', settlementId: homeVillageId,
    registeredTick: 1, settledTick: 3, status: 'recruited',
  });
  while (world.tick < 20) world = turn(world);
  world = turn(world, { [visitingDiplomat]: explore(f.newSiteId) });
  for (let j = 0; j < 2; j++) world = turn(world, { [homebound]: order('SECT_DIPLOMACY', { targetCultivatorId: visitingDiplomat }) });
  while (world.tick < 25) world = turn(world);
  expect(person(world, homebound).reflections.find(row => row.kind === 'belief' && row.theme === 'community'))
    .toMatchObject({ source: 'utility', intensity: 5, tick: 25 });
  expect(availableDoctrineActions(person(world, homebound), world))
    .toContainEqual({ action: 'DOCTRINE', doctrineMove: 'endorse', doctrineTheme: 'community' });
  world = turn(world, { [homebound]: order('DOCTRINE', { doctrineMove: 'endorse', doctrineTheme: 'community' }) });
  world = turn(world, { [homebound]: order('DOCTRINE', { doctrineMove: 'join', targetDoctrineSchoolId: initial.schoolId }) });
  world = turn(world, { [homebound]: explore(f.oldSiteId) });
  world = turn(world, { [founder]: order('DOCTRINE_FOUNDING', { doctrineFoundingMove: 'propose',
    targetDoctrineSchoolId: initial.schoolId, targetRelocationId: initial.relocationId }) });
  expect(world.tick).toBe(29);
  expect(record(world).independentSectId).toBe(oldSect);
  world = turn(world, { [f.leaderId]: founding('authorize'), [stayer]: founding('join'), [homebound]: founding('join') });
  expect(availableDoctrineFoundingActions(person(world, founder), world, world.tick + 1))
    .toContainEqual({ action: 'DOCTRINE_FOUNDING', doctrineFoundingMove: 'establish', targetDoctrineFoundingId: foundingId });
  world = turn(world, { [founder]: founding('establish') });
  expect(record(world).settlement).toMatchObject({ tick: 31, memberIds: [...membership], transferredStones: 240 });
  expect(membership.every(id => at(world, id) === f.oldSiteId && person(world, id).sectId === oldSect)).toBe(true);
  expect(person(world, sameNameNonmember).sectId).toBe(f.parentId);
  expect(sect(world, oldSect).leaderId).toBe(founder);
  world = weather(world, 2);
  for (let j = 0; j < 3; j++) world = turn(world);
  expect(record(world).maturity?.support).toMatchObject({ kind: 'sustained_hazard', observedTick: 34,
    siteId: f.oldSiteId, samples: [32, 33, 34].map(tick => ({ tick,
      hazard: { kind: 'cursed_miasma', intensity: 2 } })) });
  world = turn(world, { [founder]: maturity('offer_merge') });
  world = weather(world, 1);
  world = turn(world, { [f.leaderId]: maturity('accept_merge'), [stayer]: maturity('approve_member'),
    [homebound]: maturity('approve_member') });
  expect(world.tick).toBe(36);
  expect(availableDoctrineMaturityActions(person(world, founder), world, world.tick + 1))
    .toContainEqual({ action: 'DOCTRINE_MATURITY', doctrineMaturityMove: 'finalize_merge', targetDoctrineFoundingId: foundingId });
  return reopen(world);
}

function closedOldGate(duplicate = false) {
  const prior = beforeClosure(duplicate);
  const world = reopen(turn(prior, { [founder]: maturity('finalize_merge') }));
  expect(world.tick).toBe(37);
  expect(record(world).maturity?.settlement).toMatchObject({
    kind: 'merged', tick: 37, siteId: f.oldSiteId, receivingSectId: f.parentId,
    memberIds: [...membership], transferredStones: 328, retainedStones: 44,
  });
  expect(world.events.find(row => row.id === closureId)).toMatchObject({
    tick: 37, actorIds: [...membership, f.leaderId], witnessScope: 'participants',
  });
  expect(publicChronicleSceneEvents(world).map(row => row.id)).not.toContain(closureId);
  expect(sect(world, oldSect)).toMatchObject({ inactiveSinceTick: 37, headquartersId: f.oldSiteId });
  expect(sect(world, oldSect).leaderId).toBeUndefined();
  expect(sect(world, oldSect).officeVacancy).toBeUndefined();
  expect(sect(world, f.parentId).leaderId).toBe(f.leaderId);
  expect(site(world, f.oldSiteId).type).toBe('spirit_vein');
  expect(site(world, f.oldSiteId).ownerSectId).toBeUndefined();
  expect(membership.map(id => at(world, id))).toEqual(membership.map(id => at(prior, id)));
  expect(membership.every(id => person(world, id).alive && person(world, id).sectId === f.parentId)).toBe(true);
  return world;
}

const registerId = `last-roster-${foundingId}`;
const register = (world: WorldState) => world.lastRosters?.entries.find(row => row.id === registerId);
const entry = (world: WorldState, id: string) => register(world)?.people.find(row => row.actorId === id);
const options = (world: WorldState, id: string) => availableLastRosterActions(person(world, id), world);
const projection = (world: WorldState, id: string) => projectLastRoster(world, person(world, id));
type Move = ReturnType<typeof options>[number]['lastRosterMove'];
const farewell = (world: WorldState, id: string, move: Move) => {
  const option = options(world, id).find(row => row.lastRosterMove === move)!;
  expect(option).toBeDefined();
  expect(option.targetLastRosterId).toBe(registerId);
  return order('LAST_ROSTER', { lastRosterMove: move, targetLastRosterId: option.targetLastRosterId,
    ...('targetLocationId' in option ? { targetLocationId: option.targetLocationId } : {}) });
};
const receipt = (world: WorldState, actorId: string, move: Move, locationId: string) => {
  const id = `evt-${registerId}-${actorId}-${move}-${world.tick}`;
  expect(world.events.find(row => row.id === id)).toMatchObject({ actorIds: [actorId],
    locationId, tick: world.tick, witnessScope: 'participants' });
  expect(publicChronicleSceneEvents(world).map(row => row.id)).not.toContain(id);
  return id;
};

describe('after the actual retirement of an independent sect (P22-9)', () => {
  it('has a real final cohort, independent old-school closure, and no appointed heir from a duplicate display label', () => {
    const closed = closedOldGate(true);
    expect(person(closed, sameNameNonmember).name).toBe(person(closed, founder).name);
    expect(person(closed, sameNameNonmember).id).not.toBe(founder);
    expect(at(closed, sameNameNonmember)).toBe(f.oldSiteId);
    expect(record(closed).maturity?.settlement?.memberIds).not.toContain(sameNameNonmember);
    expect(person(closed, sameNameNonmember).sectRank).toBe('长老');
    expect(person(closed, founder).sectRank).toBe('外门弟子');
    expect(register(closed)).toMatchObject({
      id: registerId, foundingId, mergeEventId: closureId, closedTick: 37, closedSectId: oldSect,
      closedLeaderId: founder, siteId: f.oldSiteId, receivingSectId: f.parentId, newGateSiteId: f.newSiteId,
    });
    expect(register(closed)?.people.map(row => row.actorId)).toEqual([...membership]);
    expect(entry(closed, homebound)?.home).toEqual({ settlementId: homeVillageId, siteId: homeSiteId, recruitmentId: enlistId });
    expect(entry(closed, founder)?.home).toBeUndefined();
    expect(options(closed, sameNameNonmember)).toEqual([]);
    expect(projection(closed, sameNameNonmember)).toBeUndefined();
    expect(projection(closed, f.leaderId)).toBeUndefined(); // The receiving leader is no former member.
    const impostor = reopen(turn(closed, { [sameNameNonmember]: farewell(closed, founder, 'new_gate') }));
    expect(at(impostor, sameNameNonmember)).toBe(f.oldSiteId);
    expect(register(impostor)).toEqual(register(closed));
  });

  it('keeps native new-gate travel, exact old household homecoming and staying distinct on the same turn', () => {
    const closed = closedOldGate();
    const next = farewell(closed, founder, 'new_gate');
    const home = farewell(closed, homebound, 'home');
    const stay = farewell(closed, stayer, 'stay');
    expect(next.targetLocationId).toBe(f.newSiteId);
    expect(home.targetLocationId).toBe(homeSiteId);
    expect(stay.targetLocationId).toBeUndefined();
    expect(options(closed, founder).some(row => row.lastRosterMove === 'home')).toBe(false);
    const world = reopen(turn(closed, { [founder]: next, [homebound]: home, [stayer]: stay }));
    expect(world.tick).toBe(38);
    expect(membership.map(id => at(world, id))).toEqual([f.newSiteId, f.oldSiteId, homeSiteId]);
    for (const [id, move, position] of [[founder, 'new_gate', f.newSiteId],
      [homebound, 'home', homeSiteId], [stayer, 'stay', f.oldSiteId]] as const) {
      const source = receipt(world, id, move, position);
      expect(entry(world, id)?.resolution).toMatchObject({ move, tick: 38, eventId: source });
      expect(person(world, id).sectId).toBe(f.parentId);
      expect(person(world, id).guardAssignment).toEqual(person(closed, id).guardAssignment);
      expect(person(world, id).sectRank).toBe(person(closed, id).sectRank);
      expect(options(world, id)).toEqual([]);
    }
    expect(sect(world, oldSect)).toEqual(sect(closed, oldSect));
    expect(site(world, f.oldSiteId).ownerSectId).toBeUndefined();
    expect(sect(world, f.parentId).leaderId).toBe(f.leaderId);
    expect(world.settlements.villages.find(row => row.id === homeVillageId)?.population)
      .toBe(closed.settlements.villages.find(row => row.id === homeVillageId)?.population);
    let quiet = world;
    while (quiet.tick < 41) quiet = turn(quiet);
    quiet = reopen(quiet);
    expect(membership.map(id => at(quiet, id))).toEqual([f.newSiteId, f.oldSiteId, homeSiteId]);
    expect(quiet.mapHazards.some(row => row.tileId === 'tile-4-3')).toBe(false);
    expect(register(quiet)).toEqual(register(world));
  });

  it('does not turn silence or ordinary unrelated movement into a promised ending', () => {
    const closed = closedOldGate();
    const missed = reopen(turn(closed, { [homebound]: explore(homeSiteId) }));
    expect(at(missed, homebound)).toBe(homeSiteId);
    expect(entry(missed, homebound)?.resolution).toBeUndefined();
    expect(entry(missed, founder)?.resolution).toBeUndefined();
    expect(entry(missed, stayer)?.resolution).toBeUndefined();
    expect(at(missed, stayer)).toBe(f.oldSiteId);
    expect(missed.events.some(row => row.id.startsWith(`evt-${registerId}-`))).toBe(false);
    expect(options(missed, homebound)).toEqual([]);
    const forged = reopen(turn(closed, { [founder]: { ...farewell(closed, founder, 'new_gate'), targetLocationId: homeSiteId } }));
    expect(at(forged, founder)).toBe(f.oldSiteId);
    expect(register(forged)).toEqual(register(closed));
  });

  it('lets only the original member choose their exact destination through model or Utility, never a name or a new title', async () => {
    const closed = closedOldGate();
    const native = farewell(closed, homebound, 'home');
    const exact = { chosenAction: 'LAST_ROSTER', lastRosterMove: 'home', targetLastRosterId: registerId,
      targetLocationId: homeSiteId } as const;
    const withReply = async (reply: object) => {
      llmScheduler.resetTickBudget();
      const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] })));
      vi.stubGlobal('fetch', fetch);
      const proposal = await requestCultivatorLLMDecision(person(closed, homebound), closed, {
        enabled: true, apiBaseUrl: 'https://provider.invalid/v1', apiKey: 'fixture-only', model: 'fixture',
      }, closed.tick + 1);
      expect(fetch).toHaveBeenCalledTimes(1);
      return proposal;
    };
    expect(await withReply({ ...exact, familyName: person(closed, founder).name })).toBeUndefined();
    expect(await withReply({ ...exact, newTitle: '掌门' })).toBeUndefined();
    expect(await withReply({ ...exact, targetCultivatorId: founder })).toBeUndefined();
    expect(await withReply({ ...exact, targetLocationId: f.newSiteId })).toBeUndefined();
    const admitted = await withReply(exact);
    expect(admitted).toMatchObject(exact);
    const cognitive = reopen(advanceWorldTick(closed, Object.fromEntries(closed.cultivators
      .map(({ id }) => [id, id === homebound ? admitted! : order('REST')])),
    () => .99, 'deferred', undefined, { modelActors: new Set([homebound]) }));
    const utility = reopen(turn(closed, { [homebound]: native }));
    expect(register(cognitive)).toEqual(register(utility));
    expect(at(cognitive, homebound)).toBe(homeSiteId);
    expect(at(cognitive, founder)).toBe(f.oldSiteId);
    expect(entry(cognitive, founder)?.resolution).toBeUndefined();
    expect(sect(cognitive, oldSect).leaderId).toBeUndefined();
  });

});
