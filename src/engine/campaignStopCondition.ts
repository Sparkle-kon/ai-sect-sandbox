import type {Cultivator,Sect,WorldEvent,WorldState} from '../types/world';
import {isChronicleStoryFact} from './chronicleLead';
import {sameGeneratedWorld} from './worldIdentity';

export type CampaignStopCondition=
  | {readonly kind:'sect_leader_changed';readonly sectId:string;readonly initialLeaderId:string}
  | {readonly kind:'actor_died';readonly actorId:string}
  | {readonly kind:'site_owner_changed';readonly siteId:string};
interface CampaignStopDate {readonly tick:number;readonly year:number;readonly month:number;readonly eventId?:string}
type LeaderMethod=NonNullable<Sect['succession']>['method'];
export type CampaignStopReceipt=CampaignStopDate&(
  | {readonly kind:'sect_leader_changed';readonly sectId:string;readonly fromActorId:string;readonly toActorId:string;readonly method?:LeaderMethod;readonly filledVacancy?:true}
  | {readonly kind:'actor_died';readonly actorId:string}
  | {readonly kind:'site_owner_changed';readonly siteId:string;readonly fromSectId:string|null;readonly toSectId:string|null;readonly planId?:string}
);

const live=(actor:Cultivator|undefined)=>!!actor?.alive&&actor.hp>0;
const dead=(actor:Cultivator|undefined)=>!!actor&&!actor.alive&&actor.hp===0;
const one=<T>(rows:readonly T[],predicate:(row:T)=>boolean):T|undefined=>{
  const values=rows.filter(predicate);
  return values.length===1?values[0]:undefined;
};
const actorAt=(world:WorldState,actorId:string)=>one(world.cultivators,row=>row.id===actorId);
const sector=(world:WorldState,sectId:string)=>one(world.sects,row=>row.id===sectId);
const siteAt=(world:WorldState,siteId:string)=>one(world.locations,row=>row.id===siteId);
const publicSite=(world:WorldState,siteId:string)=>{
  const site=siteAt(world,siteId);
  return site&&site.type!=='secret_realm'&&site.type!=='abyss'?site:undefined;
};
const nextMonth=(before:WorldState,after:WorldState)=>
  Number.isSafeInteger(before.tick)&&after.tick===before.tick+1&&before.month>=1&&before.month<=12&&
  after.month===before.month%12+1&&after.year===before.year+(before.month===12?1:0)&&sameGeneratedWorld(before,after);
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[a-zA-Z0-9_.:@-]{1,240}(?![\s\S])/.test(id);
const exactKeys=(value:object,required:readonly string[],optional:readonly string[]=[])=>{
  const all=Object.keys(value);
  return required.every(key=>Object.hasOwn(value,key))&&all.every(key=>required.includes(key)||optional.includes(key));
};
const methodValid=(method:unknown):method is LeaderMethod=>method==='election'||method==='challenge'||method==='coup';

export function sameCampaignStopCondition(left:CampaignStopCondition|undefined,right:CampaignStopCondition|undefined):boolean{
  if(!left||!right)return left===right;
  return left.kind==='sect_leader_changed'&&right.kind===left.kind&&left.sectId===right.sectId&&left.initialLeaderId===right.initialLeaderId||
    left.kind==='actor_died'&&right.kind===left.kind&&left.actorId===right.actorId||
    left.kind==='site_owner_changed'&&right.kind===left.kind&&left.siteId===right.siteId;
}
export function isCampaignStopCondition(input:unknown):input is CampaignStopCondition{
  if(!input||typeof input!=='object'||Array.isArray(input))return false;
  const row=input as Record<string,unknown>;
  return row.kind==='sect_leader_changed'&&validId(row.sectId)&&validId(row.initialLeaderId)&&exactKeys(row,['kind','sectId','initialLeaderId'])||
    row.kind==='actor_died'&&validId(row.actorId)&&exactKeys(row,['kind','actorId'])||
    row.kind==='site_owner_changed'&&validId(row.siteId)&&exactKeys(row,['kind','siteId']);
}
export function validCampaignStopCondition(world:WorldState,input:unknown):input is CampaignStopCondition{
  if(!isCampaignStopCondition(input))return false;
  if(input.kind==='sect_leader_changed')return sector(world,input.sectId)?.leaderId===input.initialLeaderId&&live(actorAt(world,input.initialLeaderId));
  if(input.kind==='actor_died')return live(actorAt(world,input.actorId));
  return !!publicSite(world,input.siteId);
}

