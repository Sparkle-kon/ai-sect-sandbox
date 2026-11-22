import {availableCivicMemorialActions,type CivicMemorialOption} from './civicMemorialEngine';
import {availableMarketFreightActions,type MarketFreightOption} from './escortEngine';
import {availableDisasterShelterActions} from './disasterShelterEngine';
import type {DisasterShelterOption} from '../types/disasterShelter';
import {availableCraftTrainingActions,type CraftTrainingOption} from './craftTrainingEngine';
import {availableWaypostMealActions,type WaypostMealOption} from './waypostMealEngine';
import {availableWorkshopEstateActions,type WorkshopEstateOption} from './workshopEngine';
import {availableScribeCommissionActions,type ScribeCommissionOption} from './scribeCommissionEngine';
import {availableWorkshopReleaseActions,type WorkshopReleaseOption} from './workshopEngine';
import {onLowerPlane,onUpperPassagePlane} from './upperPassageIsolation';
import {upperArrayFieldPhysicalSite} from './upperArrayFieldMovementEngine';
import {availableUpperArrayFieldActions,upperArrayFieldCommand,upperArrayFieldOptionKey,type UpperArrayFieldOption} from './upperArrayFieldActions';
import {availableFrontierActions,frontierCommand,frontierOptionKey,type FrontierOption} from './frontierActions';
import {frontierPhysicalSite} from './frontierMovementEngine';
import {availableDoctrineMaturityActions,type DoctrineMaturityOption} from './doctrineMaturityEngine';
import {availableDoctrineFoundingActions,type DoctrineFoundingOption} from './doctrineFoundingEngine';
import { availableNorthGateRenewalActions,type NorthGateRenewalOption } from './northGateRenewalEngine';
import { availableUpperPassageActions,type UpperPassageOption } from './upperPassageEngine';
import { availableNorthWellReviewActions,type NorthWellReviewOption } from './northWellRevisitEngine';
import { availableNorthMiningCharterActions,type NorthMiningOption } from './northMiningCharterEngine';
import { availableWaterVeinActions,type WaterVeinOption } from './waterVeinEngine';
import { availableDanxiaMedicineActions } from './danxiaMedicineEngine';
import {availableDanxiaReviewActions,type DanxiaReviewOption} from './danxiaSeasonReviewEngine';
import { activeDanxiaMedicineEscort,danxiaMedicineActedThisTick } from './danxiaMedicineTerms';
import type { AvatarIntent, AvatarInteractionMode, AvatarInteractionOption, AvatarInteractionRequest, AvatarOrder, AvatarTranscriptEntry, Cultivator, LLMDecisionPayload, PlayerAvatarState, WorldState } from '../types/world';
import { availableArtifactSalvageActions } from './artifactSalvageEngine';
import { activeSiegeForActor } from './diplomacyEngine';
import { isTribulationActive } from './tribulationEngine';

const MAX_ESSENCE = 100;
export const AVATAR_POSSESSION_COST = 24;
export const AVATAR_ORDER_COST = 5;
export const AVATAR_MESSAGE_LIMIT = 220;
const POSSESSION_TICKS = 5;
const TRANSCRIPT_LIMIT = 72;
const GLOBAL_COOLDOWN = 1;
const TARGET_COOLDOWN = 2;
const costs: Record<AvatarIntent, number> = { guide: 7, persuade: 9, deceive: 12, interrogate: 10, recruit: 18 };
const intents = Object.keys(costs) as AvatarIntent[];
export const avatarInteractionCost = (mode: AvatarInteractionMode, intent: AvatarIntent): number => costs[intent] + (mode === 'ring' ? 3 : 0);
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const clean = (value: unknown, max: number) => typeof value === 'string' ?
  value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const availableBody = (world: WorldState, actor: Cultivator) => actor.alive && actor.hp > 0 &&
  actor.positionPlane !== 'immortal' && !isTribulationActive(actor) && !activeDanxiaMedicineEscort(world,actor) && !danxiaMedicineActedThisTick(world,actor) &&
  !activeSiegeForActor(world, actor) && !world.occasions.some((holiday) =>
    (holiday.status === 'registration' || holiday.status === 'running') && holiday.participantIds.includes(actor.id));

export function createPlayerAvatarState(): PlayerAvatarState {
  return { essence: 100, switchAvailableTick: 0, lastRefreshTick: 1, transcript: [] };
}

export function activeAvatar(world: WorldState): Cultivator | undefined {
  const state = world.playerAvatar;
  if (!state?.possessedId || (state.possessionUntilTick ?? 0) <= world.tick) return undefined;
  return world.cultivators.find((person) => person.id === state.possessedId && availableBody(world, person));
}

