import type {
  Cultivator,FurnaceSafetyCase,FurnaceSafetyMove,FurnaceSafetyReceipt,FurnaceSafetyState,LLMDecisionPayload,
  LocationNode,MapHazard,WorldEvent,WorldState,
} from '../types/world';
import { flowActor,recordResourceFlow } from './resourceFlowEngine';
import { terrainTileAt } from './terrainEngine';

export const FURNACE_SAFETY_INSPECT_STONES = 2;
export const FURNACE_SAFETY_REPAIR = {roots:2,stones:8,recovery:30} as const;
export const FURNACE_SAFETY_REOPEN_INTEGRITY = 90;
export const FURNACE_SAFETY_HISTORY_LIMIT = 64;
export const FURNACE_SAFETY_MAX_INTEGRITY = 100;
export const furnaceSafetyDamage = (severity:1|2|3) => 20+10*severity;

export interface FurnaceSafetyOption {
  action: 'FURNACE_SAFETY';
  furnaceSafetyMove: FurnaceSafetyMove;
  targetFurnaceSafetyId: string;
}
export interface FurnaceSafetyView {
  siteId: string;
  installedGrade: 1|2|3;
  status: 'closed'|'reopening'|'open';
  integrity: number;
  damagedTick?: number;
  reopenedTick?: number;
  severity?: 1|2|3;
  lastInspectedTick?: number;
  lastRepairTick?: number;
  ownReceipts: Array<Omit<FurnaceSafetyReceipt,'actorId'|'ownerSectId'>>;
}

export const createFurnaceSafetyState = (): FurnaceSafetyState => ({nextId:1,cases:[]});
const exactPayload = new Set(['chosenAction','innerMonologue','spokenLine','furnaceSafetyMove','targetFurnaceSafetyId']);
const asc = (a:string,b:string) => a<b ? -1 : a>b ? 1 : 0;
const siteAt = (world:WorldState,id:string) => world.locations.find(site=>site.id===id);
const gradeAt = (site?: LocationNode) =>
  site && site.type!=='secret_realm' && site.type!=='abyss' &&
    (site.furnaceGrade===1 || site.furnaceGrade===2 || site.furnaceGrade===3) ? site.furnaceGrade : undefined;
const active = (hazard:MapHazard,tick:number) => hazard.createdTick<=tick && tick<hazard.expiresTick;
const latestAt = (world:WorldState,siteId:string,tick:number):FurnaceSafetyCase|undefined => {
  for (let index=world.furnaceSafety.cases.length-1;index>=0;index--) {
    const row=world.furnaceSafety.cases[index];
    if(row.siteId===siteId && row.damagedTick<=tick) return row;
  }
  return undefined;
};

/** A reopen action never grants a same-turn slot. The installed physical grade is a separate property. */
export function isFurnaceSafetyClosed(world:WorldState,siteId:string,executionTick=world.tick):boolean {
  const row=latestAt(world,siteId,executionTick);
  return !!row && (row.reopenedTick===undefined || row.reopenedTick>=executionTick);
}

function activeBeastTide(world:WorldState,hazard:MapHazard):hazard is MapHazard&{intensity:1|2|3} {
  if(hazard.kind!=='beast_tide' || (hazard.intensity!==1 && hazard.intensity!==2 && hazard.intensity!==3) ||
    !Number.isSafeInteger(hazard.createdTick) || hazard.createdTick<0 || hazard.createdTick>=world.tick || !active(hazard,world.tick)) return false;
  const prefix=`natural-beast-tide-${hazard.createdTick}-`;
  if(hazard.id.startsWith(prefix)) return world.spiritBeasts.some(beast=>
    beast.kind==='凶兽' && beast.id===hazard.id.slice(prefix.length));
  const brushed=/^hazard-([1-9]\d*)-(.+)$/.exec(hazard.id);
  const revision=Number(brushed?.[1]);
  return !!brushed && brushed[2]===hazard.tileId && Number.isSafeInteger(revision) && revision<=world.interventionSequence;
}

