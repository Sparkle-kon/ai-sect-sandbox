import { describe, expect, it } from 'vitest';
import { buildMapCombatVfxPlan } from '../src/components/mapCombatVfxView';
import { buildMapPresentation } from '../src/components/mapPresentationView';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { adjustSectAffinity, advanceDiplomacy, resolveDiplomacyAction } from '../src/engine/diplomacyEngine';
import { deriveMapPresentation } from '../src/engine/mapMotionEngine';
import { resolveTribulation, triggerTribulation } from '../src/engine/tribulationEngine';
import { advanceWorldTick, executeGodIntervention } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldEvent, WorldState } from '../src/types/world';

const rest: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '静候' };
function plan(world: WorldState, viewerId?: string, fog = false) {
  const view = createTerrainMapView(world, world.cultivators.find(({ id }) => id === viewerId), fog);
  return buildMapCombatVfxPlan(world, view, buildMapPresentation(world, view,
    mapActorPositions(view.seenLocations, view.liveActors, view.trailPositions)));
}

function nativeDuel(lethal = false) {
  const initial = createInitialWorld(1, 'spirit-bloom');
  const attacker = initial.cultivators.find(({ id }) => id === 'npc-1')!;
  const defender = initial.cultivators.find(({ id }) => id === 'elder-taixu-1')!;
  if (lethal) { attacker.combatPower = 100_000; defender.hp = 5; }
  const world = advanceWorldTick(initial, Object.fromEntries(initial.cultivators.map(({ id }) =>
    [id, id === attacker.id ? { chosenAction: 'DUEL', targetCultivatorId: defender.id, innerMonologue: '不入特效的心声' } : rest])),
  () => .5, 'utility');
  const event = world.events.find(({ id }) => id === `evt-${world.tick}-${attacker.id}-${lethal ? 'kill' : 'duel'}`)!;
  expect(event?.duelWinnerId).toBeDefined();
  return { world, attacker, defender, event };
}

function subject() {
  const world = createInitialWorld();
  const actor = world.cultivators[0];
  world.cultivators = [actor];
  Object.assign(actor, { realm: '筑基', realmStage: 9, qiProgress: 100, hp: 500, maxHp: 500, techniqueMastery: 50,
    pillToxicity: 0, artifacts: [], reflections: [] });
  actor.pills.barrier = 0;
  world.relationships = [];
  const publish = (prev: WorldState, receipt: WorldEvent) => {
    world.events.unshift(receipt);
    world.mapPresentation = deriveMapPresentation(prev, world, [receipt]);
  };
  const begin = () => publish(structuredClone(world), triggerTribulation(world, actor)!);
  const advance = (stance: 'guard' | 'focus' | 'defy') => {
    const prev = structuredClone(world);
    world.tick++;
    world.month++;
    const receipt = resolveTribulation(world, actor, stance, () => .5)!;
    publish(prev, receipt);
    return receipt;
  };
  return { world, actor, begin, advance };
}

