import {ascensionEventProof,verifiedImmortalAscension} from '../engine/ascensionProof';
import {ASCENSION_OPEN_QI,ASCENSION_QI,ascensionDamage,ascensionEventId,ascensionTrialId} from '../engine/ascensionTerms';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {currentVisibleTileIds,terrainTileAt} from '../engine/terrainEngine';
import {STORMS} from '../engine/tribulationTerms';
import {localQiWeather,type QiWeatherKind} from '../engine/weatherEngine';
import type {Cultivator,LocationNode,WorldEvent,WorldState} from '../types/world';
import {mapTransitActorIds} from './mapConvoyView';
import {createTerrainMapView} from './terrainMapView';

export type AtmosphereSeason='spring'|'summer'|'autumn'|'winter';
export interface AtmosphereSite {
  readonly id:string;
  readonly x:number;
  readonly y:number;
  readonly kind:QiWeatherKind;
  readonly intensity:number;
  readonly north:boolean;
}
export interface CelestialPhenomenon {
  readonly id:string;
  readonly siteId:string;
  readonly x:number;
  readonly y:number;
  readonly kind:'nascent'|'soul'|'ascension';
}
export interface AtmosphereFrame {
  readonly seed:number;
  readonly tick:number;
  readonly season:AtmosphereSeason;
  readonly historical:boolean;
  readonly kind:QiWeatherKind;
  readonly intensity:number;
  readonly north:boolean;
  readonly sites:readonly AtmosphereSite[];
  readonly phenomena:readonly CelestialPhenomenon[];
}
export interface AtmosphereOptions {
  readonly surface:'map'|'stage'|'courtyard';
  readonly view?:ReturnType<typeof createTerrainMapView>;
  readonly viewer?:Cultivator;
  readonly siteId?:string;
  readonly sourceId?:string;
  readonly historical?:boolean;
  readonly season?:AtmosphereSeason;
}
const seasons=['spring','summer','autumn','winter'] as const;
const rank={ascension:0,soul:1,nascent:2} as const;
const idOrder=(a:{id:string},b:{id:string})=>a.id<b.id?-1:a.id>b.id?1:0;
const alive=(actor:Cultivator)=>actor.alive&&Number.isFinite(actor.hp)&&actor.hp>0;

function index<T extends {id:string}>(rows:readonly T[]):Map<string,T|undefined>{
  const byId=new Map<string,T|undefined>();
  for(const row of rows)byId.set(row.id,byId.has(row.id)?undefined:row);
  return byId;
}
function truePass(world:WorldState,event:WorldEvent,actor:Cultivator,site:LocationNode):CelestialPhenomenon['kind']|undefined{
  const trial=actor.tribulation,realm=actor.realm;
  if(event.category!=='breakthrough'||event.title!=='天劫圆满'||event.id!==`evt-${world.tick}-${actor.id}-tribulation-passed`||
    realm!=='元婴'&&realm!=='化神'||!trial||!alive(actor)||actor.positionPlane!==undefined||actor.realmStage!==1||
    actor.locationId!==site.id||trial.targetRealm!==realm||trial.stage!=='passed'||trial.resolvedTick!==world.tick||
    trial.lastActedTick!==world.tick||!Number.isSafeInteger(trial.startedTick)||trial.startedTick<1||
    trial.startedTick>=world.tick||trial.id!==`trial-${actor.id}-${trial.startedTick}`||
    trial.totalWaves!==STORMS[realm]?.waves||trial.nextWave!==trial.totalWaves+1||
    event.description!==trial.lastOutcome||event.description!==`${actor.name}渡过劫雷与心魔，踏入【${realm}】境！`||
    event.dialogue!==undefined||event.duelWinnerId!==undefined||event.damage!==undefined)return;
  return realm==='元婴'?'nascent':'soul';
}
function actualAscension(world:WorldState,event:WorldEvent,actor:Cultivator,site:LocationNode):boolean{
  if(event.title!=='九天仙门启'||event.id!==ascensionEventId(actor.id,world.tick,'succeeded'))return false;
  const terminal=verifiedImmortalAscension(world,actor);
  const proof=ascensionEventProof(world,event);
  if(!terminal||proof?.phase!=='succeeded'||proof.actorId!==actor.id||proof.siteId!==site.id||
    terminal.terminal.eventId!==event.id||terminal.terminal.tick!==world.tick||
    terminal.id!==ascensionTrialId(actor.id,terminal.startedTick)||terminal.openingQiPaid!==ASCENSION_OPEN_QI||
    terminal.siteId!==site.id)return false;
  return terminal.waves.every((wave,i)=>{
    const preceding=terminal.waves[i-1]?.tick??terminal.startedTick;
    if(wave.wave!==i+1||wave.tick<=preceding||wave.tick>world.tick||
      wave.eventId!==ascensionEventId(actor.id,wave.tick,i===2?'succeeded':`wave-${wave.wave}`)||
      wave.stance!=='guard'&&wave.stance!=='advance'||wave.qiPaid!==ASCENSION_QI[wave.stance]||
      !Number.isFinite(wave.maxHp)||wave.maxHp<=0||!Number.isFinite(wave.beforeHp)||wave.beforeHp>wave.maxHp||
      !Number.isFinite(wave.qiBefore)||wave.qiBefore<wave.qiPaid||wave.afterHp<=0||
      wave.afterHp!==wave.beforeHp-ascensionDamage(wave.maxHp,wave.wave,wave.stance))return false;
    return (world.year-wave.year)*12+world.month-wave.month===world.tick-wave.tick;
  });
}

