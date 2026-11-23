import {activeAvatar} from '../engine/avatarEngine';
import {publicChronicleSceneEvents} from '../engine/chronicleLead';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {projectStoryHomepage} from '../engine/storyHomepage';
import type {Cultivator,CultivationRealm,LocationNode,WorldEvent,WorldState} from '../types/world';
import {projectCultivatorPortrait,type CultivatorPortraitSpec} from './cultivatorPortraitModel';
import {mapTransitActorIds} from './mapConvoyView';
import {createTerrainMapView} from './terrainMapView';

export type SceneStageTheme='sword_peak'|'pill_valley'|'market'|'blood_abyss'|'north_vein'|'countryside';
export type SceneStageSeason='spring'|'summer'|'autumn'|'winter';
export type SceneStagePose='idle'|'cultivate'|'labor'|'fight'|'talk';
export interface SceneStageActor {
  readonly id:string;
  readonly name:string;
  readonly realm:CultivationRealm;
  readonly appearance:CultivatorPortraitSpec;
  readonly pose:SceneStagePose;
}
export interface SceneStageFrame {
  readonly theme:SceneStageTheme;
  readonly siteId?:string;
  readonly siteName?:string;
  readonly sourceId?:string;
  readonly season:SceneStageSeason;
  readonly cast:readonly SceneStageActor[];
  readonly portrait?:SceneStageActor;
  readonly historical:boolean;
  readonly establishing?:true;
}
export interface SceneStageOptions {
  readonly eventId?:string;
  readonly viewer?:Cultivator;
  readonly leadId?:string;
  readonly historical?:boolean;
  /** Only an exact current local viewer chosen by an already scoped scene may provide this focal body. */
  readonly localSceneActor?:Cultivator;
}

