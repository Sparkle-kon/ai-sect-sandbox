import { PAVILION_FIRE_SECURE_RECEIPT, pavilionFireActionId as actionId } from '../types/pavilionFire';
import type {PavilionFireCase,PavilionFireOption,PavilionFireView} from '../types/pavilionFire';
import type {Cultivator,LLMDecisionPayload,LocationNode,MapHazard,Technique,WorldEvent,WorldState} from '../types/world';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {knownMapLocations,noteTerrainVisit,terrainTileAt} from './terrainEngine';
import {ascensionDutyActive} from './ascensionPresence';

export type {PavilionFireOption,PavilionFireView} from '../types/pavilionFire';
export const PAVILION_FIRE_WARD_QI=8;
const unique=<T extends {id:string}>(rows:readonly T[],id:string)=>{const found=rows.filter(row=>row.id===id);return found.length===1?found[0]:undefined;};
const at=(world:WorldState,actor:Cultivator,siteId:string,tick:number)=>
  unique(world.cultivators,actor.id)===actor&&actor.positionPlane===undefined&&!ascensionDutyActive(world,actor)&&
  doctrineFoundingPhysicallyAt(world,actor,siteId,tick);
const words={
  salvage:{title:'实卷带离火场',description:'只取这一本在阁的卷册，携到亲临的避火处；尚未安置。'},
  ward:{title:'留在火前护住一人',description:'留在经阁护人。这一步不移动对方，也不算已经脱险。'},
  leave:{title:'由近路退出火场',description:'走到实有的邻地；这一步没带走卷册，也没带走旁人。'},
  secure:PAVILION_FIRE_SECURE_RECEIPT,
} as const;
const same=(a:Readonly<Technique>,b:Readonly<Technique>)=>a.id===b.id&&a.authorId===b.authorId&&a.createdTick===b.createdTick&&
  a.name===b.name&&a.spiritRoot===b.spiritRoot;
function hq(world:WorldState,site:LocationNode|undefined){
  const sect=site?.ownerSectId?unique(world.sects,site.ownerSectId):undefined;
  return site?.type==='sect_hq'&&!isScopedExpeditionGate(site)&&sect&&sect.headquartersId===site.id&&
    sect.facilities.scripture_pavilion>0&&sect.inactiveSinceTick===undefined?sect:undefined;
}
function material(world:WorldState,sectId:string,scrollId:string){
  const sect=unique(world.sects,sectId);
  const original=unique(world.scriptures.originals,scrollId);
  const copies=sect?.pavilion.filter(row=>row.id===scrollId);
  return original&&copies?.length===1&&same(original.technique,copies[0])?copies[0]:undefined;
}
const fireId=(hazardId:string)=>`pavilion-fire-${hazardId}`;
export const isPrivatePavilionFireEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&/^evt-\d+-pavilion-fire-/.test(event.id);

