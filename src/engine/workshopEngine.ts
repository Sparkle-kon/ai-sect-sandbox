import {onLowerPlane} from './upperPassageIsolation';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {recordEraWorkshopSettlement} from './eraHistoryIndex';
import type {
  CultivationRealm, Cultivator, LLMDecisionPayload, LocationNode, WorkshopCloseReason, WorkshopCapacityMove, WorkshopMove, WorkshopOrder,
  WorkshopEstateReleaseReason, WorkshopInstitutionClosure, WorkshopOutputGrade, WorkshopQualityFloor, WorkshopState, WorkshopTier, WorkshopWorkReceipt, ToolLoan, WorldEvent, WorldState,
} from '../types/world';
import { ARTIFACT_RULES } from './artifactEngine';
import { canUseFurnace, claimFurnaceUse } from './furnaceReservationEngine';
import { isFurnaceSafetyClosed } from './furnaceSafetyEngine';
import { effectiveWorkshopDeadline,effectiveWorkshopQuantity,WORKSHOP_CAPACITY_RECOVERY_TICKS } from './workshopCapacityTerms';
import {WORKSHOP_ESTATE_OFFER_TICKS,WORKSHOP_ESTATE_REPLY_TICKS,WORKSHOP_ESTATE_WORK_TICKS,
  workshopEstateBeneficiary,workshopEstateFor,type WorkshopEstateOption} from './workshopEstateTerms';
import { activeEscortForActor } from './escortEngine';
import { pilgrimageCheckpoint } from './pilgrimageEngine';
import { activeRelocationForActor } from './relocationEngine';
import { flowActor, flowWorkshop, recordResourceFlow } from './resourceFlowEngine';
import { courierCheckpoint } from './sealedCourierEngine';
import { isTribulationActive } from './tribulationEngine';
import { applyWorkshopToolUse,availableWorkshopToolUses,TOOL_LOAN_QUALITY_BONUS,workshopToolLoanForFinish } from './toolLoanEngine';

export const WORKSHOP_OFFER_TICKS = 3;
export const WORKSHOP_ACTIVE_TICKS = 7;
export const WORKSHOP_TERMINAL_LIMIT = 24;
export const WORKSHOP_DISBANDMENT_HISTORY_LIMIT = 64;
export const WORKSHOP_MAX_WORK_RECEIPTS = 4;
export const WORKSHOP_HERB = 'earth_root';
export const WORKSHOP_CAPACITY = 12;
export const WORKSHOP_ACTIVE_OFFERS_PER_SITE = 2;
const MAKERS_PER_OFFER = 2;
const TIERS: WorkshopTier[] = ['法器', '灵器'];
const FLOORS: WorkshopQualityFloor[] = ['standard', 'fine'];
const REALMS: CultivationRealm[] = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];

export interface WorkshopOption {
  action: 'WORKSHOP';
  workshopMove: WorkshopMove;
  targetWorkshopId?: string;
  targetToolLoanId?:string;
  targetCultivatorId?: string;
  workshopTier?: WorkshopTier;
  workshopQuantity?: 1 | 2;
  workshopQualityFloor?: WorkshopQualityFloor;
}

export const createWorkshopState = (): WorkshopState => ({ orders: [], nextId: 1 });
export const createWorkshopDisbandmentState = (): WorldState['workshopDisbandments'] => ({ closures:[] });

export function workshopTerms(tier: WorkshopTier, quantity: 1 | 2 = 1) {
  const base = ARTIFACT_RULES[tier].stones;
  const fuelPerPiece = Math.ceil(base * 0.6);
  const feePerPiece = base - fuelPerPiece;
  const blankFuel = Math.ceil(fuelPerPiece / 2);
  const finishFuel = fuelPerPiece - blankFuel;
  return { fuelPerPiece, feePerPiece, blankFuel, finishFuel, totalStones: quantity * base, totalHerbs: quantity * 2 };
}

const alive = (actor?: Cultivator): actor is Cultivator => Boolean(actor?.alive && actor.hp > 0);
const participant = (actor: Cultivator, order: WorkshopOrder) => actor.id === order.patronId || actor.id === order.makerId;
const deliveryPatron=(world:WorldState,order:WorkshopOrder)=>person(world,
  order.estateContinuation?.phase==='resumed'?order.estateContinuation.beneficiaryId??'':order.patronId);
const person = (world: WorldState, id: string) => world.cultivators.find(actor => actor.id === id);
const at = (world: WorldState, id: string) => world.locations.find(site => site.id === id);
const active = (world: WorldState, order: WorkshopOrder) => order.status === 'active' &&
  (order.acceptedTick ?? Infinity) <= world.tick && world.tick < (effectiveWorkshopDeadline(order) ?? 0);
const offered = (world: WorldState, order: WorkshopOrder) => order.status === 'offered' &&
  order.offeredTick <= world.tick && world.tick < order.offerExpiresTick;
function institutionEpoch(world:WorldState,sectId:string,siteId:string,tick:number):NonNullable<WorkshopOrder['institution']> {
  const prior=world.relocations.abandonedSites.filter(row=>row.sectId===sectId && row.destinationId===siteId && row.tick<=tick)
    .reduce<(typeof world.relocations.abandonedSites)[number]|undefined>((best,row)=>!best || row.tick>best.tick ? row : best,undefined);
  return prior ? {sectId,establishedTick:prior.tick,arrivalPlanId:prior.planId} : {sectId,establishedTick:0};
}

function institutionAtOffer(world:WorldState,siteId:string,makerId:string):WorkshopOrder['institution'] {
  const site=at(world,siteId);
  const title=site?.ownerSectId;
  if(!title || site.type!=='sect_hq' || person(world,makerId)?.sectId!==title) return undefined;
  const sect=world.sects.find(row=>row.id===title && row.headquartersId===siteId);
  return sect && sect.facilities.alchemy_hall>0 ? institutionEpoch(world,title,siteId,world.tick) : undefined;
}

const qualityNames: Record<WorkshopOutputGrade, string> = { failed: '报废', standard: '标准', fine: '精品' };

function availableAt(world: WorldState, actor: Cultivator | undefined, site: LocationNode | undefined): actor is Cultivator {
  return alive(actor) && site !== undefined && actor.locationId === site.id &&
    !pilgrimageCheckpoint(world, actor) && !courierCheckpoint(world, actor) &&
    !activeRelocationForActor(world, actor) && !activeEscortForActor(world, actor) && !isTribulationActive(actor);
}

function makerEligible(world: WorldState, actor: Cultivator | undefined, site: LocationNode | undefined, tier: WorkshopTier) {
  const rule = ARTIFACT_RULES[tier];
  return availableAt(world, actor, site) && site!.furnaceGrade >= rule.grade &&
    actor.techniqueMastery >= rule.mastery && REALMS.indexOf(actor.realm) >= REALMS.indexOf(rule.realm);
}