export function availableAvatarHosts(world: WorldState): Cultivator[] {
  const state = world.playerAvatar;
  if (!state || world.tick < state.switchAvailableTick || state.essence < AVATAR_POSSESSION_COST) return [];
  return world.cultivators.filter((person) => person.id !== activeAvatar(world)?.id && availableBody(world, person) && onLowerPlane(person) &&
    world.locations.some(({ id }) => id === person.locationId));
}

export function possessAvatar(world: WorldState, actorId: string | null): boolean {
  const state = world.playerAvatar;
  if (actorId === null) {
    if (!state.possessedId) return false;
    delete state.possessedId;
    delete state.possessionUntilTick;
    delete state.pendingOrder;
    return true;
  }
  if (!availableAvatarHosts(world).some(({ id }) => id === actorId)) return false;
  return attachAvatar(world,actorId);
}

function attachAvatar(world:WorldState,actorId:string):boolean{
  const state=world.playerAvatar;
  delete state.pendingOrder;
  state.essence -= AVATAR_POSSESSION_COST;
  state.possessedId = actorId;
  state.possessionUntilTick = world.tick + POSSESSION_TICKS;
  state.switchAvailableTick = world.tick + 3;
  return true;
}

/** Explicitly reacquire the same real traveler; lower host lists never enumerate this lane. */
export function canPossessUpperPassageAvatar(world:WorldState,actorId:string):boolean{
  const state=world.playerAvatar;
  if(!state||state.essence<AVATAR_POSSESSION_COST||world.tick<state.switchAvailableTick||
    activeAvatar(world)?.id===actorId)return false;
  const actor=world.cultivators.find(row=>row.id===actorId);
  return !!actor&&onUpperPassagePlane(actor)&&availableBody(world,actor)&&
    (!!upperArrayFieldPhysicalSite(world,actor)||!!world.upperPassage?.journeys.some(row=>row.actorId===actorId&&
      row.returnedTick===undefined&&row.deceasedTick===undefined&&row.steps.at(-1)?.nodeId===actor.locationId));
}
export function possessUpperPassageAvatar(world:WorldState,actorId:string):boolean{
  return canPossessUpperPassageAvatar(world,actorId) && attachAvatar(world,actorId);
}

export function canPossessFrontierAvatar(world:WorldState,actorId:string):boolean{
  const state=world.playerAvatar,actor=world.cultivators.find(row=>row.id===actorId);
  return !!actor&&!!state&&state.essence>=AVATAR_POSSESSION_COST&&world.tick>=state.switchAvailableTick&&
    activeAvatar(world)?.id!==actorId&&availableBody(world,actor)&&!!frontierPhysicalSite(world,actor,world.tick);
}
export function possessFrontierAvatar(world:WorldState,actorId:string):boolean{
  return canPossessFrontierAvatar(world,actorId)&&attachAvatar(world,actorId);
}

export function maintainPlayerAvatar(world: WorldState): void {
  const state = world.playerAvatar;
  if (world.tick > state.lastRefreshTick) {
    state.essence = clamp(state.essence + (world.tick - state.lastRefreshTick) * 5, 0, MAX_ESSENCE);
    state.lastRefreshTick = world.tick;
  }
  if (state.possessedId && !activeAvatar(world)) {
    delete state.possessedId;
    delete state.possessionUntilTick;
    delete state.pendingOrder;
  }
}

export function queueAvatarOrder(world: WorldState, action: AvatarOrder): boolean {
  const state = world.playerAvatar;
  const host = activeAvatar(world);
  if (!state || !host || !onLowerPlane(host) || state.pendingOrder || state.essence < AVATAR_ORDER_COST ||
      (state.possessionUntilTick ?? 0) <= world.tick + 1 || (action !== 'REST' && action !== 'CULTIVATE')) return false;
  state.essence -= AVATAR_ORDER_COST;
  state.pendingOrder = { actorId: host.id, action, queuedTick: world.tick };
  return true;
}

/** Queue explicit, exact custody intent without spending a furnace slot or advancing time. */
export function canQueueAvatarSalvage(world: WorldState, actorId: string): boolean {
  const state = world.playerAvatar;
  return Boolean(state && activeAvatar(world)?.id === actorId && !state.pendingOrder &&
    state.essence >= AVATAR_ORDER_COST && (state.possessionUntilTick ?? 0) > world.tick + 1);
}

