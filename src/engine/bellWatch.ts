import { bellWatchEventId, bellWatchEventProof } from '../types/bellWatch';
import type { BellWatchChoice, BellWatchListener, BellWatchMove, BellWatchOption, BellWatchState, BellWatchView } from '../types/bellWatch';
import type { Cultivator, LLMDecisionPayload, LocationNode, MapHazard, MapPoint, MapTile, WorldEvent, WorldState } from '../types/world';
import { activeBellWatchForActor, bellWatchActedThisTick } from './bellWatchPresence';
export { activeBellWatchForActor, bellWatchActedThisTick, bellWatchCheckpoint } from './bellWatchPresence';
import { isGrandSiegeFighterPresent } from './grandSiegePresence';
import { routeWarningHazardValid } from './routeWarningProof';
import { createStoryletRegistry } from './storyletEngine';
import { currentVisibleTileIds, terrainTileAt } from './terrainEngine';

export { bellWatchEventId } from '../types/bellWatch';

type Tower = LocationNode & { bellWatch: BellWatchState };
type Context = { actorId: string; option: BellWatchMove };
type BellStorylet = {
  Id: BellWatchMove; Context: Context; Actor: string; Role: 'watcher';
  Scene: { title: string; body: string }; Choice: BellWatchMove; ChoiceMeta: string;
  Condition: { kind: 'legal'; move: BellWatchMove }; Binder: { kind: 'watcher' };
  Effect: { kind: 'record'; move: BellWatchMove }; EffectContext: undefined; Result: BellWatchMove;
};
const stories = createStoryletRegistry<BellStorylet>([
  {id:'inspect',conditions:[{kind:'legal',move:'inspect'}],roles:[{id:'watcher',binder:{kind:'watcher'}}],
    scene:{title:'山钟停了一夜',body:'松针上的水落了半宿，檐下始终空着那一声。轮到你报平安，先提灯去看看钟梁。'},
    choices:[{id:'inspect',meta:'提灯查钟楼',effect:{kind:'record',move:'inspect'}}]},
  {id:'reroute',conditions:[{kind:'legal',move:'reroute'}],roles:[{id:'watcher',binder:{kind:'watcher'}}],
    scene:{title:'山钟停了一夜',body:'松针上的水落了半宿，那边山脚仍有等钟的人。旧路在脚下，只能亲自走一趟。'},
    choices:[{id:'reroute',meta:'沿熟路送信',effect:{kind:'record',move:'reroute'}}]},
],{
  conditions:{legal:({move},context)=>move===context.option},
  roles:{watcher:(_binder,{actorId})=>actorId?[actorId]:[]},
  effects:{record:({move})=>move},
});

const asc=(a:string,b:string)=>a<b?-1:a>b?1:0;
export const bellWatchId=(siteId:string,openedTick:number)=>`bell-watch-${openedTick}-${siteId}`;
const ownedTowers=(world:WorldState):Tower[]=>world.locations.filter((site):site is Tower=>site.bellWatch!==undefined);
const actorAt=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id);
const siteAt=(world:WorldState,id:string)=>world.locations.find(site=>site.id===id);
const tileAt=(world:WorldState,site:MapPoint)=>terrainTileAt(world,site.x,site.y);
const alive=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0&&actor.positionPlane===undefined;
const physical=(world:WorldState,actor:Cultivator,siteId:string)=>
  world.cultivators.includes(actor)&&!activeBellWatchForActor(world,actor)&&isGrandSiegeFighterPresent(world,actor,siteId);
const destination=(site:Tower,id:string)=>site.bellWatch.listeners.some(row=>row.siteId===id);
const towerOwner=(world:WorldState,site:LocationNode)=>world.sects.find(sect=>sect.headquartersId===site.id&&
  site.ownerSectId===sect.id&&site.type==='sect_hq'&&sect.facilities.defense_array>0);

function hazardAt(world:WorldState,tileId:string,tick:number){
  return world.mapHazards.some(hazard=>hazard.tileId===tileId&&hazard.createdTick<=tick&&hazard.expiresTick>tick);
}
const treacherous=(tile:MapTile)=>tile.biome==='魔渊'||tile.biome==='毒沼';
function sealedTiles(world:WorldState){
  return new Set(world.locations.flatMap(site=>{
    const tile=tileAt(world,site);
    return tile&&(site.type==='secret_realm'||site.type==='abyss')?[tile.id]:[];
  }));
}