function hasFunds(patron: Cultivator, tier: WorkshopTier, quantity: 1 | 2) {
  const terms = workshopTerms(tier, quantity);
  return patron.spiritStones >= terms.totalStones && patron.herbs[WORKSHOP_HERB] >= terms.totalHerbs &&
    patron.artifacts.length + quantity <= WORKSHOP_CAPACITY;
}

function hasCanonicalArtifact(world: WorldState, id: string) {
  return world.cultivators.some(actor => actor.artifacts.some(item => item.id === id)) ||
    world.estates.entries.some(estate => estate.holdings.artifacts.some(item => item.id === id)) ||
    world.toolLoans.loans.some(loan=>loan.custody?.id===id);
}

const artifactIdFor = (order: WorkshopOrder, piece: number) => `workshop-artifact-${order.id}-${piece}`;
const choice = (workshopMove: WorkshopMove, targetWorkshopId: string): WorkshopOption =>
  ({ action: 'WORKSHOP', workshopMove, targetWorkshopId });

export function availableWorkshopActions(actor: Cultivator, world: WorldState, includeOffers = true, executionTick = world.tick): WorkshopOption[] {
  if (!alive(actor) || person(world, actor.id) !== actor) return [];
  const { orders } = world.workshops;
  const result: WorkshopOption[] = [];
  const makerWorked = orders.some(order => order.makerId === actor.id && order.work.at(-1)?.tick === executionTick);
  for (const order of orders) {
    if (!participant(actor, order)||workshopEstateHoldDue(world,order,executionTick)) continue;
    const site = at(world, order.siteId);
    const patron = person(world, order.patronId);
    if (offered(world, order)) {
      if (actor.id === order.patronId) result.push(choice('cancel', order.id));
      else {
        result.push(choice('decline', order.id));
        if (availableAt(world, patron, site) && hasFunds(patron, order.tier, order.quantity) &&
            makerEligible(world, actor, site, order.tier) &&
            !orders.some(other => active(world, other) && (other.siteId === order.siteId || other.makerId === actor.id))) {
          result.push(choice('accept', order.id));
        }
      }
    }
    if (active(world, order)) {
      const continuation=order.estateContinuation;
      const recipient=deliveryPatron(world,order);
      if (!continuation)result.push(choice('cancel', order.id));
      if (actor.id !== order.makerId || makerWorked || executionTick <= (order.acceptedTick ?? Infinity) ||
          continuation&&(continuation.phase!=='resumed'||executionTick<=(continuation.resumeTick??Infinity)||
            !workshopEstateCustodyUnchanged(order)||!recipient||
            recipient.id!==workshopEstateBeneficiary(world,order,executionTick)||
            !releaseLocal(world,recipient,site,executionTick)||!releaseLocal(world,actor,site,executionTick)) ||
          executionTick >= (effectiveWorkshopDeadline(order) ?? -Infinity) ||
          !makerEligible(world, actor, site, order.tier) || !availableAt(world, recipient, site) || order.work.length >= effectiveWorkshopQuantity(order) * 2 || (order.capacityAmendment && order.work.length!==1)) continue;
      const finish = order.work.length % 2 === 1;
      const terms = workshopTerms(order.tier, order.quantity);
      if (order.escrowHerbs < 1 || order.escrowStones < (finish ? terms.finishFuel + terms.feePerPiece : terms.blankFuel)) continue;
      if (finish && (recipient.artifacts.length >= WORKSHOP_CAPACITY ||
          hasCanonicalArtifact(world, artifactIdFor(order, Math.floor(order.work.length / 2) + 1)))) continue;
      if (canUseFurnace(world, actor, order.siteId, 'workshop', order.id, executionTick)) {
        const option=choice('work',order.id);
        result.push(option);
        if(finish&&!continuation)for(const targetToolLoanId of availableWorkshopToolUses(world,actor,order,executionTick))
          result.push({...option,targetToolLoanId});
      }
    }
  }
  if (!includeOffers) return result;
  const site = at(world, actor.locationId);
  if (!availableAt(world, actor, site) || !site?.furnaceGrade ||
      orders.some(order => order.patronId === actor.id && (offered(world, order) || active(world, order))) ||
      orders.some(order => order.siteId === site.id && active(world, order)) ||
      orders.filter(order => order.siteId === site.id && offered(world, order)).length >= WORKSHOP_ACTIVE_OFFERS_PER_SITE) return result;
  for (const tier of TIERS) {
    if (!hasFunds(actor, tier, 1)) continue;
    const makers = world.cultivators.filter(candidate => candidate.id !== actor.id && makerEligible(world, candidate, site, tier) &&
      !orders.some(order => active(world, order) && order.makerId === candidate.id))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, MAKERS_PER_OFFER);
    for (const maker of makers) for (const quantity of [1, 2] as const) {
      if (!hasFunds(actor, tier, quantity)) continue;
      for (const qualityFloor of FLOORS) result.push({ action: 'WORKSHOP', workshopMove: 'offer', targetCultivatorId: maker.id,
        workshopTier: tier, workshopQuantity: quantity, workshopQualityFloor: qualityFloor });
    }
  }
  return result;
}

function event(world: WorldState, order: WorkshopOrder, phase: string, title: string, description: string): WorldEvent {
  const beneficiary=order.estateContinuation?.beneficiaryId;
  const actorIds=phase.startsWith('estate-')?
    beneficiary?[beneficiary,order.makerId]:[order.makerId]:
    phase==='finish-1'&&order.estateContinuation?.phase==='completed'&&beneficiary?
      [beneficiary,order.makerId]:[order.patronId,order.makerId];
  const receipt:WorldEvent={
    id:`evt-workshop-${order.id}-${world.tick}-${phase}`,tick:world.tick,year:world.year,month:world.month,
    category:'diplomacy',title,description,actorIds,locationId:order.siteId,witnessScope:'participants',
  };
  recordEraWorkshopSettlement(world,order,receipt);
  return receipt;
}

const visibility = (order: WorkshopOrder) => ({ kind: 'participants' as const, actorIds: [order.patronId, order.makerId] });

function refund(world:WorldState,order:WorkshopOrder,patron:Cultivator,stones=order.escrowStones,herbs=order.escrowHerbs,
  reason:'workshop_refund'|'workshop_capacity_release'='workshop_refund'){
  patron.spiritStones+=stones;
  patron.herbs[WORKSHOP_HERB]+=herbs;
  const fields={kind:'transfer' as const,from:flowWorkshop(order.id),to:flowActor(order.patronId),
    visibility:visibility(order),refId:order.id,reason,mechanism:'workshop' as const};
  recordResourceFlow(world,{...fields,good:'stone',amount:stones});
  recordResourceFlow(world,{...fields,good:WORKSHOP_HERB,amount:herbs});
  order.refundedStones+=stones;
  order.refundedHerbs+=herbs;
  order.escrowStones-=stones;
  order.escrowHerbs-=herbs;
}

