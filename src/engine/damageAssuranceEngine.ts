import type {Cultivator,DamageAssuranceClaim,DamageAssuranceMove,DamageAssuranceState,FurnaceSafetyCase,LLMDecisionPayload,
  WorldEvent,WorldState} from '../types/world';
import {availableFurnaceSafetyActions,FURNACE_SAFETY_REPAIR,furnaceDamageCustodianReady,furnaceSafetyDamage,
  projectFurnaceSafety,resolveFurnaceSafetyAction} from './furnaceSafetyEngine';

export const createDamageAssuranceState=():DamageAssuranceState=>({claims:[]});
export type DamageAssuranceOption=
  | {action:'DAMAGE_ASSURANCE';damageAssuranceMove:'seal';targetFurnaceSafetyId:string;targetDamageAssuranceId?:never}
  | {action:'DAMAGE_ASSURANCE';damageAssuranceMove:'make_good';targetDamageAssuranceId:string;targetFurnaceSafetyId?:never};

const caseAt=(world:WorldState,id:string)=>world.furnaceSafety.cases.find(row=>row.id===id);
const claimAt=(world:WorldState,id:string)=>world.damageAssurance.claims.find(row=>row.id===id);
export function damageAssuranceImpactKey(row:Pick<DamageAssuranceClaim,'sourceCaseId'|'siteId'|'hazardId'|'damagedTick'|
  'responsibleSectId'|'integrityBefore'|'integrityAfterDamage'>):string {
  return JSON.stringify([row.sourceCaseId,row.siteId,row.hazardId,row.damagedTick,row.responsibleSectId,
    row.integrityBefore,row.integrityAfterDamage]);
}
export function damageAssuranceWorkKey(claim:Parameters<typeof damageAssuranceImpactKey>[0],
  work:Pick<DamageAssuranceClaim['contributions'][number],'receiptId'|'actorId'|'tick'|'integrityBefore'|'integrityAfter'>):string {
  return JSON.stringify([damageAssuranceImpactKey(claim),work.receiptId,work.actorId,work.tick,work.integrityBefore,work.integrityAfter]);
}
export const damageAssuranceClaimId=(sourceCaseId:string)=>`damage-assurance-${sourceCaseId}`;
export const damageAssuranceNativeReceiptId=(sourceCaseId:string,tick:number)=>`evt-${sourceCaseId}-repair-${tick}`;
export const damageAssuranceRemaining=(claim:Pick<DamageAssuranceClaim,'initialLoss'|'contributions'>)=>
  Math.max(0,claim.initialLoss-claim.contributions.reduce((sum,row)=>sum+row.creditedPoints,0));

function inspectionProof(row:FurnaceSafetyCase,tick:number){
  const inspection=row.receipts[0];
  const after=Math.max(0,row.integrityBefore-furnaceSafetyDamage(row.severity));
  return inspection?.kind==='inspect'&&row.receipts.length===1&&row.reopenedTick===undefined&&
    inspection.tick>row.damagedTick&&inspection.tick<tick&&inspection.ownerSectId===row.ownerAtDamage&&
    inspection.integrityBefore===after&&inspection.integrityAfter===after&&row.integrity===after&&after<row.integrityBefore
    ?inspection:undefined;
}
const workOption=(world:WorldState,actor:Cultivator,sourceCaseId:string,tick:number)=>
  availableFurnaceSafetyActions(actor,world,tick).find(row=>row.furnaceSafetyMove==='repair'&&row.targetFurnaceSafetyId===sourceCaseId);

