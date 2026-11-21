import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { activeRelicResonance, equippedArtifact, lootStorageRing } from '../src/engine/artifactEngine';
import { advanceEstates } from '../src/engine/estateEngine';
import { advanceRelicExhibits, availableRelicExhibitActions, RELIC_EXHIBIT_DURATION, resolveRelicExhibitAction,
  visibleRelicExhibits } from '../src/engine/relicExhibitEngine';
import { resolveRelicAction } from '../src/engine/relicEngine';
import type { Cultivator, RelicExhibitMove } from '../src/types/world';

function fixture() {
  const world = createInitialWorld(113);
  const sect = world.sects.find(({ facilities }) => facilities.scripture_pavilion > 0)!;
  const hall = world.locations.find(({ id }) => id === sect.headquartersId)!;
  const host = world.cultivators.find(({ id }) => id === sect.leaderId)!;
  const [owner, visitor, remote] = world.cultivators.filter(({ id }) => id !== host.id);
  const wild = world.relics.fragments.find(({ slot }) => slot === 'frame')!.source.locationId;
  owner.locationId = wild;
  for (const fragment of world.relics.fragments.filter(({ source }) => source.locationId === wild)) {
    expect(resolveRelicAction(world, owner, { chosenAction: 'RELIC', relicMove: 'recover', targetRelicFragmentId: fragment.id,
      innerMonologue: '' })).not.toBeNull();
  }
  owner.locationId = hall.id;
  host.locationId = hall.id;
  visitor.locationId = hall.id;
  remote.locationId = world.locations.find(({ id }) => id !== hall.id)!.id;
  hall.furnaceGrade = 2;
  owner.spiritStones = 300;
  owner.herbs.earth_root = 8;
  expect(resolveRelicAction(world, owner, { chosenAction: 'RELIC', relicMove: 'assemble', targetRelicSetId: 'star-balance',
    innerMonologue: '' })).not.toBeNull();
  const item = owner.artifacts.find(({ relicSetId }) => relicSetId === 'star-balance')!;
  owner.artifacts = [item];
  item.boundTo = owner.id;
  item.durability = 71;
  item.resonance = 38;
  item.soul = { name: '原器灵', experience: 17 };
  const move = (actor: Cultivator, exhibitMove: RelicExhibitMove, ref = exhibitMove === 'offer' ? item.id! : 'exhibit-1') =>
    resolveRelicExhibitAction(world, actor, { chosenAction: 'RELIC_EXHIBIT', exhibitMove, innerMonologue: '',
      ...(exhibitMove === 'offer' ? { targetArtifactId: ref } : { targetRelicExhibitId: ref }) });
  const open = () => { expect(move(owner, 'offer')).not.toBeNull(); expect(move(host, 'accept')).not.toBeNull(); return world.relicExhibits.entries[0]; };
  return { world, owner, host, visitor, remote, sect, hall, item, move, open };
}

