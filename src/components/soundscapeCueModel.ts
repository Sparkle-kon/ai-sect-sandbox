import {alchemyCost,ALCHEMY_RECIPES} from '../engine/alchemyEngine';
import {ascensionEventProof} from '../engine/ascensionProof';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {heavenlyAlchemyEventId} from '../engine/heavenlyAlchemyTerms';
import {findMapPath} from '../engine/mapMotionEngine';
import {terrainTileAt} from '../engine/terrainEngine';
import type {Cultivator, LocationNode, PillId, WorldEvent, WorldState} from '../types/world';
import {projectAlchemyWorkshop} from './alchemyWorkshopVisualModel';
import {buildMapCombatVfxPlan} from './mapCombatVfxView';
import {mapTransitActorIds} from './mapConvoyView';
import {buildMapPresentation} from './mapPresentationView';
import {createTerrainMapView} from './terrainMapView';

export type SoundscapeCueKind='flight'|'clash'|'alchemy'|'thunder';
export interface SoundscapeCue {
  readonly id:string;
  readonly kind:SoundscapeCueKind;
  readonly tick:number;
  readonly wave?:number;
}
export interface SoundscapeCueOptions {
  readonly viewer?:Cultivator;
  readonly siteId?:string;
  readonly sourceId?:string;
  readonly historical?:boolean;
  readonly fog?:boolean;
  readonly previousWorld?:WorldState;
}

const priority:readonly SoundscapeCueKind[]=['thunder','clash','alchemy','flight'];

function index<T extends {id:string}>(rows:readonly T[]):Map<string,T|undefined>{
  const output=new Map<string,T|undefined>();
  for(const row of rows)output.set(row.id,output.has(row.id)?undefined:row);
  return output;
}

const isAtGround=(actor:Cultivator):boolean=>actor.alive&&Number.isFinite(actor.hp)&&actor.hp>0&&actor.positionPlane===undefined;
const isOpen=(site:LocationNode|undefined):site is LocationNode=>!!site&&
  site.type!=='secret_realm'&&!isScopedExpeditionGate(site);

function paidOrdinaryBrew(world:WorldState,event:WorldEvent,actor:Cultivator,site:LocationNode):boolean{
  const [receipt,...duplicates]=(actor.publicAlchemy??[]).filter(row=>row.siteId===site.id);
  if(actor.currentAction!=='BREW_PILL'||!receipt||duplicates.length||receipt.lastTick!==world.tick||receipt.firstTick>world.tick||
    !Number.isSafeInteger(receipt.successes)||receipt.successes<1||event.category!=='breakthrough'||
    event.id!==`evt-${world.tick}-${actor.id}-alchemy`||event.title!==`${actor.name}炼丹成丹`||
    !event.description.endsWith('凝成一枚灵丹。'))return false;
  const uses=world.furnaceReservations.uses.filter(row=>row.tick===world.tick&&row.actorId===actor.id&&
    row.siteId===site.id&&row.kind==='brew'&&Number.isSafeInteger(row.slot)&&row.slot>=1&&row.slot<=site.furnaceGrade);
  const [month,...clashes]=world.resourceFlow.months.filter(row=>row.tick===world.tick);
  if(uses.length!==1||!month||clashes.length||month.year!==world.year||month.month!==world.month)return false;
  const flows=month.entries.filter(row=>row.tick===world.tick&&row.mechanism==='alchemy'&&row.refId===site.id&&
    row.visibility.kind==='participants'&&row.visibility.actorIds.length===1&&row.visibility.actorIds[0]===actor.id);
  const [output,...extraPills]=flows.filter(row=>row.kind==='production'&&row.reason==='brew_output'&&
    row.to.kind==='actor'&&row.to.id===actor.id&&row.amount===1&&Object.hasOwn(ALCHEMY_RECIPES,row.good));
  if(!output||extraPills.length)return false;
  const cost=alchemyCost(output.good as PillId,site.furnaceGrade);
  return flows.filter(row=>row.kind==='consumption'&&row.reason==='brew_fee'&&row.from.kind==='actor'&&
    row.from.id===actor.id&&row.good==='stone'&&row.amount===cost).length===1;
}