export function availableDamageAssuranceActions(actor:Cultivator,world:WorldState,executionTick=world.tick):DamageAssuranceOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||!world.furnaceSafety.cases.length)return [];
  const local=[...world.furnaceSafety.cases].reverse().find(row=>row.siteId===actor.locationId&&row.damagedTick<=executionTick);
  if(!local||!furnaceDamageCustodianReady(world,actor,local.id,executionTick))return [];
  const current=claimAt(world,damageAssuranceClaimId(local.id));
  if(!current)return inspectionProof(local,executionTick) ?[
    {action:'DAMAGE_ASSURANCE',damageAssuranceMove:'seal',targetFurnaceSafetyId:local.id},
  ]:[];
  if(current.status==='open'&&current.sealedTick<executionTick&&damageAssuranceRemaining(current)>0&&
    workOption(world,actor,local.id,executionTick))return [
      {action:'DAMAGE_ASSURANCE',damageAssuranceMove:'make_good',targetDamageAssuranceId:current.id},
    ];
  return [];
}
function event(world:WorldState,claim:DamageAssuranceClaim,suffix:string,title:string,description:string,actor?:Cultivator):WorldEvent{
  return {id:`evt-${world.tick}-${claim.id}-${suffix}`,tick:world.tick,year:world.year,month:world.month,title,description,
    category:'diplomacy',witnessScope:'participants',actorIds:actor&&actor.id!==claim.sealedById?[claim.sealedById,actor.id]:[claim.sealedById],
    ...(world.locations.some(site=>site.id===claim.siteId)?{locationId:claim.siteId}:{})};
}
const allowed=(move:DamageAssuranceMove|undefined)=>['chosenAction','innerMonologue','spokenLine','damageAssuranceMove',
  move==='seal'?'targetFurnaceSafetyId':'targetDamageAssuranceId'];