function event(world:WorldState,row:FurnaceSafetyCase,token:string,title:string,description:string,actor?:Cultivator):WorldEvent {
  return {id:`evt-${row.id}-${token}-${world.tick}`,tick:world.tick,year:world.year,month:world.month,
    category:actor?'diplomacy':'heavenly',title,description,actorIds:actor?[actor.id]:[],locationId:row.siteId,
    ...(actor?{witnessScope:'participants' as const}:{})};
}

function compactCases(world:WorldState) {
  const state=world.furnaceSafety;
  if(state.cases.length<=FURNACE_SAFETY_HISTORY_LIMIT) return;
  const latest=new Map<string,FurnaceSafetyCase>();
  for(const row of state.cases) latest.set(row.siteId,row);
  const previous=state.cases.filter(row=>latest.get(row.siteId)!==row);
  const keep=new Set(previous.slice(-FURNACE_SAFETY_HISTORY_LIMIT));
  const cited = new Set(world.workshops.orders.flatMap((order)=>order.capacityOffer ? [order.capacityOffer.caseId] : []));
  state.cases=state.cases.filter(row=>latest.get(row.siteId)===row || keep.has(row) || cited.has(row.id));
}

/** Called from the actual map hazard hook before that turn has granted any furnace capacity. */
export function damageFurnacesFromBeastTide(world:WorldState,hazard:MapHazard):WorldEvent[] {
  if(!world.mapHazards.includes(hazard) || !activeBeastTide(world,hazard) ||
    world.mapHazards.some(other=>other!==hazard && other.tileId===hazard.tileId && activeBeastTide(world,other) &&
      (other.intensity>hazard.intensity || other.intensity===hazard.intensity && asc(other.id,hazard.id)<0))) return [];
  const events:WorldEvent[]=[];
  const matched=world.locations.filter(site=>!!site.ownerSectId && gradeAt(site)!==undefined &&
    world.sects.some(sect=>sect.id===site.ownerSectId) && terrainTileAt(world,site.x,site.y)?.id===hazard.tileId)
    .sort((a,b)=>asc(a.id,b.id));
  for(const site of matched) {
    const old=latestAt(world,site.id,world.tick);
    if(old && (old.reopenedTick===undefined || old.reopenedTick>=world.tick || old.hazardId===hazard.id)) continue;
    const before=old?.integrity ?? FURNACE_SAFETY_MAX_INTEGRITY;
    if(!Number.isSafeInteger(before) || before<0 || before>FURNACE_SAFETY_MAX_INTEGRITY) continue;
    const row:FurnaceSafetyCase={
      id:`furnace-safety-${world.furnaceSafety.nextId++}`,siteId:site.id,ownerAtDamage:site.ownerSectId!,
      hazardId:hazard.id,hazardTileId:hazard.tileId,hazardCreatedTick:hazard.createdTick,severity:hazard.intensity,
      damagedTick:world.tick,integrityBefore:before,integrity:Math.max(0,before-furnaceSafetyDamage(hazard.intensity)),receipts:[],
    };
    world.furnaceSafety.cases.push(row);
    events.push(event(world,row,'closed','兽潮实损，炉事暂止','兽潮损伤实有丹炉，本炉停用；装炉品阶与已有凭据不改。'));
  }
  if(events.length) compactCases(world);
  return events;
}

