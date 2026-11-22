import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {FAREWELL_LANDING_SITE as DOCK,FAREWELL_LIGHT_TICKS} from '../types/farewellLanding';
import type {FarewellLandingOption,FarewellLandingRecord,FarewellLandingView} from '../types/farewellLanding';
import {eraHistoryMatchesLiveEvent} from './eraHistoryIndex';
import {activeFrontierVisit,frontierActedOnGeography,frontierPhysicalSite} from './frontierMovementEngine';
import {matchesWitnessedPersonalScene,WITNESSED_PERSONAL_STORY_TICKS} from './witnessedPersonalStory';

export type {FarewellLandingOption,FarewellLandingView} from '../types/farewellLanding';
const unique=<T>(rows:readonly T[],accept:(row:T)=>boolean)=>{
  let exact:T|undefined;
  for(const row of rows)if(accept(row)){if(exact!==undefined)return;exact=row;}
  return exact;
};
const person=(world:WorldState,id:string)=>unique(world.cultivators,row=>row.id===id);
const event=(world:WorldState,id:string)=>unique(world.events,row=>row.id===id);
const label=(text:string)=>text.replace(/[\p{C}]/gu,'').trim().slice(0,80);
const idAt=(tick:number,actorId:string,deceasedId:string)=>`farewell-landing-${tick}-${actorId}-${deceasedId}`;
const eventId=(row:FarewellLandingRecord)=>`evt-${row.id}`;
export const isPrivateFarewellLandingEvent=(row:Pick<WorldEvent,'id'|'witnessScope'>)=>
  row.witnessScope==='participants'&&row.id.startsWith('evt-farewell-landing-');