function settle(world: WorldState, order: WorkshopOrder, status: Exclude<WorkshopOrder['status'], 'active' | 'offered' | 'probate_hold'>,
  reason?: WorkshopCloseReason): boolean {
  if (order.settledTick !== undefined) return false;
  if (order.escrowStones > 0 || order.escrowHerbs > 0) {
    const patron = person(world, order.patronId);
    if (!patron) return false; // Invalid orphan state must not destroy inventory.
    refund(world, order, patron);
  }
  order.status = status;
  order.settledTick = world.tick;
  if (reason) order.closeReason = reason;
  if (reason !== 'mutual_release') advanceWorkshopReleaseNegotiations(order,world.tick);
  return true;
}

const clamp = (value: number, upper: number) => Number.isFinite(value) ? Math.max(0, Math.min(upper, value)) : 0;

export function workshopGradeForScore(score: number): WorkshopOutputGrade {
  return score >= 70 ? 'fine' : score >= 40 ? 'standard' : 'failed';
}

function gradeWork(maker: Cultivator, site: LocationNode, order: WorkshopOrder, rng: () => number) {
  const qualityScore = clamp(42 + Math.floor(clamp(maker.techniqueMastery, 100) / 4) +
    10 * (site.furnaceGrade - ARTIFACT_RULES[order.tier].grade) +
    (maker.spiritRoot === site.spiritRoot ? 8 : 0) + Math.min(15, Math.floor(clamp(rng(), 1) * 16)) -
    (maker.hp < maker.maxHp / 2 ? 10 : 0), 100);
  const quality = workshopGradeForScore(qualityScore);
  return { qualityScore, quality };
}

function work(world: WorldState, order: WorkshopOrder, maker: Cultivator, rng: () => number,tool?:ToolLoan): WorldEvent {
  const site = at(world, order.siteId)!;
  const patron = deliveryPatron(world,order)!;
  const terms = workshopTerms(order.tier, order.quantity);
  const piece = (order.work.length < 2 ? 1 : 2) as 1 | 2;
  const stage = order.work.length % 2 === 0 ? 'blank' : 'finish';
  const stonesUsed = stage === 'blank' ? terms.blankFuel : terms.finishFuel;
  order.escrowStones -= stonesUsed;
  order.escrowHerbs -= 1;
  const workVisibility=order.estateContinuation?.phase==='resumed'?
    {kind:'participants' as const,actorIds:[patron.id,order.makerId]}:visibility(order);
  const fields = { kind: 'consumption' as const, from: flowWorkshop(order.id), mechanism: 'workshop' as const,
    refId: order.id, visibility: workVisibility };
  recordResourceFlow(world, { ...fields, good: 'stone', amount: stonesUsed, reason: 'workshop_fuel' });
  recordResourceFlow(world, { ...fields, good: WORKSHOP_HERB, amount: 1, reason: 'workshop_material' });
  const row: WorkshopWorkReceipt = { tick: world.tick, makerId: maker.id, piece, stage, stonesUsed, herbsUsed: 1 };
  order.work.push(row);
  advanceWorkshopReleaseNegotiations(order,world.tick);
  if (stage === 'blank') return event(world, order, `blank-${piece}`, '工坊铸坯', `第${piece}件投入${stonesUsed}灵石和1份玄土根，尚未交付。`);
  const base=gradeWork(maker,site,order,rng);
  const qualityScore=tool?Math.min(100,base.qualityScore+TOOL_LOAN_QUALITY_BONUS):base.qualityScore;
  const quality=tool?workshopGradeForScore(qualityScore):base.quality;
  Object.assign(row,{quality,qualityScore});
  if(tool)applyWorkshopToolUse(world,tool,row,base.qualityScore);
  if (quality === 'fine' || quality === 'standard' && order.qualityFloor === 'standard') {
    const artifactId = artifactIdFor(order, piece);
    const baseDurability = ARTIFACT_RULES[order.tier].durability;
    const durability = quality === 'fine' ? Math.ceil(baseDurability * 1.2) : baseDurability;
    const blank=order.work[(piece-1)*2];
    patron.artifacts.push({ id: artifactId, tier: order.tier, name: `${maker.spiritRoot}纹·工坊${order.tier}`, spiritRoot: maker.spiritRoot,
      durability, maxDurability: durability, resonance: 0,
      workshopOrigin:{orderId:order.id,piece,makerId:maker.id,siteId:site.id,blankTick:blank.tick,finishedTick:row.tick} });
    order.escrowStones -= terms.feePerPiece;
    maker.spiritStones += terms.feePerPiece;
    Object.assign(row, { artifactId, feePaid: terms.feePerPiece });
    recordResourceFlow(world, { kind: 'transfer', good: 'stone', amount: terms.feePerPiece, from: flowWorkshop(order.id), to: flowActor(maker.id),
      mechanism: 'workshop', refId: order.id, reason: 'workshop_wage', visibility: workVisibility });
  }
  if (piece === effectiveWorkshopQuantity(order)&&settle(world, order, 'completed')&&order.estateContinuation?.phase==='resumed'){
    order.estateContinuation.phase='completed';
    order.estateContinuation.closedTick=world.tick;
  }
  const outcome = row.artifactId ? `已实际交付，支付${row.feePaid}灵石工钱` : '未达契约门槛，无成品也无工钱';
  const suffix=order.status==='completed' ?
    (order.capacityAmendment?`；按补签完成保留工序，原承诺尚有一件已授权不再制作；累计实退${order.refundedStones}灵石、${order.refundedHerbs}份余料`:
      `；结案实退${order.refundedStones}灵石、${order.refundedHerbs}份余料`):'';
  return event(world, order, `finish-${piece}`, row.artifactId ? '工坊验收交割' : '工坊验收未过',
    `第${piece}件实测${qualityScore}分（${qualityNames[quality]}），${outcome}${suffix}。`);
}

