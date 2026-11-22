import {onLowerPlane} from './upperPassageIsolation';
import type { Cultivator, EstateAssets, EstateEligibility, EstateRecord, EstateState, HerbId, LLMDecisionPayload, PillId, WorldEvent, WorldState } from '../types/world';

const PROBATE_TICKS = 5;
const MEMORIAL_TICKS = 12;
const MEMORIAL_GROWTH = 4;
const HERBS: HerbId[] = ['jade_leaf', 'earth_root', 'star_bloom', 'shadow_moss'];
const PILLS: PillId[] = ['foundation', 'golden', 'barrier', 'heart_poison'];
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
const edgeBetween = (world: WorldState, a: string, b: string) => world.relationships.find((edge) =>
  (edge.fromId === a && edge.toId === b) || (edge.fromId === b && edge.toId === a));

export type EstateOption =
  | { action: 'NAME_HEIR'; targetCultivatorId: string; targetEstateId?: never }
  | { action: 'CLAIM_ESTATE' | 'HOLD_MEMORIAL'; targetEstateId: string; targetCultivatorId?: never };

export const createEstateState = (): EstateState => ({ entries: [] });
function emptyAssets(): EstateAssets {
  return { stones: 0, herbs: { jade_leaf: 0, earth_root: 0, star_bloom: 0, shadow_moss: 0 },
    pills: { foundation: 0, golden: 0, barrier: 0, heart_poison: 0 }, artifacts: [] };
}
function hasAssets(assets: EstateAssets): boolean {
  return assets.stones > 0 || HERBS.some((herb) => assets.herbs[herb] > 0) ||
    PILLS.some((pill) => assets.pills[pill] > 0) || assets.artifacts.length > 0;
}

function eligibility(world: WorldState, deceased: Cultivator, actor: Cultivator): EstateEligibility | undefined {
  if (!live(actor) || actor.id === deceased.id) return undefined;
  if (deceased.namedHeirId === actor.id) return { actorId: actor.id, basis: 'nomination', strength: 100 };
  const edge = edgeBetween(world, deceased.id, actor.id);
  if (edge && edge.affinity >= 55 && edge.type !== '血仇' && edge.type !== '竞争') {
    const formal = edge.type === '师徒' || edge.type === '道侣';
    return { actorId: actor.id, basis: 'bond', strength: Math.min(97, Math.floor(edge.affinity * .75 + (formal ? 22 : 10))) };
  }
  if (deceased.sectId && deceased.sectId === actor.sectId &&
      ['掌门', '太上长老', '长老'].includes(actor.sectRank) && (!edge || edge.affinity >= 0)) {
    return { actorId: actor.id, basis: 'sect', strength: actor.sectRank === '掌门' ? 30 : actor.sectRank === '太上长老' ? 26 : 20 };
  }
}