function onsite(world:WorldState,actor:Cultivator,site:LocationNode,tick:number):boolean {
  if(!actor.alive || actor.hp<=0 || actor.locationId!==site.id ||
    actor.tribulation?.stage==='lightning' || actor.tribulation?.stage==='heart_demon') return false;
  const id=actor.id;
  return !world.couriers.dispatches.some(row=>row.courierId===id && (row.status==='in_transit' || row.status==='returning' ||
      row.acceptedTick!==undefined && (row.acceptedTick===tick || row.lastAdvancedTick===tick || row.settledTick===tick))) &&
    !world.pilgrimages.journeys.some(row=>(row.organizerId===id || row.companionId===id) &&
      (row.status==='active' || row.startedTick===tick || row.lastMovedTick===tick ||
        row.camps?.some(camp=>camp.openedTick===tick || camp.closedTick===tick))) &&
    !world.escorts.contracts.some(row=>row.escortId===id && row.status==='active') &&
    !world.relocations.plans.some(row=>row.status==='in_transit' && row.garrisonIds.includes(id)) &&
    !world.boundaryReliefs.cases.some(row=>row.incomingId===id && (row.status==='travelling' || row.status==='returning')) &&
    !world.sieges.some(row=>(row.status==='marching' || row.status==='sieging') && row.participantIds.includes(id)) &&
    !world.occasions.some(row=>(row.status==='running' || row.status==='registration') && row.participantIds.includes(id) &&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id && rescue.arrivedIds?.includes(id))) &&
    !world.expeditionRescues.requests.some(row=>row.gateSiteId===site.id && (row.explorerId===id || row.rescuerId===id) &&
      row.supplySpent===1 && (row.status==='extracting' || row.status==='interrupted' && row.pathIndex>0 &&
        !row.arrivedIds?.includes(id) && world.occasions.some(occasion=>occasion.id===row.occasionId && occasion.status==='running')));
}

function authorized(world:WorldState,actor:Cultivator,site:LocationNode,tick:number):boolean {
  if(!onsite(world,actor,site,tick) || !Number.isFinite(actor.age) || actor.age<18 ||
    actor.service?.status==='retired' || !actor.sectId || site.ownerSectId!==actor.sectId) return false;
  const sect=world.sects.find(sect=>sect.id===actor.sectId);
  if(!sect) return false;
  const assignment=actor.guardAssignment;
  if(assignment && assignment.assignedTick<=tick && tick<assignment.expiresTick && assignment.locationId!==site.id) return false;
  return (sect.leaderId===actor.id && actor.sectRank==='掌门') || actor.sectRank==='长老' || actor.sectRank==='太上长老' ||
    (sect.leaderId!==actor.id && (site.type==='spirit_vein' || site.type==='secret_realm' || site.type==='abyss') &&
      !!assignment && assignment.locationId===site.id && assignment.assignedTick<=tick && tick<assignment.expiresTick);
}

function safeWork(world:WorldState,site:LocationNode,tick:number) {
  const local=terrainTileAt(world,site.x,site.y)?.id;
  return !!local && !world.mapHazards.some(hazard=>hazard.tileId===local && active(hazard,tick) &&
    (hazard.kind==='beast_tide' || hazard.intensity>=2));
}
const funds=(actor:Cultivator,stones:number) => Number.isFinite(actor.spiritStones) && actor.spiritStones>=stones;

export function availableFurnaceSafetyActions(actor:Cultivator,world:WorldState,executionTick=world.tick):FurnaceSafetyOption[] {
  if((executionTick!==world.tick && executionTick!==world.tick+1) || !world.furnaceSafety.cases.length ||
    !world.cultivators.includes(actor)) return [];
  const site=siteAt(world,actor.locationId);
  const row=site && latestAt(world,site.id,executionTick);
  if(!site || !gradeAt(site) || !row || row.reopenedTick!==undefined ||
    row.damagedTick>=executionTick || (row.receipts.at(-1)?.tick ?? -1)>=executionTick ||
    !authorized(world,actor,site,executionTick) || !safeWork(world,site,executionTick)) return [];
  let move:FurnaceSafetyMove|undefined;
  if(!row.receipts.some(receipt=>receipt.kind==='inspect')) {
    if(funds(actor,FURNACE_SAFETY_INSPECT_STONES)) move='inspect';
  } else if(row.integrity<FURNACE_SAFETY_REOPEN_INTEGRITY) {
    if(funds(actor,FURNACE_SAFETY_REPAIR.stones) && Number.isSafeInteger(actor.herbs.earth_root) &&
      actor.herbs.earth_root>=FURNACE_SAFETY_REPAIR.roots) move='repair';
  } else {
    move='reopen';
  }
  return move?[{action:'FURNACE_SAFETY',furnaceSafetyMove:move,targetFurnaceSafetyId:row.id}]:[];
}

export function resolveFurnaceSafetyAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null {
  if(payload.chosenAction!=='FURNACE_SAFETY' || Object.entries(payload).some(([key,value])=>value!==undefined &&
    !exactPayload.has(key) && !(key==='action' && value==='FURNACE_SAFETY'))) return null;
  const move=availableFurnaceSafetyActions(actor,world).find(option=>option.furnaceSafetyMove===payload.furnaceSafetyMove &&
    option.targetFurnaceSafetyId===payload.targetFurnaceSafetyId);
  if(!move) return null;
  const row=world.furnaceSafety.cases.find(row=>row.id===move.targetFurnaceSafetyId)!;
  const kind=move.furnaceSafetyMove;
  const record:FurnaceSafetyReceipt={kind,tick:world.tick,actorId:actor.id,ownerSectId:actor.sectId,
    integrityBefore:row.integrity,integrityAfter:row.integrity};
  const charge=(good:'stone'|'earth_root',amount:number,reason:string)=>{
    if(good==='stone') actor.spiritStones-=amount;
    else actor.herbs.earth_root-=amount;
    recordResourceFlow(world,{kind:'consumption',mechanism:'furnace_safety',refId:row.id,reason,
      good,amount,from:flowActor(actor.id),visibility:{kind:'participants',actorIds:[actor.id]}});
  };
  if(kind==='inspect') charge('stone',FURNACE_SAFETY_INSPECT_STONES,'furnace_safety_inspection');
  if(kind==='repair') {
    charge('stone',FURNACE_SAFETY_REPAIR.stones,'furnace_safety_repair');
    charge('earth_root',FURNACE_SAFETY_REPAIR.roots,'furnace_safety_repair');
    row.integrity=Math.min(FURNACE_SAFETY_MAX_INTEGRITY,row.integrity+FURNACE_SAFETY_REPAIR.recovery);
    record.integrityAfter=row.integrity;
  }
  if(kind==='reopen') row.reopenedTick=world.tick;
  row.receipts.push(record);
  if(kind==='inspect') return event(world,row,kind,'实付验炉，查明炉体损伤','已当场验明炉体完整度；复检本身不修炉、不开放炉位。',actor);
  if(kind==='repair') return event(world,row,kind,'实付材料修炉',`本次炉体完整度由 ${record.integrityBefore} 升至 ${row.integrity}；修炉不等于已经复开。`,actor);
  return event(world,row,kind,'现场复验，丹炉准予复开','炉体现已达到安全阈值；本轮仍停炉，下一轮才重新派位。',actor);
}

export function projectFurnaceSafety(world:WorldState,viewer?:Cultivator,siteId=viewer?.locationId):FurnaceSafetyView|undefined {
  const site=siteId===undefined?undefined:siteAt(world,siteId);
  const grade=gradeAt(site);
  if(!viewer || !site || !grade || !world.cultivators.includes(viewer) || !onsite(world,viewer,site,world.tick)) return undefined;
  const row=latestAt(world,site.id,world.tick);
  if(!row) return {siteId:site.id,installedGrade:grade,status:'open',integrity:FURNACE_SAFETY_MAX_INTEGRITY,ownReceipts:[]};
  const records=row.receipts.filter(receipt=>receipt.tick<=world.tick);
  const reopenedTick=row.reopenedTick!==undefined && row.reopenedTick<=world.tick?row.reopenedTick:undefined;
  const inspected=records.find(receipt=>receipt.kind==='inspect');
  const repaired=records.filter(receipt=>receipt.kind==='repair').at(-1);
  return {siteId:site.id,installedGrade:grade,status:reopenedTick===undefined?'closed':reopenedTick===world.tick?'reopening':'open',
    integrity:row.integrity,damagedTick:row.damagedTick,severity:row.severity,
    ...(reopenedTick!==undefined?{reopenedTick}:{}),
    ...(inspected?{lastInspectedTick:inspected.tick}:{}),
    ...(repaired?{lastRepairTick:repaired.tick}:{}),
    ownReceipts:records.filter(receipt=>receipt.actorId===viewer.id).map(({actorId:_actor,ownerSectId:_owner,...receipt})=>receipt),
  };
}
