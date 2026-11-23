import type {Cultivator,LLMDecisionPayload,LocationNode,MapHazard,MapPoint,PilgrimageJourney,WorldEvent,WorldState} from '../types/world';
import type {PilgrimageForkChoice,PilgrimageForkOption,PilgrimageForkRecord,PilgrimageForkView} from '../types/pilgrimageFork';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {findMapPath} from './mapMotionEngine';
import {availablePilgrimageActions,PILGRIMAGE_LEG_COST,PILGRIMAGE_TILE_STRIDE,resolvePilgrimageAction} from './pilgrimageEngine';
import {currentVisibleTileIds,knownMapLocations,noteTerrainVisit,terrainTileAt} from './terrainEngine';
import {flowActor,recordResourceFlow} from './resourceFlowEngine';
import {pilgrimageForkTravelLocked} from './pilgrimageForkPresence';
export {pilgrimageForkCheckpoint,pilgrimageForkTravelLocked,pilgrimageForkActedThisTick} from './pilgrimageForkPresence';
export type {PilgrimageForkMove,PilgrimageForkOption,PilgrimageForkView} from '../types/pilgrimageFork';

const CHOICE_WINDOW=2, TRAVEL_WINDOW=12, ROUTE_LIMIT=60;
const exact=<T>(rows:readonly T[],accept:(row:T)=>boolean)=>{let one:T|undefined;for(const row of rows)if(accept(row)){if(one!==undefined)return;one=row;}return one;};
const person=(world:WorldState,id:string)=>exact(world.cultivators,row=>row.id===id);
const journeyOf=(world:WorldState,id:string)=>exact(world.pilgrimages.journeys,row=>row.id===id);
const knownSite=(world:WorldState,id:string)=>{
  const site=exact(world.locations,row=>row.id===id);
  return site&&site.type!=='secret_realm'&&!isScopedExpeditionGate(site)?site:undefined;
};
const same=(a:MapPoint,b:MapPoint)=>a.x===b.x&&a.y===b.y;
const date=(world:WorldState,tick:number)=>{const at=world.year*12+world.month-1-(world.tick-tick);return{year:Math.floor(at/12),month:at%12+1};};
const onFoot=(world:WorldState,actor:Cultivator,siteId:string)=>person(world,actor.id)===actor&&actor.alive&&actor.hp>0&&
  actor.positionPlane===undefined&&actor.locationId===siteId;
function arrivalProof(world:WorldState,fork:PilgrimageForkRecord,journey:PilgrimageJourney,event:WorldEvent){
  const when=date(world,fork.arrivalTick);
  return event.id===fork.arrivalEventId&&event.id===`evt-${journey.id}-arrival-${fork.arrivalTick}`&&event.tick===fork.arrivalTick&&
    event.year===when.year&&event.month===when.month&&event.category==='diplomacy'&&event.title==='同行巡礼抵达中站'&&
    event.witnessScope==='participants'&&event.locationId===fork.siteId&&event.actorIds.length===2&&
    event.actorIds[0]===fork.actors[0]&&event.actorIds[1]===fork.actors[1]&&
    journey.stopIds[1]===fork.siteId&&journey.stopIds[2]===fork.escortSiteId&&journey.stopsVisited[1]?.tick===fork.arrivalTick&&
    journey.stopsVisited[1].locationId===fork.siteId;
}
export function recordPilgrimageForkArrival(world:WorldState,events:readonly WorldEvent[]):void{
  if(world.pilgrimageForks){
    world.pilgrimageForks.forks=world.pilgrimageForks.forks.filter(fork=>{
      if(fork.choices.length)return true;
      const journey=journeyOf(world,fork.journeyId);
      return world.tick-fork.arrivalTick<CHOICE_WINDOW&&journey?.status==='active'&&journey.legIndex===1&&
        journey.path.length===0&&journey.lastMovedTick===fork.arrivalTick;
    });
    if(!world.pilgrimageForks.forks.length)delete world.pilgrimageForks;
  }
  for(const event of events){
    if(event.tick!==world.tick||event.title!=='同行巡礼抵达中站'||!event.locationId)continue;
    const id=event.id.split('-arrival-')[0].slice(4),journey=journeyOf(world,id);
    if(!journey||journey.status!=='active'||journey.legIndex!==1||journey.path.length||journey.lastMovedTick!==world.tick||
      journey.spentByEach!==PILGRIMAGE_LEG_COST||exact(world.events,row=>row.id===event.id)!==event||
      !knownSite(world,event.locationId)||!knownSite(world,journey.stopIds[2]))continue;
    const fork:PilgrimageForkRecord={id:`pilgrimage-fork-${journey.id}-${world.tick}`,journeyId:journey.id,siteId:event.locationId,
      arrivalTick:world.tick,arrivalEventId:event.id,actors:[journey.organizerId,journey.companionId],escortSiteId:journey.stopIds[2],choices:[]};
    if(!arrivalProof(world,fork,journey,event)||fork.actors[0]===fork.actors[1]||fork.actors.some(actorId=>{
      const actor=person(world,actorId);return !actor||!onFoot(world,actor,fork.siteId);
    }))continue;
    const ledger=world.pilgrimageForks??={forks:[]};
    if(!ledger.forks.some(row=>row.id===fork.id))ledger.forks.push(fork);
  }
}
const routeHazard=(world:WorldState,tileId:string,tick:number)=>world.mapHazards.some(hazard=>
  hazard.tileId===tileId&&hazard.intensity>=2&&hazard.createdTick<=tick&&hazard.expiresTick>tick);
