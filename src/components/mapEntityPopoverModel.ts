import {availablePavilionFireActions} from '../engine/pavilionFire';
import {projectWitnessInquiry} from '../engine/witnessInquiry';
import {projectMapEntitySiteDetails,type MapEntitySiteDetail} from './mapEntitySiteDetails';
import {projectMapCultivatorPortrait,type CultivatorPortraitSpec} from './cultivatorPortraitModel';
import {activeAvatar} from '../engine/avatarEngine';
import {personaLine,privatePersonaText} from '../engine/wildPersonaEngine';
import {labelPublicMapAction} from './actionLabels';
import type {Cultivator,LocationNode,WorldState} from '../types/world';
import type {GodInterventionCommand} from '../engine/worldEngine';
import {isChronicleStoryFact} from '../engine/chronicleLead';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {villageEvolutionLocalSettlement} from '../engine/villageEvolutionEngine';
import {mapActorPositions,type createTerrainMapView} from './terrainMapView';

export type MapEntityTarget={kind:'actor'|'site';id:string};
export type MapEntityAction='treasure'|'lightning'|'whisper';
export type MapEntityRead=
  | {kind:'actor';target:MapEntityTarget&{kind:'actor'};name:string;realm:string;hp:number;maxHp:number;actionLabel:string;portrait?:CultivatorPortraitSpec;monologue?:string;persona?:string}
  | {kind:'site';target:MapEntityTarget&{kind:'site'};name:string;spiritQi:number;residents:readonly string[];residentCount:number;
     population?:number;spiritRoot?:LocationNode['spiritRoot'];details?:readonly MapEntitySiteDetail[];localDispute?:true;localFire?:true;eventTitles:readonly string[]};

type View=ReturnType<typeof createTerrainMapView>;
const cleaned=(text:string)=>text.replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu,' ').replace(/\s+/gu,' ').trim();
const cap=(text:string,n:number)=>Array.from(text).slice(0,n).join('');
const trueActor=(actor:Cultivator)=>actor.alive&&actor.hp>0&&actor.positionPlane===undefined;
const MAX_RESIDENT_LABELS=5;
const MAX_SCENE_TITLES=3;
const MAX_WHISPER=220; // Same bound as native timeline interventions.

function actorInView(world:WorldState,view:View,id:string):Cultivator|undefined{
  const roster=world.cultivators.filter(row=>row.id===id),[actor]=roster;
  return roster.length===1&&actor&&trueActor(actor)&&view.liveActors.filter(row=>row===actor).length===1?actor:undefined;
}
function siteInView(world:WorldState,view:View,id:string):LocationNode|undefined{
  const sites=world.locations.filter(row=>row.id===id),[site]=sites;
  return sites.length===1&&site&&view.seenLocations.filter(row=>row===site).length===1&&view.isCurrentLocation(id)?site:undefined;
}
function monologueLine(actor:Cultivator):string|undefined{
  const clean=privatePersonaText(actor.innerMonologue);
  const secret=cleaned(actor.secretGoal);
  if(!clean||secret&&clean.includes(secret))return undefined;
  const first=clean.match(/^.*?[。！？.!?](?=$|\s|[^0-9])/u)?.[0]??clean;
  return cap(first,100)||undefined;
}
function localSceneTitles(world:WorldState,siteId:string):string[]{
  const counts=new Map<string,number>();
  for(const event of world.events)counts.set(event.id,(counts.get(event.id)??0)+1);
  const titles=new Set<string>();
  for(const event of world.events){
    if(event.locationId!==siteId||event.tick!==world.tick||event.year!==world.year||event.month!==world.month||
      counts.get(event.id)!==1||event.witnessScope!==undefined||!isChronicleStoryFact(event,world.tick))continue;
    const title=cap(cleaned(event.title),80);
    if(title)titles.add(title);
    if(titles.size>=MAX_SCENE_TITLES)break;
  }
  return [...titles];
}
function stationaryResidents(world:WorldState,view:View,site:LocationNode):Cultivator[]{
  const inTransit=new Set<string>();
  for(const contract of world.escorts.contracts)
    if(contract.status==='active'&&contract.escortId)inTransit.add(contract.escortId);
  for(const plan of world.relocations.plans)
    if(plan.status==='in_transit')for(const id of plan.garrisonIds)inTransit.add(id);
  const current=new Map<string,Cultivator|undefined>();
  for(const actor of world.cultivators)current.set(actor.id,current.has(actor.id)?undefined:actor);
  const seen=new Set<string>();
  const visible=view.liveActors.filter(actor=>{
    if(actor.locationId!==site.id||!trueActor(actor)||view.trailPositions.has(actor.id)||inTransit.has(actor.id)||
      current.get(actor.id)!==actor||seen.has(actor.id))return false;
    seen.add(actor.id);return true;
  });
  return mapActorPositions([site],visible,view.trailPositions).map(row=>row.actor);
}

