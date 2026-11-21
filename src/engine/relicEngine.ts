import type { Cultivator, LLMDecisionPayload, LocationNode, RelicFragment, RelicMove, RelicSetId, RelicSlot,
  RelicState, WorldEvent, WorldOccasion, WorldState } from '../types/world';

const SET: RelicSetId = 'star-balance';
const SLOTS: readonly RelicSlot[] = ['frame', 'core'];
export const RELIC_SETS: Record<RelicSetId, { name: string; slots: Record<RelicSlot, string>; stoneCost: number; earthCost: number; furnaceGrade: number }> = {
  [SET]: { name: '星衡合璧', slots: { frame: '星衡外环', core: '灵纹内芯' }, stoneCost: 120, earthCost: 2, furnaceGrade: 2 },
};
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

export interface RelicOption {
  action: 'RELIC';
  relicMove: RelicMove;
  targetRelicFragmentId?: string;
  targetRelicSetId?: RelicSetId;
}

function hash(seed: number, key: string): number {
  let n = seed >>> 0;
  for (let i = 0; i < key.length; i++) n = Math.imul(n ^ key.charCodeAt(i), 0x9e3779b1);
  n = Math.imul(n ^ (n >>> 16), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}

function compactId(seed: number, key: readonly string[]): string {
  const forward = JSON.stringify(key);
  const back = JSON.stringify([...key].reverse());
  return `${hash(seed, forward).toString(16).padStart(8, '0')}${hash(seed ^ 0xd451c3a9, back).toString(16).padStart(8, '0')}`;
}

/** Set finite initial finds only at actual terrain sites. Site storage is their single custody ledger. */
export function createRelicState(locations: LocationNode[], seed: number): RelicState {
  const wilderness = locations.filter((site) => !site.ownerSectId && (site.type === 'spirit_vein' || site.type === 'secret_realm'))
    .sort(byId);
  return { fragments: wilderness.flatMap((site) => {
    const slots = hash(seed, site.id) % 2 ? [...SLOTS].reverse() : SLOTS;
    return slots.map((slot): RelicFragment => ({
      id: `fragment-cache-${compactId(seed, [site.id, slot])}`, setId: SET, slot,
      source: { kind: 'wild_cache', tick: 1, locationId: site.id },
      holder: { kind: 'site', id: site.id },
    }));
  }) };
}

/** Restrict NPC or selected-inspector uses to things this actor actually carries. */
export function heldRelicFragments(world: WorldState, actorId: string): RelicFragment[] {
  return world.relics.fragments.filter((fragment) => fragment.holder.kind === 'actor' && fragment.holder.id === actorId).sort(byId);
}

function findPair(world: WorldState, actorId: string, setId: RelicSetId): [RelicFragment, RelicFragment] | undefined {
  const held = heldRelicFragments(world, actorId).filter((fragment) => fragment.setId === setId);
  const frame = held.find(({ slot }) => slot === 'frame');
  const core = held.find(({ slot, id }) => slot === 'core' && id !== frame?.id);
  return frame && core ? [frame, core] : undefined;
}

function event(world: WorldState, key: string, title: string, description: string, actorId: string, locationId: string): WorldEvent {
  return { id: `evt-${world.tick}-${key}`, tick: world.tick, year: world.year, month: world.month, category: 'breakthrough',
    title, description, actorIds: [actorId], locationId };
}

export function availableRelicActions(actor: Cultivator, world: WorldState): RelicOption[] {
  if (!live(actor) || !world.cultivators.includes(actor)) return [];
  const site = world.locations.find(({ id }) => id === actor.locationId);
  if (!site) return [];
  const held = heldRelicFragments(world, actor.id);
  const options: RelicOption[] = world.relics.fragments.filter((fragment) => fragment.holder.kind === 'site' &&
    fragment.holder.id === site.id && !held.some((owned) => owned.setId === fragment.setId && owned.slot === fragment.slot))
    .sort(byId).map(({ id }) => ({ action: 'RELIC', relicMove: 'recover', targetRelicFragmentId: id }));
  const rules = RELIC_SETS[SET];
  if (site.furnaceGrade >= rules.furnaceGrade && actor.spiritStones >= rules.stoneCost &&
      actor.herbs.earth_root >= rules.earthCost && findPair(world, actor.id, SET)) {
    options.push({ action: 'RELIC', relicMove: 'assemble', targetRelicSetId: SET });
  }
  return options;
}

function uniqueAssemblyId(world: WorldState, pair: [RelicFragment, RelicFragment]): string {
  const base = `artifact-set-${SET}-${compactId(world.random.seed, pair.map(({ id }) => id))}`;
  const used = new Set(world.relics.fragments.filter((fragment) => fragment.holder.kind === 'consumed').map((fragment) => fragment.holder.id));
  for (const actor of world.cultivators) for (const artifact of actor.artifacts) if (artifact.id) used.add(artifact.id);
  for (const estate of world.estates.entries) for (const artifact of estate.holdings.artifacts) if (artifact.id) used.add(artifact.id);
  let id = base, counter = 1;
  while (used.has(id)) id = `${base}-${++counter}`;
  return id;
}

export function resolveRelicAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'RELIC') return null;
  const option = availableRelicActions(actor, world).find((item) => item.relicMove === decision.relicMove &&
    item.targetRelicFragmentId === decision.targetRelicFragmentId && item.targetRelicSetId === decision.targetRelicSetId);
  if (!option) return null;
  if (option.relicMove === 'recover') {
    const fragment = world.relics.fragments.find(({ id }) => id === option.targetRelicFragmentId)!;
    fragment.holder = { kind: 'actor', id: actor.id };
    return event(world, `recover-${fragment.id}-${actor.id}`, '拾得遗器碎片',
      `${actor.name}从现场存量取出${RELIC_SETS[fragment.setId].slots[fragment.slot]}，只转移一次归属。`, actor.id, actor.locationId);
  }
  const pair = findPair(world, actor.id, SET)!;
  const rules = RELIC_SETS[SET];
  const id = uniqueAssemblyId(world, pair);
  actor.spiritStones -= rules.stoneCost;
  actor.herbs.earth_root -= rules.earthCost;
  for (const item of pair) item.holder = { kind: 'consumed', id };
  actor.artifacts.push({ id, name: rules.name, spiritRoot: '雷', tier: '灵器', durability: 100, maxDurability: 100, resonance: 0,
    relicSetId: SET, relicFragmentIds: [pair[0].id, pair[1].id] });
  return event(world, `assemble-${id}`, '遗器合璧重铸',
    `${actor.name}在合用炉中消耗两枚互补碎片、${rules.stoneCost}灵石及${rules.earthCost}份玄土根，将${rules.name}铸成一件实物，仍须认主装备。`,
    actor.id, actor.locationId);
}

