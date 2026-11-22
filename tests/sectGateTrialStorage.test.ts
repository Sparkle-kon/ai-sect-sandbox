import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { possessAvatar } from '../src/engine/avatarEngine';
import { activeRoguelikeEncounter, resolveGuidedRoguelikeChoice } from '../src/engine/roguelikeEncounterEngine';
import { decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { buildConfirmedShareSave, prepareShareSavePrivacy, SHARE_SAVE_REDACTED_TEXT } from '../src/engine/shareSavePrivacy';
import { applyMapBrush } from '../src/engine/mapBrushEngine';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';
import type { RoguelikeEncounterChoice, RoguelikeEncounterRecord } from '../src/types/roguelikeEncounter';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';
import { openNativeGuidedEncounter } from './roguelikeEncounterNativeFixture';
import { foundActor, foundPayload, foundSect, foundSite, foundTurn, foundingFixture, preparedDoctrineFounding } from './fixtures/doctrineFoundingNativeFixture';

const actorId = 'npc-2', rulerId = 'npc-1', hostId = 'sect-qingyun', venueId = 'loc-taixu';
const body = (world: WorldState, id = actorId) => world.cultivators.find(row => row.id === id)!;
const host = (world: WorldState) => world.sects.find(row => row.id === hostId)!;
const record = (world: WorldState): RoguelikeEncounterRecord => world.roguelikeEncounters!.find(row => row.kind === 'sect-gate')!;
const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '静候当月。' };
const move = (targetLocationId: string): LLMDecisionPayload => ({ chosenAction: 'EXPLORE', targetLocationId, innerMonologue: '从实地动身。' });
function month(world: WorldState, orders: Record<string, LLMDecisionPayload> = {}) {
  return advanceWorldTick(world, Object.fromEntries(world.cultivators.map(actor => [actor.id, orders[actor.id] ?? rest])),
    () => .90, 'utility');
}
function actualOffer(reputation?: number) {
  const genesis = createInitialWorld(1, 'spirit-bloom');
  if (reputation !== undefined) host(genesis).reputation = reputation;
  expect(body(genesis).locationId).toBe('loc-vein-north');
  expect(possessAvatar(genesis, actorId)).toBe(true);
  const world = month(genesis, { [actorId]: move(venueId) });
  expect(body(world).locationId).toBe(venueId);
  expect(world.events.some(row => row.id === `evt-${world.tick}-${actorId}-explore`)).toBe(false);
  const gate = record(world);
  expect(gate).toMatchObject({
    kind: 'sect-gate', guided: true, actorId, siteId: venueId, openedTick: world.tick,
    sectGate: { sectId: hostId, leaderId: rulerId, possessionUntilTick: world.playerAvatar.possessionUntilTick },
  });
  return world;
}
const retain = (world: WorldState) => {
  const bytes = encodeEraWorldSave(world);
  const restored = decodeEraWorldSave(bytes);
  expect(encodeEraWorldSave(restored)).toBe(bytes);
  return restored;
};