const words={
  keep_light:{title:'在泊位留了一盏灯',description:'实付一枚灵石，在亲临的泊位留灯。灯只照眼前水面，不等亡者归来。'},
  farewell:{title:'到泊位道一声别',description:'本人亲到泊位作别，没有留灯，也没有乘舟。'},
} as const;
function bodyAtDock(world:WorldState,actor:Cultivator,tick:number){
  if((tick!==world.tick&&tick!==world.tick+1)||person(world,actor.id)!==actor||actor.positionPlane!=='frontier'||
    !actor.alive||actor.hp<=0||frontierPhysicalSite(world,actor,tick)?.id!==DOCK)return;
  const visit=activeFrontierVisit(world,actor.id);
  if(visit?.regionId==='east-offshore'&&visit.paidStones===8&&visit.paidRoots===1&&visit.anchorId==='loc-market-east')return visit;
}
function knewDeath(actor:Cultivator,death:WorldEvent){
  if(death.actorIds.includes(actor.id))return true;
  return !!unique(actor.rumors,row=>row.id===`rumor-${death.id}`&&row.originEventId===death.id&&
    row.originTick===death.tick&&row.learnedTick===death.tick&&row.originSourceCultivatorId===actor.id&&
    row.provenance==='witness'&&row.confidence===100&&row.hops===0&&row.witnessScope===undefined&&row.locationId===death.locationId);
}
function ties(world:WorldState,actor:Cultivator,tick:number){
  const floor=tick-WITNESSED_PERSONAL_STORY_TICKS;
  const exact=world.eraHistory.receipts.flatMap(death=>{
    if(death.kind!=='death'||death.actorId===actor.id||death.tick>=tick||death.tick<=floor)return [];
    const dead=person(world,death.actorId),original=event(world,death.eventId);
    if(!dead||dead.alive||dead.hp!==0||!original||original.witnessScope!==undefined||
      !eraHistoryMatchesLiveEvent(death,original)||!knewDeath(actor,original))return [];
    const shared=world.witnessedPersonalStory.scenes.filter(scene=>scene.tick>=floor&&scene.tick<death.tick&&
      scene.kind==='socialize'&&scene.actorIds.length===2&&scene.actorIds.includes(actor.id)&&scene.actorIds.includes(dead.id)&&
      scene.witnessIds.filter(id=>id===actor.id).length===1&&scene.witnessIds.filter(id=>id===dead.id).length===1&&
      unique(world.witnessedPersonalStory.scenes,row=>row.eventId===scene.eventId)===scene).filter(scene=>{
        const source=event(world,scene.eventId);
        return !!source&&source.witnessScope===undefined&&matchesWitnessedPersonalScene(scene,source);
      }).sort((a,b)=>b.tick-a.tick||(a.eventId<b.eventId?-1:1))[0];
    return shared?[{dead,death,shared}]:[];
  });
  return exact.filter(row=>exact.filter(other=>other.dead.id===row.dead.id).length===1)
    .sort((a,b)=>b.death.tick-a.death.tick||(a.dead.id<b.dead.id?-1:1));
}
function active(world:WorldState,actor:Cultivator,tick:number){
  const visit=bodyAtDock(world,actor,tick);
  if(!visit||frontierActedOnGeography(world,actor.id,tick))return;
  const available=ties(world,actor,tick).find(row=>!world.farewellLandings?.records.some(record=>
    record.actorId===actor.id&&record.deceasedId===row.dead.id));
  return available?{visit,...available}:undefined;
}
export function availableFarewellLandingActions(actor:Cultivator,world:WorldState,tick=world.tick+1):FarewellLandingOption[]{
  const source=active(world,actor,tick);
  if(!source)return [];
  const option=(farewellLandingMove:FarewellLandingOption['farewellLandingMove']):FarewellLandingOption=>
    ({action:'FAREWELL_LANDING',farewellLandingMove,targetFarewellDeceasedId:source.dead.id});
  return actor.spiritStones>=1?[option('keep_light'),option('farewell')]:[option('farewell')];
}
export function resolveFarewellLandingAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='FAREWELL_LANDING'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','farewellLandingMove','targetFarewellDeceasedId'].includes(key)))return null;
  const native=availableFarewellLandingActions(actor,world,world.tick).find(row=>
    row.targetFarewellDeceasedId===decision.targetFarewellDeceasedId&&row.farewellLandingMove===decision.farewellLandingMove);
  const source=native&&active(world,actor,world.tick);
  if(!native||!source)return null;
  const light=native.farewellLandingMove==='keep_light';
  const record:FarewellLandingRecord={id:idAt(world.tick,actor.id,source.dead.id),actorId:actor.id,deceasedId:source.dead.id,
    deathEventId:source.death.eventId,sharedEventId:source.shared.eventId,visitId:source.visit.id,siteId:DOCK,
    tick:world.tick,move:native.farewellLandingMove,paidStones:light?1:0,
    ...(light?{lightUntilTick:world.tick+FAREWELL_LIGHT_TICKS}:{})};
  actor.spiritStones-=record.paidStones;
  (world.farewellLandings??={records:[]}).records.push(record);
  return {id:eventId(record),tick:world.tick,year:world.year,month:world.month,category:'heavenly',actorIds:[actor.id],
    locationId:DOCK,witnessScope:'participants',...words[record.move]};
}
function recordSource(world:WorldState,row:FarewellLandingRecord,source:WorldEvent):boolean{
  const absolute=world.year*12+world.month-1-(world.tick-row.tick);
  return isPrivateFarewellLandingEvent(source)&&source.id===eventId(row)&&source.tick===row.tick&&source.locationId===DOCK&&
    source.year===Math.floor(absolute/12)&&source.month===absolute%12+1&&source.category==='heavenly'&&
    source.actorIds.length===1&&source.actorIds[0]===row.actorId&&source.title===words[row.move].title&&source.description===words[row.move].description;
}
export function projectFarewellLanding(world:WorldState,viewer:Cultivator):FarewellLandingView|undefined{
  const visit=bodyAtDock(world,viewer,world.tick),site=frontierPhysicalSite(world,viewer);
  if(!visit||!site)return;
  const options=availableFarewellLandingActions(viewer,world);
  const rows=world.farewellLandings?.records.filter(row=>row.actorId===viewer.id&&row.visitId===visit.id&&row.tick<=world.tick&&
    (row.tick===world.tick||row.move==='keep_light'&&row.paidStones===1&&row.lightUntilTick===row.tick+FAREWELL_LIGHT_TICKS&&world.tick<row.lightUntilTick))??[];
  const kept=rows.filter(row=>{
    const source=event(world,eventId(row));
    return !!source&&recordSource(world,row,source);
  }).sort((a,b)=>b.tick-a.tick)[0];
  const named=options[0]?.targetFarewellDeceasedId??kept?.deceasedId;
  const dead=named&&person(world,named);
  if(!dead||dead.alive||dead.hp!==0)return;
  return {siteName:label(site.name),deceasedName:label(dead.name),options,
    ...(kept&&kept.deceasedId===dead.id?{receipt:words[kept.move],...(kept.move==='keep_light'?
      {light:{chartId:'chart-east-offshore',tileId:DOCK} as const}:{})}:{})};
}