describe('combat VFX from exact public native map receipts', () => {
  it('uses an actual nonlethal duel and its exact applied packets, and keeps the genuine current lethal clash without drawing a dead actor', () => {
    for (const lethal of [false, true]) {
      const { world, attacker, defender, event } = nativeDuel(lethal);
      const base = plan(world, attacker.id, true);
      expect(base.effects).toContainEqual(expect.objectContaining({ kind: 'clash', id: event.id + '-clash', locationId: event.locationId }));
      expect(base.effects.filter(row => row.id.startsWith(event.id) && row.kind === 'damage')
        .map(row => ({ cultivatorId: row.actorIds[0], amount: row.amount }))).toEqual(event.damage);
      for (const hit of event.damage ?? []) {
        expect(base.effects.find(({ id }) => id === `${event.id}-damage-${hit.cultivatorId}`)?.text).toBe(`−${hit.amount} HP`);
      }
      if (lethal) expect(event.damage?.find(row => row.cultivatorId === defender.id)?.amount).toBe(5);
      expect(plan(world, 'npc-6', true).effects.some(row => row.id.startsWith(event.id))).toBe(false);
      expect(base.hasTransient).toBe(true);
      expect(JSON.stringify(base.effects)).not.toContain('不入特效的心声');
    }
  });

  it('fails closed for private, contested, wrong date/site, forged prefixes, saved prose, old frames and scoped source coordinates', () => {
    const { world, event, attacker } = nativeDuel();
    const clash = world.mapPresentation.effects.find(row => row.id === event.id + '-clash')!;
    const damage = world.mapPresentation.effects.find(row => row.id.startsWith(event.id + '-damage-'))!;
    const site = world.locations.find(({ id }) => id === clash.locationId)!;
    clash.text = damage.text = '不许进入可访问文字';
    expect(JSON.stringify(plan(world).effects)).not.toContain('不许进入可访问文字');
    const count = () => plan(world).effects.filter(row => row.id.startsWith(event.id)).length;
    expect(count()).toBeGreaterThan(0);
    event.witnessScope = 'participants';
    expect(count()).toBe(0);
    delete event.witnessScope;
    const duplicate = { ...event, witnessScope: 'participants' as const };
    world.events.push(duplicate);
    expect(count()).toBe(0);
    world.events.pop();
    event.month++;
    expect(count()).toBe(0);
    event.month--;
    const origin = event.locationId;
    delete event.locationId;
    expect(count()).toBe(0);
    event.locationId = origin;

    const fakeId = `evt-${world.tick}-${attacker.id}-fake-duel`;
    world.events.push({ ...event, id: fakeId });
    world.mapPresentation.effects.push({ ...clash, id: fakeId + '-clash' },
      { ...damage, id: `evt-${world.tick}-${attacker.id}-map-damage` });
    expect(plan(world).effects.some(row => row.id === fakeId + '-clash' || row.id.endsWith('-map-damage'))).toBe(false);
    const original = site.type;
    site.type = 'secret_realm';
    site.expeditionOmenId = 'no-plain-map';
    const terrain = createTerrainMapView(world, world.cultivators[0], false);
    // A scoped site remains excluded even if a private occasion view authorizes it elsewhere.
    const widened = { ...terrain, seenLocations: world.locations, isCurrentLocation: () => true };
    const scoped = buildMapCombatVfxPlan(world, widened, buildMapPresentation(world, widened, []));
    expect(scoped.effects.some(row => row.location === site)).toBe(false);
    site.type = original;
    delete site.expeditionOmenId;
    world.mapPresentation.tick--;
    expect(plan(world).effects).toHaveLength(0);
  });

  it('distinguishes real storm onset, actual waves (including final and lethal), heart demon and proved successful promotion', () => {
    const { world, actor, begin, advance } = subject();
    begin();
    const start = plan(world, actor.id, true);
    expect(start.storms).toEqual([expect.objectContaining({ id: actor.tribulation?.id, wave: 1, totalWaves: 3 })]);
    expect(start.effects).toEqual([]);
    expect(start.hasTransient).toBe(false);
    world.events[0].witnessScope = 'participants';
    expect(plan(world).storms).toHaveLength(0);
    delete world.events[0].witnessScope;
    const onset = world.events[0];
    for (let wave = 1; wave <= 3; wave++) {
      const receipt = advance('guard');
      const frame = plan(world, actor.id, true);
      expect(frame.effects).toContainEqual(expect.objectContaining({
        id: receipt.id + '-lightning', kind: 'lightning', wave, totalWaves: 3, text: `第${wave}重雷劫`,
      }));
      expect(frame.effects).toContainEqual(expect.objectContaining({ kind: 'damage', amount: receipt.damage![0].amount }));
      expect(frame.storms.map(row => row.wave)).toEqual(wave === 3 ? [] : [wave + 1]);
      if (wave === 1) {
        world.events.push({ ...onset, witnessScope: 'participants' });
        expect(plan(world).storms).toEqual([]);
        world.events.pop();
      }
    }
    expect(actor.tribulation?.stage).toBe('heart_demon');
    const passed = advance('focus');
    expect(passed.id).toMatch(/-tribulation-passed$/);
    expect(plan(world).effects).toEqual([expect.objectContaining({ kind: 'breakthrough', majorAdvance: true, text: '金丹1层' })]);

    const lethal = subject();
    lethal.actor.hp = 1;
    lethal.begin();
    const fell = lethal.advance('defy');
    expect(fell.id).toMatch(/-tribulation-failure$/);
    const aftermath = plan(lethal.world);
    expect(aftermath.storms).toEqual([]);
    expect(aftermath.effects).toContainEqual(expect.objectContaining({ kind: 'lightning', wave: 1 }));
    expect(aftermath.effects).toContainEqual(expect.objectContaining({ kind: 'damage', amount: 1, text: '−1 HP' }));
  });

  it('does not mistake mere category or prose for breakthrough/lightning and preserves actual God Strike clamp', () => {
    const world = createInitialWorld();
    const actor = world.cultivators[0];
    actor.hp = 10;
    const struck = executeGodIntervention(world, { type: 'TRIBULATION_STRIKE', targetCultivatorId: actor.id });
    const actual = plan(struck);
    expect(actual.effects).toContainEqual(expect.objectContaining({ kind: 'lightning', text: '天道雷击' }));
    expect(actual.effects).toContainEqual(expect.objectContaining({ kind: 'damage', amount: 9, text: '−9 HP' }));

    struck.events.push({ ...struck.events[0], id: 'fake-thunder', title: '天劫降临', damage: undefined });
    struck.mapPresentation = deriveMapPresentation(struck, struck, struck.events);
    expect(struck.mapPresentation.effects.some(({ id }) => id === 'fake-thunder-lightning')).toBe(true);
    expect(plan(struck).effects.some(({ id }) => id === 'fake-thunder-lightning')).toBe(false);

    const [cultivator] = world.cultivators;
    world.cultivators = [cultivator];
    cultivator.realm = '练气';
    cultivator.realmStage = 3;
    cultivator.qiProgress = 100;
    const progressed = advanceWorldTick(world, { [cultivator.id]: { chosenAction: 'BREAKTHROUGH', innerMonologue: '破关' } }, () => 0);
    const level = plan(progressed).effects.find(row => row.kind === 'breakthrough');
    expect(level).toMatchObject({ text: '练气4层', majorAdvance: false });
    const proof = progressed.events.find(row => row.id === `evt-${progressed.tick}-${cultivator.id}-break`)!;
    proof.id = `evt-${progressed.tick}-${cultivator.id}-explore`;
    expect(plan(progressed).effects.some(row => row.kind === 'breakthrough')).toBe(false);
  });

  it('shows a genuine siege at its actual destination only after arrival and emits no fabricated raid HP', () => {
    const world = createInitialWorld();
    world.diplomacy = [];
    const [attacker, defender, ...allies] = world.sects;
    const leader = world.cultivators.find(({ id }) => id === attacker.leaderId)!;
    const victim = world.cultivators.find(({ id }) => id === defender.leaderId)!;
    for (const actor of world.cultivators) {
      actor.locationId = world.sects.find(({ id }) => id === actor.sectId)!.headquartersId;
      actor.hp = actor.maxHp = 500;
      actor.combatPower = actor.sectId === defender.id ? 200 : 1500;
    }
    const action = (chosenAction: LLMDecisionPayload['chosenAction'], targetSectId: string) =>
      resolveDiplomacyAction(world, leader, { chosenAction, targetSectId, innerMonologue: '议事' });
    for (const ally of allies) {
      adjustSectAffinity(world, attacker.id, ally.id, 60);
      expect(action('OFFER_ALLIANCE', ally.id)).not.toBeNull();
    }
    adjustSectAffinity(world, attacker.id, defender.id, -60);
    expect(action('DECLARE_WAR', defender.id)).not.toBeNull();
    world.tick += 3;
    expect(action('LAUNCH_SIEGE', defender.id)).not.toBeNull();
    defender.arrayHp = defender.arrayMaxHp = 200;
    expect(plan(world).sieges).toEqual([]);
    const next = () => {
      const before = structuredClone(world);
      world.tick++;
      world.month++;
      const effects = advanceDiplomacy(world, () => .5);
      world.events.unshift(...effects);
      world.mapPresentation = deriveMapPresentation(before, world, effects);
      return effects[0];
    };
    expect(next().title).toBe('联军完成集结');
    expect(plan(world).sieges).toEqual([]);
    expect(next().title).toBe('联军抵达山门');
    const [siege] = world.sieges;
    expect(plan(world, victim.id, true).sieges).toEqual([expect.objectContaining({ id: siege.id, impact: false })]);
    const receipt = next();
    expect(receipt.title).toBe('护山阵接战');
    const battle = plan(world, victim.id, true);
    expect(battle.sieges).toEqual([expect.objectContaining({ id: siege.id, impact: true,
      location: expect.objectContaining({ id: defender.headquartersId }) })]);
    expect(battle.hasTransient).toBe(true);
    expect(battle.effects.filter(row => row.kind === 'damage')).toEqual([]);
    receipt.witnessScope = 'participants';
    expect(plan(world).sieges[0]?.impact).toBe(false);
    siege.status = 'withdrawn';
    expect(plan(world).sieges).toEqual([]);
  });
});
