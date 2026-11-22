import { describe, expect, it } from 'vitest';
import { buildMapActorBadgeView } from '../src/components/mapActorBadgeView';
import { buildMapCombatVfxPlan } from '../src/components/mapCombatVfxView';
import { buildMapPresentation } from '../src/components/mapPresentationView';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { applyDialogueLanguage } from '../src/engine/dialogueEngine';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { resolveTribulation, triggerTribulation } from '../src/engine/tribulationEngine';
import type { Cultivator, EscortContract, WorldState } from '../src/types/world';
import { dialoguePerson, publicDialogueProofFixture } from './fixtures/publicDialogueFixture';

function calculate(world: WorldState, viewer?: Cultivator, fog = false, quotes = true) {
  const view = createTerrainMapView(world, viewer, fog);
  const paint = buildMapPresentation(world, view, mapActorPositions(view.seenLocations, view.liveActors, view.trailPositions));
  const combat = buildMapCombatVfxPlan(world, view, paint);
  return buildMapActorBadgeView(world, view, combat, quotes);
}

describe('map actor badges and current public combat bubbles', () => {
  it('differentiates the strict native recovery breakpoint, 92 Qi, terminal realm and active major trial cooldown', () => {
    const world = createInitialWorld();
    const [actor] = world.cultivators;
    world.cultivators = [actor];
    Object.assign(actor, { hp: 44, maxHp: 100, realm: '练气', realmStage: 4, qiProgress: 92 });
    const statuses = () => calculate(world, actor, true).get(actor.id)?.statuses ?? [];
    expect(statuses()).toEqual(['critical']);
    actor.hp = 45;
    expect(statuses()).toEqual(['ready']);
    actor.qiProgress = 91;
    expect(statuses()).toEqual([]);
    actor.qiProgress = 92;
    actor.realm = '渡劫'; actor.realmStage = 9;
    expect(statuses()).toEqual([]);
    actor.realmStage = 8;
    expect(statuses()).toEqual(['ready']);

    actor.realm = '筑基'; actor.realmStage = 9;
    actor.hp = 1;
    expect(triggerTribulation(world, actor)).toBeTruthy();
    world.tick++;
    expect(resolveTribulation(world, actor, 'defy', () => .5)).toMatchObject({ category: 'death' });
    // Restore living health to model the badge at the cooldown boundary (the engine's failed state is real).
    actor.alive = true; actor.hp = 45; actor.qiProgress = 92;
    world.tick += 2;
    expect(statuses()).toEqual([]);
    world.tick++;
    expect(statuses()).toEqual(['ready']);
  });

  it('marks actual heart demon after final native wave, not lightning, failed, resolved or remembered reflection', () => {
    const world = createInitialWorld();
    const [actor] = world.cultivators;
    world.cultivators = [actor];
    Object.assign(actor, { realm: '筑基', realmStage: 9, qiProgress: 100, hp: 500, maxHp: 500, artifacts: [], techniqueMastery: 80 });
    actor.pills.barrier = 0;
    actor.reflections = [{ id: 'old-fear', tick: 1, kind: 'heart_demon', theme: 'conflict', intensity: 10,
      statement: '心魔记忆不供地图投影。', sourceMemoryIds: [], source: 'utility' }];
    const row = () => calculate(world, actor, true).get(actor.id);
    expect(row()?.statuses).toEqual(['ready']);
    // The reflection alone doesn't imply an ongoing heart demon.
    actor.reflections = [];
    expect(triggerTribulation(world, actor)).toBeTruthy();
    expect(row()).toBeUndefined();
    for (let wave = 1; wave <= 3; wave++) {
      world.tick++;
      expect(resolveTribulation(world, actor, 'guard', () => .5)?.id).toMatch(new RegExp(`-wave-${wave}$`));
      expect(row()?.statuses ?? []).toEqual(wave === 3 ? ['heart-demon'] : []);
    }
    actor.hp = 210;
    expect(row()?.statuses).toEqual(['critical', 'heart-demon']);
    world.tick++;
    expect(resolveTribulation(world, actor, 'focus', () => .5)?.id).toMatch(/-passed$/);
    expect(row()?.statuses.includes('heart-demon')).not.toBe(true);
  });

  it('uses direct visible actual lower markers only and respects held escort and in-transit/hidden scopes', () => {
    const world = createInitialWorld();
    const [viewer, other] = world.cultivators;
    world.cultivators = [viewer, other];
    const [home, distant] = world.locations;
    Object.assign(home, { x: 100, y: 100 });
    Object.assign(distant, { x: 900, y: 500 });
    Object.assign(viewer, { locationId: home.id, hp: 100, maxHp: 100, realm: '练气', realmStage: 4, qiProgress: 100 });
    Object.assign(other, { locationId: distant.id, hp: 20, maxHp: 100 });
    viewer.exploredTileIds = [terrainTileAt(world, distant.x, distant.y)!.id];
    const seen = (fog: boolean) => calculate(world, viewer, fog);
    expect(seen(true).get(other.id)).toBeUndefined();
    expect(seen(false).get(other.id)?.statuses).toEqual(['critical']);
    other.positionPlane = 'upper';
    expect(seen(false).has(other.id)).toBe(false);
    delete other.positionPlane;
    other.locationId = home.id;
    const escort: EscortContract = { id: 'escort', shipmentId: 'shipment', clientId: other.id, escortId: viewer.id,
      originId: home.id, destinationId: distant.id, status: 'active', offeredTick: 1, expiresTick: 5, acceptedTick: 1,
      feeEscrow: 5, feePaid: 0, feeRefunded: 0, rationsEscrow: 1, rationsSpent: 0, rationsReturned: 0,
      path: [home, distant], pathIndex: 0, stride: 1, lastCrossedTileIds: [], usedReportIds: [], detours: [] };
    world.escorts.contracts.push(escort);
    expect(seen(false).has(viewer.id)).toBe(false);
    escort.arrivedTick = world.tick; // Native active contract still holds action, though no longer draws a moving convoy.
    expect(seen(false).get(viewer.id)?.statuses).toBeUndefined();
    escort.status = 'delivered';
    expect(seen(false).get(viewer.id)?.statuses).toEqual(['ready']);

    const terrain = createTerrainMapView(world, viewer, false);
    const counterfeit = { ...terrain, liveActors: [{ ...viewer }, other] };
    const blank = { effects: [], storms: [], sieges: [], hasTransient: false };
    expect(buildMapActorBadgeView(world, counterfeit, blank, false).has(viewer.id)).toBe(false);
    home.type = 'secret_realm';
    home.expeditionOmenId = 'scoped';
    const privileged = { ...terrain, liveActors: [viewer, other] };
    expect(buildMapActorBadgeView(world, privileged, blank, false).size).toBe(0);
  });

  it('shows only short verified live first-speaker native combat, including exact shortened public language variant', () => {
    const { world, actorId, firstId, event } = publicDialogueProofFixture();
    const actor = dialoguePerson(world, actorId);
    const initial = structuredClone(world);
    const current = () => calculate(world, actor, true);
    expect(current().get(actorId)?.quote).toBe('只听在场留下的这句。');
    expect(current().get(firstId)?.quote).toBeUndefined();
    expect(JSON.stringify([...current().values()])).not.toContain('未公开想法');
    expect(calculate(world, actor, true, false).get(actorId)?.quote).toBeUndefined();
    expect(world).toEqual(initial);
    const wording = '甲乙丙丁戊己庚辛壬癸'.repeat(3) + '🗡️';
    world.events = applyDialogueLanguage(world.events, [event.id], { exchanges: [{ id: event.id, lines: [wording, '这一句不是发起者的。'] }] });
    const excerpt = current().get(actorId)?.quote;
    expect(excerpt).toBe(Array.from(wording).slice(0, 21).join('') + '…');
    expect(Array.from(excerpt ?? '')).toHaveLength(22);
    world.events = world.events.filter(row => row.id !== event.id);
    expect(current().get(actorId)?.quote).toBeUndefined(); // Archives cannot substitute current event words.
  });

  it('rejects contested, private, stale, no-longer-visible or detached-site public-looking quote records', () => {
    const { world, actorId, event } = publicDialogueProofFixture();
    const actor = dialoguePerson(world, actorId);
    const raw = world.events.find(row => row.id === event.id)!;
    const current = () => calculate(world, actor, false).get(actorId)?.quote;
    expect(current()).toBeDefined();
    raw.witnessScope = 'participants';
    expect(current()).toBeUndefined();
    delete raw.witnessScope;
    world.events.push({ ...raw });
    expect(current()).toBeUndefined(); // Even identical duplicates do not establish exact current provenance.
    world.events.pop();
    raw.month++;
    expect(current()).toBeUndefined();
    raw.month--;
    raw.dialogue!.turns[0].text = '假词绝不能流出';
    expect(current()).toBeUndefined(); // Disagrees with the native retained copy.
    raw.dialogue!.turns[0].text = '只听在场留下的这句。';
    expect(current()).toBeDefined();
    actor.locationId = world.locations.find(site => site.id !== raw.locationId)!.id;
    expect(current()).toBeUndefined();
    actor.locationId = raw.locationId!;
    world.mapPresentation.tick--;
    expect(current()).toBeUndefined();
  });
});
