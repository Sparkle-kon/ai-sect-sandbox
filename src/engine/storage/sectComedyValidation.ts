import {COMEDY_SEQUELS,isSectComedySequel} from '../../data/sectComedy/scenes/continuations';
import { findSectComedyTemplate } from '../../data/sectComedy';
import {COMEDY_ITEM_IDS,COMEDY_MAX_EFFECTS,COMEDY_PENDING_LIMIT,COMEDY_PET_IDS,COMEDY_RECRUIT_IDS,
  type SectComedyEffect,type SectComedyState,type SectComicAppliedEffect,type SectComicMoment} from '../../types/sectComedy';
import {MANAGEMENT_BUILDING_IDS} from '../../types/sectManagement';
import {SECT_RECURRING_ROLES} from '../../types/sectRecurring';
import {SECT_CHAT_ROOMS} from '../../types/sectChat';
import {comedyDueTick,comedyFollowUpEventId,comedyIdentity,comedyRecurringIds,comedyRelationTarget} from '../sectComedyTerms';
import type { SectManagementState } from '../../types/sectManagement';
import type { WorldState } from '../../types/world';
import {sectFestivalForJob,sectMonthAt} from '../sectFestivals';
import { SECT_JOB_IDS } from '../sectQuirkCatalog';
import { arr, fail as rejectShape, id, num, oid, one, optional, otick, structure, tick, type Validator } from './primitives';

const jobId=one(...SECT_JOB_IDS);
const ambient=structure({phase:one('ambient'),presence:one('home','away')});
const performed=structure({phase:one('performed'),jobId,tier:one('windfall','mishap','success'),reportEventId:oid});
const partial=structure({phase:one('on_route','unavailable'),jobId,reportEventId:oid});
const source:Validator=(value,path)=>{
  if(!value||typeof value!=='object'||!('phase' in value))return rejectShape(path);
  switch(value.phase){
    case 'ambient':return ambient(value,path);
    case 'performed':return performed(value,path);
    case 'on_route':
    case 'unavailable':return partial(value,path);
    default:return rejectShape(`${path}.phase`);
  }
};
const amount=num(-1_000_000_000,1_000_000_000,true);
const visit={npc:one(...SECT_RECURRING_ROLES),dueTick:tick};
const sequel={templateId:id,dueTick:tick};

const effects:Record<SectComicAppliedEffect['kind'],Validator>={
  qi:structure({kind:one('qi'),amount:num(-100,100)}),
  stones:structure({kind:one('stones'),amount}),
  fame:structure({kind:one('fame'),amount}),
  debt:structure({kind:one('debt'),amount}),
  injury:structure({kind:one('injury'),amount:num(-1_000_000_000,0)}),
  kitchen_damage:structure({kind:one('kitchen_damage'),amount:one(-1)}),
  building_damage:structure({kind:one('building_damage'),building:one(...MANAGEMENT_BUILDING_IDS),amount:one(-1)}),
  herb:structure({kind:one('herb'),herb:one('jade_leaf','earth_root','star_bloom','shadow_moss'),amount:num(-10_000,10_000,true)}),
  item:structure({kind:one('item'),template:one(...COMEDY_ITEM_IDS),itemId:id}),
  item_loss:structure({kind:one('item_loss'),template:one(...COMEDY_ITEM_IDS),itemId:id}),
  sect_relation:structure({kind:one('sect_relation'),targetSectId:id,amount:num(-200,200)}),
  recruit:structure({kind:one('recruit'),template:one(...COMEDY_RECRUIT_IDS),actorId:id}),
  pet:structure({kind:one('pet'),template:one(...COMEDY_PET_IDS),beastId:id}),
  visit:structure({kind:one('visit'),...visit}),
  sequel:structure({kind:one('sequel'),...sequel}),
  rumor:structure({kind:one('rumor'),group:one(...SECT_CHAT_ROOMS)}),
};
const effect:Validator=(value,path)=>{
  if(!value||typeof value!=='object'||!('kind' in value)||typeof value.kind!=='string'||
    !Object.hasOwn(effects,value.kind))return rejectShape(path);
  return effects[value.kind as SectComicAppliedEffect['kind']](value,path);
};
const arrival=structure({tick,visitorId:oid,choice:optional(structure({id,tick,effects:arr(COMEDY_MAX_EFFECTS,effect)}))});
const pendingOrigin={originTick:tick,originTemplateId:id,effectIndex:num(0,COMEDY_MAX_EFFECTS-1,true),speakerId:id,siteId:oid,
  arrival:optional(arrival)};