function matchingEvent(world:WorldState,batch:readonly WorldEvent[],matches:(event:WorldEvent)=>boolean):WorldEvent|undefined{
  const candidate=one(batch,event=>event.tick===world.tick&&event.month===world.month&&event.year===world.year&&
    isChronicleStoryFact(event,world.tick)&&matches(event));
  if(!candidate||batch.filter(row=>row.id===candidate.id).length!==1)return undefined;
  const retained=world.events.filter(row=>row.id===candidate.id);
  if(retained.length>1||retained.some(row=>!isChronicleStoryFact(row,world.tick)||row.tick!==candidate.tick||
      row.year!==candidate.year||row.month!==candidate.month||row.category!==candidate.category||
      row.actorIds.length!==candidate.actorIds.length||row.actorIds.some((id,i)=>id!==candidate.actorIds[i])||
      row.locationId!==candidate.locationId||row.duelWinnerId!==candidate.duelWinnerId))return undefined;
  return candidate;
}
function deathEvent(world:WorldState,batch:readonly WorldEvent[],actorId:string){
  const prefix=`evt-${world.tick}-`;
  return matchingEvent(world,batch,event=>{
    if(event.category!=='death')return false;
    if(event.actorIds.length===1&&event.actorIds[0]===actorId){
      return event.id===`${prefix}${actorId}-oldage`||event.id===`${prefix}${actorId}-tribulation-failure`||
        world.spiritBeasts.some(row=>event.id===`${prefix}beast-attack-${row.id}`)||
        world.occasions.some(row=>event.id===`${prefix}${row.id}-expedition-${actorId}`&&
          row.expeditions.some(proof=>proof.cultivatorId===actorId&&proof.tick===world.tick&&proof.outcome==='death'));
    }
    const [first,second]=event.actorIds,winner=event.duelWinnerId;
    return event.actorIds.length===2&&first!==second&&(first===actorId||second===actorId)&&
      (winner===first||winner===second)&&winner!==actorId&&event.id===`${prefix}${first}-kill`;
  });
}

function transferPlan(before:WorldState,after:WorldState,siteId:string,fromSectId:string|null,toSectId:string|null){
  const records=after.relocations.abandonedSites.filter(row=>row.tick===after.tick&&(
    row.originId===siteId&&fromSectId===row.sectId&&toSectId===null||
    row.destinationId===siteId&&fromSectId===null&&toSectId===row.sectId));
  if(records.length!==1)return undefined;
  const proof=records[0];
  if(before.relocations.abandonedSites.some(row=>row.id===proof.id))return undefined;
  return one(after.relocations.plans,row=>row.id===proof.planId&&row.status==='settled'&&row.settledTick===after.tick&&
    row.sectId===proof.sectId&&row.originId===proof.originId&&row.destinationId===proof.destinationId);
}

