import type {NightDoorBlock,NightDoorEncounter,NightDoorMove} from '../types/nightDoor';
import type {PilgrimageForkChoice,PilgrimageForkRecord} from '../types/pilgrimageFork';
import type {WorldEvent,WorldState} from '../types/world';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {terrainTileAt} from './terrainEngine';

export const OFFER_WINDOW=3,BED_WINDOW=2,ESCORT_WINDOW=4,ARRIVAL_WINDOW=4;
export function exactNight<T>(rows:readonly T[],predicate:(row:T)=>boolean){
  let found:T|undefined;for(const row of rows)if(predicate(row)){if(found!==undefined)return;found=row;}return found;
}
export const nightActor=(world:WorldState,id:string)=>exactNight(world.cultivators,row=>row.id===id);
export const nightSite=(world:WorldState,id:string)=>{
  const site=exactNight(world.locations,row=>row.id===id);
  return site&&site.type!=='secret_realm'&&site.type!=='abyss'&&!isScopedExpeditionGate(site)?site:undefined;
};
export const nightFork=(world:WorldState,id:string)=>exactNight(world.pilgrimageForks?.forks??[],row=>row.id===id);
export const oldChoice=(fork:PilgrimageForkRecord,id:string)=>exactNight(fork.choices,row=>row.actorId===id);
export const doorId=(forkId:string,guestId:string)=>`night-door-${forkId}-${guestId}`;
const siteTile=(world:WorldState,id:string)=>{const site=nightSite(world,id);return site&&terrainTileAt(world,site.x,site.y);};
export function adjacentNight(world:WorldState,a:string,b:string){
  const x=siteTile(world,a),y=siteTile(world,b);
  return !!x&&!!y&&Math.abs(x.col-y.col)+Math.abs(x.row-y.row)===1;
}
export const nightSafe=(world:WorldState,siteId:string,tick:number)=>{
  const tile=siteTile(world,siteId);
  return !!tile&&!world.mapHazards.some(row=>row.tileId===tile.id&&row.createdTick<=tick&&row.expiresTick>tick);
};
const clock=(world:WorldState,tick:number)=>{const m=world.year*12+world.month-1-(world.tick-tick);return {year:Math.floor(m/12),month:m%12+1};};
const when=(world:WorldState,event:WorldEvent,tick:number)=>{const d=clock(world,tick);return event.tick===tick&&event.year===d.year&&event.month===d.month;};

