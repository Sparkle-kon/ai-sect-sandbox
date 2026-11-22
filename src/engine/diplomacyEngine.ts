import {activeSiegeForActor,isActiveSiege as active} from './siegeParticipants';
export {activeSiegeForActor} from './siegeParticipants';
import { finishGrandSiegeTheatre } from './grandSiegeProof';
import type { GrandSiegeHeroResult, GrandSiegeRound } from '../types/grandSiege';
import { applyGrandSiegeHero, beginGrandSiegeRound, finishGrandSiegeRound,
  isGrandSiegeFighterPresent, openGrandSiegeTheatre, recordGrandSiegeArrival } from './grandSiegeTheatreEngine';
import {isSectActive} from './sectActivity';
import {onLowerPlane} from './upperPassageIsolation';
import { activeCourierForActor } from './sealedCourierEngine';
import { activeCeasefireBetween } from './ceasefireEngine';
import { recordCausalChronicleNode } from './chronicleCausalityEngine';
import { activeEscortForActor } from './escortEngine';
import { activeRelocationForActor, activeRelocationForSect } from './relocationEngine';
import type { ActionType, Cultivator, LLMDecisionPayload, Sect, SectDiplomaticRelation, SectSiege, WorldEvent, WorldState } from '../types/world';

type DiplomaticAction = Extract<ActionType, 'OFFER_ALLIANCE' | 'DECLARE_WAR' | 'DEMAND_TRIBUTE' | 'LAUNCH_SIEGE'>;
export interface DiplomaticOption { action: DiplomaticAction; targetSectId: string }

export const SIEGE_COST = 330;
const MIN_FORCE = 5;
const MAX_FORCE = 8;
const MAX_ROUNDS = 7;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const isPresentBelow = (actor:Cultivator) => live(actor) && onLowerPlane(actor);
const belowRoster = (world:WorldState,ids:readonly string[]) => ids.filter(id=>{
  const actor=world.cultivators.find(row=>row.id===id);
  return actor===undefined||onLowerPlane(actor);
});

export function sectRelation(world: WorldState, a: string, b: string): SectDiplomaticRelation | undefined {
  return world.diplomacy.find((item) => (item.sectAId === a && item.sectBId === b) ||
    (item.sectAId === b && item.sectBId === a));
}

function ensureRelation(world: WorldState, a: string, b: string): SectDiplomaticRelation {
  const previous = sectRelation(world, a, b);
  if (previous) return previous;
  const [sectAId, sectBId] = [a, b].sort();
  const relation: SectDiplomaticRelation = { sectAId, sectBId, affinity: 0, pact: 'neutral', sinceTick: world.tick };
  world.diplomacy.push(relation);
  return relation;
}

export function adjustSectAffinity(world: WorldState, a: string, b: string, delta: number): void {
  if (a === b || !Number.isFinite(delta) || !world.sects.some(({ id }) => id === a) || !world.sects.some(({ id }) => id === b)) return;
  const relation = ensureRelation(world, a, b);
  relation.affinity = clamp(relation.affinity + delta, -100, 100);
}

const isAlly = (world: WorldState, a: string, b: string) => a === b || sectRelation(world, a, b)?.pact === 'alliance';

function forceCandidates(world: WorldState, attacker: Sect, defender: Sect, actor: Cultivator): Cultivator[] {
  const candidates = world.cultivators.filter((person) => isPresentBelow(person) && isAlly(world, attacker.id, person.sectId) &&
    person.sectId !== defender.id && !isAlly(world, defender.id, person.sectId) && !activeRelocationForActor(world, person) && !activeEscortForActor(world, person) && !activeCourierForActor(world, person) && !activeSiegeForActor(world, person) &&
    !world.occasions.some((item) => (item.status === 'registration' || item.status === 'running') && item.participantIds.includes(person.id)) &&
    person.tribulation?.stage !== 'lightning' && person.tribulation?.stage !== 'heart_demon')
    .sort((a, b) => Number(b.id === actor.id) - Number(a.id === actor.id) || Number(b.sectId === attacker.id) - Number(a.sectId === attacker.id) ||
      b.combatPower - a.combatPower || a.id.localeCompare(b.id));
  return [...new Map(candidates.map((person) => [person.id, person])).values()].slice(0, MAX_FORCE);
}

