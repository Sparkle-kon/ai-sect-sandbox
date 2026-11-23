import {activeAt,participant,usedAfterAccept} from './siteDutyTerms';
export {sparringLocksActor} from './siteDutyTerms';
import type {
  Cultivator, LLMDecisionPayload, SparringAgreement, SparringMove, SparringRound, SparringState, WorldEvent, WorldState,
} from '../types/world';
import { gainMastery } from './techniqueEngine';

export const SPARRING_OFFER_TICKS = 3;
export const SPARRING_ACTIVE_TICKS = 4;
export const SPARRING_QI_COST = 3;
export const SPARRING_MASTERY_MAX = 1;
const SPARRING_HISTORY_LIMIT = 96;

export type SparringOption = { action:'SPARRING' } & (
  | { sparringMove:'offer';targetCultivatorId:string;sparringRounds:1|2;targetSparringId?:never }
  | { sparringMove:Exclude<SparringMove,'offer'>;targetSparringId:string;targetCultivatorId?:never;sparringRounds?:never }
);

const live = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const parties = (row: SparringAgreement) => [row.proposerId,row.partnerId];
const physicalSite = (world: WorldState, siteId: string) => world.locations.some(site => site.id === siteId &&
  site.type !== 'secret_realm' && site.type !== 'abyss');
const open = (row: SparringAgreement) => row.status === 'offered' || row.status === 'active';
const offeredAt = (row: SparringAgreement, tick: number) => row.status === 'offered' && row.offeredTick <= tick && tick < row.offerExpiresTick;
const at = (world: WorldState, id: string) => world.cultivators.find(actor => actor.id === id);
const ascending = (a: Cultivator, b: Cultivator) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export const createSparringState = (): SparringState => ({ agreements:[],nextId:1 });