/** Adjacent completed native worlds, with the exact monthly producer batch, no mutations or text guesses. */
export function detectCampaignStop(condition:CampaignStopCondition,before:WorldState,after:WorldState,
    events:readonly WorldEvent[]):CampaignStopReceipt|undefined{
  if(!nextMonth(before,after))return undefined;
  const date={tick:after.tick,year:after.year,month:after.month};
  if(condition.kind==='actor_died'){
    const {actorId}=condition;
    if(!live(actorAt(before,actorId))||!dead(actorAt(after,actorId)))return undefined;
    const origin=deathEvent(after,events,actorId);
    return {...date,kind:condition.kind,actorId,...(origin?{eventId:origin.id}:{})};
  }
  if(condition.kind==='sect_leader_changed'){
    const {sectId}=condition,old=sector(before,sectId),next=sector(after,sectId);
    const vacancy=old?.officeVacancy;
    const filledVacancy=!old?.leaderId&&!!vacancy&&vacancy.tick<=before.tick&&
      vacancy.eventId===`evt-${vacancy.tick}-${sectId}-leadership-office-vacant`;
    const fromActorId=old?.leaderId??(filledVacancy?condition.initialLeaderId:undefined),toActorId=next?.leaderId;
    if(!fromActorId||!toActorId||fromActorId===toActorId||!actorAt(before,fromActorId)||
      !live(actorAt(after,toActorId))||!next)return undefined;
    const signed=next.succession;
    const method=signed?.tick===after.tick&&signed.leaderId===toActorId&&
      signed.previousLeaderId===(filledVacancy?undefined:fromActorId)&&methodValid(signed.method)?signed.method:undefined;
    if(filledVacancy&&method!=='election')return undefined;
    const source=method&&matchingEvent(after,events,event=>{
      const prefix=`evt-${after.tick}-${sectId}-leadership-`;
      if(event.actorIds[0]!==toActorId||event.locationId!==next.headquartersId)return false;
      if(method==='election')return event.category==='diplomacy'&&event.id===`${prefix}vacancy-${toActorId}`;
      const exactPrefix=`${prefix}${toActorId}-`;
      return (event.category==='intrigue'||event.category==='death')&&event.actorIds[1]===fromActorId&&
        event.id.startsWith(exactPrefix)&&/^[1-9][0-9]*(?![\s\S])/.test(event.id.slice(exactPrefix.length));
    });
    return {...date,kind:condition.kind,sectId,fromActorId,toActorId,...(method?{method}:{}),...(filledVacancy?{filledVacancy:true as const}:{}),...(source?{eventId:source.id}:{})};
  }
  const {siteId}=condition,old=publicSite(before,siteId),next=publicSite(after,siteId);
  if(!old||!next||old.ownerSectId===next.ownerSectId)return undefined;
  const fromSectId=old.ownerSectId??null,toSectId=next.ownerSectId??null;
  if(fromSectId&&!sector(before,fromSectId)||toSectId&&!sector(after,toSectId))return undefined;
  const native=transferPlan(before,after,siteId,fromSectId,toSectId);
  const event=native&&matchingEvent(after,events,row=>row.category==='diplomacy'&&
    row.id===`evt-${after.tick}-${native.id}-arrived`&&row.locationId===native.destinationId);
  return {...date,kind:condition.kind,siteId,fromSectId,toSectId,...(native?{planId:native.id}:{}),...(event?{eventId:event.id}:{})};
}

const nat=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
export function isCampaignStopReceipt(input:unknown):input is CampaignStopReceipt{
  if(!input||typeof input!=='object'||Array.isArray(input))return false;
  const row=input as Record<string,unknown>,required=['kind','tick','year','month'],optional=['eventId'];
  if(!nat(row.tick)||!nat(row.year)||!nat(row.month)||row.month<1||row.month>12||
    row.eventId!==undefined&&!validId(row.eventId))return false;
  if(row.kind==='actor_died')return validId(row.actorId)&&exactKeys(row,[...required,'actorId'],optional);
  if(row.kind==='sect_leader_changed')return validId(row.sectId)&&validId(row.fromActorId)&&validId(row.toActorId)&&
    row.fromActorId!==row.toActorId&&(row.method===undefined||methodValid(row.method))&&
    (row.filledVacancy===undefined||row.filledVacancy===true&&row.method==='election')&&
    exactKeys(row,[...required,'sectId','fromActorId','toActorId'],[...optional,'method','filledVacancy']);
  return row.kind==='site_owner_changed'&&validId(row.siteId)&&(row.fromSectId===null||validId(row.fromSectId))&&
    (row.toSectId===null||validId(row.toSectId))&&row.fromSectId!==row.toSectId&&
    (row.planId===undefined||validId(row.planId))&&exactKeys(row,[...required,'siteId','fromSectId','toSectId'],[...optional,'planId']);
}