export function availableDiplomacyActions(actor: Cultivator, world: WorldState): DiplomaticOption[] {
  const own = world.sects.find(({ id }) => id === actor.sectId);
  if (!isSectActive(own) || !isPresentBelow(actor) || own.leaderId !== actor.id || actor.locationId !== own.headquartersId || activeRelocationForSect(world, own.id) || activeSiegeForActor(world, actor)) return [];
  if (!world.locations.some((site) => site.id === own.headquartersId && (!site.ownerSectId || site.ownerSectId === own.id))) return [];
  const result: DiplomaticOption[] = [];
  for (const target of world.sects) {
    if (!isSectActive(target)||target.id === own.id || activeRelocationForSect(world, target.id)) continue;
    const protectedByTruce = Boolean(activeCeasefireBetween(world, own.id, target.id));
    const relation = sectRelation(world, own.id, target.id);
    const affinity = relation?.affinity ?? 0;
    const targetLeader = world.cultivators.find((person) => person.id === target.leaderId && person.sectId === target.id && live(person));
    if (!targetLeader) continue;
    const cooldown = world.tick - (relation?.lastActionTick ?? -1000) >= 3;
    const add = (action: DiplomaticAction) => result.push({ action, targetSectId: target.id });
    if (cooldown && (!relation || relation.pact === 'neutral') && affinity >= 45 && onLowerPlane(targetLeader) && targetLeader.locationId === target.headquartersId) add('OFFER_ALLIANCE');
    if (!protectedByTruce && cooldown && relation?.pact !== 'war' && affinity <= -45) add('DECLARE_WAR');
    if (!protectedByTruce && cooldown && relation?.pact !== 'alliance' && affinity <= -25 &&
        !world.tributeDemands.some((demand) => demand.status === 'pending' &&
          ((demand.demanderSectId === own.id && demand.targetSectId === target.id) ||
           (demand.demanderSectId === target.id && demand.targetSectId === own.id)))) add('DEMAND_TRIBUTE');
    if (!protectedByTruce && cooldown && relation?.pact === 'war' && own.spiritStones >= SIEGE_COST &&
        !world.sieges.some((siege) => (siege.attackerSectId === own.id || siege.attackerSectId === target.id ||
          siege.defenderSectId === own.id || siege.defenderSectId === target.id) &&
          (active(siege) || world.tick - (siege.lastResolvedTick ?? siege.startedTick) < 4)) &&
        world.locations.some((site) => site.id === target.headquartersId && (!site.ownerSectId || site.ownerSectId === target.id)) &&
        forceCandidates(world, own, target, actor).length >= MIN_FORCE) add('LAUNCH_SIEGE');
  }
  return result;
}

const makeEvent = (world: WorldState, token: string, title: string, description: string, actorIds: string[], locationId?: string): WorldEvent =>
  ({ id: `evt-${world.tick}-dip-${token}`, tick: world.tick, year: world.year, month: world.month, title, description,
    category: 'diplomacy', actorIds, locationId });