function physicallyAt(world: WorldState, actor: Cultivator | undefined, siteId: string, tick: number): actor is Cultivator {
  if (!live(actor) || actor.locationId !== siteId || actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon') return false;
  const id = actor.id;
  return !(actor.guardAssignment && actor.guardAssignment.expiresTick > tick) &&
    !world.couriers.dispatches.some(row => row.courierId === id &&
      (row.status === 'in_transit' || row.status === 'returning' || row.lastAdvancedTick === tick || row.settledTick === tick || row.acceptedTick === tick)) &&
    !world.pilgrimages.journeys.some(row => (row.organizerId === id || row.companionId === id) &&
      (row.status === 'active' || row.lastMovedTick === tick || row.startedTick === tick)) &&
    !world.escorts.contracts.some(row => row.status === 'active' && row.escortId === id) &&
    !world.relocations.plans.some(row => row.status === 'in_transit' && row.garrisonIds.includes(id)) &&
    !world.sieges.some(row => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(id)) &&
    !world.occasions.some(row => (row.status === 'registration' || row.status === 'running') && row.participantIds.includes(id));
}

function presentPair(world: WorldState, row: SparringAgreement, tick: number): [Cultivator,Cultivator] | undefined {
  const proposer = at(world,row.proposerId), partner = at(world,row.partnerId);
  return proposer !== partner && physicalSite(world,row.siteId) && physicallyAt(world,proposer,row.siteId,tick) &&
    physicallyAt(world,partner,row.siteId,tick) ? [proposer,partner] : undefined;
}

const canReady = (actor: Cultivator) => Number.isFinite(actor.qiProgress) && actor.qiProgress >= SPARRING_QI_COST &&
  actor.hp >= actor.maxHp * .5 && Number.isFinite(actor.techniqueMastery) && actor.techniqueMastery >= 0 && actor.techniqueMastery <= 100;

export function availableSparringActions(actor: Cultivator, world: WorldState, includeOffers = true,
  executionTick = world.tick): SparringOption[] {
  if ((executionTick !== world.tick && executionTick !== world.tick+1) || !live(actor) || !world.cultivators.includes(actor)) return [];
  const { agreements } = world.sparring;
  if (agreements.some(row => usedAfterAccept(row,actor.id,executionTick))) return [];
  const own = agreements.find(row => participant(row,actor.id) && open(row));
  if (own) {
    const options: SparringOption[] = [];
    const add = (sparringMove: Exclude<SparringMove,'offer'>) =>
      options.push({action:'SPARRING',sparringMove,targetSparringId:own.id});
    if (offeredAt(own,executionTick)) {
      if (own.proposerId === actor.id) add('withdraw');
      else {
        add('decline');
        if (presentPair(world,own,executionTick)) add('accept');
      }
    } else if (activeAt(own,executionTick) && !own.rounds.some(({ tick }) => tick === executionTick)) {
      // An authenticated participant can always stop a signed round, even if hurt, tired or no longer co-located.
      add('yield');
      if (presentPair(world,own,executionTick) && canReady(actor) &&
        !(own.readiness?.tick === executionTick && own.readiness.actorIds.includes(actor.id))) add('ready');
    }
    return options;
  }
  if (!includeOffers || !physicalSite(world,actor.locationId) || !physicallyAt(world,actor,actor.locationId,executionTick) ||
    !canReady(actor)) return [];
  const committed = new Set<string>();
  for (const row of agreements) if (open(row) || row.acceptedTick !== undefined && row.closedTick === executionTick) {
    for (const id of parties(row)) committed.add(id);
  }
  const peers = world.cultivators.filter(other => other.id !== actor.id && !committed.has(other.id) &&
    physicallyAt(world,other,actor.locationId,executionTick) && canReady(other)).sort(ascending);
  return peers.flatMap(person => ([1,2] as const).map(sparringRounds => ({
    action:'SPARRING',sparringMove:'offer',targetCultivatorId:person.id,sparringRounds,
  })));
}

function event(world: WorldState, row: SparringAgreement, token: string, title: string, description: string): WorldEvent {
  return { id:`evt-${row.id}-${world.tick}-${token}`,tick:world.tick,year:world.year,month:world.month,
    category:'diplomacy',title,description,actorIds:parties(row),witnessScope:'participants',
    ...(world.locations.some(site => site.id === row.siteId) ? { locationId:row.siteId } : {}) };
}

function close(world: WorldState, row: SparringAgreement, status: Exclude<SparringAgreement['status'],'offered'|'active'>,
  by?: Cultivator) {
  row.status = status;
  row.closedTick = world.tick;
  if (by) row.closedById = by.id;
  delete row.readiness;
}

export function resolveSparringAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'SPARRING' || decision.targetLocationId !== undefined) return null;
  const choice = availableSparringActions(actor,world,decision.sparringMove === 'offer').find(option =>
    option.sparringMove === decision.sparringMove && option.targetSparringId === decision.targetSparringId &&
    option.targetCultivatorId === decision.targetCultivatorId && option.sparringRounds === decision.sparringRounds);
  if (!choice) return null;
  const state = world.sparring;
  if (choice.sparringMove === 'offer') {
    const row: SparringAgreement = { id:`sparring-${state.nextId++}`,proposerId:actor.id,partnerId:choice.targetCultivatorId,
      siteId:actor.locationId,roundsPlanned:choice.sparringRounds,offeredTick:world.tick,
      offerExpiresTick:world.tick+SPARRING_OFFER_TICKS,status:'offered',rounds:[] };
    state.agreements.push(row);
    return event(world,row,'offer','提出自愿同契切磋',`拟最多 ${row.roundsPlanned} 轮；双人逐轮确认，任一人认输即停。`);
  }
  const row = state.agreements.find(item => item.id === choice.targetSparringId)!;
  if (choice.sparringMove === 'accept') {
    row.status = 'active';
    row.acceptedTick = world.tick;
    row.deadlineTick = world.tick + SPARRING_ACTIVE_TICKS;
    return event(world,row,'accept','双方同意切磋条款','本轮没有练习或消耗；后续必须各自确认准备。');
  }
  if (choice.sparringMove === 'decline' || choice.sparringMove === 'withdraw' || choice.sparringMove === 'yield') {
    const status = choice.sparringMove === 'decline' ? 'declined' : choice.sparringMove === 'withdraw' ? 'withdrawn' : 'yielded';
    close(world,row,status,actor);
    return event(world,row,status,status === 'yielded' ? '认可当轮认输，切磋停止' : status === 'declined' ? '谢绝切磋邀约' : '撤回切磋邀约',
      status === 'yielded' ? '立即停止；未结算的本轮不消耗气力、不增加熟练。' : '邀约未成立，未发生练习或消耗。');
  }
  if (row.readiness?.tick !== world.tick) row.readiness = {tick:world.tick,actorIds:[]};
  row.readiness.actorIds.push(actor.id);
  const memberToken = row.proposerId === actor.id ? 'proposer' : 'partner';
  return event(world,row,`ready-${memberToken}`,'核对本人本轮准备','仅登记准备；尚未发生练习、消耗或授益。');
}