export function resolveWorkshopAction(world: WorldState, actor: Cultivator, payload: LLMDecisionPayload, rng: () => number): WorldEvent | null {
  if (payload.chosenAction !== 'WORKSHOP') return null;
  const valid = availableWorkshopActions(actor, world, payload.workshopMove === 'offer').find(option =>
    option.workshopMove === payload.workshopMove && option.targetWorkshopId === payload.targetWorkshopId &&
    option.targetCultivatorId === payload.targetCultivatorId && option.workshopTier === payload.workshopTier &&
    option.workshopQuantity === payload.workshopQuantity && option.workshopQualityFloor === payload.workshopQualityFloor &&
    option.targetToolLoanId===payload.targetToolLoanId);
  if (!valid) return null;
  if (valid.workshopMove === 'offer') {
    const institution=institutionAtOffer(world,actor.locationId,valid.targetCultivatorId!);
    const order: WorkshopOrder = {
      id: `commission-${world.workshops.nextId++}`, patronId: actor.id, makerId: valid.targetCultivatorId!, siteId: actor.locationId,
      tier: valid.workshopTier!, quantity: valid.workshopQuantity!, qualityFloor: valid.workshopQualityFloor!,
      status: 'offered', offeredTick: world.tick, offerExpiresTick: world.tick + WORKSHOP_OFFER_TICKS,
      escrowStones: 0, escrowHerbs: 0, refundedStones: 0, refundedHerbs: 0, work: [],
      ...(institution ? {institution} : {}),
    };
    world.workshops.orders.push(order);
    return event(world, order, 'offer', '提出工坊委制', `拟制${order.quantity}件${order.tier}，约定${qualityNames[order.qualityFloor]}起收；尚未支出。`);
  }
  const order = world.workshops.orders.find(({ id }) => id === valid.targetWorkshopId)!;
  if (valid.workshopMove === 'accept') {
    const patron = person(world, order.patronId)!;
    const terms = workshopTerms(order.tier, order.quantity);
    patron.spiritStones -= terms.totalStones;
    patron.herbs[WORKSHOP_HERB] -= terms.totalHerbs;
    order.escrowStones = terms.totalStones;
    order.escrowHerbs = terms.totalHerbs;
    const fields = { kind: 'transfer' as const, from: flowActor(patron.id), to: flowWorkshop(order.id),
      mechanism: 'workshop' as const, refId: order.id, reason: 'workshop_deposit', visibility: visibility(order) };
    recordResourceFlow(world, { ...fields, good: 'stone', amount: terms.totalStones });
    recordResourceFlow(world, { ...fields, good: WORKSHOP_HERB, amount: terms.totalHerbs });
    order.status = 'active';
    order.acceptedTick = world.tick;
    order.deadlineTick = world.tick + WORKSHOP_ACTIVE_TICKS;
    return event(world, order, 'accept', '工坊委制生效', `实托${order.escrowStones}灵石、${order.escrowHerbs}份玄土根；需工匠逐回合加工。`);
  }
  if (valid.workshopMove === 'work') {
    const loan=valid.targetToolLoanId?workshopToolLoanForFinish(world,actor,order,valid.targetToolLoanId):undefined;
    if(valid.targetToolLoanId&&!loan)return null;
    return claimFurnaceUse(world,actor,order.siteId,'workshop',order.id)?work(world,order,actor,rng,loan):null;
  }
  if (valid.workshopMove === 'decline') {
    settle(world, order, 'declined');
    return event(world, order, 'decline', '工匠谢绝委制', '未签约，无实际扣款。');
  }
  settle(world, order, 'cancelled', actor.id === order.patronId ? 'patron_cancelled' : 'maker_cancelled');
  return event(world, order, 'cancel', '工坊委制中止', `只退实余${order.refundedStones}灵石、${order.refundedHerbs}份玄土根；已耗用料不退。`);
}

export interface WorkshopCapacityOption{
  action:'WORKSHOP_CAPACITY';
  workshopCapacityMove:WorkshopCapacityMove;
  targetWorkshopId:string;
}
const exactCapacityFields=new Set(['action','chosenAction','innerMonologue','spokenLine','workshopCapacityMove','targetWorkshopId']);

function stillThere(world:WorldState,actor:Cultivator|undefined,site:LocationNode|undefined,tick:number):actor is Cultivator{
  if(!availableAt(world,actor,site))return false;
  const id=actor.id;
  return !world.couriers.dispatches.some(row=>row.courierId===id&&(row.acceptedTick===tick||row.lastAdvancedTick===tick||row.settledTick===tick))&&
    !world.pilgrimages.journeys.some(row=>(row.organizerId===id||row.companionId===id)&&
      (row.status==='active'&&(row.expiresTick??Infinity)>tick||row.lastMovedTick===tick||row.startedTick===tick||
        row.camps?.some(camp=>camp.openedTick===tick||camp.closedTick===tick)))&&
    !world.boundaryReliefs.cases.some(row=>row.incomingId===id&&(row.status==='travelling'||row.status==='returning'))&&
    !world.sieges.some(row=>row.participantIds.includes(id)&&(row.status==='marching'||row.status==='sieging'))&&
    !world.occasions.some(row=>row.participantIds.includes(id)&&(row.status==='registration'||row.status==='running')&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(id)));
}

function capacityLoss(world:WorldState,order:WorkshopOrder,tick:number){
  if(order.institution||order.capacityAmendment||order.status!=='active'||order.quantity!==2||
    order.work.length!==1||order.acceptedTick===undefined||order.deadlineTick===undefined||tick>=order.deadlineTick)return undefined;
  const blank=order.work[0];
  const terms=workshopTerms(order.tier,2);
  if(blank.stage!=='blank'||blank.piece!==1||blank.makerId!==order.makerId||blank.tick<=order.acceptedTick||
    blank.stonesUsed!==terms.blankFuel||blank.herbsUsed!==1||blank.artifactId!==undefined||
    order.escrowStones!==terms.totalStones-blank.stonesUsed||order.escrowHerbs!==terms.totalHerbs-blank.herbsUsed||
    order.refundedStones!==0||order.refundedHerbs!==0)return undefined;
  const site=at(world,order.siteId);
  const maker=person(world,order.makerId),patron=person(world,order.patronId);
  if(!site||!site.furnaceGrade||!stillThere(world,maker,site,tick)||!stillThere(world,patron,site,tick)||
    !isFurnaceSafetyClosed(world,site.id,tick))return undefined;
  const damage=[...world.furnaceSafety.cases].reverse().find(row=>row.siteId===site.id&&row.damagedTick<=tick);
  if(!damage||damage.damagedTick<=blank.tick)return undefined;
  return {damage,blank,maker,patron,deadline:order.deadlineTick};
}
function refundFits(patron:Cultivator,stones:number,herbs:number){
  return Number.isFinite(patron.spiritStones)&&patron.spiritStones>=0&&patron.spiritStones+stones<=1_000_000_000&&
    Number.isSafeInteger(patron.herbs[WORKSHOP_HERB])&&patron.herbs[WORKSHOP_HERB]>=0&&patron.herbs[WORKSHOP_HERB]+herbs<=10_000;
}