/** Detached audio cues for the actual current focus; nothing here clocks or mutates the simulation. */
export function projectSoundscapeCues(world:WorldState,options:SoundscapeCueOptions={}):readonly SoundscapeCue[]{
  const {viewer,historical=false,previousWorld,sourceId}=options;
  if(historical||!Number.isSafeInteger(world.tick)||world.tick<1)return [];
  const actors=index(world.cultivators),sites=index(world.locations),events=index(world.events);
  if(viewer&&(actors.get(viewer.id)!==viewer||!isAtGround(viewer)))return [];
  const id=options.siteId??viewer?.locationId;
  const site=id===undefined?undefined:sites.get(id);
  if(!isOpen(site)||(viewer&&viewer.locationId!==site.id))return [];
  const view=createTerrainMapView(world,viewer,!!viewer&&(options.fog??true));
  const beyond=mapTransitActorIds(world);
  if(viewer&&(!view.liveActors.includes(viewer)||view.trailPositions.has(viewer.id)||beyond.has(viewer.id)))return [];
  const tile=terrainTileAt(world,site.x,site.y);
  if(!tile||!view.seenLocations.includes(site)||view.locationTile.get(site.id)!==tile||
    !view.isCurrentLocation(site.id)||view.tileState(tile)!=='visible')return [];

  const onSite=(event:WorldEvent):boolean=>events.get(event.id)===event&&(!sourceId||sourceId===event.id)&&
    event.tick===world.tick&&event.year===world.year&&event.month===world.month&&
    event.locationId===site.id&&event.witnessScope===undefined;
  const nominated=sourceId?events.get(sourceId):undefined;
  if(sourceId&&(!nominated||!onSite(nominated)))return [];
  const results:SoundscapeCue[]=[];
  const add=(kind:SoundscapeCueKind,cueId:string,wave?:number)=>{
    results.push({id:cueId,kind,tick:world.tick,...(wave===undefined?{}:{wave})});
  };

  // Combat receipts have independent checks for same-month dates, bodies, travel and native trial terms.
  if(world.mapPresentation.tick===world.tick&&world.mapPresentation.effects.length){
    const plan=buildMapCombatVfxPlan(world,view,buildMapPresentation(world,view,[]));
    for(const effect of plan.effects){
      if(effect.location!==site)continue;
      const event=events.get(effect.id.replace(/-(?:clash|lightning)$/u,''));
      if(!event||!onSite(event))continue;
      if(effect.kind==='clash')add('clash',event.id);
      if(effect.kind==='lightning'&&effect.wave!==undefined)add('thunder',event.id,effect.wave);
    }
  }

  const movementCounts=new Map<string,number>();
  for(const movement of world.mapPresentation.trails)
    movementCounts.set(movement.cultivatorId,(movementCounts.get(movement.cultivatorId)??0)+1);
  for(const event of world.events){
    if(!onSite(event)||event.actorIds.length!==1)continue;
    const actor=actors.get(event.actorIds[0]);
    if(!actor)continue;
    if((event.category==='heavenly'||event.category==='death')&&world.ascension?.trials.length){
      const proof=ascensionEventProof(world,event);
      if(proof?.siteId===site.id&&proof.wave!==undefined&&(proof.phase==='wave'||proof.phase==='failed'||proof.phase==='succeeded'))
        add('thunder',event.id,proof.wave);
      // The final verified thunder is not the separate, manually triggered ascension melody.
    }
    if(!isAtGround(actor)||actor.locationId!==site.id||!view.liveActors.includes(actor)||
      view.trailPositions.has(actor.id)||beyond.has(actor.id))continue;
    if(event.id===heavenlyAlchemyEventId(actor.id,world.tick,'brew')){
      const brewed=projectAlchemyWorkshop(world,view,site.id,{viewer:actor})?.furnace;
      if(brewed?.mode==='receipt'&&brewed.result?.success)add('alchemy',event.id);
    }else if(paidOrdinaryBrew(world,event,actor,site))add('alchemy',event.id);
  }

  // Only an actual lived crossing can cue a sword rush. A rumor packet is not a movement.
  if(world.mapPresentation.tick===world.tick){
    const older=previousWorld&&previousWorld.tick===world.tick-1&&previousWorld.terrain.seed===world.terrain.seed&&
      previousWorld.year*12+previousWorld.month+1===world.year*12+world.month?previousWorld:undefined;
    const olderPeople=older?index(older.cultivators):undefined;
    const olderSites=older?index(older.locations):undefined;
    for(const movement of world.mapPresentation.trails){
      const actor=actors.get(movement.cultivatorId);
      const origin=sites.get(movement.fromLocationId);
      if(!actor||!isAtGround(actor)||actor.currentAction!=='EXPLORE'||actor.locationId!==site.id||
        !view.liveActors.includes(actor)||view.trailPositions.has(actor.id)||beyond.has(actor.id)||
        !isOpen(origin)||origin===site||movement.tick!==world.tick||movement.toLocationId!==site.id||
        movementCounts.get(actor.id)!==1)continue;
      const exploreId=`evt-${world.tick}-${actor.id}-explore`;
      const explore=events.get(exploreId);
      const publicExplore=!!explore&&onSite(explore)&&explore.category==='breakthrough'&&
        explore.actorIds.length===1&&explore.actorIds[0]===actor.id&&
        explore.title===`${actor.name}游历${site.name}获机缘`;
      if(sourceId&&!publicExplore||events.has(exploreId)&&!publicExplore)continue;
      const former=olderPeople?.get(actor.id),oldOrigin=olderSites?.get(origin.id);
      const confirmed=!!former&&isAtGround(former)&&former.locationId===origin.id&&
        !!oldOrigin&&oldOrigin.x===origin.x&&oldOrigin.y===origin.y;
      // Scope cannot replay a stranger crossing a formerly seen/fogged region. Own arrival is witnessed by its actor.
      if(!confirmed&&!publicExplore||viewer!==actor&&!view.isCurrentLocation(origin.id))continue;
      const path=findMapPath(world,origin,site);
      if(path.length<2||path.length!==movement.points.length||path.some((point,i)=>
        point.x!==movement.points[i].x||point.y!==movement.points[i].y||
        viewer!==actor&&view.current&&view.tileState(terrainTileAt(world,point.x,point.y)??tile)!=='visible'))continue;
      add('flight',publicExplore?exploreId:`flight:${world.tick}:${actor.id}`);
    }
  }
  const byKind=priority.flatMap(kind=>{
    const chosen=results.filter(row=>row.kind===kind).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)[0];
    return chosen?[chosen]:[];
  });
  return byKind.slice(0,2);
}
