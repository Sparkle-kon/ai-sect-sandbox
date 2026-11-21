import type { Cultivator, FormationLink, FormationMove, FormationNetworkState, FormationReceipt, LLMDecisionPayload, LocationNode,
  Sect, WorldEvent, WorldState } from '../types/world';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { knownMapLocations, terrainTileAt } from './terrainEngine';

export const FORMATION_SETUP_COST = 24;
export const FORMATION_REPAIR_COST = 18;
export const FORMATION_DISPATCH_QI = 20;
export const FORMATION_OVERLOAD_QI = 40;
export const FORMATION_MAX_THROUGHPUT = 24;
export const FORMATION_BUFFER_CAP = 32;
export const FORMATION_DRAW_CAP = 16;
export const FORMATION_OFFER_TICKS = 3;
export const FORMATION_RECEIPT_LIMIT = 32;
const TERMINAL_HISTORY = 48;
const MAX_OFFERS_PER_ACTOR = 3;

export interface FormationOption {
  action: 'FORMATION_NETWORK';
  formationMove: FormationMove;
  targetSectId?: string;
  targetFormationLinkId?: string;
}
export type FormationAvailability = 'ready' | 'hostility' | 'relocating' | 'site_lost';
type Side = 'A' | 'B';
const sideFor = (link: FormationLink, sectId: string): Side | undefined => sectId === link.sectAId ? 'A' : sectId === link.sectBId ? 'B' : undefined;
const peer = (side: Side): Side => side === 'A' ? 'B' : 'A';
const siteAt = (link: FormationLink, side: Side) => side === 'A' ? link.siteAId : link.siteBId;
const heldAt = (link: FormationLink, side: Side) => side === 'A' ? link.heldA : link.heldB;
const changeHeld = (link: FormationLink, side: Side, amount: number) => { if (side === 'A') link.heldA += amount; else link.heldB += amount; };
const follow = (link: FormationLink, receipt: FormationReceipt) => { link.receipts.push(receipt); link.receipts = link.receipts.slice(-FORMATION_RECEIPT_LIMIT); };
const live = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const findSect = (world: WorldState, id: string) => world.sects.find((sect) => sect.id === id);
const findPerson = (world: WorldState, id: string | undefined) => world.cultivators.find((actor) => actor.id === id);
const relocating = (world: WorldState, sectId: string) => world.relocations.plans.some((plan) => plan.sectId === sectId && plan.status === 'in_transit');
const atWar = (world: WorldState, a: string, b: string) => world.diplomacy.some((row) => row.pact === 'war' &&
  ((row.sectAId === a && row.sectBId === b) || (row.sectAId === b && row.sectBId === a)));
const liveOffer = (world: WorldState, link: FormationLink) => link.status === 'offered' && link.openedTick <= world.tick && link.offerExpiresTick > world.tick;
const isSignedForm = (link: FormationLink) => link.status === 'active' || link.status === 'broken';

export const createFormationNetworkState = (): FormationNetworkState => ({ links: [], nextId: 1 });

function node(world: WorldState, sect: Sect | undefined, pinnedSiteId?: string): LocationNode | undefined {
  if (!sect || sect.facilities.qi_array < 1 || (pinnedSiteId !== undefined && pinnedSiteId !== sect.headquartersId)) return undefined;
  return world.locations.find((site) => site.id === sect.headquartersId && site.ownerSectId === sect.id && site.type !== 'secret_realm');
}

/** Fields follow the same canonical public coordinates in either direction; no hidden path selection. */
export function formationLinkSteps(world: WorldState, from: LocationNode, to: LocationNode): number | undefined {
  const first = terrainTileAt(world, from.x, from.y), last = terrainTileAt(world, to.x, to.y);
  return first && last && from.id !== to.id ? Math.max(1, Math.abs(first.col - last.col) + Math.abs(first.row - last.row)) : undefined;
}

