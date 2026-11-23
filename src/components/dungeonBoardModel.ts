import {activeDungeonForActor,DUNGEON_ARRAY_QI,DUNGEON_BOSS_MAX_HP,DUNGEON_REWARD_STONES,projectExpeditionDungeon,
  type DungeonOption} from '../engine/expeditionDungeonEngine';
import {hasKnownExpeditionRosterMember,isScopedExpeditionGate} from '../engine/expeditionOmenTerms';
import {terrainTileAt} from '../engine/terrainEngine';
import type {DungeonMember,DungeonOutcome,DungeonRoom,DungeonStep} from '../types/expeditionDungeon';
import type {Cultivator,WorldEvent,WorldOccasion,WorldState} from '../types/world';
import {projectCultivatorPortrait} from './cultivatorPortraitModel';
import type {MapActorSpriteModel} from './mapActorSpriteModel';
import {mapTransitActorIds} from './mapConvoyView';
import type {createTerrainMapView} from './terrainMapView';
import {projectVisualDuelArena} from './visualDuelArenaModel';

const roomLabels={garden:'外围灵草园',hall:'上古符文阵门',sanctum:'禁地妖王祭坛'} as const;
const roomOrder=['garden','hall','sanctum'] as const;
export interface DungeonBoardRoom {
  readonly id:DungeonRoom;
  readonly state:'hidden'|'visited'|'current';
  readonly label?:string;
}
export interface DungeonBoardFrame {
  readonly occasionId:string;
  readonly siteId:string;
  readonly tick:number;
  readonly expiresTick:number;
  readonly historical:boolean;
  readonly entrance:boolean;
  readonly rooms:readonly DungeonBoardRoom[];
  readonly at?:DungeonRoom;
  readonly actor?:MapActorSpriteModel;
  readonly boss?:{readonly hp:number;readonly maxHp:number};
  readonly treasure?:'sealed'|'claimable'|'claimed';
  readonly steps:readonly DungeonStep[];
  readonly members:readonly DungeonMember[];
  readonly outcome?:DungeonOutcome;
  readonly options:readonly DungeonOption[];
}
export interface DungeonBoardOptions {
  readonly viewer?:Cultivator;
  readonly historical?:boolean;
}

function index<T extends {id:string}>(rows:readonly T[]):Map<string,T|undefined>{
  const found=new Map<string,T|undefined>();
  for(const row of rows)found.set(row.id,found.has(row.id)?undefined:row);
  return found;
}
const dated=(world:WorldState,event:WorldEvent,tick:number)=>
  event.tick===tick&&Number.isSafeInteger(tick)&&tick>0&&tick<=world.tick&&
  Number.isSafeInteger(event.year)&&Number.isSafeInteger(event.month)&&event.month>=1&&event.month<=12&&
  (world.year-event.year)*12+world.month-event.month===world.tick-tick;
const ownerAt=(member:DungeonMember,tick:number)=>member.enteredTick<=tick&&(member.leftTick===undefined||tick<=member.leftTick);
const copyMember=(member:DungeonMember)=>({actorId:member.actorId,enteredTick:member.enteredTick});
const stepTitles={
  enter:'并入星门探阵',gather:'药园采得灵叶',break_array:'古殿阵门已开',
  strike:'传承禁地斗妖王',claim:'妖王伏倒，宝钥入手',retreat:'折返星门出口',
} as const;

function exactSource(world:WorldState,occasion:WorldOccasion,events:ReadonlyMap<string,WorldEvent|undefined>,
  members:ReadonlyMap<string,DungeonMember>,step:DungeonStep):WorldEvent|undefined{
  const original=events.get(step.eventId);
  if(!original||step.eventId!==`evt-${step.tick}-${occasion.id}-dungeon-${step.move}-${step.actorId}`||
    !dated(world,original,step.tick)||original.locationId!==occasion.locationId||
    original.witnessScope!=='participants'||original.category!=='heavenly'||original.title!==stepTitles[step.move]||
    original.duelWinnerId!==undefined||original.dialogue!==undefined||original.damage!==undefined||
    original.actorIds[0]!==step.actorId||new Set(original.actorIds).size!==original.actorIds.length||
    original.actorIds.some(id=>{
      const person=members.get(id);
      return !person||!ownerAt(person,step.tick)||id!==step.actorId&&person.enteredTick>=step.tick&&step.move!=='enter';
    }))return;
  if(step.move==='strike'&&original.description!==(step.bossAfter>0
    ?`亲身出战者损失${step.hpLost}点气血；妖王尚有${step.bossAfter}点气血。`
    :'此招落定，妖王确已伏倒，宝物仍须亲取。'))return;
  return original;
}