export function queueAvatarSalvage(world: WorldState, actorId: string, targetArtifactId: string, targetLocationId: string): boolean {
  const { playerAvatar: state } = world;
  const host = activeAvatar(world);
  if (!host || !canQueueAvatarSalvage(world, actorId) ||
      !availableArtifactSalvageActions(host, world, world.tick + 1).some((option) =>
        option.targetArtifactId === targetArtifactId && option.targetLocationId === targetLocationId)) return false;
  state.essence -= AVATAR_ORDER_COST;
  state.pendingOrder = { actorId, action: 'SALVAGE_ARTIFACT', queuedTick: world.tick, targetArtifactId, targetLocationId };
  return true;
}

/** Record an exact local intent without drawing water, spending sect funds or moving the body. */
export function queueAvatarWaterVein(world:WorldState,actorId:string,option:WaterVeinOption):boolean {
  const host=activeAvatar(world);
  if(!host||!canQueueAvatarSalvage(world,actorId)||option.action!=='WATER_VEIN')return false;
  const exact=availableWaterVeinActions(host,world,world.tick+1).find(row=>row.waterVeinMove===option.waterVeinMove&&
    row.targetLocationId===option.targetLocationId);
  if(!exact||exact.targetLocationId!=='loc-vein-north')return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,action:'WATER_VEIN',
    waterVeinMove:exact.waterVeinMove,targetLocationId:exact.targetLocationId};
  return true;
}

/** Queue the holder's explicit native charter choice; do not open the register, sign or reserve money yet. */
export function queueAvatarNorthMiningCharter(world:WorldState,actorId:string,option:NorthMiningOption):boolean {
  const host=activeAvatar(world);
  if(!host||!canQueueAvatarSalvage(world,actorId)||option.action!=='NORTH_MINING_CHARTER')return false;
  const exact=availableNorthMiningCharterActions(host,world,world.tick+1).find(row=>row.northMiningMove===option.northMiningMove&&
    row.northMiningStance===option.northMiningStance&&row.targetNorthMiningCharterId===option.targetNorthMiningCharterId);
  if(!exact)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...exact};
  return true;
}

/** Queue only an explicit exact old-well review; payment and any permit require actual execution. */
export function queueAvatarNorthGateRenewal(world:WorldState,actorId:string,option:NorthGateRenewalOption):boolean {
  const host=activeAvatar(world);
  if(!host||!canQueueAvatarSalvage(world,actorId)||option.action!=='NORTH_GATE_RENEWAL')return false;
  const exact=availableNorthGateRenewalActions(host,world,world.tick+1).find(row=>row.northGateRenewalMove===option.northGateRenewalMove&&
    row.targetNorthGateRenewalId===option.targetNorthGateRenewalId);
  if(!exact)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...exact};
  return true;
}

export function queueAvatarNorthWellReview(world:WorldState,actorId:string,option:NorthWellReviewOption):boolean {
  const host=activeAvatar(world);
  if(!host||!canQueueAvatarSalvage(world,actorId)||option.action!=='NORTH_WELL_REVIEW')return false;
  const exact=availableNorthWellReviewActions(host,world,world.tick+1).find(row=>row.northWellReviewMove===option.northWellReviewMove&&
    row.targetNorthMiningCharterId===option.targetNorthMiningCharterId);
  if(!exact)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...exact};
  return true;
}

/** Spend only the existing command essence; an upper action must still be legal at execution. */
export function queueAvatarUpperPassage(world:WorldState,actorId:string,option:UpperPassageOption):boolean {
  const host=activeAvatar(world);
  if(!host||!canQueueAvatarSalvage(world,actorId)||option.action!=='UPPER_PASSAGE')return false;
  const exact=availableUpperPassageActions(host,world,world.tick+1).find(row=>row.upperPassageMove===option.upperPassageMove&&
    row.targetUpperPassageNodeId===option.targetUpperPassageNodeId);
  if(!exact)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...exact};
  return true;
}

export type AvatarDanxiaMedicineOption=ReturnType<typeof availableDanxiaMedicineActions>[number];

/** Queue an eligible exact medicinal choice without reserving any stock before the native turn. */
export function queueAvatarDanxiaMedicine(world:WorldState,actorId:string,choice:AvatarDanxiaMedicineOption):boolean {
  const host=activeAvatar(world);
  if(!host||!canQueueAvatarSalvage(world,actorId)||choice.danxiaMedicineMove==='observe')return false;
  const listed=availableDanxiaMedicineActions(host,world,world.tick+1).find(option=>
    option.danxiaMedicineMove===choice.danxiaMedicineMove&&option.targetDanxiaShortageId===choice.targetDanxiaShortageId&&
    option.targetDanxiaMedicineId===choice.targetDanxiaMedicineId&&option.targetCultivatorId===choice.targetCultivatorId);
  if(!listed)return false;
  const {danxiaMedicineMove,targetDanxiaShortageId,targetDanxiaMedicineId,targetCultivatorId}=listed;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,action:'DANXIA_MEDICINE',queuedTick:world.tick,danxiaMedicineMove,
    ...(targetDanxiaShortageId?{targetDanxiaShortageId}:{}),...(targetDanxiaMedicineId?{targetDanxiaMedicineId}:{}),
    ...(targetCultivatorId?{targetCultivatorId}:{} )};
  return true;
}

