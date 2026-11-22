import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { deriveMapPresentation } from '../src/engine/mapMotionEngine';
import { triggerTribulation } from '../src/engine/tribulationEngine';
import { localQiWeather } from '../src/engine/weatherEngine';
import { projectWorldPulse, resolveWorldPulseAlertSite } from '../src/components/worldPulseModel';
import type { Cultivator, WorldEvent, WorldState } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(173);
  world.tick = 40;
  world.month = 10;
  const home = world.locations.find(({ id }) => id === 'loc-qingyun') ?? world.locations[0];
  const far = world.locations[1];
  Object.assign(home, { x: 100, y: 110 });
  Object.assign(far, { x: 900, y: 520 });
  const [viewer, second, outsider, inactive, neutral] = world.cultivators;
  world.cultivators = [viewer, second, outsider, inactive, neutral];
  Object.assign(viewer, { locationId: home.id, karma: -15, combatPower: 100, realm: '筑基', realmStage: 3, contribution: 30 });
  Object.assign(second, { locationId: home.id, karma: 30, combatPower: 100, realm: '筑基', realmStage: 3, contribution: 31 });
  Object.assign(outsider, { locationId: far.id, karma: -78, combatPower: 110, sectId: 'sect-bloodmoon' });
  Object.assign(inactive, { locationId: home.id, karma: 100, combatPower: 40, sectId: 'sect-closed' });
  Object.assign(neutral, { locationId: home.id, karma: -100, combatPower: 120, sectId: 'sect-danxia', alive: false, hp: 0 });
  world.sects.push({ ...world.sects[0], id: 'sect-closed', inactiveSinceTick: 10 });
  world.events = [];
  world.sieges = [];
  world.mapPresentation = { tick: world.tick, trails: [], effects: [] };
  return { world, home, far, viewer, second, outsider, inactive, neutral };
}

function startTrial(world: WorldState, actor: Cultivator) {
  Object.assign(actor, { realm: '筑基', realmStage: 9, qiProgress: 100 });
  expect(triggerTribulation(world, actor)).not.toBeNull();
  return 'trial:' + actor.tribulation!.id;
}

function event(world: WorldState, id: string, locationId: string, witnessScope?: WorldEvent['witnessScope']): WorldEvent {
  return { id: id + '-duel', category: 'combat', title: '不供态势条显示', description: '不可带入预警文字',
    year: world.year, month: world.month, tick: world.tick, locationId, actorIds: [world.cultivators[0].id], witnessScope };
}