/** Hook after the real expedition result and its canonical event are instantiated. */
export function grantExpeditionRelic(world: WorldState, occasion: WorldOccasion, actor: Cultivator, source: WorldEvent): WorldEvent | null {
  if (occasion.kind !== 'expedition' || !world.occasions.includes(occasion) || !live(actor) || !world.cultivators.includes(actor) ||
      !occasion.participantIds.includes(actor.id) || source.locationId !== occasion.locationId || !source.actorIds.includes(actor.id) ||
      source.tick !== world.tick || source.category !== 'heavenly' || source.id !== `evt-${world.tick}-${occasion.id}-expedition-${actor.id}` ||
      !occasion.expeditions.some((result) => result.cultivatorId === actor.id && result.tick === source.tick && result.outcome === 'loot')) return null;
  const id = `fragment-expedition-${compactId(world.random.seed, [occasion.id, actor.id])}`;
  if (world.relics.fragments.some((fragment) => fragment.id === id || (fragment.source.kind === 'expedition' &&
    fragment.source.occasionId === occasion.id && fragment.source.eventId === source.id))) return null;
  const owned = new Set(heldRelicFragments(world, actor.id).filter(({ setId }) => setId === SET).map(({ slot }) => slot));
  const missing = SLOTS.filter((slot) => !owned.has(slot));
  const options = missing.length ? missing : SLOTS;
  const slot = options[hash(world.random.seed, id) % options.length];
  world.relics.fragments.push({ id, setId: SET, slot, source: { kind: 'expedition', locationId: occasion.locationId,
    tick: source.tick, eventId: source.id, occasionId: occasion.id }, holder: { kind: 'actor', id: actor.id } });
  const obtained = event(world, `expedition-find-${id}`, '秘境实录添入遗器碎片',
    `${actor.name}依本次秘境实录带回${RELIC_SETS[SET].slots[slot]}，同次结果不重复获领。`, actor.id, occasion.locationId);
  if (source.witnessScope === 'participants') obtained.witnessScope = 'participants';
  return obtained;
}

export function transferLootedRelics(world: WorldState, winner: Cultivator, loser: Cultivator, source: WorldEvent): number {
  if (!live(winner) || loser.alive || loser.hp > 0 || !world.cultivators.includes(winner) || !world.cultivators.includes(loser) ||
      source.tick !== world.tick || source.category !== 'death' || source.duelWinnerId !== winner.id ||
      !source.actorIds.includes(winner.id) || !source.actorIds.includes(loser.id)) return 0;
  const items = heldRelicFragments(world, loser.id);
  for (const item of items) item.holder = { kind: 'actor', id: winner.id };
  return items.length;
}

/** Move remaining, unconsumed fragments along the same actual probate result as the storage ring. */
export function reconcileRelicCustody(world: WorldState): void {
  const actors = new Map(world.cultivators.map((actor) => [actor.id, actor]));
  const byDead = new Map(world.estates.entries.map((estate) => [estate.deceasedId, estate]));
  const estates = new Map(world.estates.entries.map((estate) => [estate.id, estate]));
  const sites = new Set(world.locations.map(({ id }) => id));
  for (const item of world.relics.fragments) {
    if (item.holder.kind !== 'actor' && item.holder.kind !== 'estate') continue;
    const traversed = new Set<string>();
    while (item.holder.kind === 'actor' || item.holder.kind === 'estate') {
      const token = `${item.holder.kind}:${item.holder.id}`;
      if (traversed.has(token)) break;
      traversed.add(token);
      if (item.holder.kind === 'actor') {
        const actor = actors.get(item.holder.id);
        const estate = actor && !actor.alive ? byDead.get(actor.id) : undefined;
        if (!estate) break;
        item.holder = { kind: 'estate', id: estate.id };
      } else {
        const estate = estates.get(item.holder.id);
        if (!estate || estate.status === 'open') break;
        if (estate.status === 'unclaimed') {
          if (sites.has(estate.locationId)) item.holder = { kind: 'site', id: estate.locationId };
          break;
        }
        if (!estate.beneficiaryId || !actors.has(estate.beneficiaryId)) break;
        item.holder = { kind: 'actor', id: estate.beneficiaryId };
      }
    }
  }
}