function route(world:WorldState,actor:Cultivator,from:LocationNode,to:LocationNode,tick:number){
  if(!knownMapLocations(world,actor).some(site=>site.id===to.id))return [];
  const publicLandmark=(site:LocationNode)=>site.type==='market'||site.type==='sect_hq'||world.sects.some(sect=>sect.headquartersId===site.id);
  const footMap=new Set([...actor.exploredTileIds,...currentVisibleTileIds(world,actor)]);
  return findMapPath(world,from,to,tile=>!routeHazard(world,tile.id,tick)&&
    (publicLandmark(from)&&publicLandmark(to)||footMap.has(tile.id)));
}
function choicesFor(world:WorldState,actor:Cultivator,fork:PilgrimageForkRecord,tick:number){
  const journey=journeyOf(world,fork.journeyId),origin=knownSite(world,fork.siteId);
  if(!journey||!origin||!fork.actors.includes(actor.id)||!onFoot(world,actor,origin.id)||pilgrimageForkTravelLocked(world,actor)||
    fork.choices.some(row=>row.actorId===actor.id)||tick<=fork.arrivalTick||tick-fork.arrivalTick>CHOICE_WINDOW)return;
  const event=exact(world.events,row=>row.id===fork.arrivalEventId);
  if(!event||!arrivalProof(world,fork,journey,event))return;
  if(fork.closedTick===undefined){
    if(tick!==fork.arrivalTick+1||journey.status!=='active'||journey.legIndex!==1||journey.path.length||
      journey.lastMovedTick!==fork.arrivalTick||journey.spentByEach!==PILGRIMAGE_LEG_COST||
      !availablePilgrimageActions(actor,world,false,tick).some(row=>row.targetPilgrimageId===journey.id&&row.pilgrimageMove==='withdraw'))return;
  }else if(journey.status!=='withdrawn'||journey.settledTick!==fork.closedTick||fork.closedTick>tick)return;
  const base={action:'PILGRIMAGE_FORK',targetPilgrimageForkId:fork.id} as const;
  const out:{option:PilgrimageForkOption;path?:MapPoint[]}[]=[{option:{...base,pilgrimageForkMove:'remain'}}];
  if(actor.spiritStones>=PILGRIMAGE_LEG_COST){
    const add=(move:'escort'|'detour',target:string)=>{
      const to=knownSite(world,target);
      const path=to&&route(world,actor,origin,to,tick);
      if(to&&path&&path.length>1&&path.length<=ROUTE_LIMIT&&
        terrainTileAt(world,origin.x,origin.y)?.id!==terrainTileAt(world,to.x,to.y)?.id)out.push({option:{...base,pilgrimageForkMove:move,targetLocationId:target},path});
    };
    add('escort',fork.escortSiteId);
    add('detour',journey.stopIds[0]);
  }
  return out;
}
export function availablePilgrimageForkActions(actor:Cultivator,world:WorldState,tick=world.tick+1):PilgrimageForkOption[]{
  if(!world.pilgrimageForks||(tick!==world.tick&&tick!==world.tick+1))return [];
  for(const fork of world.pilgrimageForks.forks){
    const choices=choicesFor(world,actor,fork,tick);
    if(choices?.length)return choices.map(row=>row.option);
  }
  return [];
}
const lines={
  remain:{title:'本人留在实到中站',description:'只留本人在中站；同行者各自打算，未扣下一段路费。'},
  escort:{title:'本人愿向原定下一站走',description:'只记本人的继续之意；没有把另一个人记作同行，也没有先扣费。'},
  detour:{title:'本人改走曾到过的来路',description:'只记本人的改道；没有替同行者选路，也没有先扣费。'},
  arrived:{title:'本人实到所选停靠点',description:'这人实际走过自己的路段并已到站；不据此断定他人同行或抵达。'},
  closed:{title:'本人的支路没有记作到站',description:'支路停止，只保留本人已走过的路段和实付路费。'},
} as const;
type EventKind=keyof typeof lines;
const receiptId=(fork:PilgrimageForkRecord,actorId:string,move:EventKind,tick:number)=>`evt-${fork.id}-${actorId}-${move}-${tick}`;
export const isPrivatePilgrimageForkEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&event.id.startsWith('evt-pilgrimage-fork-');
function receipt(world:WorldState,fork:PilgrimageForkRecord,choice:PilgrimageForkChoice,kind:EventKind,tick=world.tick):WorldEvent{
  return {id:receiptId(fork,choice.actorId,kind,tick),tick,...date(world,tick),category:'diplomacy',witnessScope:'participants',
    actorIds:[choice.actorId],locationId:kind==='arrived'?choice.targetLocationId:fork.siteId,...lines[kind]};
}
export function resolvePilgrimageForkAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent[]{
  if(decision.chosenAction!=='PILGRIMAGE_FORK'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','pilgrimageForkMove','targetPilgrimageForkId','targetLocationId'].includes(key)))return [];
  const fork=exact(world.pilgrimageForks?.forks??[],row=>row.id===decision.targetPilgrimageForkId);
  const row=fork&&choicesFor(world,actor,fork,world.tick)?.find(row=>row.option.pilgrimageForkMove===decision.pilgrimageForkMove&&
    row.option.targetLocationId===decision.targetLocationId);
  if(!fork||!row)return [];
  const events:WorldEvent[]=[];
  if(fork.closedTick===undefined){
    const withdrawal=resolvePilgrimageAction(world,actor,{chosenAction:'PILGRIMAGE',pilgrimageMove:'withdraw',
      targetPilgrimageId:fork.journeyId,innerMonologue:'各自另作打算。'});
    if(!withdrawal)return [];
    fork.closedTick=world.tick;
    events.push(withdrawal);
  }
  const move=row.option.pilgrimageForkMove;
  const choice:PilgrimageForkChoice={actorId:actor.id,tick:world.tick,move,status:move==='remain'?'remaining':'waiting',
    paidStones:0,...(row.path?{targetLocationId:row.option.targetLocationId,path:row.path,pathIndex:0,steps:[]}: {})};
  fork.choices.push(choice);
  actor.currentAction='PILGRIMAGE_FORK';
  events.push(receipt(world,fork,choice,move));
  return events;
}

interface ForkEvidenceObserver {
  blocked(world:WorldState,fork:PilgrimageForkRecord,choice:PilgrimageForkChoice,hazard:MapHazard):void;
  arrived(world:WorldState,fork:PilgrimageForkRecord,choice:PilgrimageForkChoice,event:WorldEvent):void;
}
export function advancePilgrimageForks(world:WorldState,observer?:ForkEvidenceObserver):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const fork of world.pilgrimageForks?.forks??[])for(const choice of fork.choices){
    if(choice.status!=='waiting'&&choice.status!=='traveling')continue;
    const actor=person(world,choice.actorId),origin=knownSite(world,fork.siteId),dest=choice.targetLocationId&&knownSite(world,choice.targetLocationId);
    const path=choice.path,steps=choice.steps,index=choice.pathIndex;
    if(!actor||!origin||!dest||!path||!steps||index===undefined||!onFoot(world,actor,fork.siteId)||
      (choice.paidStones===0&&world.tick-choice.tick>=TRAVEL_WINDOW)||!same(path[0],origin)||!same(path[path.length-1],dest)){
      choice.status='closed';events.push(receipt(world,fork,choice,'closed'));continue;
    }
    if(steps.at(-1)?.tick===world.tick)continue;
    let through=index;
    while(through<Math.min(path.length-1,index+PILGRIMAGE_TILE_STRIDE)){
      const point=path[through+1],tile=terrainTileAt(world,point.x,point.y),previous=path[through];
      const beforeTile=terrainTileAt(world,previous.x,previous.y);
      if(!tile||!beforeTile||routeHazard(world,tile.id,world.tick)||
        Math.abs(tile.col-beforeTile.col)+Math.abs(tile.row-beforeTile.row)>1||same(previous,point))break;
      through++;
    }
    if(through===index){
      if(observer&&choice.paidStones===PILGRIMAGE_LEG_COST&&index>0&&path[index+1]){
        const current=terrainTileAt(world,path[index].x,path[index].y),next=terrainTileAt(world,path[index+1].x,path[index+1].y);
        if(current&&next&&Math.abs(current.col-next.col)+Math.abs(current.row-next.row)===1){
          const cause=world.mapHazards.find(hazard=>hazard.tileId===next.id&&hazard.intensity>=2&&
            hazard.createdTick<=world.tick&&hazard.expiresTick>world.tick);
          if(cause)observer.blocked(world,fork,choice,cause);
        }
      }
      continue;
    }
    if(choice.paidStones===0){
      const start=terrainTileAt(world,path[0].x,path[0].y);
      if(!path.slice(1,through+1).some(point=>terrainTileAt(world,point.x,point.y)?.id!==start?.id))continue;
      if(actor.spiritStones<PILGRIMAGE_LEG_COST){choice.status='closed';events.push(receipt(world,fork,choice,'closed'));continue;}
      actor.spiritStones-=PILGRIMAGE_LEG_COST;choice.paidStones=PILGRIMAGE_LEG_COST;
      recordResourceFlow(world,{kind:'consumption',mechanism:'pilgrimage',refId:fork.id,reason:'pilgrimage_fork_fare',
        good:'stone',amount:PILGRIMAGE_LEG_COST,from:flowActor(actor.id),visibility:{kind:'participants',actorIds:[actor.id]}});
    }
    const newSteps=path.slice(index+1,through+1).map(point=>({...point,tick:world.tick}));
    steps.push(...newSteps);choice.pathIndex=through;choice.status='traveling';
    const tiles=newSteps.flatMap(point=>terrainTileAt(world,point.x,point.y)?.id??[]);
    actor.exploredTileIds=[...new Set([...actor.exploredTileIds,...tiles])];
    if(through===path.length-1){
      actor.locationId=dest.id;choice.status='arrived';noteTerrainVisit(world,actor);
      const arrival=receipt(world,fork,choice,'arrived');
      events.push(arrival);
      observer?.arrived(world,fork,choice,arrival);
    }
  }
  return events;
}
function matches(world:WorldState,fork:PilgrimageForkRecord,choice:PilgrimageForkChoice,kind:EventKind,event:WorldEvent){
  const expected=receipt(world,fork,choice,kind,event.tick);
  return event.id===expected.id&&event.year===expected.year&&event.month===expected.month&&event.category===expected.category&&
    event.witnessScope===expected.witnessScope&&event.locationId===expected.locationId&&event.title===expected.title&&
    event.description===expected.description&&event.actorIds.length===1&&event.actorIds[0]===choice.actorId;
}
function sharedEscortStride(world:WorldState,fork:PilgrimageForkRecord,site:LocationNode,choice:PilgrimageForkChoice):boolean{
  if(choice.move!=='escort'||choice.paidStones!==PILGRIMAGE_LEG_COST)return false;
  const other=exact(fork.choices,row=>row.actorId!==choice.actorId&&fork.actors.includes(row.actorId)&&row.move==='escort');
  const otherActor=other&&person(world,other.actorId);
  if(!other||other.paidStones!==PILGRIMAGE_LEG_COST||!otherActor?.alive)return false;
  const keys=(record:PilgrimageForkChoice)=>{
    const steps=record.steps??[];
    return steps.flatMap((step,index)=>{
      if(step.tick!==world.tick)return [];
      const prev=index===0?site:steps[index-1];
      return [`${prev.x},${prev.y}:${step.x},${step.y}`];
    });
  };
  const walked=new Set(keys(other));
  return keys(choice).some(key=>walked.has(key));
}
export function projectPilgrimageFork(world:WorldState,actor:Cultivator):PilgrimageForkView|undefined{
  if(person(world,actor.id)!==actor||!actor.alive||actor.hp<=0||actor.positionPlane!==undefined)return;
  const options=availablePilgrimageForkActions(actor,world);
  for(const fork of [...world.pilgrimageForks?.forks??[]].reverse()){
    if(!fork.actors.includes(actor.id))continue;
    const site=knownSite(world,fork.siteId),choice=fork.choices.find(row=>row.actorId===actor.id);
    if(!site)continue;
    if(options[0]?.targetPilgrimageForkId===fork.id)return {siteId:site.id,siteName:site.name,options};
    if(!choice||actor.locationId!==(choice.status==='arrived'?choice.targetLocationId:fork.siteId))continue;
    const kind:EventKind=choice.status==='arrived'?'arrived':choice.status==='closed'?'closed':choice.move;
    const event=exact(world.events,row=>row.id===receiptId(fork,actor.id,kind,world.tick));
    const actual=event&&matches(world,fork,choice,kind,event);
    const shared=sharedEscortStride(world,fork,site,choice);
    if(actual||shared)return {siteId:site.id,siteName:site.name,options:[],
      ...(actual?{receipt:lines[kind]}:{}),...(shared?{sharedWalk:true as const}:{})};
  }
}
/** The selected traveller's proven own geometry only; never return an unwalked route suffix. */
export function projectPilgrimageForkTrace(world:WorldState,actor:Cultivator):readonly MapPoint[]{
  if(person(world,actor.id)!==actor||!actor.alive||actor.hp<=0||actor.positionPlane!==undefined)return [];
  for(const fork of [...world.pilgrimageForks?.forks??[]].reverse()){
    const choice=fork.choices.find(row=>row.actorId===actor.id),steps=choice?.steps;
    const site=knownSite(world,fork.siteId);
    if(!choice||!site||!steps?.length||choice.paidStones!==PILGRIMAGE_LEG_COST||
      choice.status!=='traveling'&&!(choice.status==='closed'&&actor.locationId===fork.siteId)&&
      !(choice.status==='arrived'&&steps.at(-1)?.tick===world.tick))continue;
    return [{x:site.x,y:site.y},...steps.map(({x,y})=>({x,y}))];
  }
  return [];
}
export function validatePilgrimageForkSave(world:WorldState,fail:(path:string)=>never){
  const ledger=world.pilgrimageForks;
  if(!ledger)return;
  if(!ledger.forks.length)fail('pilgrimageForks.empty');
  const ids=new Set<string>(),knownEvents=new Set<string>();
  const hot=(tick:number)=>world.events.length<120||world.events.some(row=>row.tick<tick);
  for(const fork of ledger.forks){
    const j=journeyOf(world,fork.journeyId),origin=knownSite(world,fork.siteId);
    if(ids.has(fork.id)||fork.id!==`pilgrimage-fork-${fork.journeyId}-${fork.arrivalTick}`||
      !origin||!j||j.organizerId!==fork.actors[0]||j.companionId!==fork.actors[1]||fork.actors[0]===fork.actors[1]||
      fork.actors.some(id=>!person(world,id))||fork.arrivalTick>world.tick||fork.arrivalTick<1||
      j.stopsVisited[1]?.tick!==fork.arrivalTick||j.stopIds[1]!==fork.siteId||j.stopIds[2]!==fork.escortSiteId||
      fork.arrivalEventId!==`evt-${j.id}-arrival-${fork.arrivalTick}`)fail('pilgrimageForks.origin');
    ids.add(fork.id);
    const raw=world.events.filter(event=>event.id===fork.arrivalEventId);
    if(raw.length>1||!raw.length&&hot(fork.arrivalTick)||raw[0]&&!arrivalProof(world,fork,j,raw[0]))fail('pilgrimageForks.arrival');
    if(fork.closedTick!==undefined){
      if(fork.closedTick!==fork.arrivalTick+1||fork.closedTick>world.tick||!fork.choices.length||
        j.status!=='withdrawn'||j.settledTick!==fork.closedTick||j.spentByEach!==PILGRIMAGE_LEG_COST)
        fail('pilgrimageForks.withdrawal');
      const sourceId=`evt-${j.id}-withdrawn-${fork.closedTick}`,events=world.events.filter(row=>row.id===sourceId);
      const expected=date(world,fork.closedTick);
      if(events.length>1||!events.length&&hot(fork.closedTick)||events[0]&&
        (events[0].tick!==fork.closedTick||events[0].year!==expected.year||events[0].month!==expected.month||
          events[0].locationId!==fork.siteId||events[0].category!=='diplomacy'||events[0].title!=='止步退出巡礼'||
          events[0].witnessScope!=='participants'||events[0].actorIds.length!==2||
          events[0].actorIds.some((id,index)=>id!==fork.actors[index])))fail('pilgrimageForks.withdrawalSource');
    }else if(fork.choices.length||world.tick-fork.arrivalTick>=CHOICE_WINDOW)fail('pilgrimageForks.open');
    const selected=new Set<string>();
    for(const choice of fork.choices){
      if(!fork.actors.includes(choice.actorId)||selected.has(choice.actorId)||fork.closedTick===undefined||
        choice.tick<fork.closedTick||choice.tick>fork.arrivalTick+CHOICE_WINDOW||choice.tick>world.tick)fail('pilgrimageForks.choice');
      selected.add(choice.actorId);
      const eventId=receiptId(fork,choice.actorId,choice.move,choice.tick),sources=world.events.filter(row=>row.id===eventId);
      if(sources.length>1||!sources.length&&hot(choice.tick)||sources[0]&&!matches(world,fork,choice,choice.move,sources[0]))
        fail('pilgrimageForks.choiceSource');
      knownEvents.add(eventId);
      const {path,pathIndex,steps}=choice;
      if(choice.move==='remain'){
        if(path!==undefined||pathIndex!==undefined||steps!==undefined||choice.targetLocationId!==undefined||
          choice.paidStones!==0||choice.status!=='remaining')fail('pilgrimageForks.remain');
        continue;
      }
      const dest=choice.targetLocationId&&knownSite(world,choice.targetLocationId);
      if(!dest||dest.id!==(choice.move==='escort'?fork.escortSiteId:j.stopIds[0])||!path||!steps||pathIndex===undefined||
        path.length<2||path.length>ROUTE_LIMIT||pathIndex!==steps.length||steps.length>=path.length||
        !same(path[0],origin)||!same(path[path.length-1],dest)||choice.paidStones!==(steps.length?PILGRIMAGE_LEG_COST:0)||
        choice.status==='arrived'&&pathIndex!==path.length-1||choice.status!=='arrived'&&pathIndex===path.length-1||
        choice.status==='remaining'||choice.status==='waiting'&&steps.length>0||choice.status==='traveling'&&!steps.length)
        fail('pilgrimageForks.path');
      const byTick=new Map<number,number>();
      for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i],at=terrainTileAt(world,a.x,a.y),bt=terrainTileAt(world,b.x,b.y);
        if(!at||!bt||same(a,b)||Math.abs(at.col-bt.col)+Math.abs(at.row-bt.row)>1)fail('pilgrimageForks.geometry');
        const step=steps[i-1];
        if(!step)continue;
        const prior=steps[i-2];
        const count=(byTick.get(step.tick)??0)+1;
        byTick.set(step.tick,count);
        if(!same(step,b)||step.tick<choice.tick||step.tick>world.tick||!prior&&step.tick-choice.tick>=TRAVEL_WINDOW||
          prior&&step.tick<prior.tick||count>PILGRIMAGE_TILE_STRIDE)fail('pilgrimageForks.step');
      }
      const mode=choice.status==='arrived'?'arrived':choice.status==='closed'?'closed':undefined;
      if(mode==='arrived'){
        const finalTick=steps.at(-1)!.tick,eventId=receiptId(fork,choice.actorId,mode,finalTick);
        const receipts=world.events.filter(row=>row.id===eventId);
        if(receipts.length>1||!receipts.length&&hot(finalTick)||receipts[0]&&!matches(world,fork,choice,mode,receipts[0]))
          fail('pilgrimageForks.reached');
        knownEvents.add(eventId);
      }else if(mode==='closed'){
        const observed=world.events.filter(row=>row.id===receiptId(fork,choice.actorId,mode,row.tick));
        if(observed.length>1||observed[0]&&(!matches(world,fork,choice,mode,observed[0])||observed[0].tick<choice.tick||
          observed[0].tick< (steps.at(-1)?.tick??choice.tick)))fail('pilgrimageForks.closed');
        if(observed[0])knownEvents.add(observed[0].id);
      }
    }
  }
  for(const event of world.events)if(event.id.startsWith('evt-pilgrimage-fork-')&&!knownEvents.has(event.id))fail('pilgrimageForks.orphan');
}