export function queueAvatarDanxiaReview(world:WorldState,actorId:string,option:DanxiaReviewOption):boolean {
  const host=activeAvatar(world);
  if(!host||!canQueueAvatarSalvage(world,actorId))return false;
  const legal=availableDanxiaReviewActions(host,world,world.tick+1).find(row=>row.danxiaReviewMove===option.danxiaReviewMove&&
    row.targetDanxiaReviewId===option.targetDanxiaReviewId&&row.targetSettlementRecordId===option.targetSettlementRecordId);
  if(!legal)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...legal};
  return true;
}

export function queueAvatarDoctrineFounding(world:WorldState,actorId:string,option:DoctrineFoundingOption):boolean {
  const host=activeAvatar(world);
  if(!host||!canQueueAvatarSalvage(world,actorId))return false;
  const exact=availableDoctrineFoundingActions(host,world,world.tick+1).find(row=>row.doctrineFoundingMove===option.doctrineFoundingMove&&
    row.targetDoctrineFoundingId===option.targetDoctrineFoundingId&&row.targetDoctrineSchoolId===option.targetDoctrineSchoolId&&
    row.targetRelocationId===option.targetRelocationId);
  if(!exact)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...exact};
  return true;
}

export function queueAvatarDoctrineMaturity(world:WorldState,actorId:string,option:DoctrineMaturityOption):boolean {
  const host=activeAvatar(world);
  if(!host||!canQueueAvatarSalvage(world,actorId))return false;
  const exact=availableDoctrineMaturityActions(host,world,world.tick+1).find(row=>row.doctrineMaturityMove===option.doctrineMaturityMove&&
    row.targetDoctrineFoundingId===option.targetDoctrineFoundingId);
  if(!exact)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...exact};
  return true;
}

export function queueAvatarFrontier(world:WorldState,actorId:string,choice:FrontierOption):boolean{
  const host=activeAvatar(world);
  if(!host||!canQueueAvatarSalvage(world,actorId))return false;
  const exact=availableFrontierActions(host,world,world.tick+1).find(option=>frontierOptionKey(option)===frontierOptionKey(choice));
  if(!exact)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...exact};
  return true;
}

export function queueAvatarUpperArrayField(world:WorldState,actorId:string,choice:UpperArrayFieldOption):boolean{
  const host=activeAvatar(world);
  if(!host||!canQueueAvatarSalvage(world,actorId))return false;
  const exact=availableUpperArrayFieldActions(host,world,world.tick+1).find(option=>upperArrayFieldOptionKey(option)===upperArrayFieldOptionKey(choice));
  if(!exact)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...exact};
  return true;
}

export function queueAvatarWorkshopRelease(world:WorldState,actorId:string,choice:WorkshopReleaseOption):boolean {
  const host=activeAvatar(world);
  if(!host||!onLowerPlane(host)||!canQueueAvatarSalvage(world,actorId)||choice.action!=='WORKSHOP_RELEASE')return false;
  const options=availableWorkshopReleaseActions(host,world,world.tick+1).filter(option=>
    option.workshopReleaseMove===choice.workshopReleaseMove&&option.targetWorkshopId===choice.targetWorkshopId&&
    option.targetWorkshopReleaseId===choice.targetWorkshopReleaseId);
  if(options.length!==1)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...options[0]};
  return true;
}

export function queueAvatarScribeCommission(world:WorldState,actorId:string,choice:ScribeCommissionOption):boolean {
  const host=activeAvatar(world);
  if(!host||!onLowerPlane(host)||!canQueueAvatarSalvage(world,actorId)||choice.action!=='SCRIBE_COMMISSION')return false;
  const options=availableScribeCommissionActions(host,world,world.tick+1).filter(option=>
    option.scribeCommissionMove===choice.scribeCommissionMove&&option.targetScribeCommissionId===choice.targetScribeCommissionId&&
    option.targetChronicleSourceId===choice.targetChronicleSourceId&&option.targetCultivatorId===choice.targetCultivatorId);
  if(options.length!==1)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...options[0]};
  return true;
}