const motifs:Readonly<Partial<Record<string,SceneStageTheme>>>={
  'loc-taixu':'sword_peak','loc-danxia':'pill_valley','loc-market':'market',
  'loc-blood':'blood_abyss','loc-vein-north':'north_vein',
};
const season=(month:number):SceneStageSeason=>month<=3?'spring':month<=6?'summer':month<=9?'autumn':'winter';
const named=(value:string,limit:number)=>Array.from(value.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,'').trim()).slice(0,limit).join('');
const living=(actor:Cultivator)=>actor.alive&&actor.hp>0&&actor.positionPlane===undefined;
function unique<T extends {id:string}>(rows:readonly T[]) {
  const index=new Map<string,T|undefined>();
  for(const row of rows)index.set(row.id,index.has(row.id)?undefined:row);
  return index;
}
function exactScene(world:WorldState,id:string):WorldEvent|undefined{
  const raw=unique(world.events).get(id);
  if(!raw||raw.witnessScope!==undefined||!Number.isSafeInteger(raw.year)||!Number.isSafeInteger(raw.month)||
    raw.month<1||raw.month>12||raw.tick>world.tick||
    (world.year-raw.year)*12+world.month-raw.month!==world.tick-raw.tick)return;
  return publicChronicleSceneEvents(world).includes(raw)?raw:undefined;
}
function nativeOpening(world:WorldState,event:WorldEvent|undefined):boolean {
  return world.tick===1&&world.year===1001&&world.month===1&&event?.id==='evt-init-1'&&event.tick===1&&
    event.category==='heavenly'&&event.locationId==='loc-secret-1'&&event.title==='天道沙盒开启：风起陨仙墟'&&
    event.description==='仙历1001年春，上古陨仙墟灵气暴涨，太虚剑宗、血月魔宗、丹霞谷与天机阁修士纷纷出动，修仙界大幕拉开。'&&
    event.actorIds.length===4&&['npc-1','npc-3','npc-4','npc-7'].every((id,index)=>event.actorIds[index]===id);
}
function motif(site:LocationNode):SceneStageTheme {
  return (Object.hasOwn(motifs,site.id)?motifs[site.id]:undefined)??(site.type==='market'?'market':'countryside');
}
function poseFor(actor:Cultivator):SceneStagePose {
  // These are visible resting/work silhouettes, not proof of a payout or a successful action.
  if(actor.currentAction==='CULTIVATE'||actor.currentAction==='REST')return 'cultivate';
  if(actor.currentAction==='GATHER_HERBS'||actor.currentAction==='HEAVENLY_ALCHEMY')return 'labor';
  return 'idle';
}
function nativePairPose(event:WorldEvent,actors:readonly Cultivator[]):SceneStagePose|undefined{
  if(actors.length!==2||event.actorIds.length!==2||actors[0].id!==event.actorIds[0]||actors[1].id!==event.actorIds[1])return;
  const [first,second]=actors;
  const prefix=`evt-${event.tick}-${first.id}`;
  if(event.id===prefix+'-duel'&&event.category==='combat'&&
    (event.duelWinnerId===first.id||event.duelWinnerId===second.id))return 'fight';
  if(event.id===prefix+'-social'&&event.category==='diplomacy'&&event.title===`${first.name}与${second.name}坐而论道`)return 'talk';
}
/** Read-only illustrative frame. A text source supplies its own exact venue, never one guessed from its prose. */
export function projectSceneStage(world:WorldState, options?:SceneStageOptions):SceneStageFrame {
  const actors=unique(world.cultivators);
  const viewer=options?.viewer;
  const base:SceneStageFrame={theme:'countryside',season:season(world.month),cast:[],historical:!!options?.historical};
  if(viewer&&(actors.get(viewer.id)!==viewer||!living(viewer)))return base;
  const homepage=options===undefined?projectStoryHomepage(world):undefined;
  const requestedId=options?.eventId??homepage?.scene?.eventId;
  const event=requestedId?exactScene(world,requestedId):undefined;
  if(requestedId&&!event)return base;
  const past=!!event&&event.tick<world.tick;
  const frameDate={...base,historical:base.historical||past,season:season(event?.month??world.month)};
  const view=createTerrainMapView(world,viewer,viewer!==undefined);
  const sites=unique(world.locations);
  const stationary=(actor:Cultivator|undefined):actor is Cultivator=>
    !!actor&&actors.get(actor.id)===actor&&living(actor)&&visible.has(actor)&&!view.trailPositions.has(actor.id)&&!transit.has(actor.id);
  const visible=new Set(view.liveActors),transit=mapTransitActorIds(world);
  const admittedSite=(id:string)=>{
    const site=sites.get(id);
    return site&&site.type!=='secret_realm'&&!isScopedExpeditionGate(site)&&view.isCurrentLocation(site.id)&&view.seenLocations.includes(site)?site:undefined;
  };
  const intro=event&&!frameDate.historical&&nativeOpening(world,event)?
    event.actorIds.map(id=>actors.get(id)).filter((actor):actor is Cultivator=>stationary(actor)&&!!admittedSite(actor.locationId)):undefined;
  const establishing=intro&&(intro.find(actor=>actor===viewer)??intro[0]);
  let focal:Cultivator|undefined;
  if(!event?.locationId&&!frameDate.historical){
    const local=options?.localSceneActor;
    const avatar=activeAvatar(world);
    const leadId=options?.leadId??homepage?.lead?.id;
    const exactLead=leadId&&(homepage??projectStoryHomepage(world)).lead?.id===leadId?actors.get(leadId):undefined;
    if(local&&local===viewer&&stationary(local))focal=local;
    else if(stationary(avatar))focal=avatar;
    else if(stationary(exactLead))focal=exactLead;
  }
  const siteId=establishing?.locationId??event?.locationId??focal?.locationId;
  const site=siteId?admittedSite(siteId):undefined;
  if(!site)return frameDate;
  const accepted=establishing?[establishing]:(!frameDate.historical&&event?[...new Set(event.actorIds)].map(id=>actors.get(id)):[]).filter((actor):actor is Cultivator=>
    stationary(actor)&&actor.locationId===site.id).slice(0,3);
  if(!frameDate.historical&&!accepted.length&&focal&&focal.locationId===site.id)accepted.push(focal);
  const pairPose=event&&!frameDate.historical?nativePairPose(event,accepted):undefined;
  const cast:SceneStageActor[]=accepted.flatMap(actor=>{
    const appearance=projectCultivatorPortrait(world,actor);
    const name=named(actor.name,40);
    return appearance&&name?[{id:actor.id,name,realm:actor.realm,appearance,pose:pairPose??poseFor(actor)}]:[];
  });
  const portrait=cast[0];
  return {...frameDate,theme:motif(site),siteId:site.id,siteName:named(site.name,40),
    ...(event?{sourceId:event.id}:{}),...(establishing?{establishing:true as const}:{}),cast,...(portrait?{portrait}:{})};
}
