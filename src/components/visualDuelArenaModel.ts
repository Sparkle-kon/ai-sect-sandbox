import type {ChronicleAnchor,Cultivator,LocationNode,WorldEvent,WorldState} from '../types/world';
import {activeDungeonForActor,projectExpeditionDungeon} from '../engine/expeditionDungeonEngine';
import {isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {DAO_INTENT_QI,DAO_INTENT_READY_TICKS,DAO_PATHS} from '../engine/daoPathTerms';
import {FORBIDDEN_ART_CATALOG,forbiddenDuelContactId,forbiddenArtScarId} from '../engine/forbiddenArtCatalog';
import {terrainTileAt} from '../engine/terrainEngine';
import {isChronicleStoryFact} from '../engine/chronicleLead';
import {matchSectChallengeResult} from '../engine/sectChallengeProof';
import {projectSchoolFormStrokes} from '../engine/schoolFormDuel';
import {projectCultivatorPortrait} from './cultivatorPortraitModel';
import {mapTransitActorIds} from './mapConvoyView';
import type {MapActorSpriteModel} from './mapActorSpriteModel';
import type {SceneStageSeason,SceneStageTheme} from './sceneStageModel';
import type {createTerrainMapView} from './terrainMapView';

type View=ReturnType<typeof createTerrainMapView>;
export type VisualDuelArenaSource={kind:'duel';eventId:string}|{kind:'sect_challenge';eventId:string}|{kind:'tournament';occasionId:string;round:number;bout:number}|
  {kind:'dungeon';occasionId:string};
export interface VisualDuelArenaOptions {readonly viewer?:Cultivator;readonly historical?:boolean}
type Side='left'|'right';
type Gauge={readonly value:number;readonly max:number};
export interface VisualArenaFighter {
  readonly id:string;readonly name:string;readonly realm?:string;readonly sprite?:MapActorSpriteModel;
  readonly hp?:Gauge;readonly qi?:Gauge;readonly boss?:true;
}
export interface VisualArenaDamage {readonly target:Side;readonly amount:number}
export interface VisualDuelArenaFrame {
  readonly key:string;readonly kind:VisualDuelArenaSource['kind'];readonly siteId:string;readonly siteName:string;
  readonly tick:number;readonly theme:SceneStageTheme;readonly season:SceneStageSeason;readonly historical:boolean;
  readonly left:VisualArenaFighter;readonly right:VisualArenaFighter;readonly damages:readonly VisualArenaDamage[];
  readonly outcome?:Side;readonly accent?:'school'|'forbidden'|'dao';
}

const index=<T extends {id:string}>(rows:readonly T[])=>{
  const map=new Map<string,T|undefined>();
  for(const row of rows)map.set(row.id,map.has(row.id)?undefined:row);
  return map;
};
const alive=(actor:Cultivator)=>actor.alive&&actor.hp>0&&actor.positionPlane===undefined;
const clean=(name:string)=>[...name.replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu,'').trim()].slice(0,60).join('');
const nativeDate=(world:WorldState,event:WorldEvent|ChronicleAnchor)=>Number.isSafeInteger(event.tick)&&event.tick>=1&&
  event.tick<=world.tick&&Number.isSafeInteger(event.year)&&Number.isSafeInteger(event.month)&&event.month>=1&&event.month<=12&&(world.year-event.year)*12+world.month-event.month===world.tick-event.tick;
const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const gauge=(value:number,max:number):Gauge|undefined=>Number.isFinite(value)&&Number.isFinite(max)&&value>=0&&max>0&&value<=max?
  {value,max}:undefined;
const themeAt=(site:LocationNode):SceneStageTheme=>site.id==='loc-taixu'?'sword_peak':site.id==='loc-danxia'?'pill_valley':
  site.id==='loc-vein-north'?'north_vein':site.type==='market'?'market':site.type==='abyss'?'blood_abyss':'countryside';
const seasonAt=(month:number):SceneStageSeason=>month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':
  month>=9&&month<=11?'autumn':'winter';
const positive=(amount:number)=>Number.isFinite(amount)&&amount>0;
const validDamage=(amount:number)=>Number.isFinite(amount)&&amount>=0;