export function queueAvatarWorkshopEstate(world:WorldState,actorId:string,choice:WorkshopEstateOption):boolean {
  const host=activeAvatar(world);
  if(!host||!onLowerPlane(host)||!canQueueAvatarSalvage(world,actorId)||choice.action!=='WORKSHOP_ESTATE')return false;
  const options=availableWorkshopEstateActions(host,world,world.tick+1).filter(option=>
    option.workshopEstateMove===choice.workshopEstateMove&&option.targetWorkshopId===choice.targetWorkshopId);
  if(options.length!==1)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...options[0]};
  return true;
}

export function queueAvatarWaypostMeal(world:WorldState,actorId:string,choice:WaypostMealOption):boolean {
  const host=activeAvatar(world);
  if(!host||!onLowerPlane(host)||!canQueueAvatarSalvage(world,actorId)||choice.action!=='WAYPOST_MEAL')return false;
  const options=availableWaypostMealActions(host,world,world.tick+1).filter(option=>
    option.waypostMealMove===choice.waypostMealMove&&option.targetCultivatorId===choice.targetCultivatorId&&
    option.targetWaypostMealId===choice.targetWaypostMealId);
  if(options.length!==1)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...options[0]};
  return true;
}

export function queueAvatarCraftTraining(world:WorldState,actorId:string,choice:CraftTrainingOption):boolean {
  const host=activeAvatar(world);
  if(!host||!onLowerPlane(host)||!canQueueAvatarSalvage(world,actorId)||choice.action!=='CRAFT_TRAINING')return false;
  const options=availableCraftTrainingActions(host,world,world.tick+1).filter(option=>
    option.craftTrainingMove===choice.craftTrainingMove&&option.targetCultivatorId===choice.targetCultivatorId&&
    option.targetCraftTraineeId===choice.targetCraftTraineeId&&option.targetCraftTrainingId===choice.targetCraftTrainingId);
  if(options.length!==1)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...options[0]};
  return true;
}

export function queueAvatarDisasterShelter(world:WorldState,actorId:string,choice:DisasterShelterOption):boolean {
  const host=activeAvatar(world);
  if(!host||!onLowerPlane(host)||!canQueueAvatarSalvage(world,actorId)||choice.action!=='DISASTER_SHELTER')return false;
  const options=availableDisasterShelterActions(host,world,world.tick+1).filter(option=>
    option.disasterShelterMove===choice.disasterShelterMove&&option.targetCultivatorId===choice.targetCultivatorId&&
    option.targetDisasterShelterId===choice.targetDisasterShelterId);
  if(options.length!==1)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...options[0]};
  return true;
}

export function queueAvatarMarketFreight(world:WorldState,actorId:string,choice:MarketFreightOption):boolean {
  const host=activeAvatar(world);
  if(!host||!onLowerPlane(host)||!canQueueAvatarSalvage(world,actorId)||choice.action!=='MARKET_FREIGHT')return false;
  const options=availableMarketFreightActions(host,world,world.tick+1).filter(option=>
    option.marketFreightMove===choice.marketFreightMove&&option.targetCultivatorId===choice.targetCultivatorId&&
    option.targetShipmentId===choice.targetShipmentId&&option.targetEscortId===choice.targetEscortId);
  if(options.length!==1)return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...options[0]};
  return true;
}

export function queueAvatarCivicMemorialAppend(world:WorldState,actorId:string,
  choice:Extract<CivicMemorialOption,{civicMemorialMove:'append_relief'}>):boolean {
  const host=activeAvatar(world);
  if(!host||!onLowerPlane(host)||!canQueueAvatarSalvage(world,actorId)||
    choice.action!=='CIVIC_MEMORIAL'||choice.civicMemorialMove!=='append_relief')return false;
  const options=availableCivicMemorialActions(host,world,world.tick+1).filter(option=>
    option.civicMemorialMove==='append_relief'&&option.targetCivicMemorialId===choice.targetCivicMemorialId&&
    option.targetCivicDeedId===choice.targetCivicDeedId);
  const exact=options[0];
  if(options.length!==1||exact?.civicMemorialMove!=='append_relief')return false;
  world.playerAvatar.essence-=AVATAR_ORDER_COST;
  world.playerAvatar.pendingOrder={actorId,queuedTick:world.tick,...exact};
  return true;
}