export function resolveDiplomacyAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  const option = availableDiplomacyActions(actor, world).find((candidate) => candidate.action === decision.chosenAction &&
    candidate.targetSectId === decision.targetSectId);
  if (!option) return null;
  const own = world.sects.find(({ id }) => id === actor.sectId)!;
  const target = world.sects.find(({ id }) => id === option.targetSectId)!;
  const relation = ensureRelation(world, own.id, target.id);
  relation.lastActionTick = world.tick;
  const token = `${own.id}-${target.id}-${option.action.toLowerCase()}`;
  const leaders = target.leaderId ? [actor.id, target.leaderId] : [actor.id];
  if (option.action === 'OFFER_ALLIANCE') {
    relation.pact = 'alliance'; relation.sinceTick = world.tick;
    adjustSectAffinity(world, own.id, target.id, 12);
    return makeEvent(world, token, '宗门订立同盟', `${own.name}与${target.name}两位掌门认可盟约，允诺战时互助。`, leaders, own.headquartersId);
  }
  if (option.action === 'DECLARE_WAR') {
    relation.pact = 'war'; relation.sinceTick = world.tick;
    adjustSectAffinity(world, own.id, target.id, -15);
    return makeEvent(world, token, '宗门正式宣战', `${own.name}向${target.name}发出战书，两派进入战争状态。`, leaders, own.headquartersId);
  }
  if (option.action === 'DEMAND_TRIBUTE') {
    const amount = 100 + Math.max(0, Math.floor((own.reputation - target.reputation) * 1.5));
    world.tributeDemands.push({ id: `tribute-${world.tick}-${own.id}-${target.id}`, demanderSectId: own.id, targetSectId: target.id,
      amount, status: 'pending', startedTick: world.tick });
    return makeEvent(world, token, '宗门索要贡赋', `${own.name}要求${target.name}进贡${amount}灵石，等待答复。`, leaders, own.headquartersId);
  }
  const participants = forceCandidates(world, own, target, actor);
  own.spiritStones -= SIEGE_COST;
  const siege: SectSiege = { id: `siege-${world.tick}-${own.id}-${target.id}`, attackerSectId: own.id, defenderSectId: target.id,
    destinationId: target.headquartersId, participantIds: participants.map(({ id }) => id), status: 'marching', startedTick: world.tick, rounds: 0 };
  world.sieges.push(siege);
  const launched = makeEvent(world, token, '宗门集结攻山', `${own.name}耗费${SIEGE_COST}灵石，集结${participants.length}名修士向${target.name}出征。`,
    siege.participantIds, own.headquartersId);
  recordCausalChronicleNode(world, launched, { kind: 'siege_launched', entityId: siege.id });
  openGrandSiegeTheatre(world,siege,launched);
  return launched;
}

function livedPower(force: Cultivator[]): number {
  return force.reduce((sum, person) => sum + person.combatPower * (.40 + .60 * person.hp / Math.max(1, person.maxHp)), 0);
}

function injure(force: Cultivator[], fraction: number): void {
  for (const person of force) person.hp = Math.max(1, person.hp - Math.round(person.maxHp * fraction));
}

function settleSiege(world: WorldState, siege: SectSiege, attacker: Sect, defender: Sect, raiders: Cultivator[], defenders: Cultivator[], won: boolean, displaced = false): WorldEvent {
  siege.status = won ? 'victory' : 'repelled';
  if (siege.rounds > 0 && !displaced) {
    injure(raiders, won ? .09 : .22);
    injure(defenders, won ? .23 : .10);
  }
  const indemnity = won ? Math.min(500, Math.floor(defender.spiritStones * .12)) : 0;
  attacker.spiritStones += indemnity;
  defender.spiritStones -= indemnity;
  attacker.reputation = clamp(attacker.reputation + (won ? 5 : -4), -100, 100);
  adjustSectAffinity(world, attacker.id, defender.id, -7);
  // A surviving expedition returns to its own sect HQ, not the occupier's HQ.
  for (const person of raiders) {
    const home = world.sects.find(({ id }) => id === person.sectId)?.headquartersId;
    if (home && world.locations.some(({ id }) => id === home)) person.locationId = home;
  }
  siege.outcome = displaced ? '原山门已不是这场战事可守、可攻的宗门要地。联军撤回，未再交锋。' :
    won ? `${attacker.name}攻破${defender.name}防线，夺得${indemnity}灵石战赔后撤离。` :
    `${attacker.name}未能攻破${defender.name}防线，联军撤退。`;
  return makeEvent(world, siege.id, won ? '攻山告捷' : '攻山退兵', siege.outcome, [...belowRoster(world,siege.participantIds),...defenders.map(({id})=>id)], siege.destinationId);
}