export function projectMapEntityPopover(world:WorldState,view:View,target:MapEntityTarget,viewerId?:string|null,livePersonal=false,includeFacilities=true):MapEntityRead|undefined{
  if(target.kind==='actor'){
    const actor=actorInView(world,view,target.id);
    if(!actor)return undefined;
    const monologue=livePersonal&&viewerId===actor.id&&activeAvatar(world)===actor?monologueLine(actor):undefined;
    const portrait=projectMapCultivatorPortrait(world,view,actor);
    return {kind:'actor',target:{kind:'actor',id:actor.id},name:cap(cleaned(actor.name),80),
      realm:`${actor.realm}${actor.realmStage}层`,hp:actor.hp,maxHp:actor.maxHp,
      ...(portrait?{portrait}:{}),actionLabel:labelPublicMapAction(actor.currentAction),...(monologue?{monologue}:{persona:personaLine(actor,'thought')})};
  }
  if(target.kind!=='site')return undefined;
  const site=siteInView(world,view,target.id);
  if(!site)return undefined;
  const residents=stationaryResidents(world,view,site);
  const viewers=viewerId?world.cultivators.filter(row=>row.id===viewerId):[];
  const [viewer]=viewers;
  const permittedViewer=viewers.length===1&&viewer&&trueActor(viewer)?viewer:undefined;
  const local=permittedViewer&&residents.includes(permittedViewer)?villageEvolutionLocalSettlement(world,permittedViewer):undefined;
  const details=includeFacilities?projectMapEntitySiteDetails(world,view,site,residents,permittedViewer):[];
  const localDispute=permittedViewer?.locationId===site.id&&residents.includes(permittedViewer)&&
    Boolean(projectWitnessInquiry(world,permittedViewer));
  const localFire=permittedViewer?.locationId===site.id&&residents.includes(permittedViewer)&&
    world.pavilionFires?.cases.some(row=>row.siteId===site.id&&row.heatTick===world.tick+1)&&
    availablePavilionFireActions(permittedViewer,world).some(row=>row.pavilionFireMove!=='secure');
  return {kind:'site',target:{kind:'site',id:site.id},name:cap(cleaned(site.name),80),spiritQi:site.spiritQi,spiritRoot:site.spiritRoot,
    ...(details.length?{details}:{}),...(localDispute?{localDispute:true as const}:{}),...(localFire?{localFire:true as const}:{}),
    residents:residents.slice(0,MAX_RESIDENT_LABELS).map(actor=>cap(cleaned(actor.name),60)),residentCount:residents.length,
    ...(local?.locationId===site.id?{population:local.population}:{}),eventTitles:localSceneTitles(world,site.id)};
}

export function availableMapEntityActions(world:WorldState,view:View,target:MapEntityTarget):readonly MapEntityAction[]{
  if(target.kind==='actor')return actorInView(world,view,target.id)?['lightning','whisper']:[];
  if(target.kind!=='site')return [];
  const site=siteInView(world,view,target.id);
  return site&&!isScopedExpeditionGate(site)?['treasure']:[];
}

export function buildMapEntityCommand(world:WorldState,view:View,target:MapEntityTarget,action:MapEntityAction,
  whisperText?:string):GodInterventionCommand|undefined{
  if(!availableMapEntityActions(world,view,target).includes(action))return undefined;
  if(action==='treasure')return whisperText===undefined?{type:'SPAWN_TREASURE',targetLocationId:target.id}:undefined;
  if(action==='lightning')return whisperText===undefined?{type:'TRIBULATION_STRIKE',targetCultivatorId:target.id}:undefined;
  if(action!=='whisper'||typeof whisperText!=='string'||whisperText.length>MAX_WHISPER)return undefined;
  const text=cleaned(whisperText);
  return text?{type:'WHISPER_MIND',targetCultivatorId:target.id,whisperText:text}:undefined;
}