export function consumeAvatarOrder(world: WorldState): { actorId: string; decision: LLMDecisionPayload } | undefined {
  const state = world.playerAvatar;
  const order = state?.pendingOrder;
  if (!order || world.tick <= order.queuedTick) return undefined;
  delete state.pendingOrder;
  if (world.tick !== order.queuedTick + 1 || activeAvatar(world)?.id !== order.actorId) return undefined;
  if(order.action==='FRONTIER'||order.action==='FRONTIER_PRODUCTION'||order.action==='FRONTIER_TRADE'||
    order.action==='FRONTIER_PORT'||order.action==='FRONTIER_PORT_TRADE'||order.action==='FRONTIER_DRYLAND'||order.action==='FRONTIER_DRYLAND_TRADE')
    return {actorId:order.actorId,decision:{...frontierCommand(order),innerMonologue:'按确切的另图安排前行。'}};
  if(order.action==='SCRIBE_COMMISSION')return {actorId:order.actorId,decision:{
    chosenAction:order.action,innerMonologue:'照原本亲查实证，稿约只由本人办理。',scribeCommissionMove:order.scribeCommissionMove,
    ...(order.scribeCommissionMove==='offer'?
      {targetChronicleSourceId:order.targetChronicleSourceId,targetCultivatorId:order.targetCultivatorId}:
      {targetScribeCommissionId:order.targetScribeCommissionId})}};
  if(order.action==='CIVIC_MEMORIAL')return {actorId:order.actorId,decision:{
    chosenAction:order.action,innerMonologue:'只给旧乡祠附上另一次有据的实赈，不改原册。',civicMemorialMove:order.civicMemorialMove,
    targetCivicMemorialId:order.targetCivicMemorialId,targetCivicDeedId:order.targetCivicDeedId}};
  if(order.action==='MARKET_FREIGHT')return {actorId:order.actorId,decision:{
    chosenAction:order.action,innerMonologue:'只核实这批货、实际载力与本人应承。',marketFreightMove:order.marketFreightMove,
    ...(order.marketFreightMove==='offer'?
      {targetShipmentId:order.targetShipmentId,targetCultivatorId:order.targetCultivatorId}:{targetEscortId:order.targetEscortId})}};
  if(order.action==='DISASTER_SHELTER')return {actorId:order.actorId,decision:{
    chosenAction:order.action,innerMonologue:'只照原户籍、实际行路和本人答复续办。',disasterShelterMove:order.disasterShelterMove,
    ...(order.disasterShelterMove==='offer'?{targetCultivatorId:order.targetCultivatorId}:{targetDisasterShelterId:order.targetDisasterShelterId})}};
  if(order.action==='CRAFT_TRAINING')return {actorId:order.actorId,decision:{
    chosenAction:order.action,innerMonologue:'只由原签学员照自己的真实炉前工序行事。',craftTrainingMove:order.craftTrainingMove,
    ...(order.craftTrainingMove==='offer'?
      {targetCultivatorId:order.targetCultivatorId,targetCraftTraineeId:order.targetCraftTraineeId}:
      {targetCraftTrainingId:order.targetCraftTrainingId})}};
  if(order.action==='WAYPOST_MEAL')return {actorId:order.actorId,decision:{
    chosenAction:order.action,innerMonologue:'只在实到的山驿，与原同行人分茶。',waypostMealMove:order.waypostMealMove,
    ...(order.waypostMealMove==='offer'?{targetCultivatorId:order.targetCultivatorId}:{targetWaypostMealId:order.targetWaypostMealId})}};
  if(order.action==='WORKSHOP_ESTATE')return {actorId:order.actorId,decision:{chosenAction:order.action,
    innerMonologue:'只按旧工单、原承制人与实际继承权复核。',
    workshopEstateMove:order.workshopEstateMove,targetWorkshopId:order.targetWorkshopId}};
  if(order.action==='WORKSHOP_RELEASE')return {actorId:order.actorId,decision:{chosenAction:order.action,
    innerMonologue:'只按原签和实余托管复核这次释约。',
    workshopReleaseMove:order.workshopReleaseMove,targetWorkshopId:order.targetWorkshopId,
    ...(order.workshopReleaseMove==='propose'?{}:{targetWorkshopReleaseId:order.targetWorkshopReleaseId})}};
  if(order.action==='UPPER_ARRAY_FIELD'||order.action==='UPPER_ARRAY_FIELD_LOCAL'||order.action==='UPPER_ARRAY_FIELD_TRADE')
    return {actorId:order.actorId,decision:{...upperArrayFieldCommand(order),innerMonologue:'按脚下实地和本人原约办理。'}};
  const targets = order.action === 'NORTH_GATE_RENEWAL' ?
    {northGateRenewalMove:order.northGateRenewalMove,targetNorthGateRenewalId:order.targetNorthGateRenewalId} :
    order.action === 'UPPER_PASSAGE' ?
    {upperPassageMove:order.upperPassageMove,targetUpperPassageNodeId:order.targetUpperPassageNodeId} :
    order.action === 'NORTH_WELL_REVIEW' ?
    {northWellReviewMove:order.northWellReviewMove,targetNorthMiningCharterId:order.targetNorthMiningCharterId} :
    order.action === 'NORTH_MINING_CHARTER' ?
    (order.northMiningMove==='propose'?{northMiningMove:order.northMiningMove,northMiningStance:order.northMiningStance}:
      {northMiningMove:order.northMiningMove,targetNorthMiningCharterId:order.targetNorthMiningCharterId}) :
    order.action === 'WATER_VEIN' ?
    { waterVeinMove:order.waterVeinMove,targetLocationId:order.targetLocationId } :
    order.action === 'SALVAGE_ARTIFACT' ?
    { targetArtifactId: order.targetArtifactId, targetLocationId: order.targetLocationId } :
    order.action==='DANXIA_MEDICINE'?{danxiaMedicineMove:order.danxiaMedicineMove,targetDanxiaShortageId:order.targetDanxiaShortageId,
      targetDanxiaMedicineId:order.targetDanxiaMedicineId,targetCultivatorId:order.targetCultivatorId}:
    order.action==='DANXIA_REVIEW'?{danxiaReviewMove:order.danxiaReviewMove,targetDanxiaReviewId:order.targetDanxiaReviewId,
      targetSettlementRecordId:order.targetSettlementRecordId}:
    order.action==='DOCTRINE_FOUNDING'?{doctrineFoundingMove:order.doctrineFoundingMove,
      targetDoctrineFoundingId:order.targetDoctrineFoundingId,targetDoctrineSchoolId:order.targetDoctrineSchoolId,
      targetRelocationId:order.targetRelocationId}:
    order.action==='DOCTRINE_MATURITY'?{doctrineMaturityMove:order.doctrineMaturityMove,targetDoctrineFoundingId:order.targetDoctrineFoundingId}:{};

  return { actorId: order.actorId, decision: { chosenAction: order.action, innerMonologue: '遵化身指令行动', ...targets } };
}

