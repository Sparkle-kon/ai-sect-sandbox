import type {Cultivator,WorldState} from '../types/world';
import {DESTINY_TRAIT_CATALOG} from '../engine/destinyTraitCatalog';
import {destinyTraitSourceEventId,destinyTraitSourceEventMatches,isDestinyRealmTransition} from '../engine/destinyTraitEngine';
import {DAO_PATHS,daoPathRank} from '../engine/daoPathTerms';
import {equippedArtifact} from '../engine/artifactEngine';
import {projectProtagonistSuccession} from '../engine/protagonistSuccession';
import {availableMapEntityActions,projectMapEntityPopover,type MapEntityAction,type MapEntityRead,type MapEntityTarget} from './mapEntityPopoverModel';
import {mapTransitActorIds} from './mapConvoyView';
import type {createTerrainMapView} from './terrainMapView';

type ActorRead=Extract<MapEntityRead,{kind:'actor'}>;
type SiteRead=Extract<MapEntityRead,{kind:'site'}>;
type View=ReturnType<typeof createTerrainMapView>;
export interface MapSidebarDossierRead {
  readonly actor?:ActorRead;
  readonly sectName?:string;
  readonly leadName?:string;
  readonly qi?:number;
  readonly destiny:readonly string[];
  readonly artifact?:{readonly name:string;readonly quality?:string;readonly bound?:true};
  readonly dao?:{readonly name:string;readonly rank?:string};
  readonly site?:SiteRead;
  readonly actions:readonly {readonly action:MapEntityAction;readonly target:MapEntityTarget}[];
}

const clean=(text:string)=>Array.from(text.replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu,' ').replace(/\s+/gu,' ').trim()).slice(0,80).join('');
function uniqueById<T extends {id:string}>(rows:readonly T[],id:string):T|undefined{
  let match:T|undefined;
  for(const row of rows){
    if(row.id!==id)continue;
    if(match)return undefined;
    match=row;
  }
  return match;
}

function earnedLeadName(world:WorldState):string|undefined{
  // The disposition/selection of the sidebar actor is not a story nomination.
  const frames=world.protagonistSuccession.arcs.filter(arc=>arc.openedTick<=world.tick&&
    (arc.endedTick===undefined||arc.endedTick>world.tick));
  if(frames.length!==1)return undefined;
  const active=projectProtagonistSuccession(world,world.tick).active;
  if(!active||active.id!==frames[0].id)return undefined;
  const actor=uniqueById(world.cultivators,active.actorId);
  return actor?.alive&&actor.hp>0?clean(actor.name)||undefined:undefined;
}
function earnedDestiny(world:WorldState,actor:Cultivator):readonly string[]{
  const earned=actor.destinyTraits?.earned;
  if(!earned?.length)return [];
  const names=new Set<string>();
  for(const row of earned){
    if(row.actorId!==actor.id||!Number.isSafeInteger(row.openedTick)||!Number.isSafeInteger(row.chosenTick)||
      row.openedTick<1||row.chosenTick<row.openedTick||row.chosenTick>world.tick||
      !isDestinyRealmTransition(row.fromRealm,row.realm)||
      row.sourceEventId!==destinyTraitSourceEventId(actor.id,row.openedTick,row.realm)||!row.options.includes(row.traitId)||
      !Object.hasOwn(DESTINY_TRAIT_CATALOG,row.traitId))continue;
    const originals=world.events.filter(event=>event.id===row.sourceEventId);
    if(originals.length>1||originals.some(event=>!destinyTraitSourceEventMatches(event,row)))continue;
    names.add(DESTINY_TRAIT_CATALOG[row.traitId].name);
  }
  return [...names];
}
const ranks=[undefined,'初窥','入微','圆成'] as const;
function earnedDao(world:WorldState,actor:Cultivator):MapSidebarDossierRead['dao']{
  const path=actor.daoPath;
  if(!path||!Object.hasOwn(DAO_PATHS,path.pathId)||!Number.isSafeInteger(path.chosenTick)||path.chosenTick<1||path.chosenTick>world.tick)return undefined;
  const rule=DAO_PATHS[path.pathId];
  let prior=path.chosenTick;
  for(const proof of path.practices){
    if(!Number.isSafeInteger(proof.tick)||proof.tick<=prior||proof.tick>world.tick||proof.qiPaid!==rule.qi||
      proof.herbPaid!==rule.herb||proof.stonesPaid!==rule.stones||proof.hpPaid!==rule.hp||
      (path.pathId==='sword'&&(!path.bladeId||proof.artifactId!==path.bladeId)))return undefined;
    prior=proof.tick;
  }
  const rank=daoPathRank(path.practices.length);
  return rank?{name:rule.name,rank:ranks[rank]}:undefined;
}

export function projectMapSidebarDossier(world:WorldState,viewer:Cultivator|undefined,view:View,livePersonal:boolean):MapSidebarDossierRead{
  const leadName=earnedLeadName(world);
  const empty:MapSidebarDossierRead={...(leadName?{leadName}:{}),destiny:[],actions:[]};
  if(!viewer||uniqueById(world.cultivators,viewer.id)!==viewer)return empty;
  const actorTarget={kind:'actor',id:viewer.id} as const;
  const actor=projectMapEntityPopover(world,view,actorTarget,viewer.id,livePersonal,false);
  if(actor?.kind!=='actor')return empty;
  const siteTarget={kind:'site',id:viewer.locationId} as const;
  const travel=view.trailPositions.has(viewer.id)||mapTransitActorIds(world).has(viewer.id);
  // Resolve the actor's actual settled location, never the retained source address during travel.
  const location=travel?undefined:projectMapEntityPopover(world,view,siteTarget,undefined,false,false);
  const site=location?.kind==='site'?location:undefined;
  const actions:{action:MapEntityAction;target:MapEntityTarget}[]=
    availableMapEntityActions(world,view,actorTarget).map(action=>({action,target:actorTarget}));
  if(site)for(const action of availableMapEntityActions(world,view,siteTarget))actions.push({action,target:siteTarget});
  const sect=uniqueById(world.sects,viewer.sectId);
  const sectName=sect&&clean(sect.name);
  const artifact=equippedArtifact(viewer);
  const artifactName=artifact&&clean(artifact.name);
  const tier=artifact?.tier;
  const quality=tier==='法器'||tier==='灵器'||tier==='法宝'||tier==='通天灵宝'?tier:undefined;
  const dao=earnedDao(world,viewer);
  return {...empty,actor,
    ...(sectName?{sectName}:{}),
    ...(Number.isFinite(viewer.qiProgress)?{qi:Math.max(0,Math.min(100,viewer.qiProgress))}:{}),
    destiny:earnedDestiny(world,viewer),
    ...(artifactName?{artifact:{name:artifactName,...(quality?{quality}:{}),...(artifact?.boundTo===viewer.id?{bound:true as const}:{})}}:{}),
    ...(dao?{dao}:{}),...(site?{site}:{}),actions};
}