function event(world: WorldState, estate: EstateRecord, suffix: string, title: string, description: string, actorIds: string[]): WorldEvent {
  return { id: `evt-${world.tick}-${estate.id}-${suffix}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds, locationId: estate.locationId, category: 'diplomacy' };
}

/** Drain only holdings actually remaining on the corpse after combat loot and other transfers. */
function takeResidual(estate: EstateRecord, deceased: Cultivator): void {
  estate.holdings.stones += deceased.spiritStones;
  deceased.spiritStones = 0;
  for (const herb of HERBS) {
    estate.holdings.herbs[herb] += deceased.herbs[herb];
    deceased.herbs[herb] = 0;
  }
  for (const pill of PILLS) {
    estate.holdings.pills[pill] += deceased.pills[pill];
    deceased.pills[pill] = 0;
  }
  const artifacts = deceased.artifacts.splice(0);
  for (const item of artifacts) {
    if (!item.id) {
      const index = estate.distributed.artifactIds.length + estate.holdings.artifacts.length + 1;
      item.id = `artifact-${estate.id}-${index}`;
    }
    delete item.boundTo;
    if (item.resonance !== undefined) item.resonance = 0;
    estate.holdings.artifacts.push(item);
  }
}

export function captureEstate(world: WorldState, deceased: Cultivator): WorldEvent | null {
  if (deceased.alive || !onLowerPlane(deceased) || !world.cultivators.includes(deceased) || world.estates.entries.some(({ deceasedId }) => deceasedId === deceased.id)) return null;
  const sect = world.sects.find(({ id }) => id === deceased.sectId);
  const locationId = world.locations.find(({ id }) => id === deceased.locationId)?.id ??
    world.locations.find(({ id }) => id === sect?.headquartersId)?.id ?? [...world.locations].sort(byId)[0]?.id;
  if (!locationId) return null;
  const account = emptyAssets();
  const estate: EstateRecord = {
    id: `estate-${deceased.id}`, deceasedId: deceased.id, locationId, openedTick: world.tick, closesTick: world.tick + PROBATE_TICKS,
    ...(deceased.namedHeirId ? { namedHeirId: deceased.namedHeirId } : {}), ...(sect ? { sponsorSectId: sect.id } : {}),
    status: 'open', holdings: emptyAssets(), distributed: { stones: 0, herbs: account.herbs, pills: account.pills, artifactIds: [] },
    eligibleHeirs: world.cultivators.map((actor) => eligibility(world, deceased, actor))
      .filter((candidate): candidate is EstateEligibility => candidate !== undefined)
      .sort((a, b) => b.strength - a.strength || a.actorId.localeCompare(b.actorId)),
    claims: [],
  };
  takeResidual(estate, deceased);
  world.estates.entries.push(estate);
  return event(world, estate, 'opened', '遗产封存立案', `${deceased.name}身后的实存财物已登记封存，核验过的战利品不重复记入遗产。`, [deceased.id]);
}

export function visibleEstates(world: WorldState, actor?: Cultivator): EstateRecord[] {
  return world.estates.entries.filter((entry) => !actor || entry.deceasedId === actor.id ||
    (live(actor) && entry.locationId === actor.locationId && world.locations.some(({ id }) => id === entry.locationId)));
}

function mourners(world: WorldState, estate: EstateRecord, actor: Cultivator): Cultivator[] {
  return [actor, ...world.cultivators.filter((person) => person.id !== actor.id && live(person) && person.locationId === estate.locationId &&
    estate.eligibleHeirs.some(({ actorId }) => actorId === person.id)).sort(byId).slice(0, 7)];
}

export function availableEstateActions(actor: Cultivator, world: WorldState, includeNomination = true): EstateOption[] {
  if (!live(actor) || !world.cultivators.includes(actor) || !world.locations.some(({ id }) => id === actor.locationId)) return [];
  const choices: EstateOption[] = [];
  const heirs = !includeNomination ? [] : world.cultivators.filter((candidate) => {
    if (!live(candidate) || candidate.id === actor.id || candidate.id === actor.namedHeirId || candidate.locationId !== actor.locationId) return false;
    const bond = edgeBetween(world, actor.id, candidate.id);
    return (bond && bond.affinity >= 45 && bond.type !== '血仇' && bond.type !== '竞争') ||
      (actor.sectId && actor.sectId === candidate.sectId && (!bond || bond.affinity >= 0));
  }).sort(byId);
  for (const heir of heirs) choices.push({ action: 'NAME_HEIR', targetCultivatorId: heir.id });
  for (const estate of visibleEstates(world, actor)) {
    if (!estate.eligibleHeirs.some(({ actorId }) => actorId === actor.id)) continue;
    if (estate.status === 'open' && world.tick < estate.closesTick && !estate.claims.some(({ actorId }) => actorId === actor.id)) {
      choices.push({ action: 'CLAIM_ESTATE', targetEstateId: estate.id });
    }
    if (!estate.memorial && world.tick < estate.openedTick + MEMORIAL_TICKS && mourners(world, estate, actor).length >= 2) {
      choices.push({ action: 'HOLD_MEMORIAL', targetEstateId: estate.id });
    }
  }
  return choices;
}

export function resolveEstateAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  const choice = availableEstateActions(actor, world).find((entry) => entry.action === decision.chosenAction &&
    (entry.action === 'NAME_HEIR' ? entry.targetCultivatorId === decision.targetCultivatorId : entry.targetEstateId === decision.targetEstateId));
  if (!choice) return null;
  if (choice.action === 'NAME_HEIR') {
    const heir = world.cultivators.find(({ id }) => id === choice.targetCultivatorId)!;
    actor.namedHeirId = heir.id;
    return { id: `evt-${world.tick}-will-${actor.id}-${heir.id}`, tick: world.tick, year: world.year, month: world.month,
      title: '指定遗产继承人', description: `${actor.name}在生前列明${heir.name}为继承人。`, actorIds: [actor.id, heir.id],
      locationId: actor.locationId, category: 'diplomacy', witnessScope: 'participants' };
  }
  const estate = world.estates.entries.find(({ id }) => id === choice.targetEstateId)!;
  if (choice.action === 'CLAIM_ESTATE') {
    const record = estate.eligibleHeirs.find(({ actorId }) => actorId === actor.id)!;
    estate.claims.push({ ...record, tick: world.tick });
    return event(world, estate, `claim-${actor.id}`, '遗产申领登记', `${actor.name}提交生前提名、旧交或宗门资格中的可核验凭据。`, [actor.id, estate.deceasedId]);
  }
  const attendees = mourners(world, estate, actor);
  let relationshipImpacts = 0;
  for (const witness of attendees.slice(1)) {
    const existing = edgeBetween(world, actor.id, witness.id);
    if (existing) {
      const prior = existing.affinity;
      existing.affinity = Math.min(100, existing.affinity + MEMORIAL_GROWTH);
      if (existing.affinity !== prior) relationshipImpacts++;
    } else {
      world.relationships.push({ fromId: actor.id, toId: witness.id,
        type: actor.sectId && actor.sectId === witness.sectId ? '同门' : '挚友', affinity: MEMORIAL_GROWTH, note: '同赴归葬祭礼' });
      relationshipImpacts++;
    }
  }
  estate.memorial = { tick: world.tick, organizerId: actor.id, attendeeIds: attendees.map(({ id }) => id), relationshipImpacts };
  return event(world, estate, 'memorial', '故人归葬纪念', `${actor.name}主持归葬祭礼，共${attendees.length}名旧识到场；${relationshipImpacts}段生者关系因共祭缓和。`,
    [...estate.memorial.attendeeIds, estate.deceasedId]);
}

function distribute(estate: EstateRecord, heir: Cultivator): void {
  heir.spiritStones += estate.holdings.stones;
  estate.distributed.stones += estate.holdings.stones;
  estate.holdings.stones = 0;
  for (const herb of HERBS) {
    heir.herbs[herb] += estate.holdings.herbs[herb];
    estate.distributed.herbs[herb] += estate.holdings.herbs[herb];
    estate.holdings.herbs[herb] = 0;
  }
  for (const pill of PILLS) {
    heir.pills[pill] += estate.holdings.pills[pill];
    estate.distributed.pills[pill] += estate.holdings.pills[pill];
    estate.holdings.pills[pill] = 0;
  }
  for (const item of estate.holdings.artifacts.splice(0)) {
    if (item.id) estate.distributed.artifactIds.push(item.id);
    heir.artifacts.push(item);
  }
}

export function advanceEstates(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  const dead = world.cultivators.filter((actor) => !actor.alive).sort(byId);
  const existing = new Map(world.estates.entries.map((estate) => [estate.deceasedId, estate]));
  for (const deceased of dead) {
    if (!existing.has(deceased.id)) {
      const opened = captureEstate(world, deceased);
      if (opened) events.push(opened);
    } else takeResidual(existing.get(deceased.id)!, deceased);
  }
  const estates = new Map(world.estates.entries.map((estate) => [estate.deceasedId, estate]));
  const persons = new Map(world.cultivators.map((actor) => [actor.id, actor]));
  for (const estate of estates.values()) {
    if (!world.locations.some(({ id }) => id === estate.locationId)) {
      const fallback = world.sects.find(({ id }) => id === estate.sponsorSectId)?.headquartersId;
      const available = world.locations.find(({ id }) => id === fallback) ?? [...world.locations].sort(byId)[0];
      if (available) estate.locationId = available.id;
    }
    if (estate.status !== 'open' || world.tick < estate.closesTick) continue;
    const eligibleLiving = (id: string) => {
      const candidate = persons.get(id);
      return candidate !== undefined && live(candidate);
    };
    const nominated = estate.namedHeirId && estate.eligibleHeirs.some(({ actorId }) => actorId === estate.namedHeirId) &&
      eligibleLiving(estate.namedHeirId) ? estate.namedHeirId : undefined;
    const adjudicated = [...estate.claims].filter(({ actorId }) => eligibleLiving(actorId)).sort((a, b) =>
      b.strength - a.strength || a.tick - b.tick || a.actorId.localeCompare(b.actorId))[0];
    const beneficiary = nominated ?? adjudicated?.actorId;
    estate.settledTick = world.tick;
    estate.status = beneficiary ? 'settled' : 'unclaimed';
    if (beneficiary) estate.beneficiaryId = beneficiary;
    events.push(event(world, estate, 'closed', beneficiary ? '遗产裁定归属' : '遗产无人申领',
      beneficiary ? `归属按${nominated ? '生前提名' : '有效凭据与申领顺序'}裁定，实物从封存账移交继承人。` :
        '复核期已满且无人具备有效申领资格；财物继续保存在无人继承的封存账中，不投入市场。',
      beneficiary ? [estate.deceasedId, beneficiary] : [estate.deceasedId]));
  }
  // A late refunded trade remains a real asset. Forward once through each settled estate;
  // where a former heir has since died, the next estate receives the actual asset, not a copy.
  function apply(estate: EstateRecord, chain: Set<string>): void {
    if (chain.has(estate.id) || estate.status !== 'settled' || !estate.beneficiaryId || !hasAssets(estate.holdings)) return;
    const heir = persons.get(estate.beneficiaryId);
    if (!heir) return;
    const successor = !heir.alive ? estates.get(heir.id) : undefined;
    if (!heir.alive && (!successor || chain.has(successor.id) || successor.id === estate.id)) return;
    chain.add(estate.id);
    distribute(estate, heir);
    if (estate.settledTick !== world.tick) events.push(event(world, estate, 'late-credit', '遗产补记交割',
      '原交易的后续交割或退回资产已纳入同一继承裁定，未重复估值。', [estate.deceasedId, heir.id]));
    if (successor) {
      takeResidual(successor, heir);
      apply(successor, chain);
    }
  }
  for (const estate of estates.values()) apply(estate, new Set());
  return events;
}
