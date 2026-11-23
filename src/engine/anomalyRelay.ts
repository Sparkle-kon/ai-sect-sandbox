import type {AnomalyRelayOrigin,AnomalyRelayReceipt,AnomalyRelayScene,AnomalyRelayView} from '../types/anomalyRelay';
import type {Cultivator,LocationNode,Rumor,WorldEvent,WorldState} from '../types/world';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {terrainTileAt} from './terrainEngine';
export type {AnomalyRelayScene,AnomalyRelayView} from '../types/anomalyRelay';

const TITLE='凶兽引动兽潮';
const ORIGIN_LIMIT=24;
const RUMOR_LIFE=24;
const unique=<T>(list:readonly T[],match:(row:T)=>boolean):T|undefined=>{
  const rows=list.filter(match);
  return rows.length===1?rows[0]:undefined;
};
type ExactIndex<T>=Map<string,T|null>;
function insert<T>(index:ExactIndex<T>,key:string,value:T){
  index.set(key,index.has(key)?null:value);
}
function indexed<T>(list:readonly T[],key:(value:T)=>string):ExactIndex<T>{
  const index:ExactIndex<T>=new Map();
  for(const value of list)insert(index,key(value),value);
  return index;
}
const receiptKey=(eventId:string,actorId:string)=>JSON.stringify([eventId,actorId]);
const keyOf=(row:AnomalyRelayReceipt)=>receiptKey(row.eventId,row.actorId);
const writeIndices=new WeakMap<AnomalyRelayReceipt[],{size:number;byKey:ExactIndex<AnomalyRelayReceipt>}>();
function writableIndex(receipts:AnomalyRelayReceipt[]){
  const current=writeIndices.get(receipts);
  if(current?.size===receipts.length)return current;
  const next={size:receipts.length,byKey:indexed(receipts,keyOf)};
  writeIndices.set(receipts,next);
  return next;
}
function append(receipts:AnomalyRelayReceipt[],row:AnomalyRelayReceipt){
  const current=writableIndex(receipts);
  insert(current.byKey,keyOf(row),row);
  receipts.push(row);
  current.size=receipts.length;
}
function admissibleSite(site:LocationNode|null|undefined){
  return site&&site.type!=='secret_realm'&&!isScopedExpeditionGate(site)?site:undefined;
}
function publicSite(world:WorldState,id:string){
  return admissibleSite(unique(world.locations,row=>row.id===id));
}
const writePeople=new WeakMap<WorldState,{rows:Cultivator[];size:number;byId:ExactIndex<Cultivator>}>();
function currentPerson(world:WorldState,id:string){
  let cached=writePeople.get(world);
  if(cached?.rows!==world.cultivators||cached.size!==world.cultivators.length){
    cached={rows:world.cultivators,size:world.cultivators.length,byId:indexed(world.cultivators,actor=>actor.id)};
    writePeople.set(world,cached);
  }
  return cached.byId.get(id);
}
function calendar(world:WorldState,tick:number){
  const absolute=world.year*12+world.month-1-(world.tick-tick);
  return {year:Math.floor(absolute/12),month:absolute%12+1};
}
function nativeEvent(world:WorldState,origin:AnomalyRelayOrigin,event:WorldEvent){
  const clock=calendar(world,origin.tick);
  return event.id===origin.eventId&&event.tick===origin.tick&&event.year===clock.year&&event.month===clock.month&&
    event.title===TITLE&&event.category==='heavenly'&&event.locationId===origin.siteId&&
    event.witnessScope===undefined&&!event.actorIds.length;
}
const actualOrigins=new WeakMap<WorldEvent,WorldState>();
export function stampAnomalyTide(world:WorldState,event:WorldEvent,beastId:string,site:LocationNode,tileId:string){
  if(publicSite(world,site.id)!==site)return;
  const origin={eventId:event.id,hazardId:`natural-beast-tide-${world.tick}-${beastId}`,beastId,siteId:site.id,tileId,tick:world.tick};
  if(!nativeEvent(world,origin,event))return;
  const state=world.anomalyRelays??={origins:[],receipts:[]};
  if(state.origins.some(row=>row.eventId===origin.eventId))return;
  state.origins.push(origin);
  if(state.origins.length>ORIGIN_LIMIT){
    const removed=state.origins.splice(0,state.origins.length-ORIGIN_LIMIT);
    const ids=new Set(removed.map(row=>row.eventId));
    state.receipts=state.receipts.filter(row=>!ids.has(row.eventId));
  }
  actualOrigins.set(event,world);
}