export function validateFarewellLandingSave(world:WorldState,fail:(path:string)=>never):void{
  const seen=new Set<string>(),proofIds=new Set<string>();
  for(const row of world.farewellLandings?.records??[]){
    const key=JSON.stringify([row.actorId,row.deceasedId]);
    const dead=person(world,row.deceasedId),viewer=person(world,row.actorId);
    const visit=unique(world.frontier?.visits??[],candidate=>candidate.id===row.visitId);
    const death=unique(world.eraHistory.receipts,receipt=>receipt.kind==='death'&&receipt.actorId===row.deceasedId&&receipt.eventId===row.deathEventId);
    const rawDeath=world.events.filter(source=>source.id===row.deathEventId);
    if(seen.has(key)||row.id!==idAt(row.tick,row.actorId,row.deceasedId)||row.siteId!==DOCK||row.tick>world.tick||
      row.actorId===row.deceasedId||!viewer||!dead||dead.alive||dead.hp!==0||!death||death.tick>=row.tick||
      rawDeath.length>1||rawDeath[0]&&!eraHistoryMatchesLiveEvent(death,rawDeath[0])||
      visit?.actorId!==row.actorId||visit?.regionId!=='east-offshore'||visit?.anchorId!=='loc-market-east'||
      (visit.exitedTick!==undefined&&visit.exitedTick<=row.tick)||(visit.deceasedTick!==undefined&&visit.deceasedTick<row.tick))
      fail('farewellLandings.record');
    seen.add(key);proofIds.add(eventId(row));
    const step=visit.steps.filter(entry=>entry.tick<=row.tick).at(-1);
    if(!step||step.tick>=row.tick||step.siteId!==DOCK||death.tick<row.tick-WITNESSED_PERSONAL_STORY_TICKS)
      fail('farewellLandings.site');
    const sharedTick=/^evt-([1-9]\d*)-/.exec(row.sharedEventId)?.[1];
    const originalSharedTick=sharedTick===undefined?0:Number(sharedTick);
    if(!Number.isSafeInteger(originalSharedTick)||originalSharedTick>=death.tick||
      originalSharedTick<row.tick-WITNESSED_PERSONAL_STORY_TICKS||
      ![row.actorId,row.deceasedId].some(id=>row.sharedEventId===`evt-${originalSharedTick}-${id}-social`))
      fail('farewellLandings.shared.id');
    const sharedRaw=world.events.filter(source=>source.id===row.sharedEventId);
    if(sharedRaw.length>1||sharedRaw[0]&&(sharedRaw[0].tick>=death.tick||sharedRaw[0].tick<row.tick-WITNESSED_PERSONAL_STORY_TICKS||
      sharedRaw[0].witnessScope!==undefined||sharedRaw[0].actorIds.length!==2||!sharedRaw[0].actorIds.includes(row.actorId)||
      !sharedRaw[0].actorIds.includes(row.deceasedId)||sharedRaw[0].category!=='diplomacy'||
      sharedRaw[0].id!==`evt-${sharedRaw[0].tick}-${sharedRaw[0].actorIds[0]}-social`))fail('farewellLandings.shared');
    const originals=world.events.filter(source=>source.id===eventId(row));
    if(originals.length>1||originals[0]&&!recordSource(world,row,originals[0])||
      (row.move==='keep_light'?(row.paidStones!==1||row.lightUntilTick!==row.tick+FAREWELL_LIGHT_TICKS):
        row.paidStones!==0||row.lightUntilTick!==undefined))fail('farewellLandings.receipt');
  }
  for(const row of world.events)if(row.id.startsWith('evt-farewell-landing-')&&!proofIds.has(row.id))fail('farewellLandings.orphan');
}