export function blockProof(world:WorldState,block:NightDoorBlock,fork:PilgrimageForkRecord,choice:PilgrimageForkChoice){
  const path=choice.path;
  if(!path||fork.id!==block.forkId||!fork.actors.includes(block.actorId)||choice.targetLocationId!==block.destinationId||choice.actorId!==block.actorId||choice.paidStones!==8||
    block.tick<=choice.tick||block.tick>world.tick||!Number.isSafeInteger(block.pathIndex)||block.pathIndex<1||block.pathIndex+1>=path.length||
    !choice.steps?.[block.pathIndex-1]||choice.steps[block.pathIndex-1].tick>=block.tick||
    choice.steps[block.pathIndex]&&choice.steps[block.pathIndex].tick<=block.tick||
    terrainTileAt(world,path[block.pathIndex+1].x,path[block.pathIndex+1].y)?.id!==block.hazardTileId||
    block.hazardCreatedTick>block.tick||block.hazardExpiresTick<=block.tick)return false;
  const original=world.mapHazards.filter(hazard=>hazard.id===block.hazardId);
  if(original.length>1||original[0]&&(original[0].tileId!==block.hazardTileId||original[0].intensity<2||
    original[0].createdTick!==block.hazardCreatedTick||original[0].expiresTick!==block.hazardExpiresTick))return false;
  // The only native strong hazards are actual map-brush marks; natural beast tides are severity 1.
  const marker=/^hazard-([1-9]\d*)-(tile-\d+-\d+)$/.exec(block.hazardId);
  if(!marker||marker[2]!==block.hazardTileId||Number(marker[1])>world.interventionSequence)return false;
  const rawId=`evt-brush-${marker[1]}-${marker[2]}`;
  const events=world.events.filter(event=>event.id===rawId);
  const durations:Record<string,number>={'星陨降地':3,'兽潮席卷':4,'瘴气蔓延':6};
  const detail=world.terrain.tiles.find(tile=>tile.id===block.hazardTileId);
  if(!detail)return false;
  const correctly=(event:WorldEvent)=>when(world,event,block.hazardCreatedTick)&&event.witnessScope===undefined&&
    (event.category==='heavenly'||event.category==='death')&&durations[event.title]===block.hazardExpiresTick-block.hazardCreatedTick&&
    event.description.startsWith(`地块(${detail.col+1}, ${detail.row+1})：`);
  if(events.length)return events.length===1&&correctly(events[0]);
  const archived=world.chronicleArchive.anchors.filter(event=>event.id===rawId);
  if(archived.length)return archived.length===1&&correctly(archived[0]);
  return !!original[0]||world.events.length>=120&&world.events.every(evt=>evt.tick>=block.hazardCreatedTick);
}
export function arrivalSource(world:WorldState,row:NightDoorEncounter,event:WorldEvent){
  return event.id===row.arrivalEventId&&event.id===`evt-${row.forkId}-${row.guestId}-arrived-${row.arrivalTick}`&&
    when(world,event,row.arrivalTick)&&event.locationId===row.siteId&&event.category==='diplomacy'&&
    event.witnessScope==='participants'&&event.actorIds.length===1&&event.actorIds[0]===row.guestId&&event.title==='本人实到所选停靠点';
}
export function acquaintanceSource(world:WorldState,row:NightDoorEncounter,event:WorldEvent){
  return !!row.acquaintanceId&&row.acquaintanceId!==row.guestId&&row.acquaintanceId!==row.hostId&&
    event.id===row.acquaintanceEventId&&event.id===`evt-${event.tick}-${event.actorIds[0]}-social`&&
    when(world,event,event.tick)&&event.tick<row.arrivalTick&&event.locationId===row.siteId&&event.category==='diplomacy'&&
    event.witnessScope===undefined&&event.actorIds.length===2&&event.actorIds.includes(row.acquaintanceId)&&event.actorIds.includes(row.hostId);
}
const wording:Record<NightDoorMove,{title:string;description:string}>={
  identify:{title:'来客亲报本人名姓',description:'走到这里的本人报了身份；先前只是似曾相识，没有把旧识写成来客。'},
  shelter:{title:'主人请来客暂时借宿',description:'只是本人开口相邀；没有占用席位，来客仍可不应。'},
  close:{title:'主人自行掩上门',description:'主人没有接待；没把门外的人移走，也没有替他定去处。'},
  escort:{title:'主人提出走一程邻路',description:'只是提议；对方尚未答应，双方都还没有迈步。'},
  accept:{title:'来客亲自答应眼下的提议',description:'这是来客自己的答复；借宿才入实席，同行的话还须各自走到。'},
  cross:{title:'本人真正走到了邻处',description:'这一步确已走过；另一人有没有到，须看对方自己的脚步。'},
};
export const nightEventId=(row:NightDoorEncounter,move:NightDoorMove,actorId:string,tick:number)=>`evt-${row.id}-${actorId}-${move}-${tick}`;
export const isPrivateNightDoorEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&event.id.startsWith('evt-night-door-');
export function nightReceipt(world:WorldState,row:NightDoorEncounter,move:NightDoorMove,actorId:string,tick=world.tick):WorldEvent{
  return {id:nightEventId(row,move,actorId,tick),tick,...clock(world,tick),category:'diplomacy',witnessScope:'participants',
    actorIds:[actorId],locationId:move==='cross'?row.offer?.refugeId:row.siteId,...wording[move]};
}
export function nightReceiptMatches(world:WorldState,row:NightDoorEncounter,move:NightDoorMove,actorId:string,tick:number,event:WorldEvent){
  const expected=nightReceipt(world,row,move,actorId,tick);
  return event.id===expected.id&&when(world,event,tick)&&event.category===expected.category&&isPrivateNightDoorEvent(event)&&
    event.actorIds.length===1&&event.actorIds[0]===actorId&&event.locationId===expected.locationId&&
    event.title===expected.title&&event.description===expected.description;
}