const tagMatches=(origin:AnomalyRelayOrigin,rumor:Rumor)=>
  rumor.id===`rumor-${origin.eventId}`&&rumor.originEventId===origin.eventId&&rumor.originTick===origin.tick&&
  rumor.locationId===origin.siteId&&rumor.subject===TITLE&&!rumor.lead&&rumor.witnessScope===undefined;
function present(world:WorldState,actor:Cultivator,canonical= currentPerson(world,actor.id)){
  return publicSite(world,actor.locationId)&&canonical===actor&&
    isGrandSiegeFighterPresent(world,actor,actor.locationId);
}
export function stampAnomalyWitness(world:WorldState,actor:Cultivator,event:WorldEvent,rumor:Rumor){
  const state=world.anomalyRelays;
  if(!state||actualOrigins.get(event)!==world||!present(world,actor)||actor.locationId!==event.locationId)return;
  const origin=unique(state.origins,row=>row.eventId===event.id);
  if(!origin||!tagMatches(origin,rumor)||writableIndex(state.receipts).byKey.has(receiptKey(event.id,actor.id)))return;
  append(state.receipts,{eventId:event.id,actorId:actor.id,siteId:origin.siteId,tick:world.tick,
    channel:'witness',confidence:100,hops:0,originalWitnessId:actor.id});
}
function links(parent:AnomalyRelayReceipt,row:AnomalyRelayReceipt){
  return row.channel!=='witness'&&parent.actorId===row.senderId&&parent.originalWitnessId===row.originalWitnessId&&
    parent.tick<row.tick&&parent.hops+1===row.hops&&
    row.confidence===Math.floor(parent.confidence*(row.channel==='conversation'?.84:.7))&&
    (row.channel==='conversation'?row.senderSiteId===row.siteId:row.tick%3===0&&row.senderSiteId!==row.siteId);
}
export function stampAnomalyRelay(world:WorldState,listener:Cultivator,rumor:Rumor,sender:Cultivator,packet:Rumor){
  const state=world.anomalyRelays;
  if(!state||!rumor.originEventId||!rumor.originSourceCultivatorId||rumor.learnedTick!==world.tick||
    rumor.sourceCultivatorId!==sender.id||(rumor.provenance!=='conversation'&&rumor.provenance!=='flying_sword'))return;
  const origin=unique(state.origins,row=>row.eventId===rumor.originEventId);
  if(!origin||!tagMatches(origin,rumor)||writableIndex(state.receipts).byKey.has(receiptKey(origin.eventId,listener.id))||
    !present(world,listener)||!present(world,sender))return;
  const parent=writableIndex(state.receipts).byKey.get(receiptKey(origin.eventId,sender.id));
  const row:AnomalyRelayReceipt={eventId:origin.eventId,actorId:listener.id,siteId:listener.locationId,tick:world.tick,
    channel:rumor.provenance,confidence:rumor.confidence,hops:rumor.hops,originalWitnessId:rumor.originSourceCultivatorId,
    senderId:sender.id,senderSiteId:sender.locationId};
  if(parent&&tagMatches(origin,packet)&&packet.learnedTick===parent.tick&&packet.hops===parent.hops&&
    packet.confidence===parent.confidence&&packet.provenance===parent.channel&&packet.sourceCultivatorId===parent.senderId&&
    packet.originSourceCultivatorId===parent.originalWitnessId&&links(parent,row)&&(row.channel!=='flying_sword'||sender.sectId===listener.sectId))append(state.receipts,row);
}