/** Only the original payer and maker may renegotiate an actually funded and later changed capacity. */
export function availableWorkshopCapacityActions(actor:Cultivator,world:WorldState,executionTick=world.tick):WorkshopCapacityOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||!alive(actor)||!world.cultivators.includes(actor))return [];
  const options:WorkshopCapacityOption[]=[];
  for(const order of world.workshops.orders){
    if(order.status!=='active'||!participant(actor,order))continue;
    const activeCase=capacityLoss(world,order,executionTick);
    if(!activeCase)continue;
    const offer=order.capacityOffer;
    const perPiece=workshopTerms(order.tier,1);
    if(!refundFits(activeCase.patron,perPiece.totalStones,perPiece.totalHerbs))continue;
    if(!offer&&actor===activeCase.maker&&executionTick+1<activeCase.deadline)options.push({
      action:'WORKSHOP_CAPACITY',workshopCapacityMove:'offer',targetWorkshopId:order.id});
    if(offer&&actor===activeCase.patron&&offer.offeredTick<executionTick&&offer.caseId===activeCase.damage.id&&
      offer.makerId===activeCase.maker.id&&offer.damagedTick===activeCase.damage.damagedTick&&offer.blankTick===activeCase.blank.tick)
      options.push({action:'WORKSHOP_CAPACITY',workshopCapacityMove:'accept',targetWorkshopId:order.id});
  }
  return options;
}

export function resolveWorkshopCapacityAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='WORKSHOP_CAPACITY'||Object.entries(decision).some(([key,value])=>value!==undefined&&
    (!exactCapacityFields.has(key)||key==='action'&&value!=='WORKSHOP_CAPACITY')))return null;
  const option=availableWorkshopCapacityActions(actor,world).find(row=>row.workshopCapacityMove===decision.workshopCapacityMove&&
    row.targetWorkshopId===decision.targetWorkshopId);
  if(!option)return null;
  const order=world.workshops.orders.find(row=>row.id===option.targetWorkshopId)!;
  const current=capacityLoss(world,order,world.tick);
  if(!current)return null;
  if(option.workshopCapacityMove==='offer'){
    order.capacityOffer={caseId:current.damage.id,damagedTick:current.damage.damagedTick,blankTick:current.blank.tick,
      makerId:actor.id,offeredTick:world.tick};
    return event(world,order,'capacity-offer','炉位实损后提议减做一件','尚未改动实存托管、原约件数或原截止日。');
  }
  const {totalStones,totalHerbs}=workshopTerms(order.tier,1);
  order.capacityAmendment={acceptedTick:world.tick,patronId:actor.id,keptQuantity:1,releasedQuantity:1,
    workUntilTick:current.deadline+WORKSHOP_CAPACITY_RECOVERY_TICKS,releasedStones:totalStones,releasedHerbs:totalHerbs};
  refund(world,order,current.patron,totalStones,totalHerbs,'workshop_capacity_release');
  return event(world,order,'capacity-accepted','双签释放未动工的一件',`退回第二件实托${totalStones}灵石及${totalHerbs}份玄土根；首坯留存，原约与补签截止日分别记账。`);
}

/** Shutter one actual old charter, never a nearby or successor workshop and never an expired obligation. */
export function advanceWorkshopInstitutionClosures(world:WorldState):WorldEvent[] {
  const state=world.workshopDisbandments;
  const events:WorldEvent[]=[];
  for(const abandoned of world.relocations.abandonedSites) {
    if(abandoned.tick!==world.tick || abandoned.originalType!=='sect_hq' || abandoned.facilities.alchemy_hall<1 ||
      state.closures.some(row=>row.abandonedSiteId===abandoned.id)) continue;
    const plan=world.relocations.plans.find(row=>row.id===abandoned.planId && row.status==='settled' &&
      row.settledTick===abandoned.tick && row.sectId===abandoned.sectId && row.originId===abandoned.originId &&
      row.destinationId===abandoned.destinationId);
    if(!plan) continue;
    const title=world.sects.find(sect=>sect.id===abandoned.sectId);
    const origin=at(world,abandoned.originId);
    const destination=at(world,abandoned.destinationId);
    if(!origin || !destination || origin.ownerSectId===abandoned.sectId || title?.headquartersId!==destination.id ||
      destination.ownerSectId!==abandoned.sectId) continue;
    const epoch=institutionEpoch(world,abandoned.sectId,abandoned.originId,world.tick-1);
    const closure:WorkshopInstitutionClosure={
      id:`workshop-disband-${plan.id}`,planId:plan.id,abandonedSiteId:abandoned.id,
      sectId:abandoned.sectId,originId:abandoned.originId,destinationId:abandoned.destinationId,tick:world.tick,
      returns:[],voidedOfferIds:[],
    };
    for(const order of world.workshops.orders) {
      if(order.siteId!==origin.id || order.institution?.sectId!==epoch.sectId ||
        order.institution?.establishedTick!==epoch.establishedTick || order.institution?.arrivalPlanId!==epoch.arrivalPlanId ||
        order.offeredTick>=world.tick || !alive(person(world,order.patronId)) || !alive(person(world,order.makerId))) continue;
      const paid=active(world,order);
      if(!paid && !offered(world,order)) continue;
      if(!settle(world,order,'cancelled','institution_closed')) continue;
      order.disbandmentId=closure.id;
      if(paid && order.acceptedTick!==undefined) {
        closure.returns.push({orderId:order.id,patronId:order.patronId,makerId:order.makerId,acceptedTick:order.acceptedTick,
          tier:order.tier,quantity:order.quantity,workCount:order.work.length,
          consumedStones:order.work.reduce((sum,work)=>sum+work.stonesUsed,0),
          consumedHerbs:order.work.reduce((sum,work)=>sum+work.herbsUsed,0),
          paidWages:order.work.reduce((sum,work)=>sum+(work.feePaid??0),0),
          refundedStones:order.refundedStones,refundedHerbs:order.refundedHerbs});
        events.push(event(world,order,'institution-return','旧山门工坊撤并，实退原委托余料',
          `只退实余${order.refundedStones}灵石及${order.refundedHerbs}份玄土根；已履行工序、发放工钱与成品不重复结算。`));
      } else {
        closure.voidedOfferIds.push(order.id);
        events.push(event(world,order,'institution-void','旧山门工坊撤并，未付款邀约撤销','未收取灵石或材料，无需退款。'));
      }
    }
    state.closures.push(closure);
    events.push({id:`evt-${closure.id}`,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',
      title:'旧山门工坊停止承接',description:`${origin.name}的旧工坊章程随迁宗终止；${destination.name}只承接山门，不承继原委托。`,
      actorIds:[],locationId:origin.id});
  }
  if(state.closures.length>WORKSHOP_DISBANDMENT_HISTORY_LIMIT) {
    const keep=new Set(state.closures.slice(-WORKSHOP_DISBANDMENT_HISTORY_LIMIT).map(row=>row.id));
    for(const order of world.workshops.orders) if(order.disbandmentId) keep.add(order.disbandmentId);
    state.closures=state.closures.filter(row=>keep.has(row.id));
  }
  return events;
}