export function projectDungeonBoard(world:WorldState,terrainView:ReturnType<typeof createTerrainMapView>,occasionId:string,
  {viewer,historical=false}:DungeonBoardOptions={}):DungeonBoardFrame|undefined{
  const people=index(world.cultivators),locations=index(world.locations);
  if(!viewer||people.get(viewer.id)!==viewer||!viewer.alive||!Number.isFinite(viewer.hp)||viewer.hp<=0||
    viewer.positionPlane!==undefined)return;
  const occasion=index(world.occasions).get(occasionId);
  if(!occasion||occasion.kind!=='expedition'||occasion.id!==`occasion-${occasion.startedTick}-expedition`||
    occasion.locationId!==`${occasion.id}-gate`||occasion.registrationClosesTick!==occasion.startedTick+3||
    occasion.expiresTick!==occasion.startedTick+12||!occasion.omenId)return;
  const anchor=locations.get(occasion.anchorSiteId??'');
  const omen=index(world.expeditionOmens.rows).get(occasion.omenId);
  if(!anchor||anchor.type==='secret_realm'||anchor.type==='abyss'||isScopedExpeditionGate(anchor)||
    omen?.siteId!==anchor.id||omen.opening?.occasionId!==occasionId||omen.opening.tick!==occasion.startedTick||
    !hasKnownExpeditionRosterMember(world,viewer,occasion))return;
  const native=projectExpeditionDungeon(world,viewer,occasion.id);
  if(!native)return;
  const gate=locations.get(occasion.locationId),tile=gate&&terrainTileAt(world,gate.x,gate.y);
  const visible=!!gate&&gate.type==='secret_realm'&&isScopedExpeditionGate(gate)&&gate.expeditionOmenId===omen.id&&
    !!tile&&index(terrainView.seenLocations).get(gate.id)===gate&&terrainView.locationTile.get(gate.id)===tile&&
    terrainView.tileState(tile)==='visible'&&terrainView.isCurrentLocation(gate.id)&&
    (!terrainView.current||terrainView.current.has(tile.id));
  const settledBody=viewer.locationId===occasion.locationId&&visible&&index(terrainView.liveActors).get(viewer.id)===viewer&&
    !terrainView.trailPositions.has(viewer.id)&&!mapTransitActorIds(world).has(viewer.id);
  const base={occasionId,siteId:occasion.locationId,tick:world.tick,expiresTick:occasion.expiresTick,historical};
  const cards=(known:ReadonlySet<DungeonRoom>,at?:DungeonRoom):DungeonBoardRoom[]=>roomOrder.map(id=>
    known.has(id)?{id,state:at===id?'current':'visited',label:roomLabels[id]}:{id,state:'hidden'});
  const ownMembers=native.members.filter(row=>row.actorId===viewer.id);
  if(ownMembers.length===0){
    const options=native.options.filter(row=>row.dungeonMove==='enter'&&row.targetDungeonRoomId==='garden');
    return settledBody&&options.length===1?{...base,entrance:true,rooms:cards(new Set()),steps:[],members:[],options:historical?[]:options}:undefined;
  }
  if(ownMembers.length!==1)return;
  const own=ownMembers[0],members=new Map<string,DungeonMember>();
  for(const member of native.members){
    const left=member.leftTick;
    if(members.has(member.actorId)||!people.get(member.actorId)||!occasion.participantIds.includes(member.actorId)||
      !Number.isSafeInteger(member.enteredTick)||member.enteredTick<native.openedTick||member.enteredTick>=occasion.expiresTick||
      member.enteredTick>world.tick||(left===undefined)!==(member.exit===undefined)||left!==undefined&&
        (!Number.isSafeInteger(left)||left<member.enteredTick||left>world.tick||left>(native.closedTick??occasion.expiresTick)))return;
    members.set(member.actorId,member);
  }
  const events=index(world.events),seen=new Set<DungeonRoom>(),seenPeople=new Set<string>(),admitted=new Set<string>();
  const reported:DungeonStep[]=[],acceptedExit=new Set<string>();
  const stepIds=new Set<string>(),actorsThisTurn=new Set<string>();
  const ownedEnter=native.steps.filter(row=>row.move==='enter'&&row.actorId===viewer.id);
  if(ownedEnter.length!==1||ownedEnter[0].tick!==own.enteredTick||!exactSource(world,occasion,events,members,ownedEnter[0]))return;
  let cursor:DungeonRoom='garden',lastTick=native.openedTick,sharedTick=-1,bossHp=DUNGEON_BOSS_MAX_HP;
  let treasure:DungeonBoardFrame['treasure'],witnessedBossHp:number|undefined,knownClaim=false,claimed=false;
  for(const step of native.steps){
    const who=members.get(step.actorId);
    if(!who||!ownerAt(who,step.tick)||stepIds.has(step.eventId)||step.tick<lastTick||step.tick>world.tick||
      step.tick>=occasion.expiresTick||step.tick>(native.closedTick??Infinity))return;
    if(lastTick!==step.tick)actorsThisTurn.clear();
    if(actorsThisTurn.has(step.actorId))return;
    lastTick=step.tick;stepIds.add(step.eventId);actorsThisTurn.add(step.actorId);
    if(step.move==='enter'){
      if(admitted.has(step.actorId)||who.enteredTick!==step.tick||cursor!=='garden')return;
      admitted.add(step.actorId);
    }else if(!admitted.has(step.actorId)||who.enteredTick>=step.tick||acceptedExit.has(step.actorId))return;
    if(step.move==='retreat'){
      if(who.leftTick!==step.tick||who.exit!==(claimed?'escaped':'retreated'))return;
      acceptedExit.add(step.actorId);
    }else if(step.move!=='enter'){
      if(sharedTick===step.tick)return;
      sharedTick=step.tick;
      switch(step.move){
        case 'gather':
          if(cursor!=='garden'||step.jadeLeaf!==1)return;
          cursor='hall';break;
        case 'break_array':
          if(cursor!=='hall'||step.qiPaid!==DUNGEON_ARRAY_QI)return;
          cursor='sanctum';break;
        case 'strike':
          if(cursor!=='sanctum'||bossHp<=0||step.bossBefore!==bossHp||!Number.isInteger(step.bossAfter)||
            step.bossAfter<Math.max(0,bossHp-45)||step.bossAfter>Math.max(0,bossHp-20)||
            !Number.isSafeInteger(step.hpLost)||step.hpLost<0||step.bossAfter===0&&step.hpLost!==0)return;
          bossHp=step.bossAfter;break;
        case 'claim':
          if(cursor!=='sanctum'||bossHp!==0||claimed||step.stones!==DUNGEON_REWARD_STONES||
            step.artifactId!==`dungeon-loot-${occasion.id}`)return;
          claimed=true;break;
      }
    }
    const original=exactSource(world,occasion,events,members,step);
    if(!original||!ownerAt(own,step.tick)||!original.actorIds.includes(viewer.id)||
      original.actorIds.some(id=>!admitted.has(id)||id!==step.actorId&&acceptedExit.has(id)))continue;
    const reached=step.move==='enter'||step.move==='gather'&&seen.has('garden')||
      step.move==='break_array'&&seen.has('hall')||
      (step.move==='strike'||step.move==='claim')&&seen.has('sanctum')||step.move==='retreat';
    if(!reached)continue;
    if(step.move==='enter')seen.add('garden');
    if(step.move==='gather')seen.add('hall');
    if(step.move==='break_array'){
      seen.add('sanctum');treasure='sealed';witnessedBossHp=DUNGEON_BOSS_MAX_HP;
    }
    if(step.move==='strike'){
      witnessedBossHp=step.bossBefore===witnessedBossHp?step.bossAfter:undefined;
      if(witnessedBossHp===0)treasure='claimable';
    }
    if(step.move==='claim'&&treasure==='claimable'){treasure='claimed';knownClaim=true;}
    reported.push({...step});original.actorIds.forEach(id=>seenPeople.add(id));
  }
  if(cursor!==native.room||bossHp!==native.bossHp||native.bossMaxHp!==DUNGEON_BOSS_MAX_HP||admitted.size!==members.size)return;
  const inside=own.leftTick===undefined&&native.closedTick===undefined&&settledBody&&activeDungeonForActor(world,viewer)===occasion;
  if(!inside&&own.leftTick===undefined)return;
  const at=!historical&&inside&&seen.has(cursor)?cursor:undefined;
  // If the live chest no longer has a proved selectable state, retain only the earlier memory in read-only views.
  if(at&&claimed&&!knownClaim)treasure=undefined;
  const options=at?native.options.filter(option=>option.targetDungeonRoomId===at&&option.targetOccasionId===occasionId&&
    (option.dungeonMove!=='claim'||treasure==='claimable')):[];
  const appearance=at?projectCultivatorPortrait(world,viewer):undefined;
  const actor:MapActorSpriteModel|undefined=appearance?{id:viewer.id,appearance,pose:'idle'}:undefined;
  const visual=at==='sanctum'?projectVisualDuelArena(world,terrainView,{kind:'dungeon',occasionId},{viewer}):undefined;
  // An idle month adds no hit. Preserve the last contiguous personally witnessed HP only while actually inside.
  const liveGauge=visual?.right.boss===true?visual.right.hp:undefined;
  const hp=at==='sanctum'&&witnessedBossHp===bossHp&&(!liveGauge||
    liveGauge.max===DUNGEON_BOSS_MAX_HP&&liveGauge.value===bossHp)?{hp:bossHp,maxHp:DUNGEON_BOSS_MAX_HP}:undefined;
  const collapseTick=own.exit==='collapse'?own.leftTick:undefined;
  const collapse=collapseTick===undefined?undefined:events.get(`evt-${collapseTick}-${occasionId}-dungeon-collapse`);
  const ownCollapse=collapseTick!==undefined&&collapse&&dated(world,collapse,collapseTick)&&collapse.locationId===occasion.locationId&&
    collapse.witnessScope==='participants'&&collapse.category==='heavenly'&&collapse.title==='星门倾颓'&&
    collapse.actorIds.includes(viewer.id);
  const ownRetreat=reported.some(step=>step.actorId===viewer.id&&step.move==='retreat');
  const ownRescued=own.exit==='rescued'&&world.expeditionRescues.requests.filter(request=>
    request.occasionId===occasionId&&request.finishedTick===own.leftTick&&request.arrivedIds?.includes(viewer.id)).length===1;
  const knownOwnExit=ownRetreat||ownCollapse||ownRescued||own.exit==='lost'&&
    native.closedTick===own.leftTick&&occasion.status!=='running';
  const visibleMembers=native.members.filter(row=>seenPeople.has(row.actorId)).map(row=>{
    const personallyObservedExit=reported.some(step=>step.actorId===row.actorId&&step.move==='retreat');
    return row.actorId===viewer.id&&knownOwnExit||personallyObservedExit||ownCollapse&&collapse?.actorIds.includes(row.actorId)?{...row}:copyMember(row);
  });
  const outcome:DungeonOutcome|undefined=ownCollapse?'collapsed':knownOwnExit&&own.exit==='lost'?'lost':
    ownRetreat&&own.exit==='escaped'&&knownClaim?'claimed':
      ownRetreat&&own.exit==='retreated'||ownRescued?'retreated':undefined;
  return {...base,entrance:false,rooms:cards(seen,at),steps:reported,members:visibleMembers,options,
    ...(at?{at}:{}),...(actor?{actor}:{}),...(hp?{boss:hp}:{}),...(treasure?{treasure}:{}),...(outcome?{outcome}:{})};
}