export function formationLinkAvailability(world: WorldState, link: FormationLink): FormationAvailability {
  const a = node(world, findSect(world, link.sectAId), link.siteAId), b = node(world, findSect(world, link.sectBId), link.siteBId);
  if (!a || !b || formationLinkSteps(world, a, b) !== link.steps) return 'site_lost';
  if (relocating(world, link.sectAId) || relocating(world, link.sectBId)) return 'relocating';
  if (atWar(world, link.sectAId, link.sectBId)) return 'hostility';
  return 'ready';
}

function present(world: WorldState, actor: Cultivator | undefined, sect: Sect, siteId: string): actor is Cultivator {
  return live(actor) && actor.sectId === sect.id && actor.locationId === siteId && !pilgrimageCheckpoint(world, actor) &&
    !world.relocations.plans.some((plan) => plan.status === 'in_transit' && plan.garrisonIds.includes(actor.id)) &&
    !world.escorts.contracts.some((deal) => deal.status === 'active' && deal.escortId === actor.id) &&
    !world.sieges.some((row) => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(actor.id)) &&
    !world.occasions.some((row) => (row.status === 'registration' || row.status === 'running') && row.participantIds.includes(actor.id)) &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon';
}
function represents(world: WorldState, actor: Cultivator | undefined, sect: Sect, siteId: string): actor is Cultivator {
  return present(world, actor, sect, siteId) && actor.id === sect.leaderId && actor.sectRank === '掌门';
}

export function visibleFormationLinks(world: WorldState, viewer?: Cultivator): FormationLink[] {
  const actor = viewer && findPerson(world, viewer.id);
  if (!actor || !world.formations.links.length) return [];
  const known = new Set(knownMapLocations(world, actor).map(({ id }) => id));
  return world.formations.links.filter((link) => link.openedTick <= world.tick && known.has(link.siteAId) && known.has(link.siteBId) &&
      sideFor(link, actor.sectId))
    .map((link) => ({ ...link, receipts: link.receipts.map((row) => ({ ...row })) }));
}

export function availableFormationActions(actor: Cultivator, world: WorldState, includeOffers = true): FormationOption[] {
  if (!world.cultivators.includes(actor)) return [];
  const own = findSect(world, actor.sectId), here = node(world, own);
  if (!own || !here || !present(world, actor, own, here.id) || relocating(world, own.id)) return [];
  const actions: FormationOption[] = [];
  const add = (formationMove: FormationMove, targetFormationLinkId: string) => actions.push({ action: 'FORMATION_NETWORK', formationMove, targetFormationLinkId });
  const authority = represents(world, actor, own, here.id);
  for (const link of world.formations.links) {
    const side = sideFor(link, own.id);
    if (!side || siteAt(link, side) !== here.id) continue;
    if (liveOffer(world, link)) {
      if (!authority || actor.id !== link.recipientLeaderId || own.id === link.proposerSectId) continue;
      add('decline', link.id);
      const sponsor = findSect(world, link.proposerSectId);
      const sponsorActor = findPerson(world, link.proposerId);
      if (sponsor && own.spiritStones >= FORMATION_SETUP_COST && sponsor.spiritStones >= FORMATION_SETUP_COST &&
          represents(world, sponsorActor, sponsor, siteAt(link, peer(side))) && formationLinkAvailability(world, link) === 'ready') add('accept', link.id);
      continue;
    }
    if (!isSignedForm(link) || formationLinkAvailability(world, link) !== 'ready') continue;
    if (link.lastDrawTick !== world.tick && heldAt(link, side) > 0 && Math.floor(100 - actor.qiProgress) > 0) add('draw', link.id);
    if (link.status === 'broken') {
      if (authority && own.spiritStones >= FORMATION_REPAIR_COST && world.tick > (link.brokenTick ?? world.tick) &&
          link.lastRepairTick !== world.tick) add('repair', link.id);
      continue;
    }
    if (link.lastDispatchTick === world.tick || heldAt(link, peer(side)) >= FORMATION_BUFFER_CAP) continue;
    if (actor.qiProgress >= FORMATION_DISPATCH_QI) add('dispatch', link.id);
    if (authority && actor.qiProgress >= FORMATION_OVERLOAD_QI) add('overload', link.id);
  }
  if (!includeOffers || !authority || own.spiritStones < FORMATION_SETUP_COST) return actions;
  let count = 0;
  for (const other of [...world.sects].sort((a, b) => a.id.localeCompare(b.id))) {
    const there = node(world, other);
    if (other.id === own.id || !there || atWar(world, own.id, other.id) || relocating(world, other.id) ||
        other.spiritStones < FORMATION_SETUP_COST || !represents(world, findPerson(world, other.leaderId), other, there.id) ||
        !formationLinkSteps(world, here, there) || world.formations.links.some((link) => sideFor(link, own.id) && sideFor(link, other.id) &&
          (liveOffer(world, link) || isSignedForm(link)))) continue;
    actions.push({ action: 'FORMATION_NETWORK', formationMove: 'offer', targetSectId: other.id });
    if (++count >= MAX_OFFERS_PER_ACTOR) break;
  }
  return actions;
}