function pathTo(world:WorldState,actor:Cultivator,origin:LocationNode,to:LocationNode,tick:number){
  const start=tileAt(world,origin),end=tileAt(world,to);
  if(!start||!end||start.id===end.id)return [];
  const known=new Set([...actor.exploredTileIds,...currentVisibleTileIds(world,actor)]);
  const sealed=sealedTiles(world),{tiles,columns,rows}=world.terrain;
  const prev=new Map<string,string|undefined>([[start.id,undefined]]);
  const queue=[start];
  for(let i=0;i<queue.length;i++){
    const current=queue[i];
    if(current.id===end.id){
      const path:string[]=[];
      for(let id:string|undefined=end.id;id;id=prev.get(id))path.push(id);
      return path.reverse();
    }
    for(const [col,row] of [[current.col,current.row-1],[current.col-1,current.row],
      [current.col+1,current.row],[current.col,current.row+1]]){
      if(col<0||col>=columns||row<0||row>=rows)continue;
      const next=tiles[row*columns+col];
      if(!next||prev.has(next.id)||!known.has(next.id)||sealed.has(next.id)||
        treacherous(next)||hazardAt(world,next.id,tick))continue;
      prev.set(next.id,current.id);
      queue.push(next);
    }
  }
  return [];
}

function reroute(world:WorldState,actor:Cultivator,tower:Tower,tick:number){
  const destinations=[...new Set(tower.bellWatch.listeners.map(row=>row.siteId))].filter(id=>id!==tower.id);
  return destinations.flatMap(id=>{
    const site=siteAt(world,id);
    if(!site)return [];
    const path=pathTo(world,actor,tower,site,tick);
    return path.length>1?[{site,path}]:[];
  }).sort((a,b)=>a.path.length-b.path.length||asc(a.site.id,b.site.id))[0];
}

function pending(world:WorldState,actor:Cultivator,tick:number){
  return ownedTowers(world).find(tower=>{
    const row=tower.bellWatch;
    return row.watcherId===actor.id&&row.damage&&row.damage.tick<tick&&!row.choice&&
      row.sectId===actor.sectId&&physical(world,actor,tower.id);
  });
}

export function availableBellWatchActions(actor:Cultivator,world:WorldState,executionTick=world.tick):BellWatchOption[]{
  if(executionTick!==world.tick&&executionTick!==world.tick+1)return [];
  if(bellWatchActedThisTick(world,actor)&&executionTick===world.tick)return [];
  const tower=pending(world,actor,executionTick);
  if(!tower)return [];
  const make=(bellWatchMove:BellWatchMove):BellWatchOption=>({
    chosenAction:'BELL_WATCH',bellWatchMove,targetBellWatchId:tower.bellWatch.id,
  });
  return reroute(world,actor,tower,executionTick)?[make('inspect'),make('reroute')]:[make('inspect')];
}

const exactPayload=new Set(['chosenAction','bellWatchMove','targetBellWatchId','innerMonologue']);

/** No location, actor, warning contents or delivery details appear in generic history. */
function shell(world:WorldState,watch:BellWatchState,kind:string):WorldEvent{
  return {id:bellWatchEventId(watch.id,kind,world.tick,bellWatchEventProof(watch,kind)),tick:world.tick,year:world.year,month:world.month,
    title:'一件寻常差事',description:'只在当事人的一章里记下这段始末。',category:'diplomacy',actorIds:[],witnessScope:'participants'};
}

export function resolveBellWatchAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='BELL_WATCH'||Object.keys(decision).some(key=>!exactPayload.has(key)))return null;
  const option=availableBellWatchActions(actor,world).find(row=>row.bellWatchMove===decision.bellWatchMove&&
    row.targetBellWatchId===decision.targetBellWatchId);
  const tower=option&&pending(world,actor,world.tick);
  if(!option||!tower)return null;
  const move=option.bellWatchMove;
  const resolution=stories.resolve(move,move,{actorId:actor.id,option:move},undefined);
  const route=resolution?.result==='reroute'?reroute(world,actor,tower,world.tick):undefined;
  if(!resolution||move==='reroute'&&!route)return null;
  tower.bellWatch.choice={move,tick:world.tick,pathIndex:0,pathTileIds:route?.path??[],destinationId:route?.site.id??tower.id};
  return shell(world,tower.bellWatch,move);
}