export function advanceWorkshops(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const order of world.workshops.orders) {
    advanceWorkshopReleaseNegotiations(order,world.tick);
    if(order.estateContinuation){
      const transition=advanceWorkshopEstate(world,order);
      if(transition)events.push(transition);
      continue;
    }
    const hold=holdWorkshopEstate(world,order);
    if(hold){events.push(hold);continue;}
    if (order.status !== 'active' && order.status !== 'offered') continue;
    const patron = person(world, order.patronId), maker = person(world, order.makerId);
    const reason: WorkshopCloseReason | undefined = !alive(patron) ? 'patron_unavailable' : !alive(maker) ? 'maker_unavailable' :
      !at(world, order.siteId) ? 'site_unavailable' :
      order.status === 'offered' && world.tick >= order.offerExpiresTick ? 'offer_expired' :
      order.status === 'active' && world.tick >= (effectiveWorkshopDeadline(order) ?? Infinity) ? 'work_expired' : undefined;
    if (!reason) continue; // Temporary absence/furnace downgrade leaves the agreement paused until a real deadline.
    const timedOut = reason === 'offer_expired' || reason === 'work_expired';
    if (settle(world, order, timedOut ? 'expired' : 'cancelled', reason)) {
      events.push(event(world, order, 'close', timedOut ? '工坊委制到期' : '工坊委制无法继续',
        `已核实并退回实余${order.refundedStones}灵石、${order.refundedHerbs}份玄土根；已付工钱及已耗投入不重复结算。`));
    }
  }
  const toolProofOrders = new Set(world.toolLoans.loans.flatMap(({workshopId,origin})=>[workshopId,origin.orderId]));
  const terminal = world.workshops.orders.filter(order => order.settledTick !== undefined && !order.capacityAmendment && !order.releaseNegotiations?.length && !order.estateContinuation && !toolProofOrders.has(order.id))
    .sort((a, b) => (b.settledTick! - a.settledTick!) || Number(b.id.slice(11)) - Number(a.id.slice(11)))
    .slice(0, WORKSHOP_TERMINAL_LIMIT);
  const retain = new Set(terminal.map(({ id }) => id));
  world.workshops.orders = world.workshops.orders.filter(order => order.settledTick === undefined || !!order.capacityAmendment || !!order.releaseNegotiations?.length || !!order.estateContinuation || toolProofOrders.has(order.id) || retain.has(order.id));
  return events;
}

/** Private terms and job receipts are participant records, not world intelligence. */
export function visibleWorkshopOrders(world: WorldState, actor?: Cultivator): WorkshopOrder[] {
  return actor && person(world, actor.id) === actor
    ? world.workshops.orders.filter(order => order.offeredTick <= world.tick && (participant(actor, order)||
        order.estateContinuation?.beneficiaryId===actor.id||
        order.status==='probate_hold'&&workshopEstateBeneficiary(world,order,world.tick+1)===actor.id&&
          releaseLocal(world,actor,at(world,order.siteId),world.tick))) : [];
}

export const WORKSHOP_RELEASE_OFFER_TICKS=2;
export const WORKSHOP_RELEASE_MAX_NEGOTIATIONS=WORKSHOP_ACTIVE_TICKS;
export type WorkshopReleaseOption={action:'WORKSHOP_RELEASE';targetWorkshopId:string}&(
  | {workshopReleaseMove:'propose';targetWorkshopReleaseId?:never}
  | {workshopReleaseMove:'accept'|'decline';targetWorkshopReleaseId:string}
);

/** Exact new release source is the first native blank+finish, not a forecast or failure story. */
export function workshopReleaseSource(order:WorkshopOrder){
  if(order.institution||order.capacityAmendment||order.quantity!==2||order.acceptedTick===undefined||order.work.length<2)return undefined;
  const [blank,finish]=order.work,terms=workshopTerms(order.tier,2);
  if(blank.piece!==1||finish.piece!==1||blank.stage!=='blank'||finish.stage!=='finish'||
    blank.makerId!==order.makerId||finish.makerId!==order.makerId||blank.tick<=order.acceptedTick||finish.tick<=blank.tick||
    blank.stonesUsed!==terms.blankFuel||finish.stonesUsed!==terms.finishFuel||blank.herbsUsed!==1||finish.herbsUsed!==1||
    blank.artifactId!==undefined||blank.feePaid!==undefined||blank.quality!==undefined||blank.qualityScore!==undefined||
    blank.toolUse!==undefined||!Number.isInteger(finish.qualityScore)||
    finish.qualityScore!<0||finish.qualityScore!>100||finish.quality!==workshopGradeForScore(finish.qualityScore!))return undefined;
  const delivered=finish.quality==='fine'||finish.quality==='standard'&&order.qualityFloor==='standard';
  if(delivered?(finish.artifactId!==artifactIdFor(order,1)||finish.feePaid!==terms.feePerPiece):
    (finish.artifactId!==undefined||finish.feePaid!==undefined&&finish.feePaid!==0))return undefined;
  return {firstFinishTick:finish.tick,firstOutcome:delivered?'delivered' as const:'stock_unavailable' as const,
    balanceStones:terms.totalStones-blank.stonesUsed-finish.stonesUsed-(finish.feePaid??0),
    balanceHerbs:terms.totalHerbs-blank.herbsUsed-finish.herbsUsed};
}

function releaseFunds(order:WorkshopOrder,proof:NonNullable<ReturnType<typeof workshopReleaseSource>>):boolean{
  return order.work.length===2&&order.escrowStones===proof.balanceStones&&order.escrowHerbs===proof.balanceHerbs&&
    order.escrowStones>0&&order.escrowHerbs>0&&order.refundedStones===0&&order.refundedHerbs===0;
}
const releaseSignature=(row:NonNullable<WorkshopOrder['releaseNegotiations']>[number],proof:NonNullable<ReturnType<typeof workshopReleaseSource>>)=>
  row.firstFinishTick===proof.firstFinishTick&&row.firstOutcome===proof.firstOutcome&&
  row.balanceStones===proof.balanceStones&&row.balanceHerbs===proof.balanceHerbs;

function releaseLocal(world:WorldState,actor:Cultivator|undefined,site:LocationNode|undefined,tick:number):actor is Cultivator{
  return stillThere(world,actor,site,tick)&&onLowerPlane(actor)&&!expeditionRescueCheckpoint(world,actor);
}