function originValid(world:WorldState,origin:AnomalyRelayOrigin,mustRetain:boolean){
  const site=publicSite(world,origin.siteId);
  if(!site||!Number.isSafeInteger(origin.tick)||origin.tick<1||origin.tick>world.tick||origin.tick%36!==0||
    origin.eventId!==`evt-${origin.tick}-beast-tide-${origin.beastId}`||
    origin.hazardId!==`natural-beast-tide-${origin.tick}-${origin.beastId}`||
    terrainTileAt(world,site.x,site.y)?.id!==origin.tileId)return false;
  const beast=unique(world.spiritBeasts,row=>row.id===origin.beastId);
  if(beast?.kind!=='凶兽')return false;
  const hazards=world.mapHazards.filter(row=>row.id===origin.hazardId);
  if(hazards.length>1||world.tick<origin.tick+4&&hazards.length!==1||hazards.some(row=>
    row.kind!=='beast_tide'||row.tileId!==origin.tileId||row.createdTick!==origin.tick||row.expiresTick!==origin.tick+4||row.intensity!==1))return false;
  const events=world.events.filter(row=>row.id===origin.eventId);
  return events.length===1?nativeEvent(world,origin,events[0]):events.length===0&&!mustRetain&&
    world.events.length>=120&&world.events.every(row=>row.tick>=origin.tick);
}
function lineage(world:WorldState,origin:AnomalyRelayOrigin,receipt:AnomalyRelayReceipt,
  byKey:ExactIndex<AnomalyRelayReceipt>,people:ExactIndex<Cultivator>,sites:ExactIndex<LocationNode>){
  const chain:AnomalyRelayReceipt[]=[];
  let row:AnomalyRelayReceipt|undefined=receipt;
  while(row&&chain.length<=4){
    if(row.eventId!==origin.eventId||!admissibleSite(sites.get(row.siteId))||
      !Number.isSafeInteger(row.tick)||row.tick<origin.tick||row.tick>world.tick||row.tick-origin.tick>RUMOR_LIFE||
      !people.get(row.actorId)||!Number.isSafeInteger(row.hops)||row.hops<0||row.hops>4||
      !Number.isSafeInteger(row.confidence)||row.confidence<25||row.confidence>100)return;
    chain.unshift(row);
    if(row.channel==='witness'){
      return row.tick===origin.tick&&row.siteId===origin.siteId&&row.actorId===row.originalWitnessId&&
        row.hops===0&&row.confidence===100&&row.senderId===undefined&&row.senderSiteId===undefined?chain:undefined;
    }
    if((row.channel!=='conversation'&&row.channel!=='flying_sword')||!row.senderId||!row.senderSiteId||
      row.senderId===row.actorId||!admissibleSite(sites.get(row.senderSiteId)))return;
    const child:AnomalyRelayReceipt=row;
    const parent=byKey.get(receiptKey(origin.eventId,child.senderId!));
    if(!parent||!links(parent,child))return;
    row=parent;
  }
}
/** Returns the new receipt-site count for an authentic prospective packet; never writes receipts. */
export function prepareAnomalyPriority(world:WorldState){
  const state=world.anomalyRelays,director=world.storyteller;
  if(!state||!director||director.style==='still_water'||director.focusActorId!==undefined)return;
  const originIndex=indexed(state.origins,row=>row.eventId);
  const origins=new Map(state.origins.filter(origin=>originIndex.get(origin.eventId)===origin&&
    world.tick-origin.tick<=RUMOR_LIFE&&originValid(world,origin,false)).map(origin=>[origin.eventId,origin]));
  if(!origins.size)return;
  const byKey=indexed(state.receipts,keyOf),people=indexed(world.cultivators,row=>row.id);
  const sites=indexed(world.locations,row=>row.id);
  const parents=new Map<string,Set<string>|null>();
  const actual=(actor:Cultivator)=>people.get(actor.id)===actor&&admissibleSite(sites.get(actor.locationId))&&
    isGrandSiegeFighterPresent(world,actor,actor.locationId);
  return (sender:Cultivator,listener:Cultivator,packet:Rumor,incoming:Rumor)=>{
    if(!packet.originEventId||sender===listener)return 0;
    const origin=origins.get(packet.originEventId);
    if(!origin||!tagMatches(origin,packet)||!tagMatches(origin,incoming)||
      byKey.has(receiptKey(origin.eventId,listener.id))||!actual(sender)||!actual(listener))return 0;
    const parentKey=receiptKey(origin.eventId,sender.id),parent=byKey.get(parentKey);
    if(!parent||parent.tick!==packet.learnedTick||parent.tick>=world.tick||parent.hops!==packet.hops||
      parent.confidence!==packet.confidence||parent.channel!==packet.provenance||parent.senderId!==packet.sourceCultivatorId||
      parent.originalWitnessId!==packet.originSourceCultivatorId||incoming.hops!==parent.hops+1||incoming.hops>4||
      incoming.learnedTick!==world.tick||incoming.sourceCultivatorId!==sender.id||incoming.confidence<25)return 0;
    const local=sender.locationId===listener.locationId;
    if(incoming.provenance!==(local?'conversation':'flying_sword')||
      !local&&(!sender.sectId||sender.sectId!==listener.sectId||world.tick%3!==0)||
      incoming.confidence!==Math.floor(parent.confidence*(local?.84:.7)))return 0;
    if(!parents.has(parentKey)){
      const chain=lineage(world,origin,parent,byKey,people,sites);
      parents.set(parentKey,chain?new Set(chain.map(row=>row.siteId)):null);
    }
    const prior=parents.get(parentKey);
    return prior&&prior.size<3&&!prior.has(listener.locationId)?prior.size+1:0;
  };
}