export function projectVisualDuelArena(world:WorldState,view:View,source:VisualDuelArenaSource,
  options:VisualDuelArenaOptions={}):VisualDuelArenaFrame|undefined{
  const people=index(world.cultivators),viewer=options.viewer;
  if(viewer&&(people.get(viewer.id)!==viewer||!alive(viewer)))return;
  const sites=index(world.locations),seen=index(view.seenLocations),events=index(world.events);
  const visible=index(view.liveActors),moving=mapTransitActorIds(world);
  function venue(id:string|undefined,scoped=false){
    if(!id)return;
    const site=sites.get(id),tile=view.locationTile.get(id);
    if(!site||seen.get(id)!==site||!tile||tile!==terrainTileAt(world,site.x,site.y)||!view.isCurrentLocation(id)||view.tileState(tile)!=='visible'||
      view.current&&!view.current.has(tile.id))return;
    if(!scoped&&(site.type==='secret_realm'||isScopedExpeditionGate(site)))return;
    return site;
  }
  const here=(actor:Cultivator,siteId:string)=>people.get(actor.id)===actor&&alive(actor)&&visible.get(actor.id)===actor&&
    actor.locationId===siteId&&!view.trailPositions.has(actor.id)&&!moving.has(actor.id);
  const actualPublic=(event:WorldEvent|undefined):event is WorldEvent=>!!event&&event.witnessScope===undefined&&nativeDate(world,event)&&
    isChronicleStoryFact(event,world.tick);
  const base=(key:string,site:LocationNode,event:WorldEvent|ChronicleAnchor)=>({key,kind:source.kind,siteId:site.id,siteName:clean(site.name),
    tick:event.tick,theme:themeAt(site),season:seasonAt(event.month),historical:!!options.historical||event.tick!==world.tick});
  function fighter(actor:Cultivator,moodEventId:string|undefined,current:boolean,stats:boolean):VisualArenaFighter{
    const appearance=projectCultivatorPortrait(world,actor,current&&moodEventId?{viewer,publicEventId:moodEventId}:undefined);
    // Retained identities may be illustrated, but modern affiliation, stage and vital gauges are not historical evidence.
    const art=appearance&&(current?appearance:{...appearance,attire:'neutral' as const,ageBand:'seasoned' as const,halo:undefined,
      palette:{fabric:'#536478',trim:'#bdc7d4',spirit:'#c8d5dc',background:'#263042'}});
    const hp=stats?gauge(actor.hp,actor.maxHp):undefined,qi=stats&&viewer===actor?gauge(actor.qiProgress,100):undefined;
    return {id:actor.id,name:clean(actor.name),...(current?{realm:`${actor.realm}${actor.realmStage}层`}:{}),
      ...(art?{sprite:{id:actor.id,appearance:art,pose:'fight' as const}}:{}),...(hp?{hp}:{}),...(qi?{qi}:{})};
  }
  const damage=(target:Side,amount:number):VisualArenaDamage[]=>positive(amount)?[{target,amount}]:[];
  if(source.kind==='sect_challenge'){
    const event=events.get(source.eventId);
    if(!actualPublic(event))return;
    const result=matchSectChallengeResult(world,event),site=venue(result?.siteId);
    if(!result||!site)return;
    const left=people.get(result.challengerId),right=people.get(result.defenderId);
    if(!left||!right)return;
    const layout=base(event.id,site,event),current=!layout.historical;
    // The verdict itself is dated proof. If a fighter already returned home, never
    // present that newer body's gauges as if they were still on the gate forecourt.
    const leftHere=current&&here(left,site.id),rightHere=current&&here(right,site.id);
    return {...layout,left:fighter(left,event.id,leftHere,leftHere),right:fighter(right,event.id,rightHere,rightHere),
      damages:damage(result.loserId===left.id?'left':'right',result.injury),
      outcome:result.winnerId===left.id?'left':'right'};
  }
  if(source.kind==='duel'){
    const event=events.get(source.eventId);
    if(!actualPublic(event)||event.actorIds.length!==2||event.actorIds[0]===event.actorIds[1])return;
    const lethal=event.category==='death',site=venue(event.locationId),[a,b]=event.actorIds;
    if(!site||!lethal&&event.category!=='combat'||event.id!==`evt-${event.tick}-${a}-${lethal?'kill':'duel'}`||
      event.duelWinnerId!==a&&event.duelWinnerId!==b)return;
    const left=people.get(a),right=people.get(b);
    if(!left||!right)return;
    const layout=base(event.id,site,event),current=!layout.historical,sameTick=event.tick===world.tick;
    const fallen=event.duelWinnerId===a?right:left;
    if(sameTick&&(left.positionPlane!==undefined||right.positionPlane!==undefined))return;
    if(sameTick&&[left,right].some(actor=>!here(actor,site.id)&&
      !(lethal&&actor===fallen&&!actor.alive&&actor.hp===0&&actor.locationId===site.id)))return;
    const hits=event.damage??[],seenHits=new Set<string>();
    if(hits.some(row=>{
      if(seenHits.has(row.cultivatorId)||!event.actorIds.includes(row.cultivatorId)||!positive(row.amount))return true;
      seenHits.add(row.cultivatorId);return false;
    }))return;
    const damages=hits.flatMap(row=>damage(row.cultivatorId===a?'left':'right',row.amount));
    const school=current&&projectSchoolFormStrokes(world).some(row=>row.actorId===a&&row.opponentId===b&&row.siteId===site.id);
    const scar=event.forbiddenArt;
    const oldScar=scar&&people.get(scar.ownerId)?.forbiddenScars?.filter(row=>row.id===scar.id);
    const paid=scar?[scar.paid.hp,scar.paid.lifespan,scar.paid.durability]:[];
    const forbidden=scar&&Object.hasOwn(FORBIDDEN_ART_CATALOG,scar.artId)&&scar.artifactId&&
      event.actorIds.includes(scar.ownerId)&&event.actorIds.includes(scar.opponentId)&&scar.ownerId!==scar.opponentId&&
      scar.tick===event.tick&&scar.siteId===site.id&&scar.openedTick<=scar.tick&&
      scar.contactId===forbiddenDuelContactId(scar.openedTick,a,b)&&scar.id===forbiddenArtScarId(scar.contactId,scar.artId)&&
      paid.every(validDamage)&&paid.some(positive)&&oldScar?.length===1&&
      oldScar[0].artId===scar.artId&&oldScar[0].contactId===scar.contactId&&oldScar[0].artifactId===scar.artifactId&&
      oldScar[0].tick===scar.tick&&oldScar[0].siteId===scar.siteId&&oldScar[0].paid.hp===scar.paid.hp&&
      oldScar[0].paid.lifespan===scar.paid.lifespan&&oldScar[0].paid.durability===scar.paid.durability;
    const dao=event.daoIntents?.some(row=>{
      const matches=people.get(row.actorId)?.daoPath?.activations.filter(own=>own.eventId===event.id);
      const own=matches?.length===1?matches[0]:undefined;
      return own&&event.daoIntents?.filter(item=>item.actorId===row.actorId).length===1&&Object.hasOwn(DAO_PATHS,row.pathId)&&
        [1,2,3].includes(row.rank)&&row.eventId===event.id&&row.siteId===site.id&&row.tick===event.tick&&row.qiPaid===DAO_INTENT_QI&&
        row.readyTick<row.tick&&row.readyTick>=row.tick-DAO_INTENT_READY_TICKS&&!!sites.get(row.readySiteId)&&
        event.actorIds.includes(row.actorId)&&own.actorId===row.actorId&&own.siteId===site.id&&own.tick===event.tick&&
        own.rank===row.rank&&own.pathId===row.pathId&&own.readyTick===row.readyTick&&own.readySiteId===row.readySiteId&&
        own.artifactId===row.artifactId&&own.qiPaid===row.qiPaid;
    });
    const accent=school?'school' as const:forbidden?'forbidden' as const:dao?'dao' as const:undefined;
    const liveGauge=(actor:Cultivator)=>current&&(here(actor,site.id)||lethal&&actor===fallen&&!actor.alive&&actor.hp===0);
    return {...layout,left:fighter(left,event.id,current,liveGauge(left)),
      right:fighter(right,event.id,current,liveGauge(right)),damages,
      outcome:event.duelWinnerId===a?'left':'right',...(accent?{accent}:{})};
  }
  const occasion=index(world.occasions).get(source.occasionId);
  if(!occasion)return;
  if(source.kind==='tournament'){
    const site=venue(occasion.locationId),arena=occasion.arena;
    if(!site||!arena||occasion.kind!=='tournament'||occasion.omenId||
      (site.type!=='market'&&site.type!=='sect_hq')||![8,16].includes(arena.seededIds.length)||
      new Set(arena.seededIds).size!==arena.seededIds.length||!Number.isSafeInteger(source.round)||!Number.isSafeInteger(source.bout)||
      source.round<1||source.bout<0)return;
    const rows=arena.rounds.filter(row=>row.round===source.round),round=rows.length===1?rows[0]:undefined,bout=round?.bouts[source.bout];
    const previous=source.round===1?arena.seededIds:arena.rounds[source.round-2]?.bouts.map(row=>row.winnerId);
    if(!round||!bout?.secondId||!previous||round!==arena.rounds[source.round-1]||round.tick<=arena.openedTick||
      ![`evt-${round.tick}-${occasion.id}-round`,`evt-${round.tick}-${occasion.id}-champion`].includes(round.eventId)||
      !validDamage(bout.firstDamage)||bout.secondDamage===undefined||!validDamage(bout.secondDamage))return;
    const [a,b]=[bout.firstId,bout.secondId],ids=[a,b];
    const roster=previous.filter(id=>!round.absentIds.includes(id));
    if(a===b||!ids.includes(bout.winnerId)||roster[source.bout]!==a||roster[roster.length-1-source.bout]!==b||
      !ids.every(id=>occasion.participantIds.includes(id)&&arena.seededIds.includes(id))||
      occasion.bouts.filter(row=>row.round===round.round&&row.firstId===a&&row.secondId===b&&row.winnerId===bout.winnerId).length!==1)return;
    const raw=events.get(round.eventId);
    const historic=index(world.chronicleArchive.anchors).get(round.eventId);
    const event=events.has(round.eventId)?(actualPublic(raw)?raw:undefined):historic;
    const final=round.eventId.endsWith('-champion');
    if(!event||event.locationId!==site.id||event.tick!==round.tick||event.category!=='heavenly'||!nativeDate(world,event)||
      (final?!same(event.actorIds,[bout.winnerId])||occasion.championId!==bout.winnerId||round.bouts.length!==1:
        !ids.every(id=>event.actorIds.includes(id))))return;
    const left=people.get(a),right=people.get(b);
    if(!left||!right)return;
    const layout=base(`${event.id}:${source.bout}`,site,event),current=!layout.historical;
    return {...layout,left:fighter(left,undefined,current&&here(left,site.id),false),
      right:fighter(right,undefined,current&&here(right,site.id),false),
      damages:[...damage('left',bout.firstDamage),...damage('right',bout.secondDamage)],outcome:bout.winnerId===a?'left':'right'};
  }
  // A public/remote scene never widens the separately gated private native dungeon.
  if(!viewer||activeDungeonForActor(world,viewer)!==occasion||!here(viewer,occasion.locationId))return;
  const site=venue(occasion.locationId,true),dungeon=projectExpeditionDungeon(world,viewer,occasion.id);
  if(!site||!dungeon||dungeon.room!=='sanctum'||dungeon.closedTick!==undefined||!occasion.omenId)return;
  const last=[...dungeon.steps].reverse().find(row=>row.move==='strike');
  if(!last){
    const openings=dungeon.steps.filter(row=>row.move==='break_array');
    const paid=openings.length===1?openings[0]:undefined;
    const original=paid&&events.get(paid.eventId);
    if(!paid||paid.move!=='break_array'||paid.qiPaid!==18||!original||!nativeDate(world,original)||
      original.id!==`evt-${paid.tick}-${occasion.id}-dungeon-break_array-${paid.actorId}`||
      original.tick!==paid.tick||original.category!=='heavenly'||original.witnessScope!=='participants'||original.locationId!==site.id||
      original.actorIds[0]!==paid.actorId||!original.actorIds.includes(viewer.id)||dungeon.bossHp!==dungeon.bossMaxHp||
      !dungeon.members.some(row=>row.actorId===viewer.id&&row.enteredTick<paid.tick&&row.leftTick===undefined)||
      !dungeon.members.some(row=>row.actorId===paid.actorId&&row.enteredTick<paid.tick))return;
    const current=!options.historical;
    const layout={...base(`${original.id}:ready:${world.tick}`,site,original),tick:world.tick,
      historical:!current,season:seasonAt(world.month)};
    return {...layout,left:fighter(viewer,undefined,current,current),
      right:{id:`dungeon-boss:${occasion.id}`,name:'秘境妖王',boss:true,...(current?{hp:{value:dungeon.bossHp,max:dungeon.bossMaxHp}}:{})},
      damages:[]};
  }
  if(last.move!=='strike'||!validDamage(last.hpLost)||!validDamage(last.bossBefore)||!validDamage(last.bossAfter)||
    last.bossBefore<=last.bossAfter||last.bossBefore>dungeon.bossMaxHp||last.bossAfter!==dungeon.bossHp)return;
  const event=events.get(last.eventId),actor=people.get(last.actorId);
  if(!event||!actor||!here(actor,site.id)||!nativeDate(world,event)||event.witnessScope!=='participants'||event.category!=='heavenly'||
    event.locationId!==site.id||event.tick!==last.tick||event.actorIds[0]!==actor.id||!event.actorIds.includes(viewer.id)||
    last.eventId!==`evt-${last.tick}-${occasion.id}-dungeon-strike-${actor.id}`||
    !dungeon.members.some(row=>row.actorId===actor.id&&row.enteredTick<last.tick&&row.leftTick===undefined))return;
  const layout=base(last.eventId,site,event),current=!layout.historical;
  return {...layout,left:fighter(actor,undefined,current,current),
    right:{id:`dungeon-boss:${occasion.id}`,name:'秘境妖王',boss:true,...(current?{hp:{value:last.bossAfter,max:dungeon.bossMaxHp}}:{})},
    damages:[...damage('left',last.hpLost),...damage('right',last.bossBefore-last.bossAfter)],...(last.bossAfter===0?{outcome:'left' as const}:{})};
}