/** Only native movement/hazard progression may supply a registered hazard. */
export function bellWatchDamage(world:WorldState,hazard:MapHazard):WorldEvent[]{
  if(!world.mapHazards.includes(hazard)||hazard.createdTick>=world.tick||
    !routeWarningHazardValid(world,hazard,world.tick))return [];
  const winner=world.mapHazards.filter(row=>row.tileId===hazard.tileId&&row.createdTick<world.tick&&
    routeWarningHazardValid(world,row,world.tick)).sort((a,b)=>b.intensity-a.intensity||asc(a.id,b.id))[0];
  if(winner!==hazard)return [];
  return ownedTowers(world).flatMap(tower=>{
    const watch=tower.bellWatch;
    if(watch.damage||watch.openedTick>=hazard.createdTick||towerOwner(world,tower)?.id!==watch.sectId||
      tileAt(world,tower)?.id!==hazard.tileId)return [];
    const {id,kind,tileId,createdTick,expiresTick,intensity}=hazard;
    watch.damage={hazard:{id,kind,tileId,createdTick,expiresTick,intensity},tick:world.tick,integrityBefore:100,
      integrityAfter:100-intensity*20};
    return [shell(world,watch,'changed')];
  });
}

function peopleOnDuty(world:WorldState,site:LocationNode,sectId:string){
  const stationed=world.cultivators.filter(actor=>actor.sectId===sectId&&physical(world,actor,actor.locationId))
    .sort((a,b)=>asc(a.id,b.id));
  const watchers=stationed.filter(actor=>actor.locationId===site.id);
  const watch=watchers[0];
  if(!watch)return undefined;
  const listeners:BellWatchListener[]=[];
  const included=new Set<string>();
  for(const actor of [...watchers.slice(1),...stationed]){
    if(actor===watch||included.has(actor.id))continue;
    const target=siteAt(world,actor.locationId);
    if(!target||target.type==='secret_realm'||target.type==='abyss')continue;
    if(target.id!==site.id&&pathTo(world,watch,site,target,world.tick).length<2)continue;
    included.add(actor.id);
    listeners.push({actorId:actor.id,siteId:target.id});
    if(listeners.length>=8)break;
  }
  return listeners.length?{watch,listeners}:undefined;
}

function retainDuty(world:WorldState,site:LocationNode,watch:BellWatchState):boolean{
  const watcher=actorAt(world,watch.watcherId);
  return !!watcher&&watcher.sectId===watch.sectId&&physical(world,watcher,site.id)&&watch.listeners.some(row=>{
    const listener=actorAt(world,row.actorId);
    return !!listener&&listener.sectId===watch.sectId&&physical(world,listener,row.siteId);
  });
}

function receive(world:WorldState,tower:Tower,siteId:string){
  const watch=tower.bellWatch;
  for(const listener of watch.listeners){
    if(listener.siteId!==siteId||watch.receipts.some(row=>row.actorId===listener.actorId))continue;
    const actor=actorAt(world,listener.actorId);
    if(actor&&physical(world,actor,siteId))watch.receipts.push({...listener,tick:world.tick});
  }
}

function settle(world:WorldState,tower:Tower,choice:BellWatchChoice,outcome:BellWatchChoice['outcome']){
  choice.endedTick=world.tick;
  choice.outcome=outcome;
  if(outcome==='arrived'||outcome==='inspected')receive(world,tower,choice.destinationId);
  return shell(world,tower.bellWatch,'settled');
}

function safeStep(world:WorldState,id:string|undefined,sealed:Set<string>){
  const tile=world.terrain.tiles.find(tile=>tile.id===id);
  return tile&&!sealed.has(tile.id)&&!treacherous(tile)&&!hazardAt(world,tile.id,world.tick);
}

