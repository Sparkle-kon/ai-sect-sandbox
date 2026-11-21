import { effectiveWorkshopDeadline,effectiveWorkshopQuantity } from './workshopCapacityTerms';
import type { Artifact, ArtifactSalvageState, Cultivator, LLMDecisionPayload, WorkshopArtifactOrigin, WorkshopOrder,
  WorldEvent, WorldState } from '../types/world';
import { ARTIFACT_RULES } from './artifactEngine';
import { canUseFurnace, claimFurnaceUse } from './furnaceReservationEngine';
import { flowActor, recordResourceFlow } from './resourceFlowEngine';
import { workshopGradeForScore, workshopTerms } from './workshopEngine';

export const ARTIFACT_SALVAGE_ROOTS = 1;
export const ARTIFACT_SALVAGE_WEAR_LIMIT = .30;
export const createArtifactSalvageState = (): ArtifactSalvageState => ({ receipts:[] });
export interface ArtifactSalvageOption { action:'SALVAGE_ARTIFACT'; targetArtifactId:string; targetLocationId:string }
const acceptedFields=new Set(['action','chosenAction','innerMonologue','spokenLine','targetArtifactId','targetLocationId']);
const workshopTier=(tier:Artifact['tier']):tier is '法器'|'灵器' => tier==='法器' || tier==='灵器';

function realOrigin(order:WorkshopOrder,id:string,piece:1|2,worldTick:number):WorkshopArtifactOrigin|undefined {
  const deadline=effectiveWorkshopDeadline(order);
  if(piece>effectiveWorkshopQuantity(order) || order.acceptedTick===undefined || deadline===undefined) return undefined;
  const blank=order.work[(piece-1)*2], finish=order.work[(piece-1)*2+1];
  const terms=workshopTerms(order.tier,order.quantity);
  if(!blank || !finish || blank.stage!=='blank' || finish.stage!=='finish' || finish.artifactId!==id ||
    blank.artifactId!==undefined || blank.piece!==piece || finish.piece!==piece || blank.herbsUsed!==1 || finish.herbsUsed!==1 ||
    blank.makerId!==order.makerId || finish.makerId!==order.makerId || blank.stonesUsed!==terms.blankFuel ||
    finish.stonesUsed!==terms.finishFuel || finish.feePaid!==terms.feePerPiece ||
    finish.qualityScore===undefined || workshopGradeForScore(finish.qualityScore)!==finish.quality ||
    (finish.quality!=='fine' && (finish.quality!=='standard' || order.qualityFloor!=='standard')) ||
    order.acceptedTick>=blank.tick || blank.tick>=finish.tick || finish.tick>=deadline || finish.tick>worldTick) return undefined;
  return {orderId:order.id,piece,makerId:order.makerId,siteId:order.siteId,blankTick:blank.tick,finishedTick:finish.tick};
}

function sameOrigin(left:WorkshopArtifactOrigin,right:WorkshopArtifactOrigin) {
  return left.orderId===right.orderId && left.piece===right.piece && left.makerId===right.makerId &&
    left.siteId===right.siteId && left.blankTick===right.blankTick && left.finishedTick===right.finishedTick;
}

/** Never infer provenance from a label or ID alone. An explicit conflicting stamp is never upgraded. */
export function proveWorkshopArtifactOrigin(world:WorldState,item:Pick<Artifact,'id'|'tier'|'workshopOrigin'>):WorkshopArtifactOrigin|undefined {
  if(!item.id || !workshopTier(item.tier)) return undefined;
  const shape=/^workshop-artifact-(commission-([1-9]\d*))-([12])$/.exec(item.id);
  const serial=Number(shape?.[2]);
  if(!shape || !Number.isSafeInteger(serial) || serial>=world.workshops.nextId) return undefined;
  const [,orderId,,pieceLabel]=shape;
  const piece=pieceLabel==='1'?1:2;
  const order=world.workshops.orders.find(row=>row.id===orderId);
  const explicit=item.workshopOrigin;
  if(order) {
    if(order.tier!==item.tier) return undefined;
    const actual=realOrigin(order,item.id,piece,world.tick);
    return actual && (!explicit || sameOrigin(explicit,actual)) ? actual : undefined;
  }
  return explicit && explicit.orderId===orderId && explicit.piece===piece &&
    Number.isSafeInteger(explicit.blankTick) && Number.isSafeInteger(explicit.finishedTick) &&
    explicit.blankTick>=0 && explicit.blankTick<explicit.finishedTick && explicit.finishedTick<=world.tick &&
    world.cultivators.some(row=>row.id===explicit.makerId) && Boolean(explicit.siteId) ? {...explicit} : undefined;
}