function grandSiegeSceneEvent(world:WorldState,siege:SectSiege,round:GrandSiegeRound):WorldEvent|undefined{
  if(!round.clash&&!round.hero)return undefined;
  const name=(id:string)=>world.cultivators.find(actor=>actor.id===id)?.name??'阵中修士';
  const rows:string[]=[];
  const people=new Set<string>();
  if(round.clash){
    const {attackerId,defenderId,winnerId}=round.clash;
    people.add(attackerId);people.add(defenderId);
    rows.push(`鼓声忽断。${name(attackerId)}与${name(defenderId)}越出阵前，各受一击，${name(winnerId)}占得上风。`);
  }
  if(round.hero){
    const {actorId,move,paidHp,paidQi,wallSaved}=round.hero;
    people.add(actorId);
    rows.push(`${name(actorId)}以${paidQi}灵气与${paidHp}气血${move==='elder-rescue'?'托起阵眼':'守住阵门'}，阵光又明了一息，挡下${wallSaved}阵力。`);
  }
  return {id:`evt-${world.tick}-${siege.id}-front-theatre`,tick:world.tick,year:world.year,month:world.month,
    title:round.hero?'重阵将倾，有人死守':'叩关之际，两锋出阵',description:rows.join(''),
    category:round.clash?'combat':'diplomacy',actorIds:[...people],locationId:siege.destinationId};
}