export function resolveDamageAssuranceAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  const move=payload.damageAssuranceMove;
  if(payload.chosenAction!=='DAMAGE_ASSURANCE'||Object.entries(payload).some(([key,value])=>
      value!==undefined&&!allowed(move).includes(key)&&!(key==='action'&&value==='DAMAGE_ASSURANCE')))return null;
  const choice=availableDamageAssuranceActions(actor,world).find(row=>row.damageAssuranceMove===move&&
    row.targetFurnaceSafetyId===payload.targetFurnaceSafetyId&&row.targetDamageAssuranceId===payload.targetDamageAssuranceId);
  if(!choice)return null;
  if(choice.damageAssuranceMove==='seal'){
    const native=caseAt(world,choice.targetFurnaceSafetyId);
    const inspect=native&&inspectionProof(native,world.tick);
    if(!native||!inspect)return null;
    const row:DamageAssuranceClaim={id:damageAssuranceClaimId(native.id),sourceCaseId:native.id,siteId:native.siteId,
      responsibleSectId:native.ownerAtDamage,hazardId:native.hazardId,damagedTick:native.damagedTick,
      integrityBefore:native.integrityBefore,integrityAfterDamage:inspect.integrityAfter,initialLoss:native.integrityBefore-inspect.integrityAfter,
      inspectionTick:inspect.tick,inspectorId:inspect.actorId,sealedTick:world.tick,sealedById:actor.id,
      status:'open',contributions:[]};
    world.damageAssurance.claims.push(row);
    return event(world,row,'sealed','封存实际损害原状','按实际兽潮与已完成的原始验炉记录封存损害；本次没有修炉、拨款或发钱。',actor);
  }
  const row=claimAt(world,choice.targetDamageAssuranceId),source=row&&caseAt(world,row.sourceCaseId);
  if(!row||!source)return null;
  const receiptId=damageAssuranceNativeReceiptId(source.id,world.tick);
  if(row.contributions.some(work=>work.receiptId===receiptId))return null;
  const repair=resolveFurnaceSafetyAction(world,actor,{
    chosenAction:'FURNACE_SAFETY',furnaceSafetyMove:'repair',targetFurnaceSafetyId:source.id,
    innerMonologue:'按同一实物与原验炉记录补做真正修缮。',
  });
  if(!repair)return null;
  const actual=source.receipts.at(-1);
  if(!actual||actual.kind!=='repair'||actual.tick!==world.tick||actual.actorId!==actor.id||repair.id!==receiptId)return repair;
  const points=Math.min(damageAssuranceRemaining(row),actual.integrityAfter-actual.integrityBefore);
  if(points<=0)return repair;
  actual.assuranceClaimId=row.id;
  row.contributions.push({receiptId,tick:actual.tick,actorId:actor.id,integrityBefore:actual.integrityBefore,
    integrityAfter:actual.integrityAfter,creditedPoints:points,stonesSpent:FURNACE_SAFETY_REPAIR.stones,rootsSpent:FURNACE_SAFETY_REPAIR.roots});
  if(damageAssuranceRemaining(row)===0){row.status='fulfilled';row.closedTick=world.tick;}
  return {...event(world,row,'work','实际修缮计入补偿',`只记录真实付料施工的 ${points} 点修复；未另付钱，也未替代复开检查。`,actor),
    id:repair.id};
}
export function advanceDamageAssurance(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const row of world.damageAssurance.claims){
    if(row.status!=='open')continue;
    const site=world.locations.find(location=>location.id===row.siteId);
    const source=caseAt(world,row.sourceCaseId);
    const closure:DamageAssuranceClaim['closure']=!site||site.ownerSectId!==row.responsibleSectId?'title_changed':
      !source||world.furnaceSafety.cases.some(other=>other.siteId===row.siteId&&other.damagedTick>row.damagedTick&&other.damagedTick<=world.tick)
        ?'case_superseded':source.reopenedTick!==undefined?'native_reopened':undefined;
    if(!closure)continue;
    row.status='closed';row.closedTick=world.tick;row.closure=closure;
    events.push(event(world,row,'closed','补偿账停止受理','已签记录保留，尚有差额时仍如实显示，不冒充补齐。'));
  }
  return events;
}
export function projectDamageAssurance(world:WorldState,viewer?:Cultivator){
  if(!viewer||!world.cultivators.includes(viewer))return [];
  const local=projectFurnaceSafety(world,viewer);
  return world.damageAssurance.claims.flatMap(row=>{
    const participant=row.sealedById===viewer.id||row.inspectorId===viewer.id||row.contributions.some(work=>work.actorId===viewer.id);
    if(!participant&&(local?.siteId!==row.siteId||viewer.sectId!==row.responsibleSectId))return [];
    const native=caseAt(world,row.sourceCaseId);
    const remaining=damageAssuranceRemaining(row);
    const isLatest=native&&!world.furnaceSafety.cases.some(other=>other.siteId===row.siteId&&other.damagedTick>row.damagedTick);
    return [{id:row.id,siteId:row.siteId,status:row.status,damagedTick:row.damagedTick,inspectionTick:row.inspectionTick,
      sealedTick:row.sealedTick,closedTick:row.closedTick,closure:row.closure,integrityBefore:row.integrityBefore,
      integrityAfterDamage:row.integrityAfterDamage,initialLoss:row.initialLoss,credited:row.initialLoss-remaining,remaining,
      ...(isLatest?{physicalRemaining:Math.max(0,row.integrityBefore-native.integrity)}:{}),
      contributions:row.contributions.map(work=>({tick:work.tick,integrityBefore:work.integrityBefore,integrityAfter:work.integrityAfter,
        creditedPoints:work.creditedPoints,stonesSpent:work.stonesSpent,rootsSpent:work.rootsSpent,own:work.actorId===viewer.id}))}];
  });
}
export function projectLocalDamageAssurance(world:WorldState,viewer?:Cultivator){
  const local=viewer&&projectFurnaceSafety(world,viewer);
  if(!viewer||!local||!world.cultivators.includes(viewer))return undefined;
  const found=world.damageAssurance.claims.find(row=>row.siteId===local.siteId&&row.damagedTick===local.damagedTick);
  return found?{siteId:local.siteId,status:found.status,initialLoss:found.initialLoss,remaining:damageAssuranceRemaining(found)}:undefined;
}