function record(world:WorldState,row:PavilionFireCase,tag:string,title:string,description:string,siteId:string,actorIds:string[],
  privateEvent=false):WorldEvent{
  return {id:`evt-${world.tick}-${row.id}-${tag}`,tick:world.tick,year:world.year,month:world.month,title,description,
    category:'heavenly',locationId:siteId,actorIds,...(privateEvent?{witnessScope:'participants'}:{})};
}
/** Called from the native meteor brush, after the real original impact is constructed. */
export function openPavilionFire(world:WorldState,hazard:MapHazard,source:WorldEvent):WorldEvent|undefined{
  const site=source.locationId?unique(world.locations,source.locationId):undefined;
  const sect=hq(world,site);
  if(!site||!sect||hazard.kind!=='meteor'||unique(world.mapHazards,hazard.id)!==hazard||
    !hazard.id.startsWith('hazard-')||source.id!==`evt-brush-${hazard.id.slice(7)}`||source.title!=='星陨降地'||
    (source.category!=='heavenly'&&source.category!=='death')||source.witnessScope!==undefined||
    hazard.createdTick!==world.tick||source.tick!==world.tick||source.year!==world.year||source.month!==world.month||
    terrainTileAt(world,site.x,site.y)?.id!==hazard.tileId||
    !world.cultivators.some(actor=>actor.sectId===sect.id&&at(world,actor,site.id,world.tick))||
    world.pavilionFires?.cases.some(row=>row.hazardId===hazard.id||row.siteId===site.id&&!row.heat))return;
  const selected=sect.pavilion.filter(row=>row.id&&material(world,sect.id,row.id)===row&&
    !world.pavilionFires?.cases.some(fire=>fire.sectId===sect.id&&fire.scrollId===row.id))
    .sort((a,b)=>a.id!<b.id!?-1:1)[0];
  if(!selected?.id)return;
  const row:PavilionFireCase={id:fireId(hazard.id),siteId:site.id,sectId:sect.id,tileId:hazard.tileId,hazardId:hazard.id,
    sourceEventId:source.id,openedTick:world.tick,heatTick:world.tick+1,scrollId:selected.id,scrollStatus:'shelved'};
  (world.pavilionFires??={cases:[]}).cases.push(row);
  return record(world,row,'open','陨火烧到藏经阁','陨星落地以后，经阁起火；这一处阁藏确有卷册尚未移走。',site.id,[]);
}
function safe(world:WorldState,site:LocationNode,tick:number){
  const tile=terrainTileAt(world,site.x,site.y);
  return tile&&site.type!=='secret_realm'&&site.type!=='abyss'&&!isScopedExpeditionGate(site)&&
    tile.biome!=='魔渊'&&!world.mapHazards.some(hazard=>hazard.tileId===tile.id&&hazard.createdTick<=tick&&hazard.expiresTick>tick)&&
    !world.pavilionFires?.cases.some(row=>row.tileId===tile.id&&!row.heat)?tile:undefined;
}
function refuges(world:WorldState,actor:Cultivator,row:PavilionFireCase,tick:number){
  const from=world.terrain.tiles.find(tile=>tile.id===row.tileId);
  if(!from)return [];
  return knownMapLocations(world,actor).filter(site=>{
    if(unique(world.locations,site.id)!==site)return false;
    const target=safe(world,site,tick);
    return target&&Math.abs(from.col-target.col)+Math.abs(from.row-target.row)===1;
  }).sort((a,b)=>a.id<b.id?-1:1);
}
function optionRows(world:WorldState,actor:Cultivator,row:PavilionFireCase,tick:number):PavilionFireOption[]{
  const base={action:'PAVILION_FIRE',targetPavilionFireId:row.id} as const;
  if(row.scrollStatus==='carried'&&row.carrierId===actor.id&&row.carriedTick!==undefined&&row.carriedTick<tick&&row.safeSiteId){
    const site=unique(world.locations,row.safeSiteId);
    if(site&&safe(world,site,tick)&&at(world,actor,site.id,tick))return [{...base,pavilionFireMove:'secure'}];
  }
  if(row.heat||tick!==row.heatTick||!at(world,actor,row.siteId,tick)||
    world.events.some(event=>isPrivatePavilionFireEvent(event)&&event.tick===tick&&event.actorIds[0]===actor.id))return [];
  const out:PavilionFireOption[]=[];
  for(const dest of refuges(world,actor,row,tick).slice(0,1)){
    if(row.scrollStatus==='shelved'&&actor.sectId===row.sectId&&hq(world,unique(world.locations,row.siteId))?.id===row.sectId&&material(world,row.sectId,row.scrollId))
      out.push({...base,pavilionFireMove:'salvage',targetLocationId:dest.id});
    out.push({...base,pavilionFireMove:'leave',targetLocationId:dest.id});
  }
  if(!row.ward&&actor.qiProgress>=PAVILION_FIRE_WARD_QI){
    for(const target of world.cultivators.filter(other=>other.id!==actor.id&&other.locationId===row.siteId&&other.hp>1&&at(world,other,row.siteId,tick))
      .sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||(a.id<b.id?-1:1)).slice(0,1))
      out.push({...base,pavilionFireMove:'ward',targetCultivatorId:target.id});
  }
  return out;
}
export function availablePavilionFireActions(actor:Cultivator,world:WorldState,tick=world.tick+1):PavilionFireOption[]{
  if(tick!==world.tick&&tick!==world.tick+1||!actor.alive||actor.positionPlane!==undefined)return [];
  return world.pavilionFires?.cases.flatMap(row=>optionRows(world,actor,row,tick))??[];
}
export function resolvePavilionFireAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='PAVILION_FIRE'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','pavilionFireMove','targetPavilionFireId','targetLocationId','targetCultivatorId'].includes(key)))return null;
  const option=availablePavilionFireActions(actor,world,world.tick).find(row=>row.targetPavilionFireId===decision.targetPavilionFireId&&
    row.pavilionFireMove===decision.pavilionFireMove&&row.targetLocationId===decision.targetLocationId&&row.targetCultivatorId===decision.targetCultivatorId);
  const row=option&&unique(world.pavilionFires?.cases??[],option.targetPavilionFireId);
  if(!row||!option)return null;
  const move=option.pavilionFireMove;
  const tag=`${actor.id}-${move}`;
  if(world.events.some(event=>event.id===actionId(world.tick,row.id,actor.id,move)))return null;
  if(move==='secure'){row.scrollStatus='secured';row.securedTick=world.tick;}
  else if(move==='ward'){row.ward={actorId:actor.id,targetId:option.targetCultivatorId,tick:world.tick};}
  else{
    const destination=option.targetLocationId;
    if(move==='salvage'){
      const copy=material(world,row.sectId,row.scrollId),sect=unique(world.sects,row.sectId);
      if(!copy||!sect)return null;
      sect.pavilion=sect.pavilion.filter(entry=>entry!==copy);
      row.copy={...copy};row.scrollStatus='carried';row.carrierId=actor.id;row.safeSiteId=destination;row.carriedTick=world.tick;
    }
    actor.locationId=destination;
    noteTerrainVisit(world,actor);
  }
  return record(world,row,tag,words[move].title,words[move].description,actor.locationId,
    move==='ward'?[actor.id,option.targetCultivatorId]:[actor.id],true);
}