describe('exact native sect gate save authority', () => {
  it('keeps legacy bytes and reopens native no-loot offer and all three actual settled endings', () => {
    const legacy = encodeWorldSave(createInitialWorld());
    expect(legacy).not.toContain('"sectGate"');
    expect(encodeWorldSave(decodeWorldSave(legacy))).toBe(legacy);

    const world = actualOffer();
    const gate = record(world);
    const fresh = retain(world);
    expect(activeRoguelikeEncounter(fresh, { ...body(fresh) })).toBeUndefined();
    expect(activeRoguelikeEncounter(fresh, body(fresh))).toBe(record(fresh));
    for (const [choice, effect] of [['cautious', 2], ['bold', 1], ['leave', 0]] as const) {
      const result = resolveGuidedRoguelikeChoice(world, gate.id, choice satisfies RoguelikeEncounterChoice);
      expect(result).not.toBe(world);
      expect(resolveGuidedRoguelikeChoice(result, gate.id, choice)).toBe(result);
      expect(host(result).reputation - host(world).reputation).toBe(effect);
      expect(record(retain(result))).toMatchObject({ choice, status: 'resolved', resolvedTick: gate.openedTick,
        outcome: { success: choice !== 'leave', sectReputationDelta: effect, affinityDelta: 0, qiDelta: 0, hpDelta: 0, lifespanDelta: 0, karmaDelta: 0 } });
      expect(result.events.find(row => row.id === `evt-${gate.id}-settled`)).toMatchObject({
        witnessScope: 'participants', actorIds: [actorId], tick: gate.openedTick, locationId: venueId,
      });
    }
    const later = retain(month(world));
    expect(record(later)).toMatchObject({ status: 'expired', resolvedTick: world.tick + 1 });
    expect(later.events.some(row => row.id === `evt-${gate.id}-settled`)).toBe(false);
  });

  it('round-trips an authentic released offer inert and ages it out only on the next real month', () => {
    const world = actualOffer();
    const id = record(world).id;
    expect(possessAvatar(world, null)).toBe(true);
    const released = retain(world);
    expect(record(released)).toMatchObject({ status: 'offered', openedTick: world.tick });
    expect(activeRoguelikeEncounter(released, body(released))).toBeUndefined();
    expect(resolveGuidedRoguelikeChoice(released, id, 'cautious')).toBe(released);
    const expired = retain(month(released));
    expect(record(expired)).toMatchObject({ status: 'expired', resolvedTick: released.tick + 1 });
    expect(host(expired).reputation).toBe(host(world).reputation);
    expect(expired.events.some(row => row.id === `evt-${id}-settled`)).toBe(false);
  });

  it('accepts only the confirmed two-field privacy redaction on real open and resolved receipts', () => {
    const world = actualOffer(), gate = record(world);
    const ended = resolveGuidedRoguelikeChoice(world, gate.id, 'bold');
    for (const frame of [world, ended]) {
      const original = encodeWorldSave(frame);
      const review = prepareShareSavePrivacy(frame);
      expect(review).toMatchObject({ status: 'ready', protectedStateVerified: true });
      const copy = buildConfirmedShareSave(frame, review)!;
      expect(copy).toBeDefined();
      const decoded = decodeWorldSave(copy.json);
      expect(record(decoded)).toEqual(record(frame));
      expect(host(decoded).reputation).toBe(host(frame).reputation);
      expect(encodeWorldSave(frame)).toBe(original);
      const originals = frame.events.filter(event => event.id.startsWith(`evt-${gate.id}-`));
      for (const source of originals) {
        const sharedSource = decoded.events.find(event => event.id === source.id)!;
        expect(sharedSource).toEqual({ ...source, title: SHARE_SAVE_REDACTED_TEXT, description: SHARE_SAVE_REDACTED_TEXT });
        expect(source.title).not.toBe(SHARE_SAVE_REDACTED_TEXT);
        for (const field of ['title', 'description'] as const) {
          const half = structuredClone(frame);
          half.events.find(event => event.id === source.id)![field] = SHARE_SAVE_REDACTED_TEXT;
          expect(() => encodeWorldSave(half)).toThrow(/sectGate.event/);
        }
      }
    }
  });

  it('keeps fractional directional cap and reads a prior ending after the original abbey ruler has really left', () => {
    const world = actualOffer(99.5);
    const result = resolveGuidedRoguelikeChoice(world, record(world).id, 'cautious');
    expect(host(result).reputation).toBe(100);
    expect(record(retain(result)).outcome?.sectReputationDelta).toBe(.5);
    const later = month(result, { [rulerId]: move('loc-market') });
    expect(body(later, rulerId).locationId).toBe('loc-market');
    expect(record(retain(later))).toEqual(record(result));
  });

  it('retains an actual ended trial when a once-titled independent sect later disperses and releases that exact site', () => {
    const setup = preparedDoctrineFounding(), f = foundingFixture;
    let world = foundTurn(setup.world, { [f.authorId]: foundPayload('DOCTRINE_FOUNDING', {
      doctrineFoundingMove: 'propose', targetDoctrineSchoolId: setup.schoolId, targetRelocationId: setup.relocationId,
    }) });
    const foundingId = world.doctrineFoundings.foundings[0].id;
    const initiative = (doctrineFoundingMove: 'authorize' | 'join' | 'establish') =>
      foundPayload('DOCTRINE_FOUNDING', { doctrineFoundingMove, targetDoctrineFoundingId: foundingId });
    const visitors = f.members.filter(id => id !== f.authorId);
    world = foundTurn(world, { [f.leaderId]: initiative('authorize'),
      ...Object.fromEntries(visitors.map(id => [id, initiative('join')])) });
    world = foundTurn(world, { [f.authorId]: initiative('establish') });
    const childId = world.doctrineFoundings.foundings[0].independentSectId;
    expect(foundSect(world, childId)).toMatchObject({ headquartersId: f.oldSiteId, leaderId: f.authorId });
    const traveler = visitors[0];
    world = foundTurn(world, { [traveler]: move('loc-market') });
    expect(foundActor(world, traveler).locationId).toBe('loc-market');
    expect(possessAvatar(world, traveler)).toBe(true);
    world = foundTurn(world, { [traveler]: move(f.oldSiteId) });
    const gate = record(world);
    expect(gate).toMatchObject({ actorId: traveler, status: 'offered', sectGate: { sectId: childId, leaderId: f.authorId } });
    world = resolveGuidedRoguelikeChoice(world, gate.id, 'leave');
    const resolved = { ...record(world) };
    expect(resolved.status).toBe('resolved');

    const { x, y } = foundSite(world, f.oldSiteId);
    world = applyMapBrush(applyMapBrush(world, 'cursed_miasma', [{ x, y }]), 'cursed_miasma', [{ x, y }]);
    for (let i = 0; i < 3; i++) world = foundTurn(world);
    expect(world.doctrineFoundings.foundings[0].maturity?.support?.kind).toBe('sustained_hazard');
    for (const id of f.members) for (let i = 0; i < 4; i++)
      world = executeGodIntervention(world, { type: 'TRIBULATION_STRIKE', targetCultivatorId: id });
    world = applyMapBrush(world, 'meteor', [{ x, y }]);
    expect(f.members.every(id => !foundActor(world, id).alive)).toBe(true);
    world = foundTurn(world);
    expect(foundSite(world, f.oldSiteId)).toMatchObject({ type: 'spirit_vein' });
    expect(foundSite(world, f.oldSiteId).ownerSectId).toBeUndefined();
    expect(world.doctrineFoundings.foundings[0].maturity?.settlement).toMatchObject({
      kind: 'dispersed', siteId: f.oldSiteId, tick: world.tick,
    });
    expect(world.events.some(row => row.id === `evt-${gate.id}-open`)).toBe(true);
    const loaded = retain(world);
    expect(record(loaded)).toEqual(resolved);
    expect(activeRoguelikeEncounter(loaded, foundActor(loaded, traveler))).toBeUndefined();
    expect(resolveGuidedRoguelikeChoice(loaded, gate.id, 'cautious')).toBe(loaded);
    const disputed = structuredClone(loaded);
    delete disputed.doctrineFoundings.foundings[0].maturity!.settlement;
    expect(() => encodeWorldSave(disputed)).toThrow(/sectGate.title/);
  });

  it('rejects forged variant custody, holder, incumbent, venue, and unsourced private observations', () => {
    const world = actualOffer();
    const change = (alter: (fresh: WorldState) => void) => () => {
      const copy = structuredClone(world);
      alter(copy);
      return encodeWorldSave(copy);
    };
    expect(change(w => { record(w).guided = false; })).toThrow(/sectGate/);
    expect(change(w => { delete record(w).sectGate; })).toThrow(/sectGate/);
    expect(change(w => { record(w).sectGate!.possessionUntilTick++; })).toThrow(/sectGate/);
    expect(change(w => { record(w).sectGate!.leaderId = 'npc-3'; })).toThrow(/sectGate/);
    expect(change(w => { record(w).sectGate!.sectId = 'sect-bloodmoon'; })).toThrow(/sectGate/);
    expect(change(w => { record(w).siteId = 'loc-market'; })).toThrow(/sectGate/);
    expect(change(w => { w.events = w.events.filter(row => row.id !== `evt-${record(w).id}-open`); })).toThrow(/sectGate.source/);
    const legacy = openNativeGuidedEncounter().world;
    legacy.roguelikeEncounters![0].sectGate = record(world).sectGate;
    expect(() => encodeWorldSave(legacy)).toThrow(/sectGate.variant/);
  });

  it('rejects rewritten month, public/mirrored proof, unsupported gains and an altered actual choice', () => {
    const world = actualOffer();
    const resolved = resolveGuidedRoguelikeChoice(world, record(world).id, 'cautious');
    const edit = (alter: (fresh: WorldState, row: RoguelikeEncounterRecord) => void) => () => {
      const copy = structuredClone(resolved);
      alter(copy, record(copy));
      return encodeWorldSave(copy);
    };
    expect(edit((w, row) => { w.events.find(x => x.id === `evt-${row.id}-settled`)!.month++; })).toThrow(/sectGate.event/);
    expect(edit((w, row) => { delete w.events.find(x => x.id === `evt-${row.id}-settled`)!.witnessScope; })).toThrow(/roguelikeEncounters.event/);
    expect(edit((w, row) => {
      const { witnessScope: _, ...copy } = w.events.find(x => x.id === `evt-${row.id}-settled`)!;
      w.chronicleArchive.anchors.push(copy);
    })).toThrow(/roguelikeEncounters.publicArchive/);
    expect(edit((_w, row) => { row.outcome!.sectReputationDelta = 3; })).toThrow(/sectGate.outcome/);
    expect(edit((_w, row) => { row.outcome!.qiDelta = 1; })).toThrow(/sectGate.outcome/);
    expect(edit((_w, row) => { row.choice = 'bold'; row.outcome!.sectReputationDelta = 1; })).toThrow(/sectGate.event/);
    expect(edit((w, row) => { w.events = w.events.filter(x => x.id !== `evt-${row.id}-settled`); })).toThrow(/sectGate.source/);
  });
});