function event(world: WorldState, link: FormationLink, stage: string, title: string, description: string, actorIds: string[],
  locationId?: string, privateOnly = false): WorldEvent {
  return { id: `evt-${link.id}-${stage}-${world.tick}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds, locationId, category: 'diplomacy', ...(privateOnly ? { witnessScope: 'participants' } : {}) };
}

export function resolveFormationAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'FORMATION_NETWORK') return null;
  const option = availableFormationActions(actor, world, decision.formationMove === 'offer').find((row) =>
    row.formationMove === decision.formationMove && row.targetSectId === decision.targetSectId &&
    row.targetFormationLinkId === decision.targetFormationLinkId);
  if (!option) return null;
  const own = findSect(world, actor.sectId)!;
  if (option.formationMove === 'offer') {
    const other = findSect(world, option.targetSectId!)!;
    const [aId, bId] = [own.id, other.id].sort();
    const a = node(world, findSect(world, aId))!, b = node(world, findSect(world, bId))!;
    const link: FormationLink = { id: `formation-link-${world.formations.nextId++}`, sectAId: aId, sectBId: bId, siteAId: a.id, siteBId: b.id,
      proposerId: actor.id, recipientLeaderId: other.leaderId!, proposerSectId: own.id, openedTick: world.tick, offerExpiresTick: world.tick + FORMATION_OFFER_TICKS,
      steps: formationLinkSteps(world, a, b)!, status: 'offered', openedPaymentEach: 0, heldA: 0, heldB: 0, sentTotal: 0,
      deliveredTotal: 0, transmissionLoss: 0, drawnTotal: 0, dissipatedTotal: 0, repairTotal: 0, receipts: [] };
    world.formations.links.push(link);
    return event(world, link, 'offer', '邀议宗门联阵', '两端实有聚灵阵，未结接前不输灵气，也不扣费。',
      [link.proposerId, link.recipientLeaderId], actor.locationId, true);
  }
  const link = world.formations.links.find(({ id }) => id === option.targetFormationLinkId)!;
  const side = sideFor(link, own.id)!;
  if (option.formationMove === 'decline') {
    link.status = 'declined';
    link.settledTick = world.tick;
    return event(world, link, 'decline', '宗门拒绝联阵邀约', '未联通、未移灵气、未扣资材。',
      [link.proposerId, link.recipientLeaderId], actor.locationId, true);
  }
  if (option.formationMove === 'accept') {
    const sponsor = findSect(world, link.proposerSectId)!;
    sponsor.spiritStones -= FORMATION_SETUP_COST;
    own.spiritStones -= FORMATION_SETUP_COST;
    link.status = 'active';
    link.fundedTick = world.tick;
    link.openedPaymentEach = FORMATION_SETUP_COST;
    return event(world, link, 'accept', '两宗付资实接联阵', `两宗各耗${FORMATION_SETUP_COST}灵石；启用有损中继，初始储量为零。`,
      [link.proposerId, link.recipientLeaderId], actor.locationId);
  }
  if (option.formationMove === 'draw') {
    const drawn = Math.min(FORMATION_DRAW_CAP, Math.floor(100 - actor.qiProgress), heldAt(link, side));
    changeHeld(link, side, -drawn);
    actor.qiProgress += drawn;
    link.drawnTotal += drawn;
    link.lastDrawTick = world.tick;
    follow(link, { tick: world.tick, kind: 'draw', actorId: actor.id, fromSiteId: actor.locationId, drawn });
    return event(world, link, 'draw', '端点实领已抵灵气', `从本端储量领用${drawn}点，不经被动增益或重复计入。`, [actor.id], actor.locationId);
  }
  if (option.formationMove === 'repair') {
    own.spiritStones -= FORMATION_REPAIR_COST;
    link.status = 'active';
    link.lastRepairTick = world.tick;
    link.repairTotal += FORMATION_REPAIR_COST;
    follow(link, { tick: world.tick, kind: 'repair', actorId: actor.id, fromSiteId: actor.locationId, stonesSpent: FORMATION_REPAIR_COST });
    return event(world, link, 'repair', '实物修复过载断链', `本端公库支出${FORMATION_REPAIR_COST}灵石；未额外生成灵气。`, [actor.id], actor.locationId);
  }
  const overload = option.formationMove === 'overload';
  const sent = overload ? FORMATION_OVERLOAD_QI : FORMATION_DISPATCH_QI;
  const through = Math.min(sent, FORMATION_MAX_THROUGHPUT);
  // Base 20% loss plus one unit per six installed grid steps. Unabsorbed saturated overflow is also lost.
  const delivered = Math.max(0, Math.min(FORMATION_BUFFER_CAP - heldAt(link, peer(side)), through - Math.ceil(through / 5) - Math.ceil(link.steps / 6)));
  const lost = sent - delivered;
  actor.qiProgress -= sent;
  changeHeld(link, peer(side), delivered);
  link.lastDispatchTick = world.tick;
  link.sentTotal += sent;
  link.deliveredTotal += delivered;
  link.transmissionLoss += lost;
  if (overload) { link.status = 'broken'; link.brokenTick = world.tick; }
  follow(link, { tick: world.tick, kind: overload ? 'overload' : 'dispatch', actorId: actor.id, fromSiteId: actor.locationId,
    toSiteId: siteAt(link, peer(side)), sent, delivered, lost });
  return event(world, link, overload ? 'overload' : 'dispatch', overload ? '超限调拨致阵链断开' : '实扣本人灵气有损调拨',
    `实付${sent}点，接收${delivered}点，损耗${lost}点。${overload ? '阵链已断，不被动复通。' : ''}`, [actor.id], actor.locationId);
}

export function advanceFormations(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  const { links } = world.formations;
  for (const link of links) {
    if (link.openedTick > world.tick) continue;
    if (link.status === 'offered' && link.offerExpiresTick <= world.tick) {
      link.status = 'expired';
      link.settledTick = world.tick;
      events.push(event(world, link, 'expired', '联阵邀约届满', '未获双签，不移资材与灵气。', [link.proposerId, link.recipientLeaderId], undefined, true));
      continue;
    }
    if (!isSignedForm(link) || formationLinkAvailability(world, link) !== 'site_lost') continue;
    const dissipated = link.heldA + link.heldB;
    link.dissipatedTotal += dissipated;
    link.heldA = 0;
    link.heldB = 0;
    link.status = 'ended';
    link.settledTick = world.tick;
    link.endReason = 'site_lost';
    follow(link, { tick: world.tick, kind: 'dissipate', dissipated });
    events.push(event(world, link, 'ended', '实有联阵端点失效', `原址或产权已改变，未领${dissipated}点灵气消散，不转入新址。`,
      [link.proposerId, link.recipientLeaderId]));
  }
  const terminal = new Set(links.filter((link) => link.status !== 'offered' && !isSignedForm(link))
    .sort((a, b) => (a.settledTick ?? 0) - (b.settledTick ?? 0)).slice(-TERMINAL_HISTORY).map(({ id }) => id));
  world.formations.links = links.filter((link) => link.status === 'offered' || isSignedForm(link) || terminal.has(link.id));
  return events;
}