/** Read-back consistency with the selected condition and resulting month's native state. */
export function campaignStopReceiptMatchesResult(condition:CampaignStopCondition,raw:unknown,world:WorldState):raw is CampaignStopReceipt{
  if(!isCampaignStopReceipt(raw))return false;
  const row=raw as unknown as Record<string,unknown>;
  if(row.kind!==condition.kind||row.tick!==world.tick||row.year!==world.year||row.month!==world.month||
    row.eventId!==undefined&&!validId(row.eventId))return false;
  const eventId=typeof row.eventId==='string'?row.eventId:undefined;
  const retained=eventId?world.events.filter(event=>event.id===eventId):[];
  if(retained.length>1||retained.some(event=>event.tick!==world.tick||event.year!==world.year||
      event.month!==world.month||!isChronicleStoryFact(event,world.tick)))return false;
  const required=['kind','tick','year','month'],optional=['eventId'];
  if(condition.kind==='actor_died')return row.actorId===condition.actorId&&exactKeys(row,[...required,'actorId'],optional)&&
    dead(actorAt(world,condition.actorId))&&(!eventId||eventId.startsWith(`evt-${world.tick}-`)&&
      (!retained.length||deathEvent(world,retained,condition.actorId)?.id===eventId));
  if(condition.kind==='sect_leader_changed'){
    const sect=sector(world,condition.sectId),signed=sect?.succession;
    const eventPrefix=`evt-${world.tick}-${condition.sectId}-leadership-`;
    const eventSupported=!eventId||(row.method==='election'?eventId===`${eventPrefix}vacancy-${row.toActorId}`:
      (row.method==='coup'||row.method==='challenge')&&eventId.startsWith(`${eventPrefix}${row.toActorId}-`)&&
      /^[1-9][0-9]*(?![\s\S])/.test(eventId.slice(`${eventPrefix}${row.toActorId}-`.length)))&&
      (!retained.length||retained[0].actorIds[0]===row.toActorId&&retained[0].locationId===sect?.headquartersId&&
        (row.method==='election'?retained[0].category==='diplomacy':
          (retained[0].category==='intrigue'||retained[0].category==='death')&&retained[0].actorIds[1]===row.fromActorId));
    const vacant=row.filledVacancy===true;
    if(row.filledVacancy!==undefined&&(!vacant||row.method!=='election'||row.fromActorId!==condition.initialLeaderId))return false;
    return eventSupported&&row.sectId===condition.sectId&&validId(row.fromActorId)&&validId(row.toActorId)&&row.fromActorId!==row.toActorId&&
      exactKeys(row,[...required,'sectId','fromActorId','toActorId'],[...optional,'method','filledVacancy'])&&
      !!actorAt(world,row.fromActorId)&&sect?.leaderId===row.toActorId&&live(actorAt(world,row.toActorId))&&
      (row.method===undefined||methodValid(row.method)&&signed?.tick===world.tick&&signed.method===row.method&&
        signed.previousLeaderId===(vacant?undefined:row.fromActorId)&&signed.leaderId===row.toActorId);
  }
  const site=publicSite(world,condition.siteId);
  if(!site||row.siteId!==condition.siteId||row.fromSectId===row.toSectId||
      !(row.fromSectId===null||validId(row.fromSectId))||row.toSectId!==(site.ownerSectId??null)||
      !exactKeys(row,[...required,'siteId','fromSectId','toSectId'],[...optional,'planId']))return false;
  if(row.planId===undefined)return !eventId;
  if(!validId(row.planId))return false;
  return world.relocations.plans.some(plan=>plan.id===row.planId&&plan.status==='settled'&&plan.settledTick===world.tick&&
    (!eventId||eventId===`evt-${world.tick}-${plan.id}-arrived`&&
      (!retained.length||retained[0].category==='diplomacy'&&retained[0].locationId===plan.destinationId))&&
    (plan.originId===condition.siteId&&plan.sectId===row.fromSectId&&row.toSectId===null||
     plan.destinationId===condition.siteId&&plan.sectId===row.toSectId&&row.fromSectId===null));
}