const pendingVisit=structure({kind:one('visit'),...visit,...pendingOrigin});
const pendingSequel=structure({kind:one('sequel'),...sequel,...pendingOrigin});
const pending:Validator=(value,path)=>{
  if(!value||typeof value!=='object'||!('kind' in value))return rejectShape(path);
  return (value.kind==='visit'?pendingVisit:pendingSequel)(value,path);
};
const moment=structure({tick,templateId:id,speakerId:id,siteId:oid,source,effects:arr(COMEDY_MAX_EFFECTS,effect)});
const recentMonthCount=12;
export const sectComedyShape=structure({moments:arr(recentMonthCount,moment),pending:optional(arr(COMEDY_PENDING_LIMIT,pending)),
  catBond:optional(structure({feeds:num(0,3,true),fedTick:otick,shooedTick:otick,returnedTick:otick}))});

const signed=(received:number,offered:number)=>received!==0&&Math.sign(received)===Math.sign(offered)&&
  Math.abs(received)<=Math.abs(offered)+1e-9;
function matchesEffect(world:WorldState,state:SectManagementState,row:Omit<SectComicMoment,'effects'>,index:number,
  applied:SectComicAppliedEffect,offered:SectComedyEffect):boolean{
  const {source}=row;
  switch(applied.kind){
    case 'qi':return offered.kind==='qi'&&signed(applied.amount,offered.amount);
    case 'stones':case 'fame':case 'debt':return offered.kind===applied.kind&&applied.amount===offered.amount&&applied.amount!==0;
    case 'herb':return offered.kind==='herb'&&applied.herb===offered.herb&&applied.amount===offered.amount&&applied.amount!==0;
    case 'injury':return offered.kind==='injury'&&applied.amount<0;
    case 'kitchen_damage':return offered.kind==='kitchen_damage'&&source.phase==='performed'&&source.tier==='mishap'&&
      source.jobId==='kitchen'&&row.siteId===state.homeSiteId;
    case 'building_damage':return offered.kind==='building_damage'&&applied.building===offered.building;
    case 'sect_relation':return offered.kind==='sect_relation'&&applied.targetSectId!==state.sectId&&
      world.sects.some(sect=>sect.id===applied.targetSectId)&&
      (offered.target==='host_sect'?!!row.siteId:comedyRelationTarget(world,row,offered.target)===applied.targetSectId)&&
      signed(applied.amount,offered.amount);
    case 'item':return offered.kind==='item'&&applied.template===offered.template&&
      applied.itemId===comedyIdentity(state.sectId,'item',`${row.tick}-${index}`);
    case 'item_loss':return offered.kind==='item_loss'&&applied.template===offered.template&&
      applied.itemId.startsWith(comedyIdentity(state.sectId,'item',''));
    case 'recruit':return offered.kind==='recruit'&&applied.template===offered.template&&
      applied.actorId===comedyIdentity(state.sectId,'recruit',offered.template)&&
      world.cultivators.some(actor=>actor.id===applied.actorId);
    case 'pet':return offered.kind==='pet'&&applied.template===offered.template&&
      applied.beastId===(offered.template==='pill-cat'?comedyRecurringIds(world)?.cat:comedyIdentity(state.sectId,'pet',offered.template));
    case 'visit':return offered.kind==='visit'&&applied.npc===offered.npc&&
      applied.dueTick===comedyDueTick(world.random.seed,row,index,offered.afterMonths);
    case 'sequel':return offered.kind==='sequel'&&applied.templateId===offered.templateId&&(isSectComedySequel(applied.templateId)||!!findSectComedyTemplate(applied.templateId))&&
      applied.dueTick===comedyDueTick(world.random.seed,row,index,offered.afterMonths);
    case 'rumor':return offered.kind==='rumor'&&applied.group===offered.group&&applied.group!=='leaders';
  }
}
function matchesDatedReport(world:WorldState,state:SectManagementState,row:SectComicMoment):boolean {
  const comic=row.source,report=state.latestReport;
  if(comic.phase==='ambient')return true;
  if(report?.settledTick!==row.tick)return row.tick<world.tick;
  const entries=report.rows.filter(entry=>entry.discipleId===row.speakerId);
  const entry=entries[0];
  if(entries.length===1&&row.effects.some(effect=>effect.kind==='kitchen_damage')&&
      !entry.effects.some(effect=>effect.kind==='herb'&&effect.stage==='native'&&effect.amount===-1&&
        (effect.herbId==='jade_leaf'||effect.herbId==='earth_root')))return false;
  return entries.length===1&&entry.jobId===comic.jobId&&entry.phase===comic.phase&&
    entry.sourceEventId===comic.reportEventId&&entry.siteId===row.siteId&&
    (comic.phase!=='performed'||entry.tier===comic.tier);
}