export function validateNightDoorSave(world:WorldState,fail:(path:string)=>never):void{
  const ledger=world.nightDoors;
  if(!ledger)return;
  if(!ledger.blocks.length)fail('nightDoors.empty');
  const pairs=new Set<string>(),doors=new Set<string>(),knownEvents=new Set<string>();
  const key=(forkId:string,actorId:string)=>JSON.stringify([forkId,actorId]);
  const byPair=new Map<string,NightDoorBlock>();
  const hot=(tick:number)=>world.events.length<120||world.events.some(event=>event.tick<tick);
  const exactDate=(tick:number,after=0)=>Number.isSafeInteger(tick)&&tick>after&&tick<=world.tick;
  for(const block of ledger.blocks){
    const k=key(block.forkId,block.actorId),fork=nightFork(world,block.forkId),choice=fork&&oldChoice(fork,block.actorId);
    if(pairs.has(k)||!fork||!choice||!nightActor(world,block.actorId)||!nightSite(world,block.destinationId)||
      !exactDate(block.tick)||!exactDate(block.hazardCreatedTick)||!Number.isSafeInteger(block.hazardExpiresTick)||
      !blockProof(world,block,fork,choice))fail('nightDoors.block');
    pairs.add(k);byPair.set(k,block);
  }
  for(const row of ledger.encounters){
    const k=key(row.forkId,row.guestId),block=byPair.get(k),fork=nightFork(world,row.forkId),choice=fork&&oldChoice(fork,row.guestId);
    const guest=nightActor(world,row.guestId),host=nightActor(world,row.hostId);
    const member=exactNight(world.households.members,item=>item.recruitedId===row.hostId);
    const village=exactNight(world.settlements.villages,item=>item.id===row.villageId&&item.locationId===row.siteId);
    const shelter=exactNight(world.villageWorks.projects,item=>item.id===row.shelterProjectId);
    if(doors.has(row.id)||!block||!fork||!choice||!guest||!host||!village||row.hostId===row.guestId||
      !member||member.householdId!==row.hostHouseholdId||member.settlementId!==row.villageId||
      member.status!=='recruited'&&!(member.status==='deceased'&&!host.alive&&host.hp===0)||
      !shelter||shelter.kind!=='shelter'||shelter.status!=='completed'||shelter.settlementId!==row.villageId||
      shelter.settledTick===undefined||shelter.settledTick>=row.arrivalTick||
      choice.status!=='arrived'||choice.steps?.at(-1)?.tick!==row.arrivalTick||choice.targetLocationId!==row.siteId||
      !exactDate(row.arrivalTick,block.tick)||row.siteId!==block.destinationId||row.id!==doorId(row.forkId,row.guestId)||
      row.arrivalEventId!==`evt-${row.forkId}-${row.guestId}-arrived-${row.arrivalTick}`)fail('nightDoors.origin');
    doors.add(row.id);
    const arrivals=world.events.filter(event=>event.id===row.arrivalEventId);
    if(arrivals.length>1||!arrivals.length&&hot(row.arrivalTick)||arrivals[0]&&!arrivalSource(world,row,arrivals[0]))
      fail('nightDoors.arrival');
    if(!!row.acquaintanceId!==!!row.acquaintanceEventId||row.acquaintanceId&&(!nightActor(world,row.acquaintanceId)||
      row.acquaintanceId===row.hostId||row.acquaintanceId===row.guestId))fail('nightDoors.acquaintance');
    if(row.acquaintanceEventId){
      const events=world.events.filter(event=>event.id===row.acquaintanceEventId);
      const sourceTick=Number(/^evt-([1-9]\d*)-/.exec(row.acquaintanceEventId)?.[1]);
      if(!Number.isSafeInteger(sourceTick)||sourceTick>=row.arrivalTick||events.length>1||!events.length&&hot(sourceTick)||
        events[0]&&!acquaintanceSource(world,row,events[0]))fail('nightDoors.acquaintanceSource');
    }
    const check=(move:NightDoorMove,actorId:string,tick:number)=>{
      const id=nightEventId(row,move,actorId,tick),events=world.events.filter(event=>event.id===id);
      if(knownEvents.has(id)||events.length>1||!events.length&&hot(tick)||events[0]&&!nightReceiptMatches(world,row,move,actorId,tick,events[0]))
        fail('nightDoors.action');
      knownEvents.add(id);
    };
    const promptDate=(tick:number)=>exactDate(tick,row.arrivalTick)&&tick-row.arrivalTick<=ARRIVAL_WINDOW;
    if(row.identifiedTick!==undefined){
      if(!promptDate(row.identifiedTick))fail('nightDoors.identified');
      check('identify',row.guestId,row.identifiedTick);
    }
    if(row.closedTick!==undefined){
      if(!promptDate(row.closedTick)||row.offer?.acceptedTick!==undefined)fail('nightDoors.closed');
      check('close',row.hostId,row.closedTick);
    }
    const offer=row.offer;
    if(!offer)continue;
    if(!promptDate(offer.tick)||row.closedTick!==undefined&&row.closedTick<=offer.tick||
      (offer.move==='escort'?(!offer.refugeId||!adjacentNight(world,row.siteId,offer.refugeId)):offer.refugeId!==undefined))
      fail('nightDoors.offer');
    check(offer.move,row.hostId,offer.tick);
    if(offer.acceptedTick===undefined){
      if(offer.expiresTick!==undefined||offer.crossed!==undefined)fail('nightDoors.acceptance');
      continue;
    }
    if(!promptDate(offer.acceptedTick)||offer.acceptedTick<=offer.tick||offer.acceptedTick-offer.tick>OFFER_WINDOW||
      offer.acceptedTick===row.identifiedTick||offer.expiresTick!==offer.acceptedTick+(offer.move==='shelter'?BED_WINDOW:ESCORT_WINDOW))
      fail('nightDoors.acceptance');
    check('accept',row.guestId,offer.acceptedTick);
    if(offer.crossed){
      const crossed=new Set<string>();
      if(offer.move!=='escort'||!offer.crossed.length||offer.crossed.length>2)fail('nightDoors.cross');
      for(const step of offer.crossed){
        if(crossed.has(step.actorId)||step.actorId!==row.hostId&&step.actorId!==row.guestId||
          !exactDate(step.tick,offer.acceptedTick)||step.tick>=offer.expiresTick!)fail('nightDoors.cross');
        crossed.add(step.actorId);check('cross',step.actorId,step.tick);
      }
    }
  }
  for(const event of world.events)if(event.id.startsWith('evt-night-door-')&&!knownEvents.has(event.id))fail('nightDoors.orphan');
}