export function projectAnomalyRelay(world:WorldState,viewer:Cultivator|undefined):AnomalyRelayView|undefined{
  const state=world.anomalyRelays;
  if(!state||!viewer)return;
  const people=indexed(world.cultivators,actor=>actor.id);
  if(!people.get(viewer.id)||!present(world,viewer,people.get(viewer.id)))return;
  const byKey=indexed(state.receipts,keyOf),sites=indexed(world.locations,row=>row.id);
  const originIndex=indexed(state.origins,row=>row.eventId);
  for(const origin of [...state.origins].reverse()){
    if(originIndex.get(origin.eventId)!==origin)continue;
    const receipt=byKey.get(receiptKey(origin.eventId,viewer.id));
    if(!receipt||!originValid(world,origin,false))continue;
    const chain=lineage(world,origin,receipt,byKey,people,sites);
    if(!chain)continue;
    const seen=new Set<string>(),scenes:AnomalyRelayScene[]=[];
    for(const step of chain){
      const site=admissibleSite(sites.get(step.siteId));
      if(site&&!seen.has(site.id)&&scenes.length<3){
        seen.add(site.id);
        scenes.push({siteId:site.id,siteName:site.name,tick:step.tick,...calendar(world,step.tick),channel:step.channel});
      }
    }
    return {scenes,complete:scenes.length===3};
  }
}
export function validateAnomalyRelaySave(world:WorldState,fail:(path:string)=>never){
  const state=world.anomalyRelays;
  if(!state)return;
  if(!state.origins.length||state.origins.length>ORIGIN_LIMIT)fail('anomalyRelays.origins');
  const origins=new Map<string,AnomalyRelayOrigin>();
  for(const origin of state.origins){
    if(origins.has(origin.eventId)||!originValid(world,origin,false))fail('anomalyRelays.origin');
    origins.set(origin.eventId,origin);
  }
  const byKey=indexed(state.receipts,keyOf),people=indexed(world.cultivators,actor=>actor.id),sites=indexed(world.locations,row=>row.id);
  for(const row of state.receipts){
    const origin=origins.get(row.eventId);
    if(!origin||byKey.get(keyOf(row))!==row||
      !lineage(world,origin,row,byKey,people,sites))fail('anomalyRelays.receipt');
    const retained=people.get(row.actorId)?.rumors.find(rumor=>rumor.id===`rumor-${row.eventId}`);
    if(retained&&(retained.learnedTick<row.tick||retained.learnedTick===row.tick&&
      (!tagMatches(origin,retained)||retained.provenance!==row.channel||retained.confidence!==row.confidence||
        retained.hops!==row.hops||retained.sourceCultivatorId!==row.senderId||
        retained.originSourceCultivatorId!==row.originalWitnessId)))fail('anomalyRelays.packet');
  }
}