/** The bounded notebook stores display references, not prose or authority to apply effects again. */
export function validateSectComedy(
  world:WorldState,state:SectManagementState,comedy:SectComedyState,fail:(field:string)=>never,
):void {
  const newest=comedy.moments.at(-1);
  if(!newest||newest.tick>world.tick||newest.tick-comedy.moments[0].tick>=recentMonthCount)
    return fail('sectManagement.comedy.clock');
  const speakers=new Map(world.cultivators.map(person=>[person.id,person]));
  const sites=new Set(world.locations.filter(site=>site.expeditionOmenId===undefined).map(site=>site.id));
  let previous=state.foundedTick;
  for(const row of comedy.moments){
    if(row.tick<=previous||row.tick>(state.growth?.failure?.tick??world.tick))
      return fail('sectManagement.comedy.clock');
    previous=row.tick;
    const speaker=speakers.get(row.speakerId);
    const authored=findSectComedyTemplate(row.templateId);
    if(!speaker||!authored||row.siteId!==undefined&&!sites.has(row.siteId)||
        authored.match.quirks?.some(quirk=>!speaker.quirks?.includes(quirk)))
      return fail('sectManagement.comedy.identity');
    const {source}=row,{match}=authored;
    const seasonal=source.phase==='ambient'?undefined:sectFestivalForJob(source.jobId);
    if(seasonal&&sectMonthAt(world,row.tick)!==seasonal.month||match.phase!==source.phase||
        source.phase==='ambient'&&(
          match.phase!=='ambient'||match.presence!==undefined&&match.presence!==source.presence||
          source.presence==='home'&&row.siteId!==state.homeSiteId||source.presence==='away'&&row.siteId===state.homeSiteId)||
        source.phase!=='ambient'&&(
          match.phase==='ambient'||match.job!==undefined&&match.job!==source.jobId||row.speakerId===state.leaderId||
          source.phase==='performed'&&(match.phase!=='performed'||match.tier!==source.tier)||
          source.reportEventId!==undefined&&!source.reportEventId.startsWith('evt-'))||
        !matchesDatedReport(world,state,row))
      return fail('sectManagement.comedy.source');

    const receiptId=`evt-${row.tick}-${state.sectId}-comic`;
    const retained=world.events.filter(event=>event.id===receiptId);
    const calendar=world.year*12+world.month-(world.tick-row.tick);
    if(retained.length>1||row.tick===world.tick&&!retained.length||
        retained.some(event=>event.tick!==row.tick||event.year*12+event.month!==calendar||event.category!=='diplomacy'||
          event.witnessScope!=='participants'||event.locationId!==undefined||
          event.actorIds.length!==1||event.actorIds[0]!==row.speakerId))
      return fail('sectManagement.comedy.receipt');

    if(row.effects.length!==authored.effects.length||
      source.phase!=='performed'&&!(source.phase==='ambient'&&row.siteId)&&row.effects.length||
      row.effects.some((applied,index)=>!matchesEffect(world,state,row,index,applied,authored.effects[index])))
      return fail('sectManagement.comedy.effects');
  }
  const bond=comedy.catBond;
  if(bond){
    const beast=world.spiritBeasts.find(beast=>beast.id===comedyRecurringIds(world)?.cat);
    if(!beast||(bond.feeds>0)!==(bond.fedTick!==undefined)||
      [bond.fedTick,bond.shooedTick,bond.returnedTick].some(t=>t!==undefined&&(t<=state.foundedTick||t>world.tick))||
      bond.returnedTick!==undefined&&(bond.shooedTick===undefined||bond.returnedTick<bond.shooedTick+2))
      return fail('sectManagement.comedy.catBond');
  }
  const queued=new Set<string>();
  for(const row of comedy.pending??[]){
    const key=`${row.originTick}:${row.effectIndex}`;
    const origin=comedy.moments.find(moment=>moment.tick===row.originTick);
    const effect=findSectComedyTemplate(row.originTemplateId)?.effects[row.effectIndex];
    const context={tick:row.originTick,templateId:row.originTemplateId,speakerId:row.speakerId,siteId:row.siteId,
      source:{phase:'ambient' as const,presence:'home' as const}};
    if(queued.has(key)||row.originTick<=state.foundedTick||row.originTick>world.tick||
      !speakers.has(row.speakerId)||row.siteId!==undefined&&!sites.has(row.siteId)||
      origin&&(origin.templateId!==row.originTemplateId||origin.speakerId!==row.speakerId||origin.siteId!==row.siteId||
        origin.effects[row.effectIndex]?.kind!==row.kind)||
      !effect||!matchesEffect(world,state,context,row.effectIndex,row,effect))
      return fail('sectManagement.comedy.pending');
    const arrival=row.arrival;
    if(arrival){
      const recipient=state.leaderId,guest=row.kind==='visit'?comedyRecurringIds(world)?.[row.npc]:undefined;
      const expected=row.kind==='visit'&&row.npc!=='cat'?[recipient,guest]:[recipient];
      const validMarker=(tick:number,choice:boolean)=>{
        const id=comedyFollowUpEventId(state.sectId,row,choice);
        const events=world.events.filter(event=>event.id===id);
        const insideTail=world.events.length<120||world.events.some(event=>event.tick<tick);
        if(events.length!==1)return events.length===0&&!insideTail;
        const event=events[0],audience=choice?[recipient]:expected;
        return event.tick===tick&&event.year*12+event.month===world.year*12+world.month-(world.tick-tick)&&
          event.locationId===state.homeSiteId&&event.category==='diplomacy'&&event.witnessScope==='participants'&&
          event.actorIds.length===audience.length&&event.actorIds.every((id,index)=>id===audience[index]);
      };
      if(arrival.tick<row.dueTick||arrival.tick>Math.min(row.dueTick+4,state.growth?.failure?.tick??world.tick)||
        arrival.visitorId!==guest||row.kind==='visit'&&(!guest||arrival.choice!==undefined)||
        !validMarker(arrival.tick,false))return fail('sectManagement.comedy.arrival');
      if(arrival.choice){
        const choice=arrival.choice,authored=row.kind==='sequel'?COMEDY_SEQUELS[row.templateId]?.choices.find(row=>row.id===choice.id):undefined;
        const actionContext={...context,tick:choice.tick,speakerId:recipient,siteId:state.homeSiteId};
        if(!authored||choice.tick<arrival.tick||choice.tick>world.tick||choice.tick-arrival.tick>=12||
          choice.effects.length!==authored.effects.length||choice.effects.some((applied,index)=>
            !matchesEffect(world,state,actionContext,index,applied,authored.effects[index]))||!validMarker(choice.tick,true))
          return fail('sectManagement.comedy.choice');
      }
    }
    queued.add(key);
  }
  for(const origin of comedy.moments)for(const [index,effect] of origin.effects.entries()){
    if((effect.kind==='visit'||effect.kind==='sequel')&&effect.dueTick>world.tick&&!queued.has(`${origin.tick}:${index}`))
      return fail('sectManagement.comedy.pending');
  }
}