export function advancePavilionFires(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const row of world.pavilionFires?.cases??[]){
    if(row.heat||world.tick!==row.heatTick)continue;
    const people=world.cultivators.filter(actor=>actor.locationId===row.siteId&&at(world,actor,row.siteId,world.tick));
    const nominal=(actor:Cultivator)=>Math.max(0,Math.min(actor.hp-1,Math.round(actor.maxHp*.12)));
    const leader=people.find(actor=>actor.id===row.ward?.actorId),warded=people.find(actor=>actor.id===row.ward?.targetId);
    const prevented=leader&&warded&&leader.qiProgress>=PAVILION_FIRE_WARD_QI?Math.floor(nominal(warded)*.65):0;
    if(prevented>0&&leader)leader.qiProgress-=PAVILION_FIRE_WARD_QI;
    const hits=people.flatMap(actor=>{
      const harm=nominal(actor)-(actor===warded?prevented:0);
      if(harm<=0)return [];
      actor.hp-=harm;return [{cultivatorId:actor.id,amount:harm}];
    });
    row.heat={tick:world.tick,damage:hits,...(prevented>0?{wardSaved:prevented}:{})};
    if(row.scrollStatus==='shelved'&&hq(world,unique(world.locations,row.siteId))?.id===row.sectId){
      const copy=material(world,row.sectId,row.scrollId),sect=unique(world.sects,row.sectId);
      if(copy&&sect){sect.pavilion=sect.pavilion.filter(entry=>entry!==copy);row.scrollStatus='lost';row.lostTick=world.tick;}
    }
    const lostName=row.scrollStatus==='lost'?unique(world.scriptures.originals,row.scrollId)?.technique.name
      .replace(/[\p{C}]/gu,'').trim().slice(0,60):undefined;
    const carriedName=row.scrollStatus==='carried'&&row.carriedTick===world.tick&&row.carrierId?
      row.copy?.name.replace(/[\p{C}]/gu,'').trim().slice(0,60):undefined;
    events.push({...record(world,row,'heat','经阁火势落定',
      `${hits.length?'仍在阁中的人实受热创。':'这一轮没有人在阁中受热创。'}${lostName?`阁中这一本《${lostName}》已烧毁；不牵连别处本子。`:row.scrollStatus==='lost'?'其中一卷阁藏烧毁；不牵连别处本子。':carriedName?`阁中这一本《${carriedName}》已被带离火场，尚未安置。`:''}`,
      row.siteId,hits.map(hit=>hit.cultivatorId)),...(hits.length?{damage:hits}:{})});
  }
  return events;
}
export function projectPavilionFire(world:WorldState,viewer:Cultivator):PavilionFireView|undefined{
  if(!viewer?.alive||unique(world.cultivators,viewer.id)!==viewer||viewer.positionPlane!==undefined)return;
  const options=availablePavilionFireActions(viewer,world);
  for(const row of [...(world.pavilionFires?.cases??[])].reverse()){
    const own=options.filter(option=>option.targetPavilionFireId===row.id);
    const site=unique(world.locations,row.siteId);
    if(!site)continue;
    const candidates=world.events.filter(event=>event.tick===world.tick&&event.actorIds[0]===viewer.id&&
      (Object.keys(words) as (keyof typeof words)[]).some(move=>event.id===actionId(world.tick,row.id,viewer.id,move)&&
        event.title===words[move].title&&event.description===words[move].description)&&isPrivatePavilionFireEvent(event));
    const receipt=candidates.length===1?unique(world.events,candidates[0].id):undefined;
    const saved=receipt?.title===words.ward.title&&row.ward?.actorId===viewer.id&&row.heat?.tick===world.tick
      ?row.heat.wardSaved:undefined;
    if(own.length||receipt)return {siteName:site.name,options:own,...(receipt?{receipt:{title:receipt.title,
      description:saved?`实付八点灵气，为所护之人挡下 ${saved} 点热创。那人未被移动。`:receipt.description}}:{})};
  }
}

