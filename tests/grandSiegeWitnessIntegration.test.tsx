import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GrandSiegeMapScene } from '../src/components/GrandSiegeMapScene';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { projectGrandSiegeTheatres } from '../src/engine/grandSiegeTheatreEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { WorldState } from '../src/types/world';
import { actualGrandSiege, actualSiege, commander, disciple, patriarch, siegeActor, siegeTurn } from './grandSiegeNativeFixture';

const projected = (world: WorldState, id: string) => {
  const actor = siegeActor(world, id);
  return projectGrandSiegeTheatres(world, createTerrainMapView(world, actor, false), id)
    .find(row => row.siegeId === actualSiege(world).id);
};
const markup = (world: WorldState, actor = siegeActor(world, patriarch), personalOnly = false) =>
  renderToStaticMarkup(<GrandSiegeMapScene world={world} viewer={actor} fog={false} visible
    personalOnly={personalOnly} witnessScopeKey="main-view"/>);

describe('actual battlefield map and story surfaces share only local stamped testimony', () => {
  for (const mode of ['utility', 'deferred'] as const) {
    it(`projects the two sides from the same actual ${mode} month without altering it`, () => {
      const { arrived } = actualGrandSiege();
      expect(projected(arrived, patriarch)?.witness).toBeUndefined();
      const world = advanceWorldTick(arrived, Object.fromEntries(arrived.cultivators.map(actor => [actor.id,
        { chosenAction: 'REST', innerMonologue: '此处静坐。' }])), () => .5, mode);
      const before = structuredClone(world);
      const defender = projected(world, patriarch), attacker = projected(world, commander);
      expect(defender?.witness?.rounds).toEqual([expect.objectContaining({ round: 1, side: 'defender' })]);
      expect(attacker?.witness?.rounds).toEqual([expect.objectContaining({ round: 1, side: 'attacker' })]);
      expect(attacker?.round).toEqual(defender?.round);
      expect(markup(world, siegeActor(world, disciple), true)).toContain('亲历战报');
      const outside = world.cultivators.find(actor => ![...defender!.round!.attackers, ...defender!.round!.defenders]
        .some(fighter => fighter.actorId === actor.id))!;
      expect(markup(world, outside, true)).toBe('');
      expect(markup(world, outside)).not.toContain('亲历战报');
      expect(markup(world, siegeActor(arrived, patriarch))).toBe('');
      expect(world).toEqual(before);
    });
  }

  it('withholds the private replacement from both overview and actual witness projections on a sibling snapshot', () => {
    const { arrived } = actualGrandSiege();
    const world = siegeTurn(arrived);
    const theatre = actualSiege(world).theatre!;
    const round = theatre.rounds[0];
    const secret = structuredClone(world);
    const front = secret.events.find(event => event.id === `evt-${round.tick}-${actualSiege(world).id}-front-theatre`)!;
    expect(front).toBeDefined();
    front.witnessScope = 'participants';
    front.description = '只写给本分支当事人的密谈。';
    const original = projected(world, round.clash!.defenderId);
    const replaced = projected(secret, round.clash!.defenderId);
    expect(original?.round?.clash).toBeDefined();
    expect(original?.witness?.rounds[0].selfDamage).toBeGreaterThan(0);
    expect(replaced?.round?.wallBefore).toBe(original?.round?.wallBefore);
    expect(replaced?.round?.clash).toBeUndefined();
    expect(replaced?.witness?.rounds[0].selfDamage).toBeUndefined();
    expect(markup(secret)).not.toMatch(/实损|本分支当事人/u);
    const publicWall = secret.events.find(event => event.id === round.sourceEventId)!;
    publicWall.witnessScope = 'participants';
    expect(projected(secret, patriarch)?.round).toBeUndefined();
    expect(projected(secret, patriarch)?.witness).toBeUndefined();
    expect(markup(secret)).toContain('暂没有可核的公开战报');
    expect(markup(secret)).not.toContain('两边还未真正交手');
  });
});
