import { describe, expect, it } from 'vitest';
import { battlefieldRevisitCommand } from '../src/engine/battlefieldRevisitCognition';
import { availableBattlefieldRevisits, BATTLEFIELD_REPAIR_QI, BATTLEFIELD_REPAIR_LIMIT, isBattlefieldRevisitEvent,
  projectBattlefieldArrayBreak, projectBattlefieldRevisit } from '../src/engine/battlefieldRevisit';
import type { LLMDecisionPayload } from '../src/types/world';
import { actualGrandSiege, actualSiege, commander, disciple, location, patriarch, siegeActor, siegeSect, siegeTurn } from './grandSiegeNativeFixture';

const explore = (targetLocationId: string): LLMDecisionPayload => ({
  chosenAction: 'EXPLORE', targetLocationId, innerMonologue: '实际走到旧日记得的地点。',
});
function brokenNativeBattle() {
  const { arrived } = actualGrandSiege();
  let world = siegeTurn(arrived, { [disciple]: { chosenAction: 'SOCIALIZE', targetCultivatorId: patriarch, innerMonologue: '阵前真的见过同门。' } });
  expect(world.events).toContainEqual(expect.objectContaining({ id: `evt-${world.tick}-${disciple}-social`,
    actorIds: [disciple, patriarch] }));
  for (let i = 0; i < 7 && actualSiege(world).status === 'sieging'; i++) world = siegeTurn(world);
  const siege = actualSiege(world);
  const scar = projectBattlefieldArrayBreak(world, siege);
  expect(scar).toMatchObject({ wallAfter: 0 });
  expect(scar?.wallBefore).toBeGreaterThan(0);
  return world;
}

describe('a true broken array and one original witness really returning', () => {
  it('will pay to repair only after a native return, and distinguishes today’s array from an old scar', () => {
    const end = brokenNativeBattle(), body = siegeActor(end, disciple);
    expect(availableBattlefieldRevisits(end, body)).toEqual([]);
    const far = siegeTurn(end, { [disciple]: explore('loc-secret-1') });
    expect(siegeActor(far, disciple).locationId).toBe('loc-secret-1');
    const returned = siegeTurn(far, { [disciple]: explore(location) });
    expect(siegeActor(returned, disciple).locationId).toBe(location);
    const revisit = projectBattlefieldRevisit(returned, siegeActor(returned, disciple));
    const [repair, seek] = revisit?.options ?? [];
    expect(revisit?.returnTick).toBe(returned.tick);
    expect(repair?.battlefieldRevisitMove).toBe('repair');
    expect(seek).toMatchObject({ battlefieldRevisitMove: 'seek', targetCultivatorId: patriarch });
    expect(projectBattlefieldRevisit(returned, siegeActor(returned, disciple), commander)).toBeUndefined();
    const pause = siegeTurn(returned);
    const mended = siegeTurn(returned, { [disciple]: { ...battlefieldRevisitCommand(repair!), innerMonologue: '愿用自己的灵气修阵。' } });
    expect(mended.events.filter(isBattlefieldRevisitEvent)).toContainEqual(expect.objectContaining({ title: '幸存者续起旧阵眼',
      actorIds: [disciple], witnessScope: 'participants', tick: mended.tick }));
    // Both same-date siblings have the same sect maintenance. The chosen native action adds only its paid increment.
    expect(siegeSect(mended).arrayHp - siegeSect(pause).arrayHp).toBe(BATTLEFIELD_REPAIR_LIMIT);
    expect(siegeActor(returned, disciple).qiProgress - siegeActor(mended, disciple).qiProgress).toBe(BATTLEFIELD_REPAIR_QI);
    expect(projectBattlefieldArrayBreak(mended, actualSiege(mended))?.wallAfter).toBe(0);
    expect(projectBattlefieldRevisit(pause, siegeActor(pause, disciple))).toBeUndefined();
    const met = siegeTurn(returned, { [disciple]: { ...battlefieldRevisitCommand(seek!), innerMonologue: '当面认回原先见过的人。' } });
    expect(met.events.filter(isBattlefieldRevisitEvent)).toContainEqual(expect.objectContaining({ title: '昔日师友在旧阵眼相见',
      actorIds: [disciple, patriarch], witnessScope: 'participants', tick: met.tick }));
    expect(siegeActor(met, patriarch).locationId).toBe(location);
    expect(siegeActor(met, disciple).locationId).toBe(location);
  });

  it('rejects an intact round, duplicate public result and an unproved forged observer', () => {
    const { arrived } = actualGrandSiege();
    const initialClash = siegeTurn(arrived);
    expect(projectBattlefieldArrayBreak(initialClash, actualSiege(initialClash))).toBeUndefined();
    const world = brokenNativeBattle(), siege = actualSiege(world);
    const key = siege.theatre!.terminal!.sourceEventId;
    const duplicate = { ...world, events: [...world.events, { ...world.events.find(event => event.id === key)! }] };
    expect(projectBattlefieldArrayBreak(duplicate, siege)).toBeUndefined();
    expect(projectBattlefieldRevisit(world, { ...siegeActor(world, disciple) })).toBeUndefined();
  });
});