function affinity(world: WorldState, a: string, b: string) {
  return world.relationships.find((item) => (item.fromId === a && item.toId === b) || (item.fromId === b && item.toId === a));
}

function nudgeRelationship(world: WorldState, host: Cultivator, target: Cultivator, amount: number): void {
  const edge = affinity(world, host.id, target.id);
  if (edge) {
    edge.affinity = clamp(edge.affinity + amount, -100, 100);
    if (edge.affinity <= -60) edge.type = '血仇';
  } else {
    world.relationships.push({ fromId: host.id, toId: target.id, affinity: amount,
      type: host.sectId && host.sectId === target.sectId ? '同门' : '竞争', note: '一番私下交谈留下印象' });
  }
}

function recruitable(world: WorldState, host: Cultivator, target: Cultivator): boolean {
  const home = world.sects.find(({ id }) => id === host.sectId);
  if (!home || home.id === target.sectId || world.sects.some(({ leaderId }) => leaderId === target.id) || host.spiritStones < 80) return false;
  if (!(host.id === home.leaderId || host.sectRank === '长老' || host.sectRank === '太上长老')) return false;
  return !target.sectId || (target.contribution < 70 && (affinity(world, host.id, target.id)?.affinity ?? 0) >= 55);
}

export function availableAvatarInteractions(world: WorldState, mode: AvatarInteractionMode): AvatarInteractionOption[] {
  if (mode !== 'avatar' && mode !== 'ring') return [];
  const state = world.playerAvatar;
  if (!state || world.tick - (state.transcript[0]?.tick ?? -100) < GLOBAL_COOLDOWN) return [];
  const current=activeAvatar(world);
  if(current&&!onLowerPlane(current))return [];
  const host=mode==='avatar'?current:undefined;
  if (mode === 'avatar' && !host) return [];
  return world.cultivators.filter((target) => availableBody(world, target) && onLowerPlane(target) && target.id !== host?.id &&
    (!host || host.locationId === target.locationId) &&
    !state.transcript.some((entry) => entry.targetCultivatorId === target.id && world.tick - entry.tick < TARGET_COOLDOWN))
    .flatMap((target) => intents.filter((intent) => state.essence >= avatarInteractionCost(mode, intent) &&
      (intent !== 'recruit' || !!host && recruitable(world, host, target))).map((intent) => ({ mode, intent, targetCultivatorId: target.id })));
}