function uniqueOwned(world:WorldState,actor:Cultivator,item:Artifact) {
  return !world.artifactSalvages.receipts.some(row=>row.artifactId===item.id) &&
    !world.toolLoans.loans.some(row=>(row.status==='offered' && world.tick<row.expiresTick &&
      row.artifactId===item.id)||row.custody?.id===item.id) &&
    !world.cultivators.some(row=>row.artifacts.some(other=>other.id===item.id && (row!==actor || other!==item))) &&
    actor.artifacts.filter(other=>other.id===item.id).length===1 &&
    !world.estates.entries.some(row=>row.holdings.artifacts.some(other=>other.id===item.id)) &&
    !world.relicExhibits.entries.some(row=>(row.status!=='closed' && row.artifactId===item.id) || row.custody?.id===item.id);
}

function usableRootInventory(actor:Cultivator) {
  return Number.isSafeInteger(actor.herbs.earth_root) && actor.herbs.earth_root>=0 && actor.herbs.earth_root<=10_000-ARTIFACT_SALVAGE_ROOTS;
}

function candidates(actor:Cultivator,world:WorldState,executionTick:number) {
  if(!actor.alive || actor.hp<=0 || !actor.artifacts.length || !world.cultivators.includes(actor) || !usableRootInventory(actor) ||
    !canUseFurnace(world,actor,actor.locationId,'salvage',undefined,executionTick)) return [];
  const site=world.locations.find(row=>row.id===actor.locationId);
  if(!site) return [];
  return actor.artifacts.flatMap(item=>{
    const {id,tier,durability,maxDurability}=item;
    if(!id || !workshopTier(tier) || site.furnaceGrade<ARTIFACT_RULES[tier].grade || item.boundTo!==undefined ||
      item.soul!==undefined || item.relicSetId!==undefined || item.relicFragmentIds!==undefined ||
      durability===undefined || maxDurability===undefined || !Number.isSafeInteger(durability) || !Number.isSafeInteger(maxDurability) ||
      durability<0 || (maxDurability!==ARTIFACT_RULES[tier].durability && maxDurability!==Math.ceil(ARTIFACT_RULES[tier].durability*1.2)) ||
      durability>maxDurability*ARTIFACT_SALVAGE_WEAR_LIMIT) return [];
    const origin=proveWorkshopArtifactOrigin(world,item);
    return origin && origin.finishedTick<executionTick && uniqueOwned(world,actor,item) ?
      [{item,artifactId:id,tier,durability,maxDurability,origin}] : [];
  });
}

export function availableArtifactSalvageActions(actor:Cultivator,world:WorldState,executionTick=world.tick):ArtifactSalvageOption[] {
  return candidates(actor,world,executionTick).map(({artifactId:targetArtifactId})=>
    ({action:'SALVAGE_ARTIFACT',targetArtifactId,targetLocationId:actor.locationId}));
}

export function resolveArtifactSalvageAction(actor:Cultivator,world:WorldState,payload:LLMDecisionPayload):WorldEvent|null {
  if(payload.chosenAction!=='SALVAGE_ARTIFACT' || payload.targetLocationId!==actor.locationId || Object.entries(payload).some(([key,value])=>value!==undefined &&
      (!acceptedFields.has(key) || (key==='action' && value!=='SALVAGE_ARTIFACT')))) return null;
  const row=candidates(actor,world,world.tick).find(({artifactId})=>artifactId===payload.targetArtifactId);
  if(!row) return null;
  const index=actor.artifacts.indexOf(row.item);
  if(index<0 || !claimFurnaceUse(world,actor,actor.locationId,'salvage')) return null;
  actor.artifacts.splice(index,1);
  actor.herbs.earth_root+=ARTIFACT_SALVAGE_ROOTS;
  world.artifactSalvages.receipts.push({artifactId:row.artifactId,artifactName:row.item.name,ownerId:actor.id,siteId:actor.locationId,tick:world.tick,
    tier:row.tier,durability:row.durability,maxDurability:row.maxDurability,origin:row.origin});
  recordResourceFlow(world,{kind:'production',to:flowActor(actor.id),mechanism:'artifact_salvage',good:'earth_root',
    amount:ARTIFACT_SALVAGE_ROOTS,refId:row.artifactId,reason:'artifact_salvage_recovery',
    visibility:{kind:'participants',actorIds:[actor.id]}});
  return {id:`evt-artifact-salvage-${row.artifactId}`,year:world.year,month:world.month,tick:world.tick,category:'breakthrough',
    title:'验明旧器并拆解回收',description:'一件有真实工坊来源的旧器已永久拆除，仅回收一份可再利用的玄土根。',
    actorIds:[actor.id],locationId:actor.locationId,witnessScope:'participants'};
}