export function availableWorkshopReleaseActions(actor:Cultivator,world:WorldState,executionTick=world.tick):WorkshopReleaseOption[]{
  if(!alive(actor)||person(world,actor.id)!==actor||(executionTick!==world.tick&&executionTick!==world.tick+1))return [];
  const options:WorkshopReleaseOption[]=[];
  for(const order of world.workshops.orders){
    if(!participant(actor,order)||order.status!=='active'||order.settledTick!==undefined||
        order.deadlineTick===undefined||executionTick>=order.deadlineTick)continue;
    const proof=workshopReleaseSource(order);
    if(!proof||executionTick<=proof.firstFinishTick||!releaseFunds(order,proof))continue;
    const site=at(world,order.siteId),maker=person(world,order.makerId),patron=person(world,order.patronId);
    if(!releaseLocal(world,actor,site,executionTick))continue;
    const pending=order.releaseNegotiations?.find(row=>row.status==='offered'&&executionTick<row.expiresTick);
    if(pending){
      if(pending.proposerId===actor.id||![order.patronId,order.makerId].includes(pending.proposerId)||
        pending.id!==`workshop-release-${order.id}-${pending.offeredTick}`||pending.offeredTick<=proof.firstFinishTick||
        pending.expiresTick!==Math.min(pending.offeredTick+WORKSHOP_RELEASE_OFFER_TICKS,order.deadlineTick)||
        pending.offeredTick>=executionTick||pending.closedTick!==undefined||pending.responderId!==undefined||
        pending.returnedStones!==undefined||pending.returnedHerbs!==undefined||pending.supersededBy!==undefined||
        !releaseSignature(pending,proof))continue;
      options.push({action:'WORKSHOP_RELEASE',workshopReleaseMove:'decline',targetWorkshopId:order.id,targetWorkshopReleaseId:pending.id});
      if(releaseLocal(world,maker,site,executionTick)&&releaseLocal(world,patron,site,executionTick)&&
          refundFits(patron,order.escrowStones,order.escrowHerbs))
        options.push({action:'WORKSHOP_RELEASE',workshopReleaseMove:'accept',targetWorkshopId:order.id,targetWorkshopReleaseId:pending.id});
    }else if(executionTick+1<order.deadlineTick&&releaseLocal(world,maker,site,executionTick)&&releaseLocal(world,patron,site,executionTick)&&
        (order.releaseNegotiations?.length??0)<WORKSHOP_RELEASE_MAX_NEGOTIATIONS&&
        !order.releaseNegotiations?.some(row=>row.offeredTick===executionTick)){
      options.push({action:'WORKSHOP_RELEASE',workshopReleaseMove:'propose',targetWorkshopId:order.id});
    }
  }
  return options;
}

/** No offer creates a halt or a claim on inventory. Existing stage/contract proceeds normally. */
function advanceWorkshopReleaseNegotiations(order:WorkshopOrder,tick:number){
  for(const row of order.releaseNegotiations??[]){
    if(row.status!=='offered')continue;
    if(tick>=row.expiresTick){
      row.status='expired';row.closedTick=row.expiresTick;
      continue;
    }
    if(order.status!=='active'){
      row.status='superseded';row.supersededBy='contract_closed';
    }else if(order.work.length!==2||!workshopReleaseSource(order)){
      row.status='superseded';row.supersededBy='work_changed';
    }else continue;
    row.closedTick=tick;
  }
}
export function resolveWorkshopReleaseAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='WORKSHOP_RELEASE')return null;
  const fields=new Set(['chosenAction','innerMonologue','workshopReleaseMove','targetWorkshopId','targetWorkshopReleaseId']);
  if(Object.keys(payload).some(key=>!fields.has(key))||
    payload.workshopReleaseMove==='propose'&&Object.hasOwn(payload,'targetWorkshopReleaseId'))return null;
  const choice=availableWorkshopReleaseActions(actor,world).find(row=>row.workshopReleaseMove===payload.workshopReleaseMove&&
    row.targetWorkshopId===payload.targetWorkshopId&&row.targetWorkshopReleaseId===payload.targetWorkshopReleaseId);
  if(!choice)return null;
  const order=world.workshops.orders.find(row=>row.id===choice.targetWorkshopId)!;
  advanceWorkshopReleaseNegotiations(order,world.tick);
  if(choice.workshopReleaseMove==='propose'){
    const proof=workshopReleaseSource(order)!;
    (order.releaseNegotiations??=[]).push({id:`workshop-release-${order.id}-${world.tick}`,proposerId:actor.id,offeredTick:world.tick,
      expiresTick:Math.min(world.tick+WORKSHOP_RELEASE_OFFER_TICKS,order.deadlineTick!),status:'offered',...proof});
    return event(world,order,'release-proposed','双方释约尚待应允','只提出停作余件，不停原有工序，不调用付款或退款。');
  }
  const negotiation=order.releaseNegotiations!.find(row=>row.id===choice.targetWorkshopReleaseId)!;
  if(choice.workshopReleaseMove==='decline'){
    negotiation.status='declined';negotiation.responderId=actor.id;negotiation.closedTick=world.tick;
    return event(world,order,'release-declined','对方谢绝释约','原委托、既有交割与托管均未改动。');
  }
  const returnedStones=order.escrowStones,returnedHerbs=order.escrowHerbs;
  if(!settle(world,order,'cancelled','mutual_release'))return null;
  Object.assign(negotiation,{status:'accepted',responderId:actor.id,closedTick:world.tick,returnedStones,returnedHerbs});
  return event(world,order,'release-accepted','双方应允释约',
    `已按原托管实退${returnedStones}灵石与${returnedHerbs}份玄土根；旧交割与实发工钱不重算。`);
}

export type {WorkshopEstateOption} from './workshopEstateTerms';
export {WORKSHOP_ESTATE_OFFER_TICKS,WORKSHOP_ESTATE_REPLY_TICKS,WORKSHOP_ESTATE_WORK_TICKS} from './workshopEstateTerms';

/** This is the original funded blank, not a newly created artifact or estate asset. */
export function workshopEstateBlank(order:WorkshopOrder){
  const blank=order.work[0], terms=workshopTerms(order.tier,1);
  if(order.institution||order.disbandmentId||order.capacityOffer||order.capacityAmendment||order.releaseNegotiations?.length||
    order.quantity!==1||order.acceptedTick===undefined||order.deadlineTick===undefined||!blank||
    blank.piece!==1||blank.stage!=='blank'||blank.makerId!==order.makerId||blank.tick<=order.acceptedTick||
    blank.tick>=order.deadlineTick||blank.stonesUsed!==terms.blankFuel||blank.herbsUsed!==1||
    blank.quality!==undefined||blank.qualityScore!==undefined||blank.feePaid!==undefined||blank.artifactId!==undefined||
    blank.toolUse!==undefined)return undefined;
  return {blank,stones:terms.totalStones-blank.stonesUsed,herbs:terms.totalHerbs-blank.herbsUsed};
}
function workshopEstateCustodyUnchanged(order:WorkshopOrder):boolean{
  const source=workshopEstateBlank(order),estate=order.estateContinuation;
  return !!source&&order.work.length===1&&source.stones===order.escrowStones&&source.herbs===order.escrowHerbs&&
    !order.refundedStones&&!order.refundedHerbs&&(!estate||estate.heldStones===source.stones&&estate.heldHerbs===source.herbs);
}