/** Exact durable custody; historical events stay corroboration when retained, not a new physical copy. */
export function validatePavilionFireSave(world:WorldState,fail:(path:string)=>never):void{
  if(!world.pavilionFires)return;
  const caseIds=new Set<string>(),physical=new Set<string>();
  for(const row of world.pavilionFires.cases){
    const site=unique(world.locations,row.siteId),sect=unique(world.sects,row.sectId);
    const original=unique(world.scriptures.originals,row.scrollId);
    const hazard=unique(world.mapHazards,row.hazardId);
    const reserved=`${row.sectId}:${row.scrollId}`;
    if(caseIds.has(row.id)||physical.has(reserved)||!site||!sect||!original||row.id!==fireId(row.hazardId)||
      !row.hazardId.startsWith('hazard-')||!row.hazardId.endsWith(`-${row.tileId}`)||
      row.sourceEventId!==`evt-brush-${row.hazardId.slice(7)}`||row.openedTick>world.tick||
      row.heatTick!==row.openedTick+1||terrainTileAt(world,site.x,site.y)?.id!==row.tileId||
      (hazard&&(hazard.kind!=='meteor'||hazard.createdTick!==row.openedTick||hazard.tileId!==row.tileId)))
      fail('pavilionFires.case');
    caseIds.add(row.id);physical.add(reserved);
    const sources=world.events.filter(event=>event.id===row.sourceEventId);
    if(sources.length>1||sources[0]&&(sources[0].tick!==row.openedTick||sources[0].locationId!==row.siteId||
      sources[0].title!=='星陨降地'||sources[0].witnessScope!==undefined||
      sources[0].category!=='heavenly'&&sources[0].category!=='death'))fail('pavilionFires.source');
    const hasCopy=row.scrollStatus==='carried'||row.scrollStatus==='secured';
    if(hasCopy){
      const refuge=row.safeSiteId?unique(world.locations,row.safeSiteId):undefined;
      const from=terrainTileAt(world,site.x,site.y),to=refuge&&terrainTileAt(world,refuge.x,refuge.y);
      if(!row.copy||!same(row.copy,original.technique)||!from||!to||Math.abs(from.col-to.col)+Math.abs(from.row-to.row)!==1||
        !row.carrierId||!unique(world.cultivators,row.carrierId)||row.carriedTick!==row.heatTick||row.carriedTick>world.tick||
        row.lostTick!==undefined||material(world,row.sectId,row.scrollId)||
        (row.scrollStatus==='secured'?(row.securedTick===undefined||row.securedTick<=row.carriedTick||row.securedTick>world.tick):
          row.securedTick!==undefined))fail('pavilionFires.custody');
    }else if(row.copy!==undefined||row.carrierId!==undefined||row.safeSiteId!==undefined||row.carriedTick!==undefined||row.securedTick!==undefined||
      (row.scrollStatus==='lost'?(row.lostTick!==row.heatTick||row.lostTick>world.tick||material(world,row.sectId,row.scrollId)!==undefined):
        row.lostTick!==undefined))fail('pavilionFires.custody');
    if(row.ward&&(row.ward.tick!==row.heatTick||row.ward.tick>world.tick||row.ward.actorId===row.ward.targetId||
      !unique(world.cultivators,row.ward.actorId)||!unique(world.cultivators,row.ward.targetId)))fail('pavilionFires.ward');
    if(row.heat){
      if(row.heat.tick!==row.heatTick||row.heat.tick>world.tick||
        new Set(row.heat.damage.map(hit=>hit.cultivatorId)).size!==row.heat.damage.length||row.heat.damage.some(hit=>
          !unique(world.cultivators,hit.cultivatorId)||!Number.isSafeInteger(hit.amount)||hit.amount<=0)||
        (row.heat.wardSaved!==undefined&&(!row.ward||!Number.isSafeInteger(row.heat.wardSaved)||row.heat.wardSaved<=0||
          !row.heat.damage.some(hit=>hit.cultivatorId===row.ward?.targetId))))fail('pavilionFires.heat');
    }else if(world.tick>=row.heatTick)fail('pavilionFires.heat');
  }
}