/** Read only already scoped native weather. Sun angle and decorative precipitation belong solely to paint time. */
export function projectAtmosphere(world:WorldState,opts:AtmosphereOptions):AtmosphereFrame {
  const {viewer,surface,siteId,sourceId,historical=false}=opts;
  const month=Number.isInteger(world.month)&&world.month>=1&&world.month<=12?world.month:1;
  const season=historical&&opts.season&&seasons.includes(opts.season)?opts.season:seasons[Math.floor((month-1)/3)];
  const seed=Number.isSafeInteger(world.terrain.seed)?world.terrain.seed>>>0:0;
  const base:AtmosphereFrame={seed,tick:world.tick,season,historical,kind:'平息',intensity:0,north:false,sites:[],phenomena:[]};
  if(historical)return base;
  const people=index(world.cultivators);
  if(viewer&&(people.get(viewer.id)!==viewer||!alive(viewer)||viewer.positionPlane!==undefined))return base;
  const view=opts.view??createTerrainMapView(world,viewer,viewer!==undefined);
  const sight=viewer&&view.current?currentVisibleTileIds(world,viewer):undefined;
  const presented=index(view.seenLocations),allSites=index(world.locations);
  const admitted=(id:string|undefined):LocationNode|undefined=>{
    if(!id)return;
    const site=allSites.get(id);
    if(!site||site.type==='secret_realm'||isScopedExpeditionGate(site)||presented.get(id)!==site||
      !Number.isFinite(site.x)||!Number.isFinite(site.y))return;
    const tile=terrainTileAt(world,site.x,site.y);
    if(!tile||view.locationTile.get(id)!==tile||!view.isCurrentLocation(id)||view.tileState(tile)!=='visible'||
      view.current&&!view.current.has(tile.id)||sight&&!sight.has(tile.id))return;
    return site;
  };
  const focal=admitted(siteId);
  if(surface!=='map'&&!focal)return base;
  const siteFrame=(site:LocationNode):AtmosphereSite=>{
    const observed=localQiWeather(world,site);
    return {id:site.id,x:site.x,y:site.y,kind:observed.kind,intensity:observed.intensity,north:site.id==='loc-vein-north'};
  };
  const scoped=focal?siteFrame(focal):undefined;
  // A full atlas has sparse, bounded regional accents. Do not sample undisclosed tiles to fill gaps.
  const sites=surface==='map'?[...presented.keys()].sort().flatMap(id=>{
    const site=admitted(id);
    return site&&id!==focal?.id?[site]:[];
  }).slice(0,scoped?3:4).map(siteFrame):[];
  if(scoped)sites.unshift(scoped);
  const visible=index(view.liveActors), originals=index(world.events), transit=mapTransitActorIds(world);
  const phenomena:CelestialPhenomenon[]=[];
  for(const event of world.events){
    if(originals.get(event.id)!==event||event.tick!==world.tick||event.year!==world.year||event.month!==world.month||
       event.witnessScope!==undefined||event.actorIds.length!==1||
       event.category!=='breakthrough'&&event.category!=='heavenly'||
       surface==='stage'&&event.id!==sourceId||surface!=='map'&&event.locationId!==focal?.id)continue;
    const site=admitted(event.locationId),actor=people.get(event.actorIds[0]);
    if(!site||!actor)continue;
    const kind=actualAscension(world,event,actor,site)?'ascension':
      visible.get(actor.id)===actor&&!view.trailPositions.has(actor.id)&&!transit.has(actor.id)
        ?truePass(world,event,actor,site):undefined;
    if(kind)phenomena.push({id:event.id,siteId:site.id,x:site.x,y:site.y,kind});
  }
  return {...base,...(scoped?{kind:scoped.kind,intensity:scoped.intensity,north:scoped.north}:{}),sites,
    phenomena:phenomena.sort((a,b)=>rank[a.kind]-rank[b.kind]||idOrder(a,b)).slice(0,surface==='map'?3:1)};
}