describe('world pulse from native frame and visible lower-plane facts', () => {
  it('uses native local weather and signed active-sect means without exposing excluded champions', () => {
    const { world, home, viewer, second, outsider } = fixture();
    const before = JSON.stringify(world);
    const full = projectWorldPulse(world, viewer.id, false);
    expect(full).toMatchObject({
      season: '冬', weather: { kind: localQiWeather(world, home).kind, siteName: home.name, intensity: localQiWeather(world, home).intensity },
      righteous: { count: 2, mean: 7.5 }, demonic: { count: 1, mean: -78 },
      champion: { name: outsider.name, realm: outsider.realm, power: 110 }, coverage: 'world',
    });
    const seen = projectWorldPulse(world, viewer.id, true);
    expect(seen).toMatchObject({ righteous: { count: 2, mean: 7.5 }, demonic: { count: 0 },
      champion: { name: second.name, power: 100 }, coverage: 'visible' });
    expect(seen.demonic.mean).toBeUndefined();
    expect(JSON.stringify(world)).toBe(before);
    outsider.positionPlane = 'upper';
    const lower = projectWorldPulse(world, viewer.id, false);
    expect(lower.coverage).toBe('visible');
    expect(lower.champion?.name).toBe(second.name);
  });

  it('keeps real current trial and siege alerts, hides marching/foreign/future/resolved events, and verifies exact focus IDs', () => {
    const { world, home, far, viewer, second, outsider } = fixture();
    const trial = startTrial(world, viewer);
    const farTrial = startTrial(world, outsider);
    startTrial(world, second);
    if (second.tribulation) second.tribulation.stage = 'passed';
    const siege = { startedTick: world.tick, rounds: 0, attackerSectId: 'sect-bloodmoon', defenderSectId: 'sect-qingyun',
      participantIds: [viewer.id], destinationId: home.id, status: 'sieging', id: 'exact' } as const;
    const participants = [...siege.participantIds];
    world.sieges.push({ ...siege, participantIds: participants }, { ...siege, participantIds: participants, id: 'far', destinationId: far.id },
      { ...siege, participantIds: participants, id: 'march', status: 'marching' },
      { ...siege, participantIds: participants, id: 'future', startedTick: world.tick + 1 });
    expect(projectWorldPulse(world, viewer.id, true).risks.map(({ id }) => id)).toEqual([trial, 'siege:exact']);
    expect(resolveWorldPulseAlertSite(world, viewer.id, true, farTrial)).toBeUndefined();
    expect(resolveWorldPulseAlertSite(world, viewer.id, true, trial)).toBe(home);
    expect(resolveWorldPulseAlertSite(world, viewer.id, true, 'siege:exact')).toBe(home);
    world.sieges[0].status = 'withdrawn';
    expect(resolveWorldPulseAlertSite(world, viewer.id, true, 'siege:exact')).toBeUndefined();
  });

  it('requires the exact current public source for a clash and counts capped unique alerts', () => {
    const { world, home, far, viewer } = fixture();
    const native = [event(world, 'c', home.id), event(world, 'a', home.id), event(world, 'b', home.id), event(world, 'd', home.id)];
    const privateEvent = event(world, 'private', home.id, 'participants');
    const hidden = event(world, 'hidden', far.id);
    const explicitWrongSite = event(world, 'wrong', far.id);
    const noSource = event(world, 'unproven', home.id);
    const duplicate = event(world, 'contested', home.id);
    const wrongMonth = { ...event(world, 'wrong-month', home.id), month: world.month - 1 };
    const wrongYear = { ...event(world, 'wrong-year', home.id), year: world.year + 1 };
    world.events = [...native, privateEvent, hidden, explicitWrongSite, wrongMonth, wrongYear,
      duplicate, { ...duplicate, witnessScope: 'participants' }];
    world.mapPresentation = deriveMapPresentation(world, world, [...world.events, noSource]);
    const repeated = world.mapPresentation.effects.find(({ id }) => id === `${native[0].id}-clash`)!;
    const wrong = world.mapPresentation.effects.find(({ id }) => id === `${explicitWrongSite.id}-clash`)!;
    wrong.locationId = home.id;
    world.mapPresentation.effects.push(repeated, { ...repeated, id: 'expired-clash', tick: world.tick - 1 });
    const view = projectWorldPulse(world, viewer.id, true);
    expect(view.risks.map(({ id }) => id)).toEqual(['clash:a-duel-clash', 'clash:b-duel-clash', 'clash:c-duel-clash']);
    expect(view.additionalRisks).toBe(1);
    expect(view.risks.every(({ label, siteId }) => label === '本月交锋' && siteId === home.id)).toBe(true);
    expect(resolveWorldPulseAlertSite(world, viewer.id, true, 'clash:c-duel-clash')).toBe(home);
    expect(resolveWorldPulseAlertSite(world, viewer.id, true, 'clash:private-duel-clash')).toBeUndefined();
    world.mapPresentation.tick--;
    expect(projectWorldPulse(world, viewer.id, true).risks).toHaveLength(0);
  });

  it('does not expose closed gates or non-lower viewers even without terrain fog', () => {
    const { world, home, viewer, outsider } = fixture();
    const gate = { ...home, type: 'secret_realm' as const, id: 'loc-expedition-gate-unseen', expeditionOmenId: 'unseen' };
    world.locations.push(gate);
    outsider.locationId = gate.id;
    const trial = startTrial(world, outsider);
    expect(projectWorldPulse(world, viewer.id, false).coverage).toBe('visible');
    expect(resolveWorldPulseAlertSite(world, viewer.id, false, trial)).toBeUndefined();
    viewer.positionPlane = 'frontier';
    expect(projectWorldPulse(world, viewer.id, false)).toMatchObject({
      season: '冬', coverage: 'visible', righteous: { count: 0 }, demonic: { count: 0 }, risks: [], additionalRisks: 0,
    });
    expect(projectWorldPulse(world, viewer.id, false).weather).toBeUndefined();
  });
});
