import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HouseholdNamePanel, HouseholdNameResults } from '../src/components/HouseholdNamePanel';
import { createInitialWorld } from '../src/data/initialWorld';
import { lookupHouseholdNames } from '../src/engine/householdNameEngine';

function fixture() {
  const world = createInitialWorld(98);
  world.tick = 20;
  const [viewer, visitor, remote] = world.cultivators;
  const village = world.settlements.villages[0];
  const region = world.locations.find(({ id }) => id === village.locationId)!;
  const otherwise = world.locations.find(({ id }) => id !== region.id)!;
  viewer.locationId = visitor.locationId = region.id;
  remote.locationId = otherwise.id;
  visitor.name = remote.name = '同名家户';
  const [living, deceased] = village.volunteers;
  living.name = deceased.name = '同名家户';
  const marker = world.households.members.find(({ volunteerId }) => volunteerId === deceased.id)!;
  const corpse = { ...structuredClone(remote), id: `recruit-${deceased.id}`, alive: false, hp: 0 };
  world.cultivators.push(corpse);
  deceased.enlistedCultivatorId = corpse.id;
  marker.status = 'deceased';
  marker.recruitedId = corpse.id;
  marker.settledTick = 19;
  world.householdNames.entries = [{
    id: 'raw-unconsented-alias', actorId: corpse.id, volunteerId: deceased.id, householdId: marker.householdId,
    settlementId: village.id, kind: 'alias', alias: '未核验的新称名', openedTick: 19, expiresTick: 22, status: 'proposed',
  }];
  const panel = (actor = viewer) => renderToStaticMarkup(<HouseholdNamePanel world={world} cultivator={actor} settlementId={village.id} />);
  return { world, viewer, remote, visitor, village, living, deceased, panel };
}

describe('onsite explicit household name lookup', () => {
  it('initially renders only a closed lookup; even a prior known outsider receives no village-wide register', () => {
    const { remote, panel } = fixture();
    const markup = panel();
    expect(markup).toMatch(/<details class="[^"]+"><summary class="[^"]+">家户称名与同名核验/);
    expect(markup).toContain('姓名或已核验称名');
    expect(markup).toContain('核验本地称名');
    expect(markup).toContain('同名者按各自来历列册，亲缘另有记载');
    expect(markup).not.toContain('同名家户');
    expect(panel(remote)).toBe('');
  });

  it('renders three distinct same-name identities only from local results; detached and unknown input never merges', () => {
    const { world, viewer, remote, village, living, deceased, visitor } = fixture();
    const lookup = lookupHouseholdNames(world, viewer, village.id, '同名家户');
    const markup = renderToStaticMarkup(<HouseholdNameResults result={lookup} />);
    expect(lookup.status).toBe('ambiguous');
    expect(lookup.matches).toHaveLength(3);
    expect(new Set(lookup.matches.map(({ id }) => id)).size).toBe(3);
    expect(lookup.matches.some(({ actorId }) => actorId === remote.id)).toBe(false);
    expect(markup).toContain('同名身份尚未核并');
    expect(markup).toContain('当地在籍居民');
    expect(markup).toContain('已故留档');
    expect(markup).toContain('同名到访，身份未核并');
    for (const forbidden of [living.id, deceased.id, visitor.id]) expect(markup).not.toContain(forbidden);
    const unknown = lookupHouseholdNames(world, viewer, village.id, '未核验的新称名');
    expect(unknown).toMatchObject({ status: 'unresolved', matches: [] });
    const failure = renderToStaticMarkup(<HouseholdNameResults result={unknown} />);
    expect(failure).toContain('未核验者不合并');
    expect(failure).not.toContain('相符的独立本地记录');
  });
});