function estateVisit(world:WorldState,order:WorkshopOrder,phase:'hold'|'offer'|'accept',title:string,description:string):WorldEvent{
  return event(world,order,`estate-${phase}`,title,description);
}
function workshopEstateHoldDue(world:WorldState,order:WorkshopOrder,tick:number):boolean{
  if(order.status!=='active'||order.estateContinuation||order.settledTick!==undefined||tick>=(order.deadlineTick??0))return false;
  const patron=person(world,order.patronId);
  return !!patron&&!patron.alive&&patron.hp===0&&onLowerPlane(patron)&&alive(person(world,order.makerId))&&
    !world.estates.entries.some(estate=>estate.deceasedId===patron.id&&estate.openedTick!==tick)&&
    !!at(world,order.siteId)&&workshopEstateCustodyUnchanged(order);
}
function holdWorkshopEstate(world:WorldState,order:WorkshopOrder):WorldEvent|null{
  if(!workshopEstateHoldDue(world,order,world.tick))return null;
  order.estateContinuation={estateId:`estate-${order.patronId}`,heldTick:world.tick,heldStones:order.escrowStones,heldHerbs:order.escrowHerbs,phase:'held'};
  order.status='probate_hold';
  return estateVisit(world,order,'hold','旧坯留炉，余料封账','原委托人已不在世。只守原坯与余款，不提前交遗产或给任何人另记一单。');
}
function releaseWorkshopEstate(world:WorldState,order:WorkshopOrder,reason:WorkshopEstateReleaseReason):WorldEvent|null{
  const chain=order.estateContinuation;
  if(!chain||chain.phase==='released'||chain.phase==='completed'||!workshopEstateCustodyUnchanged(order)||
    !settle(world,order,'cancelled','estate_returned'))return null;
  chain.phase='released';chain.closedTick=world.tick;chain.releaseReason=reason;
  return event(world,order,'estate-release','遗托续制未成，原余料归账',
    `只退尚存的${order.refundedStones}灵石和${order.refundedHerbs}份玄土根，回原委托人的同一遗产；旧坯不重作、不估价。`);
}
function advanceWorkshopEstate(world:WorldState,order:WorkshopOrder):WorldEvent|null{
  const chain=order.estateContinuation;
  if(!chain||chain.phase==='released'||chain.phase==='completed')return null;
  const tick=world.tick,estate=workshopEstateFor(world,order),site=at(world,order.siteId);
  const maker=person(world,order.makerId);
  if(!site)return releaseWorkshopEstate(world,order,'site_unavailable');
  if(!alive(maker))return releaseWorkshopEstate(world,order,'maker_unavailable');
  if(estate?.status==='unclaimed')return releaseWorkshopEstate(world,order,'unclaimed');
  if(!estate||estate.status==='open'||estate.settledTick===undefined||estate.settledTick>=tick)return null;
  const id=workshopEstateBeneficiary(world,order,tick);
  if(!id||!alive(person(world,id)))return releaseWorkshopEstate(world,order,'heir_unavailable');
  if(chain.phase==='held'&&tick>=estate.settledTick+WORKSHOP_ESTATE_OFFER_TICKS||
    chain.phase==='offered'&&tick>=(chain.replyUntilTick??0)||
    chain.phase==='resumed'&&tick>=(chain.workUntilTick??0))return releaseWorkshopEstate(world,order,'lapsed');
  return null;
}

export function availableWorkshopEstateActions(actor:Cultivator,world:WorldState,tick=world.tick):WorkshopEstateOption[]{
  if((tick!==world.tick&&tick!==world.tick+1)||person(world,actor.id)!==actor||!alive(actor))return [];
  const choices:WorkshopEstateOption[]=[];
  for(const order of world.workshops.orders){
    const chain=order.estateContinuation;
    if(order.status!=='probate_hold'||!chain||chain.heldTick>=tick||!workshopEstateCustodyUnchanged(order))continue;
    const estate=workshopEstateFor(world,order),id=workshopEstateBeneficiary(world,order,tick);
    if(!id||!estate||estate.settledTick===undefined)continue;
    const heir=person(world,id),maker=person(world,order.makerId),site=at(world,order.siteId);
    if(!releaseLocal(world,heir,site,tick)||!releaseLocal(world,maker,site,tick))continue;
    const add=(workshopEstateMove:WorkshopEstateOption['workshopEstateMove'])=>
      choices.push({action:'WORKSHOP_ESTATE',workshopEstateMove,targetWorkshopId:order.id});
    if(chain.phase==='held'&&actor===heir&&tick<estate.settledTick+WORKSHOP_ESTATE_OFFER_TICKS)add('offer');
    if(chain.phase!=='offered'||actor!==maker||chain.beneficiaryId!==id||
      tick<=(chain.offeredTick??Infinity)||tick>=(chain.replyUntilTick??0))continue;
    add('decline');
    const occupied=world.workshops.orders.some(other=>other!==order&&active(world,other)&&
      (other.makerId===order.makerId||other.siteId===order.siteId));
    if(!occupied&&heir.artifacts.length<WORKSHOP_CAPACITY&&makerEligible(world,maker,site,order.tier))add('accept');
  }
  return choices;
}
export function resolveWorkshopEstateAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='WORKSHOP_ESTATE'||Object.keys(payload).some(key=>
    !['chosenAction','innerMonologue','workshopEstateMove','targetWorkshopId'].includes(key)))return null;
  const choice=availableWorkshopEstateActions(actor,world).find(row=>row.workshopEstateMove===payload.workshopEstateMove&&row.targetWorkshopId===payload.targetWorkshopId);
  const order=choice&&world.workshops.orders.find(row=>row.id===choice.targetWorkshopId),chain=order?.estateContinuation;
  if(!choice||!order||!chain)return null;
  const tick=world.tick;
  if(choice.workshopEstateMove==='offer'){
    chain.phase='offered';chain.beneficiaryId=actor.id;chain.offeredTick=tick;chain.replyUntilTick=tick+WORKSHOP_ESTATE_REPLY_TICKS;
    return estateVisit(world,order,'offer','裁定继承人只请续原坯','此处仍是原契、原工匠、原托管；只等工匠下一月亲答。');
  }
  if(choice.workshopEstateMove==='decline')return releaseWorkshopEstate(world,order,'declined');
  chain.phase='resumed';chain.resumeTick=tick;chain.workUntilTick=tick+WORKSHOP_ESTATE_WORK_TICKS;
  order.status='active';
  return estateVisit(world,order,'accept','原工匠当面应下续制','从原坯接手，下月才走原来最后一道工序；未重交灵石，未另起一张委托。');
}