function advanceReroute(world:WorldState,tower:Tower,actor:Cultivator,choice:BellWatchChoice):WorldEvent|undefined{
  const target=siteAt(world,choice.destinationId);
  const index=choice.pathIndex;
  const sealed=sealedTiles(world);
  if(!target||!destination(tower,choice.destinationId)||tileAt(world,target)?.id!==choice.pathTileIds.at(-1)||
    !safeStep(world,choice.pathTileIds[index+1],sealed))choice.returning=true;
  if(choice.returning&&index===0)return settle(world,tower,choice,'blocked');
  const nextIndex=choice.returning?index-1:index+1;
  if(!safeStep(world,choice.pathTileIds[nextIndex],sealed))return undefined;
  choice.pathIndex=nextIndex;
  choice.lastMovedTick=world.tick;
  if(choice.returning)return nextIndex===0?settle(world,tower,choice,'blocked'):undefined;
  if(target&&nextIndex===choice.pathTileIds.length-1){
    actor.locationId=target.id;
    return settle(world,tower,choice,'arrived');
  }
  return undefined;
}

function rememberBellSilence(world:WorldState,tower:Tower):WorldEvent|undefined{
  const watch=tower.bellWatch;
  if(!watch.damage||watch.waits||world.tick!==watch.damage.tick+1)return undefined;
  const waits=watch.listeners.flatMap(listener=>{
    const actor=actorAt(world,listener.actorId);
    if(!actor||!physical(world,actor,listener.siteId)||watch.receipts.some(row=>row.actorId===listener.actorId))return [];
    return [{...listener,tick:world.tick}];
  });
  if(!waits.length)return undefined;
  watch.waits=waits;
  return shell(world,watch,'waiting');
}

/** Open duties before a later hazard; resolve one actual footstep or a local report per tick. */
export function advanceBellWatch(world:WorldState):WorldEvent[]{
  if(world.tick<1)return [];
  const events:WorldEvent[]=[];
  for(const site of world.locations){
    if(!site.bellWatch||!site.bellWatch.damage&&world.tick>=site.bellWatch.openedTick+2&&
      !retainDuty(world,site,site.bellWatch)){
      const owner=towerOwner(world,site);
      const tile=tileAt(world,site);
      const assigned=owner&&tile&&!hazardAt(world,tile.id,world.tick)&&peopleOnDuty(world,site,owner.id);
      if(owner&&assigned)site.bellWatch={id:bellWatchId(site.id,world.tick),sectId:owner.id,openedTick:world.tick,
        watcherId:assigned.watch.id,listeners:assigned.listeners,receipts:[]};
      continue;
    }
    const tower:Tower={...site,bellWatch:site.bellWatch};
    const {choice,watcherId}=tower.bellWatch;
    if(choice&&choice.tick<world.tick&&choice.endedTick===undefined&&choice.lastMovedTick!==world.tick){
      const actor=actorAt(world,watcherId);
      let event:WorldEvent|undefined;
      if(!alive(actor)||actor.locationId!==tower.id)event=settle(world,tower,choice,'absent');
      else if(choice.move==='inspect')event=settle(world,tower,choice,physical(world,actor,tower.id)?'inspected':'absent');
      else event=advanceReroute(world,tower,actor,choice);
      if(event)events.push(event);
    }
    const waiting=rememberBellSilence(world,tower);
    if(waiting)events.push(waiting);
  }
  return events;
}