function publicStatement(world: WorldState, target: Cultivator): string {
  // Only a public fact with the subject explicitly named; never the private rumor bag, memory or internal monologue.
  const seen = world.events.find((item) => item.witnessScope !== 'participants' && item.actorIds.includes(target.id));
  if (seen) return `据公开纪事：「${clean(seen.title, 80)}」。`;
  const location = world.locations.find(({ id, type }) => id === target.locationId && (type === 'market' || type === 'sect_hq'));
  return location ? `可公开确认的是：此人目前在${location.name}。` : '暂没有可公开核验的线索。';
}

export function resolveAvatarInteraction(world: WorldState, request: AvatarInteractionRequest, rng: () => number,
  advisoryLine?: string): AvatarTranscriptEntry | null {
  const message = clean(request.message, AVATAR_MESSAGE_LIMIT);
  if (!message || !availableAvatarInteractions(world, request.mode).some(({ targetCultivatorId, intent }) =>
    targetCultivatorId === request.targetCultivatorId && intent === request.intent)) return null;
  const target = world.cultivators.find(({ id }) => id === request.targetCultivatorId)!;
  const host = request.mode === 'avatar' ? activeAvatar(world) : undefined;
  const state = world.playerAvatar;
  state.essence -= avatarInteractionCost(request.mode, request.intent);
  const trust = host ? affinity(world, host.id, target.id)?.affinity ?? 0 : 0;
  const wary = target.personality === '苟道' || target.personality === '诡诈';
  const chance = clamp((request.intent === 'recruit' ? .35 : request.intent === 'deceive' ? .39 : .65) + trust * .004 +
    (target.personality === '逍遥' ? .08 : 0) - (wary ? .14 : 0), .12, .91);
  const agreed = rng() < chance;
  let outcome: AvatarTranscriptEntry['outcome'] = 'resisted';
  let effect = '对方自行拒绝，未强制改变其决定。';
  let reply = '此事我自有分寸，不便应承。';
  if (agreed) {
    outcome = 'agreed';
    if (request.intent === 'guide') {
      const before = target.qiProgress;
      target.qiProgress = Math.min(100, target.qiProgress + 6);
      effect = `听取善意指导，气机推进${target.qiProgress - before}；未强制改变下轮行动。`;
      reply = '这番提醒我听进去了，且去静心领会。';
    } else if (request.intent === 'persuade') {
      if (host) nudgeRelationship(world, host, target, 10);
      else target.karma = Math.min(100, target.karma + 3);
      reply = '我愿再考虑你的看法。';
      effect = host ? '与化身好感提升10（到顶为止）。' : '戒中劝导使业缘改善3（到顶为止）。';
    } else if (request.intent === 'deceive') {
      // Only a fictional tactical distraction. No rumors, credentials, or practical deception instructions.
      const previous = target.qiProgress;
      target.qiProgress = Math.max(0, target.qiProgress - 4);
      reply = '虚惊一场，方才修炼分神。';
      effect = `虚构迷阵造成短暂误判，气机下降${previous - target.qiProgress}；不传播伪造事实。`;
    } else if (request.intent === 'interrogate') {
      outcome = 'revealed';
      reply = publicStatement(world, target);
      effect = '只转述可公开查验的纪事或可见地点，未读出秘密或其他对话。';
    } else if (host) {
      outcome = 'recruited';
      host.spiritStones -= 80;
      target.spiritStones += 80;
      target.sectId = host.sectId;
      target.sectRank = '外门弟子'; target.contribution = 0;
      delete target.guardAssignment;
      if (target.activeScheme?.status === 'active') {
        target.activeScheme.status = 'failed'; target.activeScheme.finishedTick = world.tick; target.activeScheme.outcome = '改投宗门，原有计划终止。';
      }
      nudgeRelationship(world, host, target, 12);
      effect = '经本人同意加入化身所在宗门；80灵石安置费由化身转给新人。';
      reply = '我愿入门，从外门重新立足。';
    }
  } else if (request.intent === 'deceive' && host) {
    nudgeRelationship(world, host, target, -8);
    effect = '对方识破虚构迷阵，化身与其好感下降8。';
  }
  // An optional externally supplied spoken aside is never the authoritative reply or game outcome.
  const aside = clean(advisoryLine, 140);
  const safeAside = aside && request.intent !== 'interrogate' && outcome === 'agreed';
  const entry: AvatarTranscriptEntry = { id: `avatar-${world.tick}-${target.id}`, tick: world.tick, mode: request.mode,
    intent: request.intent, targetCultivatorId: target.id, actorId: host?.id, message,
    reply: safeAside ? `${reply}\n（文学润色：${aside}）` : reply, outcome, source: safeAside ? 'llm' : 'utility', effect };
  state.transcript = [entry, ...state.transcript].slice(0, TRANSCRIPT_LIMIT);
  return entry;
}