/** Run after all actors have had their chance to yield. Eligibility is rechecked after their real actions. */
export function advanceSparring(world: WorldState): WorldEvent[] {
  const state = world.sparring;
  if (!state.agreements.length) return [];
  const events: WorldEvent[] = [];
  for (const row of state.agreements) {
    if (!open(row)) continue;
    const timedOut = row.status === 'offered' ? world.tick >= row.offerExpiresTick : world.tick >= (row.deadlineTick ?? Infinity);
    if (timedOut) {
      close(world,row,'expired');
      events.push(event(world,row,'expired','切磋期限已过','保留已实际完成练习；其余不消耗、不计练习。'));
      continue;
    }
    const present = presentPair(world,row,world.tick);
    if (!present) {
      close(world,row,'interrupted');
      events.push(event(world,row,'interrupted','切磋因席位实况中止','成员离场、无法参与或场地失效；未完成的一轮不结算。'));
      continue;
    }
    if (!activeAt(row,world.tick) || row.readiness?.tick !== world.tick || row.rounds.some(({ tick }) => tick === world.tick) ||
      row.rounds.length >= row.roundsPlanned ||
      !parties(row).every(id => row.readiness?.actorIds.includes(id)) || !present.every(canReady)) {
      if (row.readiness && row.readiness.tick <= world.tick) delete row.readiness;
      continue;
    }
    const round: SparringRound = { tick:world.tick,members:present.map(person => {
      const baseline = person.techniqueMastery;
      person.qiProgress -= SPARRING_QI_COST;
      gainMastery(person,SPARRING_MASTERY_MAX);
      return { actorId:person.id,qiSpent:SPARRING_QI_COST,masteryGained:person.techniqueMastery-baseline };
    }) };
    row.rounds.push(round);
    delete row.readiness;
    const complete = row.rounds.length === row.roundsPlanned;
    if (complete) close(world,row,'completed');
    events.push(event(world,row,`round-${row.rounds.length}`,complete ? '同契切磋如约收场' : '双人切磋本轮已结算',
      '仅记实际熟练增长及气力消耗；没有气血伤害、胜负奖励或额外资产。'));
  }
  const closed = state.agreements.filter(row => !open(row))
    .sort((a,b) => (b.closedTick ?? -1) - (a.closedTick ?? -1) || Number(b.id.slice(9))-Number(a.id.slice(9)));
  const keep = new Set(closed.slice(0,SPARRING_HISTORY_LIMIT).map(row=>row.id));
  for(const entry of world.apprenticeshipReunions?.cases??[])if(entry.sparring)keep.add(entry.sparring.sparringId);
  state.agreements = state.agreements.filter(row => open(row) || row.closedTick === world.tick || keep.has(row.id));
  return events;
}

/** Agreements, intentions and exact deltas are visible only to actual participants. */
export function visibleSparring(world: WorldState, viewer?: Cultivator): SparringAgreement[] {
  if (!viewer || at(world,viewer.id) !== viewer) return [];
  return world.sparring.agreements.filter(row => row.offeredTick <= world.tick && participant(row,viewer.id)).map(row=>structuredClone(row));
}