export interface GrandSiegeTurnContext {
  chosenHero:(siege: SectSiege)=>{actorId:string;decision:LLMDecisionPayload}|undefined;
  applied?:(siege: SectSiege, result: GrandSiegeHeroResult)=>void;
  heldByModel?:(siege: SectSiege, actorId:string)=>void;
}
export function advanceDiplomacy(world: WorldState, rng: () => number, theatre?:GrandSiegeTurnContext): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const demand of world.tributeDemands) {
    if (demand.status !== 'pending' || demand.startedTick >= world.tick) continue;
    const demander = world.sects.find(({ id }) => id === demand.demanderSectId);
    const target = world.sects.find(({ id }) => id === demand.targetSectId);
    demand.resolvedTick = world.tick;
    if (activeCeasefireBetween(world, demand.demanderSectId, demand.targetSectId)) { demand.status = 'rejected'; continue; }
    const force = (id: string) => livedPower(world.cultivators.filter((actor) => actor.sectId === id && isPresentBelow(actor)));
    if (demander && target && demander.id !== target.id && Number.isFinite(demand.amount) && demand.amount > 0 &&
        target.spiritStones >= demand.amount && force(demander.id) > 0 && force(demander.id) >= force(target.id) * 1.25 &&
        sectRelation(world, demander.id, target.id)?.pact !== 'alliance') {
      target.spiritStones -= demand.amount; demander.spiritStones += demand.amount; demand.status = 'paid';
    } else demand.status = 'rejected';
    if (demander && target) {
      adjustSectAffinity(world, demander.id, target.id, demand.status === 'paid' ? -4 : -9);
      events.push(makeEvent(world, demand.id, demand.status === 'paid' ? '贡赋入库' : '拒纳贡赋',
        demand.status === 'paid' ? `${target.name}向${demander.name}支付${demand.amount}灵石。` : `${target.name}拒绝${demander.name}的贡赋要求。`,
        [demander.leaderId, target.leaderId].filter((id): id is string => !!id), target.headquartersId));
    }
  }
  for (const siege of world.sieges) {
    if (!active(siege) || siege.startedTick >= world.tick || (siege.lastResolvedTick ?? -1) >= world.tick) continue;
    siege.lastResolvedTick = world.tick;
    const attacker = world.sects.find(({ id }) => id === siege.attackerSectId);
    const defender = world.sects.find(({ id }) => id === siege.defenderSectId);
    if (!attacker || !defender || !world.locations.some(({ id }) => id === siege.destinationId)) {
      siege.status = 'repelled'; siege.outcome = '出征目的地或宗门不复存在。';
      if(siege.theatre)delete siege.theatre.queued;
      continue;
    }
    const raiders = [...new Set(siege.participantIds)].map((id) => world.cultivators.find((person) => person.id === id))
      .filter((person): person is Cultivator => Boolean(person && isPresentBelow(person) && isAlly(world, person.sectId, attacker.id)));
    const defenders = world.cultivators.filter((person) => isPresentBelow(person) && !siege.participantIds.includes(person.id) &&
      person.locationId === siege.destinationId && !activeCourierForActor(world, person) && isAlly(world, defender.id, person.sectId));
    const site=world.locations.find(row=>row.id===siege.destinationId);
    const displaced=!!siege.theatre&&(!isSectActive(attacker)||!isSectActive(defender)||defender.headquartersId!==siege.destinationId||
      !!site?.ownerSectId&&site.ownerSectId!==defender.id||attacker.alignment===defender.alignment||
      attacker.alignment==='中立'||defender.alignment==='中立');
    if(displaced){
      const returned=settleSiege(world,siege,attacker,defender,raiders,[],false,true);
      finishGrandSiegeTheatre(world,siege,returned);events.push(returned);continue;
    }
    const liveTheatre=!!siege.theatre&&siege.status==='sieging';
    const forefront=liveTheatre?raiders.filter(actor=>isGrandSiegeFighterPresent(world,actor,siege.destinationId)):raiders;
    const holdingFront=liveTheatre?defenders.filter(actor=>isGrandSiegeFighterPresent(world,actor,siege.destinationId)):defenders;
    if (forefront.length < MIN_FORCE || sectRelation(world, attacker.id, defender.id)?.pact !== 'war') {
      const event=settleSiege(world,siege,attacker,defender,raiders,defenders,false);
      finishGrandSiegeTheatre(world,siege,event);
      events.push(event);continue;
    }
    if (siege.status === 'marching') {
      if (world.tick === siege.startedTick + 1) {
        for (const person of raiders) person.locationId = attacker.headquartersId;
        events.push(makeEvent(world, siege.id, '联军完成集结', `${raiders.length}名修士会师，次轮抵达${defender.name}山门。`, belowRoster(world,siege.participantIds), attacker.headquartersId));
      } else {
        for (const person of raiders) person.locationId = siege.destinationId;
        siege.status = 'sieging';
        const event=makeEvent(world,siege.id,'联军抵达山门',`${attacker.name}联军抵达${defender.name}山门，准备破阵。`,
          belowRoster(world,siege.participantIds),siege.destinationId);
        recordGrandSiegeArrival(world,siege,event);
        events.push(event);
      }
      continue;
    }
    siege.rounds++;
    const wall = defender.arrayHp;
    const attackRoll=rng(),defenseRoll=rng();
    const theatricalRound=beginGrandSiegeRound(world,siege,forefront,holdingFront,attackRoll,defenseRoll);
    const effectiveAttack = livedPower(forefront) * (.82 + .36 * attackRoll);
    const effectiveDefense = livedPower(holdingFront) * (.82 + .36 * defenseRoll);
    if (wall > 0) {
      const projected = clamp(Math.round(38 + 90 * effectiveAttack / Math.max(1, effectiveAttack + effectiveDefense)), 38, 128);
      const harm=theatricalRound
        ?applyGrandSiegeHero(world,siege,theatricalRound,projected,theatre?.chosenHero(siege),
          actorId=>theatre?.heldByModel?.(siege,actorId))
        :projected;
      if(theatricalRound?.hero)theatre?.applied?.(siege,theatricalRound.hero);
      defender.arrayHp = Math.max(0, wall - harm);
      injure(forefront, .045 + .055 * effectiveDefense / Math.max(1, effectiveAttack + effectiveDefense));
      injure(holdingFront, .035);
      if (siege.rounds < MAX_ROUNDS) {
        const event=makeEvent(world,siege.id,'护山阵接战',`护山阵受损${wall - defender.arrayHp}，尚余${defender.arrayHp}阵力。`,
          belowRoster(world,siege.participantIds),siege.destinationId);
        if(theatricalRound)finishGrandSiegeRound(world,siege,theatricalRound,event,defender.arrayHp);
        events.push(event);
        const scene=theatricalRound&&grandSiegeSceneEvent(world,siege,theatricalRound);
        if(scene)events.push(scene);
        continue;
      }
    }
    const won = defender.arrayHp <= 0 && effectiveAttack > effectiveDefense * 1.07;
    const event=settleSiege(world,siege,attacker,defender,forefront,holdingFront,won);
    if(theatricalRound)finishGrandSiegeRound(world,siege,theatricalRound,event,defender.arrayHp);
    finishGrandSiegeTheatre(world,siege,event);
    events.push(event);
    const scene=theatricalRound&&grandSiegeSceneEvent(world,siege,theatricalRound);
    if(scene)events.push(scene);
  }
  return events;
}
