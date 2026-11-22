import { describe, expect, it } from 'vitest';
import { possessAvatar } from '../src/engine/avatarEngine';
import { queueGrandSiegeHero } from '../src/engine/grandSiegeTheatreEngine';
import { roundEventId } from '../src/engine/grandSiegeProof';
import { projectSiegeWitness } from '../src/engine/grandSiegeWitnessView';
import { actualGrandSiege, actualSiege, commander, defendSect, disciple, location, patriarch, siegeActor, siegeTurn } from './grandSiegeNativeFixture';

function lateFighterBattle() {
  let world = actualGrandSiege().declared;
  world = siegeTurn(world);
  expect(siegeActor(world, disciple).locationId).not.toBe(location);
  world = siegeTurn(world);
  world = siegeTurn(world, { [commander]: { chosenAction: 'LAUNCH_SIEGE', targetSectId: defendSect, innerMonologue: '领军出阵。' } });
  world = siegeTurn(world);
  world = siegeTurn(world);
  const outside = siegeTurn(world);
  const inside = siegeTurn(outside, { [disciple]: { chosenAction: 'EXPLORE', targetLocationId: location, innerMonologue: '亲至阵前。' } });
  return { outside, inside };
}

describe('a separate exact view of actual grand siege witnesses', () => {
  it('lets a late native arrival see only its actual round, while the defender present in both can see both', () => {
    const { outside, inside } = lateFighterBattle();
    expect(outside.tick).toBe(8);
    expect(inside.tick).toBe(9);
    expect(siegeActor(inside, disciple).locationId).toBe(location);
    const view = (world: typeof inside, id: string, cutoff?: number) =>
      projectSiegeWitness(world, actualSiege(world), siegeActor(world, id), cutoff);
    expect(view(outside, disciple)).toBeUndefined();
    expect(view(inside, disciple, outside.tick)).toBeUndefined();
    expect(view(inside, disciple)?.rounds).toEqual([expect.objectContaining({
      sourceId: roundEventId(9, actualSiege(inside).id), tick: 9, round: 2, side: 'defender', wallAfter: 41,
    })]);
    expect(view(inside, patriarch)?.rounds.map(row => [row.tick, row.side, row.wallAfter]))
      .toEqual([[8, 'defender', 100], [9, 'defender', 41]]);
    expect(view(inside, commander)?.rounds.map(row => [row.tick, row.side, row.wallAfter]))
      .toEqual([[8, 'attacker', 100], [9, 'attacker', 41]]);
    const ally = actualSiege(inside).theatre?.rounds[0].attackers.find(row => row.sectId !== actualSiege(inside).attackerSectId);
    expect(ally).toBeDefined();
    expect(view(inside, ally!.actorId)?.rounds[0].side).toBe('attacker');
    expect(projectSiegeWitness(inside, actualSiege(inside), siegeActor(outside, patriarch))).toBeUndefined();
    expect(projectSiegeWitness(inside, { ...actualSiege(inside) }, siegeActor(inside, patriarch))).toBeUndefined();
  });

  it('keeps actual public walls but withholds unsourced self effects and any disputed/private round', () => {
    const { inside } = lateFighterBattle();
    const siege = actualSiege(inside);
    const actor = siegeActor(inside, patriarch);
    const round = siege.theatre!.rounds[0];
    const original = inside.events.find(row => row.id === round.sourceEventId)!;
    const front = inside.events.find(row => row.id === `evt-${round.tick}-${siege.id}-front-theatre`)!;
    const expectedDamage = round.clash!.defenderDamage;
    expect(projectSiegeWitness(inside, siege, actor)?.rounds[0].selfDamage).toBe(expectedDamage);
    const hiddenFront = { ...inside, events: inside.events.map(row => row === front ? { ...row, witnessScope: 'participants' as const } : row) };
    expect(projectSiegeWitness(hiddenFront, siege, actor)?.rounds[0]).toMatchObject({ tick: 8, wallAfter: 100 });
    expect(projectSiegeWitness(hiddenFront, siege, actor)?.rounds[0].selfDamage).toBeUndefined();
    const duplicate = { ...inside, events: [...inside.events, { ...original }] };
    expect(projectSiegeWitness(duplicate, siege, actor)?.rounds.map(row => row.tick)).toEqual([9]);
    const wrongDate = { ...inside, events: inside.events.map(row => row === original ? { ...row, year: row.year + 1 } : row) };
    expect(projectSiegeWitness(wrongDate, siege, actor)?.rounds.map(row => row.tick)).toEqual([9]);
    expect(projectSiegeWitness(inside, siege, actor, inside.tick + 1)).toBeUndefined();
    const missingArrival = { ...inside, events: inside.events.filter(event =>
      event.id !== roundEventId(siege.theatre!.arrivedTick!, siege.id)) };
    expect(projectSiegeWitness(missingArrival, siege, actor)).toBeUndefined();
  });

  it('shows a genuinely paid personal guard only to the original fighter who paid', () => {
    const first = siegeTurn(actualGrandSiege().arrived);
    const originalSiege = actualSiege(first);
    expect(possessAvatar(first, patriarch)).toBe(true);
    const paid = siegeTurn(queueGrandSiegeHero(first, patriarch, originalSiege.id, 'leader-last-stand'));
    const held = siegeTurn(queueGrandSiegeHero(first, patriarch, originalSiege.id, 'hold'));
    const siege = actualSiege(paid);
    const row = projectSiegeWitness(paid, siege, siegeActor(paid, patriarch))?.rounds.find(round => round.tick === paid.tick);
    expect(row?.selfGuard).toEqual({ move: 'leader-last-stand', paidQi: 18, paidHp: 12, wallSaved: siege.theatre?.rounds[1].hero?.wallSaved });
    expect(projectSiegeWitness(paid, siege, siegeActor(paid, disciple))?.rounds.some(round => !!round.selfGuard)).toBe(false);
    expect(projectSiegeWitness(held, actualSiege(held), siegeActor(held, patriarch))?.rounds.some(round => !!round.selfGuard)).toBe(false);
  });
});
