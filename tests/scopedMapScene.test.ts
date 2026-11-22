import { describe, expect, it } from 'vitest';
import { getVisibleHazards } from '../src/components/mapBrushView';
import { paintedMapMarks } from '../src/components/mapPaintedSemantics';
import { buildScopedMapScene } from '../src/components/scopedMapScene';
import { createTerrainMapView, mapActorPositions } from '../src/components/terrainMapView';
import { createInitialWorld } from '../src/data/initialWorld';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { LLMDecisionPayload, WorldState } from '../src/types/world';
import { actualGrandSiege, actualSiege, disciple, location, patriarch, siegeActor, siegeTurn } from './grandSiegeNativeFixture';

function model(world: WorldState, viewerId?: string, fog = false, historical = false) {
  const viewer = world.cultivators.find(row => row.id === viewerId);
  const view = createTerrainMapView(world, viewer, fog);
  const points = mapActorPositions(view.seenLocations, view.liveActors, view.trailPositions);
  const plan = buildScopedMapScene(world, view, points, historical);
  const index = paintedMapMarks(world, view, [], getVisibleHazards(world, view), [], undefined, plan.presentation);
  return { view, points, plan, index };
}

describe('shared authorized Canvas scene compilation', () => {
  it('projects the same actual visible wall and formation in the current and historical frame, with no hidden front', () => {
    const { arrived } = actualGrandSiege();
    expect(model(arrived).plan.formationFrames).toHaveLength(0);
    const world = siegeTurn(arrived, { [disciple]: { chosenAction: 'CULTIVATE', innerMonologue: '守在山门调息。' } });
    const round = actualSiege(world).theatre!.rounds[0];
    const visible = model(world, patriarch, true);
    const historical = model(world, patriarch, true, true);
    expect(visible.plan.combatVfx.sieges.some(row => row.location.id === location && row.impact)).toBe(true);
    expect(visible.plan.domesBySite.get(location)).toMatchObject({ hp: round.wallAfter, impacted: true });
    expect(visible.plan.formationFrames).toEqual([expect.objectContaining({ sourceId: round.sourceEventId, hits: expect.any(Array) })]);
    expect(historical.plan.formationFrames).toEqual(visible.plan.formationFrames);
    expect(historical.plan.domesBySite.get(location)).toEqual(visible.plan.domesBySite.get(location));
    const hidden = model(world, undefined, true);
    expect(hidden.view.isCurrentLocation(location)).toBe(false);
    expect(hidden.plan.domesBySite.has(location)).toBe(false);
    expect(hidden.plan.formationFrames).toEqual([]);
    expect(hidden.plan.combatVfx.sieges).toEqual([]);
  });

  it('uses the exact painted flight endpoint for the keyboard index, and removes that route from both under fog', () => {
    const initial = createInitialWorld(1, 'spirit-bloom');
    const traveler = siegeActor(initial, disciple);
    const world = siegeTurn(initial, { [disciple]: { chosenAction: 'EXPLORE', targetLocationId: location, innerMonologue: '回到山门。' } });
    expect(traveler.locationId).not.toBe(location);
    expect(siegeActor(world, disciple).locationId).toBe(location);
    const exposed = model(world, disciple);
    const route = exposed.plan.presentation.routes.get(disciple);
    const flightMark = exposed.index.find(row => row.id === `flight:${disciple}`);
    expect(route).toBeDefined();
    expect(exposed.plan.presentation.routes).toBe(exposed.plan.motionSnapshot.routes);
    expect(exposed.plan.presentation.effects).toBe(exposed.plan.combatVfx.effects);
    expect(flightMark?.point).toBe(route?.points.at(-1));
    const hidden = model(world, undefined, true);
    expect(hidden.plan.presentation.routes.has(disciple)).toBe(false);
    expect(hidden.index.some(row => row.id === `flight:${disciple}`)).toBe(false);
  });

  it('retains actual public combat status but never a live speech badge in replay', () => {
    const initial = createInitialWorld(1, 'spirit-bloom');
    const attackerId = 'npc-1';
    const wait: LLMDecisionPayload = { chosenAction: 'REST', innerMonologue: '静候。' };
    const attack: LLMDecisionPayload = { chosenAction: 'DUEL', targetCultivatorId: 'elder-taixu-1',
      spokenLine: '且接我一剑！', innerMonologue: '这里不是公话。' };
    const world = advanceWorldTick(initial, Object.fromEntries(initial.cultivators.map(actor =>
      [actor.id, actor.id === attackerId ? attack : wait])), () => .2, 'utility');
    const turn = model(world, attackerId);
    const replay = model(world, attackerId, false, true);
    expect(turn.plan.hasBadgeQuote).toBe(true);
    expect(turn.plan.actorBadgeFacts.get(attackerId)?.quote).toBe('且接我一剑！');
    expect(replay.plan.hasBadgeQuote).toBe(false);
    expect(replay.plan.actorBadgeFacts.get(attackerId)?.quote).toBeUndefined();
    expect(replay.plan.presentation).toEqual(turn.plan.presentation);
  });
});