describe('temporary relic exhibition custody', () => {
  it('only transfers a provenance-backed original on independent local host consent and exposes a redacted local summary', () => {
    const { world, owner, host, visitor, remote, item, move } = fixture();
    expect(equippedArtifact(owner)).toBe(item);
    expect(activeRelicResonance(owner)).toBeGreaterThan(0);
    const fake = { ...item, id: 'never-produced-from-its-fragments' };
    owner.artifacts.push(fake);
    expect(move(owner, 'offer', fake.id)).toBeNull();
    expect(move(owner, 'offer')).toMatchObject({ witnessScope: 'participants' });
    expect(move(owner, 'offer')).toBeNull();
    expect(equippedArtifact(owner)).toBe(item);
    expect(visibleRelicExhibits(world, visitor)).toEqual([]);
    expect(move(visitor, 'accept')).toBeNull();
    host.locationId = remote.locationId;
    expect(move(host, 'accept')).toBeNull();
    host.locationId = owner.locationId;
    owner.artifacts.pop();
    expect(availableRelicExhibitActions(host, world).map(({ exhibitMove }) => exhibitMove)).toEqual(['decline', 'accept']);
    expect(move(host, 'accept')).not.toBeNull();
    expect(move(host, 'accept')).toBeNull();
    expect(equippedArtifact(owner)).toBeUndefined();
    expect(activeRelicResonance(owner)).toBe(0);
    expect(world.relicExhibits.entries[0].custody).toBe(item);
    const [publicView] = visibleRelicExhibits(world, visitor);
    expect(publicView).toEqual({ scope: 'public', id: 'exhibit-1', siteId: owner.locationId,
      setId: 'star-balance', acceptedTick: world.tick, expiresTick: world.tick + RELIC_EXHIBIT_DURATION, sourceKinds: ['wild_cache'] });
    expect(visibleRelicExhibits(world, remote)).toEqual([]);
    expect(visibleRelicExhibits(world, owner)[0]).toMatchObject({ scope: 'participant', ownerId: owner.id, artifactId: item.id });
    expect(visibleRelicExhibits(world, host)[0]).not.toHaveProperty('custody');
  });

  it('expires once, preserving unchanged physical condition while not replacing a new bound artifact', () => {
    const { world, owner, item, open } = fixture();
    const exhibit = open();
    const newBound = { id: 'cur-mantle', name: '新披风', spiritRoot: item.spiritRoot, boundTo: owner.id };
    owner.artifacts.push(newBound);
    world.tick = exhibit.expiresTick! - 1;
    expect(advanceRelicExhibits(world)).toEqual([]);
    expect(owner.artifacts).toEqual([newBound]);
    world.tick += 1;
    expect(advanceRelicExhibits(world)).toHaveLength(1);
    expect(exhibit).toMatchObject({ status: 'closed', closeReason: 'term_complete', closedTick: world.tick });
    expect(exhibit.custody).toBeUndefined();
    expect(owner.artifacts).toEqual([newBound, item]);
    expect(item).toMatchObject({ durability: 71, resonance: 38, soul: { name: '原器灵', experience: 17 } });
    expect(item.boundTo).toBeUndefined();
    expect(equippedArtifact(owner)).toBe(newBound);
    expect(advanceRelicExhibits(world)).toEqual([]);
    expect(owner.artifacts).toHaveLength(2);
  });

  it('distinguishes pending decline and documented title breach, without manufacturing another relic', () => {
    const { world, owner, host, hall, item, move } = fixture();
    expect(move(owner, 'offer')).not.toBeNull();
    expect(move(host, 'decline')).not.toBeNull();
    expect(world.relicExhibits.entries[0]).toMatchObject({ status: 'closed', closeReason: 'declined' });
    expect(owner.artifacts).toEqual([item]);
    expect(move(owner, 'offer')).not.toBeNull();
    expect(move(host, 'accept', 'exhibit-2')).not.toBeNull();
    delete hall.ownerSectId;
    expect(advanceRelicExhibits(world)).toHaveLength(1);
    expect(world.relicExhibits.entries[1]).toMatchObject({ status: 'closed', closeReason: 'host_breach' });
    expect(owner.artifacts).toEqual([item]);
    expect(item.boundTo).toBe(owner.id);
    expect(advanceRelicExhibits(world)).toEqual([]);
  });

  it('does not let an estate or a duel loot an exhibited original twice and follows actual probate', () => {
    const { world, owner, visitor, remote, item, open } = fixture();
    const exhibit = open();
    owner.namedHeirId = visitor.id;
    owner.alive = false;
    owner.hp = 0;
    expect(lootStorageRing(remote, owner).artifacts).toBe(0);
    expect(remote.artifacts).not.toContain(item);
    expect(advanceRelicExhibits(world)).toHaveLength(1);
    expect(exhibit).toMatchObject({ status: 'closed', closeReason: 'owner_died' });
    expect(owner.artifacts).toEqual([item]);
    advanceEstates(world);
    const estate = world.estates.entries.find(({ deceasedId }) => deceasedId === owner.id)!;
    expect(estate.holdings.artifacts).toEqual([item]);
    expect(owner.artifacts).toEqual([]);
    expect(exhibit.custody).toBeUndefined();
    world.tick = estate.closesTick;
    advanceRelicExhibits(world);
    advanceEstates(world);
    expect(estate.holdings.artifacts).toEqual([]);
    expect(estate.distributed.artifactIds).toContain(item.id);
    expect(visitor.artifacts.filter(({ id }) => id === item.id)).toEqual([item]);
    expect(visibleRelicExhibits(world, visitor)).toEqual([]);
  });
});