export function projectBellWatch(world:WorldState,actor:Cultivator):BellWatchView|undefined{
  if(!alive(actor)||!world.cultivators.includes(actor))return undefined;
  const options=availableBellWatchActions(actor,world,world.tick+1);
  const forActor=ownedTowers(world).filter(({bellWatch})=>bellWatch.watcherId===actor.id||bellWatch.listeners.some(row=>row.actorId===actor.id));
  for(const tower of forActor.sort((a,b)=>b.bellWatch.openedTick-a.bellWatch.openedTick||asc(a.id,b.id))){
    const watch=tower.bellWatch,choice=watch.choice;
    const forWatcher=watch.watcherId===actor.id;
    const wait=watch.waits?.find(row=>row.actorId===actor.id);
    const receipt=watch.receipts.find(row=>row.actorId===actor.id);
    const title='山钟停了一夜';
    if(receipt&&world.tick<=receipt.tick+2)return {title,siteId:receipt.siteId,phase:'received',
      body:choice?.move==='inspect'?'你把茶盏往灯下推了推。查过钟楼的人回来，当面把梁木受损的消息说给你听。':
        '你原还在等钟，等到的却是来人的脚步。他当面把钟楼受损的消息说了，灯火在他肩头抖了一下。',options:[]};
    if(receipt||!watch.damage)continue;
    if(!forWatcher){
      if(wait&&world.tick>=wait.tick&&world.tick<=wait.tick+3)
        return {title:'钟声未至',siteId:wait.siteId,phase:world.tick>wait.tick?'not_received':'awaiting',
          body:'灯花落了两回，听钟的时辰已经过了。你尚未接到这一趟平安信，也不知缘故。',options:[]};
      continue;
    }
    const own=options.filter(option=>option.targetBellWatchId===watch.id);
    if(!choice&&!physical(world,actor,tower.id))continue;
    if(!choice)return {title,siteId:tower.id,phase:'pending',body:stories.definition(own.some(option=>option.bellWatchMove==='reroute')?'reroute':'inspect')?.scene.body??
      '檐下少了一声钟响。雨还未停，值守的人认得这份差事。',options:own};
    if(choice.endedTick===undefined)return {title,siteId:tower.id,phase:'travelling',
      body:choice.move==='inspect'?'你提灯去查钟梁，须等查过才能当面开口。':
        choice.returning?'熟路也遇了险，你顺已经走过的路退下，还没有人收信。':'你循走熟的山路报信。尚未抵达，不能当作有人听见。',options:[]};
    if(world.tick>choice.endedTick+2)continue;
    const delivered=watch.receipts.length>0;
    return {title,siteId:choice.outcome==='arrived'?choice.destinationId:tower.id,phase:delivered?'received':'not_received',
      body:delivered?'确有人当面收了信。没到跟前的那几人，仍只听得见各自檐下的雨。':
        '这次没能当面交付。别处仍没有人从你的脚程里听到消息。',options:[]};
  }
  return undefined;
}


/** Previously published chapters only get personally witnessed, in-window facts. */
export function projectBellWatchSideNote(world:WorldState,actor:Cultivator,startTick:number,endTick:number):BellWatchView|undefined{
  if(!world.cultivators.includes(actor)||!Number.isSafeInteger(startTick)||!Number.isSafeInteger(endTick)||
    startTick<0||endTick<startTick||endTick>world.tick)return undefined;
  const within=(tick:number|undefined):tick is number=>tick!==undefined&&tick>=startTick&&tick<=endTick;
  const notes:Array<{tick:number;view:BellWatchView}>=[];
  for(const tower of ownedTowers(world)){
    const watch=tower.bellWatch;
    const choice=watch.choice;
    const personalReceipt=watch.receipts.find(row=>row.actorId===actor.id);
    const wait=watch.waits?.find(row=>row.actorId===actor.id&&within(row.tick));
    if(personalReceipt&&within(personalReceipt.tick)){
      const receipt=personalReceipt;
      notes.push({tick:receipt.tick,view:{title:'山钟停了一夜',siteId:receipt.siteId,phase:'received',
        body:'钟声没有来。到了这一日，报信人当面说起钟楼的伤处。你这才知道缘故。',options:[]}});
    }else if(wait&&(!personalReceipt||personalReceipt.tick>wait.tick)){
      notes.push({tick:wait.tick,view:{title:'钟声未至',siteId:wait.siteId,phase:'not_received',
        body:'那一日，你在原约的地方等过。灯花落了两回，没等到钟，也没人当面带来平安信。你那时还不知缘故。',options:[]}});
    }
    if(watch.watcherId!==actor.id||!choice||!within(choice.endedTick))continue;
    const tick=choice.endedTick;
    const arrived=choice.outcome==='arrived';
    const announced=watch.receipts.some(row=>row.tick===tick);
    // An absent caster is not a witness to conditions at the tower or along the intended route.
    if(choice.outcome==='absent')continue;
    notes.push({tick,view:{title:'山钟停了一夜',siteId:arrived?choice.destinationId:tower.id,
      phase:announced?'received':'not_received',
      body:announced?'这一次没靠钟声。有人确实就在跟前，听你把钟楼受损的始末说完。':
        '这一趟没有当面交付。没有听见的人，仍不知钟为何没响。',options:[]}});
  }
  return notes.sort((a,b)=>b.tick-a.tick||asc(a.view.siteId,b.view.siteId))[0]?.view;
}
