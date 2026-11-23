import type {Cultivator,LLMDecisionPayload,LocationNode,SectSiege,WorldEvent,WorldState} from '../types/world';
import type {GrandSiegeRound} from '../types/grandSiege';
import type {VacantGateOption,VacantGateRecord,VacantGateView,VacantGateWardProof} from '../types/vacantGate';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {GUARD_DURATION} from './siteDutyTerms';
import {roundEventId} from './grandSiegeProof';
import {knownMapLocations,noteTerrainVisit,terrainTileAt} from './terrainEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';

export type {VacantGateOption,VacantGateView} from '../types/vacantGate';
const QI=8, WALL_SAVING=16;
const formal=new Set(['掌门','内门弟子','真传弟子','长老','太上长老']);
const senior=new Set(['真传弟子','长老','太上长老']);
const only=<T extends {id:string}>(rows:readonly T[],id:string)=>{const found=rows.filter(row=>row.id===id);return found.length===1?found[0]:undefined;};
const actorAt=(world:WorldState,id:string)=>only(world.cultivators,id);
const siteAt=(world:WorldState,id:string)=>only(world.locations,id);
const date=(world:WorldState,row:WorldEvent,tick:number)=>{
  const month=world.year*12+world.month-1-(world.tick-tick);
  return row.tick===tick&&row.year===Math.floor(month/12)&&row.month===month%12+1;
};
const receiptId=(row:VacantGateRecord)=>`evt-${row.roundTick}-vacant-gate-${row.siegeId}-${row.actorId}-${row.move}`;
const appealId=(row:VacantGateRecord)=>`${receiptId(row)}-appeal`;
const appealWords={title:'近处传来撤离请求',description:'同门请仍在阵前的人各自斟酌是否撤下；这不是号令，也没有替任何人答应。'} as const;
const words={
  guard:{title:'无令时亲手撑阵',description:'这一轮实付八点灵气，护山阵少受一份冲击；无人凭此登位。'},
  withdraw:{title:'自行撤到相邻安全处',description:'只有本人在这轮前退到近处，没有替同门决定去留。'},
} as const;
export const isPrivateVacantGateEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&/^evt-\d+-vacant-gate-/.test(event.id);

function nativeLoss(world:WorldState,siteId:string,actorId:string,lossTick:number,event:WorldEvent):boolean{
  if(!date(world,event,lossTick)||event.category!=='death'||event.witnessScope!==undefined||event.locationId!==siteId||
    event.actorIds.filter(id=>id===actorId).length!==1||event.damage?.filter(hit=>hit.cultivatorId===actorId&&hit.amount>0).length!==1)return false;
  const site=siteAt(world,siteId),tile=site&&terrainTileAt(world,site.x,site.y);
  if(!tile)return false;
  if(/^evt-brush-[1-9]\d*-tile-\d+-\d+$/.test(event.id)&&event.id.endsWith(`-${tile.id}`)&&event.title==='星陨降地')
    return true;
  return event.actorIds.length===2&&event.id===`evt-${lossTick}-${event.actorIds[0]}-kill`&&
    !!event.duelWinnerId&&event.duelWinnerId!==actorId&&event.actorIds.includes(event.duelWinnerId);
}
function loss(world:WorldState,siege:SectSiege,tick:number){
  const defence=only(world.sects,siege.defenderSectId),site=siteAt(world,siege.destinationId);
  if(only(world.sieges,siege.id)!==siege||siege.status!=='sieging'||siege.theatre?.arrivedTick===undefined||
    siege.theatre.arrivedTick>=tick||siege.theatre.terminal||!defence||!site||defence.headquartersId!==site.id||
    site.ownerSectId!==defence.id||defence.arrayHp<=0||!defence.leaderId||isScopedExpeditionGate(site))return;
  const arrival=only(world.events,roundEventId(siege.theatre.arrivedTick,siege.id));
  if(!arrival||!date(world,arrival,siege.theatre.arrivedTick)||arrival.title!=='联军抵达山门'||
    arrival.category!=='diplomacy'||arrival.witnessScope!==undefined||arrival.locationId!==site.id||
    arrival.actorIds.length<1||new Set(arrival.actorIds).size!==arrival.actorIds.length||
    arrival.actorIds.some(id=>!siege.participantIds.includes(id)))return;
  const leader=actorAt(world,defence.leaderId);
  const lossTick=tick-1;
  const deathOf=(actor:Cultivator|undefined)=>{
    if(!actor||actor.alive||actor.hp!==0||actor.sectId!==defence.id||actor.locationId!==site.id)return;
    const hits=world.events.filter(event=>nativeLoss(world,site.id,actor.id,lossTick,event));
    return hits.length===1&&only(world.events,hits[0].id)===hits[0]?hits[0]:undefined;
  };
  const origin=deathOf(leader);
  if(origin&&leader)return {site,lost:leader,lossTick,source:origin,role:'leader' as const};
  if(!leader?.alive||leader.hp<=0)return;
  const candidates=world.events.filter(event=>event.tick===lossTick&&event.id.endsWith('-guard_duty')).flatMap(event=>{
    const guard=event.actorIds.length===1?actorAt(world,event.actorIds[0]):undefined;
    const source=deathOf(guard);
    if(!guard||!source||guard.id===leader.id)return [];
    return world.events.filter(dispatch=>dispatch.tick<lossTick&&dispatch.tick+GUARD_DURATION>lossTick&&
      dispatch.id===`evt-${dispatch.tick}-${leader.id}-dispatch_guard`).flatMap(dispatch=>{
      const wardProof={dispatcherId:leader.id,dispatchTick:dispatch.tick,dutyTick:lossTick};
      return wardSources(world,site,guard,wardProof,false)?[{site,lost:guard,lossTick,source,wardProof,role:'ward_keeper' as const}]:[];
    });
  });
  return candidates.length===1?candidates[0]:undefined;
}

function wardSources(world:WorldState,site:LocationNode,guard:Cultivator,proof:VacantGateWardProof,allowCold:boolean):boolean{
  const dispatcher=actorAt(world,proof.dispatcherId);
  if(!dispatcher||dispatcher.id===guard.id||!Number.isSafeInteger(proof.dispatchTick)||proof.dispatchTick<1||
    !Number.isSafeInteger(proof.dutyTick)||proof.dutyTick<=proof.dispatchTick||proof.dutyTick>=proof.dispatchTick+GUARD_DURATION)return false;
  const dispatchId=`evt-${proof.dispatchTick}-${dispatcher.id}-dispatch_guard`;
  const dutyId=`evt-${proof.dutyTick}-${guard.id}-guard_duty`;
  const exact=(id:string,tick:number,match:(event:WorldEvent)=>boolean)=>{
    const rows=world.events.filter(event=>event.id===id);
    if(rows.length===0)return allowCold&&world.events.length>=120&&world.events.every(event=>event.tick>=tick);
    return rows.length===1&&date(world,rows[0],tick)&&rows[0].category==='diplomacy'&&
      rows[0].witnessScope===undefined&&rows[0].locationId===site.id&&match(rows[0]);
  };
  return exact(dispatchId,proof.dispatchTick,event=>event.title==='奉令镇守'&&event.actorIds.length===2&&
    event.actorIds[0]===dispatcher.id&&event.actorIds[1]===guard.id&&
    event.description===`${dispatcher.name}派${guard.name}镇守${site.name}，至第${proof.dispatchTick+GUARD_DURATION}轮卸任。`)&&
    exact(dutyId,proof.dutyTick,event=>event.title==='巡守灵脉'&&event.actorIds.length===1&&event.actorIds[0]===guard.id&&
      event.description===`${guard.name}巡守${site.name}，获得宗门贡献。`);
}

function refuge(world:WorldState,actor:Cultivator,site:LocationNode,tick:number){
  const from=terrainTileAt(world,site.x,site.y);
  if(!from)return;
  return knownMapLocations(world,actor).filter(place=>{
    if(siteAt(world,place.id)!==place||place.type==='abyss'||place.type==='secret_realm'||isScopedExpeditionGate(place)||
      place.ownerSectId&&place.ownerSectId!==site.ownerSectId)return false;
    const to=terrainTileAt(world,place.x,place.y);
    return !!to&&to.biome!=='魔渊'&&to.biome!=='毒沼'&&Math.abs(to.col-from.col)+Math.abs(to.row-from.row)===1&&
      !world.mapHazards.some(hazard=>hazard.tileId===to.id&&hazard.createdTick<=tick&&hazard.expiresTick>tick);
  }).sort((a,b)=>a.id<b.id?-1:1)[0];
}
function optionsFor(actor:Cultivator,world:WorldState,siege:SectSiege,tick:number):VacantGateOption[]{
  if(!formal.has(actor.sectRank??'')||actor.positionPlane!==undefined||actorAt(world,actor.id)!==actor||
    actor.sectId!==siege.defenderSectId||actor.locationId!==siege.destinationId||siege.participantIds.includes(actor.id)||
    !isGrandSiegeFighterPresent(world,actor,siege.destinationId))return [];
  const source=loss(world,siege,tick);
  if(!source||source.role==='leader'&&!senior.has(actor.sectRank??'')||siege.theatre?.queued?.actorId===actor.id)return [];
  const saw=source.source.actorIds.includes(actor.id)||
    actor.rumors.some(rumor=>rumor.id===`rumor-${source.source.id}`&&rumor.originEventId===source.source.id&&
      rumor.provenance==='witness'&&rumor.hops===0&&rumor.confidence===100&&rumor.learnedTick===source.lossTick&&
      rumor.originTick===source.lossTick&&rumor.originSourceCultivatorId===actor.id&&rumor.witnessScope===undefined);
  if(!saw)return [];
  const standard={action:'VACANT_GATE',targetVacantGateSiegeId:siege.id} as const;
  const choices:VacantGateOption[]=[];
  if(actor.qiProgress>=QI)choices.push({...standard,vacantGateMove:'guard'});
  const exit=refuge(world,actor,source.site,tick);
  if(exit)choices.push({...standard,vacantGateMove:'withdraw',targetLocationId:exit.id});
  return choices;
}

const staged=new WeakMap<WorldState,Map<string,VacantGateOption>>();
export function availableVacantGateActions(actor:Cultivator,world:WorldState,tick=world.tick+1):VacantGateOption[]{
  if((tick!==world.tick&&tick!==world.tick+1)||!formal.has(actor.sectRank??'')||!actor.alive)return [];
  return world.sieges.flatMap(siege=>siege.status==='sieging'&&siege.defenderSectId===actor.sectId&&
    siege.destinationId===actor.locationId?optionsFor(actor,world,siege,tick):[]);
}
export function stageVacantGateAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):boolean{
  if(decision.chosenAction!=='VACANT_GATE'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','vacantGateMove','targetVacantGateSiegeId','targetLocationId'].includes(key)))return false;
  const menu=availableVacantGateActions(actor,world,world.tick);
  const option=menu.find(row=>row.targetVacantGateSiegeId===decision.targetVacantGateSiegeId&&
    row.vacantGateMove===decision.vacantGateMove&&row.targetLocationId===decision.targetLocationId);
  if(!option)return false;
  const leaders=staged.get(world)??new Map<string,VacantGateOption>();
  if(leaders.has(actor.id))return false;
  leaders.set(actor.id,option);staged.set(world,leaders);return true;
}
type RoundIntent={row:VacantGateRecord;actor:Cultivator;option:VacantGateOption};
export function prepareVacantGateRound(world:WorldState,siege:SectSiege,defenders:readonly Cultivator[]):RoundIntent[]{
  const orders=staged.get(world);
  if(!orders?.size)return [];
  const source=loss(world,siege,world.tick);
  if(!source)return [];
  return defenders.flatMap(actor=>{
    const option=orders.get(actor.id);
    if(!option||option.targetVacantGateSiegeId!==siege.id||!optionsFor(actor,world,siege,world.tick).some(row=>
      row.vacantGateMove===option.vacantGateMove&&row.targetLocationId===option.targetLocationId))return [];
    orders.delete(actor.id);
    const row:VacantGateRecord={siegeId:siege.id,siteId:source.site.id,lostActorId:source.lost.id,lostRole:source.role,
      ...('wardProof' in source?{wardProof:source.wardProof}:{}),lossTick:source.lossTick,lossEventId:source.source.id,roundTick:world.tick,roundEventId:roundEventId(world.tick,siege.id),
      actorId:actor.id,move:option.vacantGateMove,paidQi:0};
    if(option.vacantGateMove==='withdraw'){
      row.destinationId=option.targetLocationId;
      const listeners=defenders.filter(peer=>peer.id!==actor.id&&optionsFor(peer,world,siege,world.tick)
        .some(candidate=>candidate.vacantGateMove==='withdraw')).map(peer=>peer.id).sort();
      if(listeners.length)row.requestedActorIds=[...new Set(listeners)];
    }
    return [{row,actor,option}];
  });
}
export function commitVacantGateWithdrawals(world:WorldState,intents:readonly RoundIntent[]):void{
  for(const {actor,option} of intents)if(option.vacantGateMove==='withdraw'){
    actor.locationId=option.targetLocationId;noteTerrainVisit(world,actor);
  }
}
export function applyVacantGateGuards(world:WorldState,round:GrandSiegeRound,intents:readonly RoundIntent[],harm:number):number{
  let residual=Math.min(round.wallBefore,harm);
  for(const intent of intents){
    const {row,actor}=intent;
    if(row.move!=='guard'||row.roundTick!==world.tick||row.roundEventId!==round.sourceEventId||
      residual<=0||actor.qiProgress<QI||!round.defenders.some(member=>member.actorId===actor.id))continue;
    row.wallSaved=Math.min(WALL_SAVING,residual);
    row.paidQi=QI;actor.qiProgress-=QI;residual-=row.wallSaved;
  }
  return residual<Math.min(round.wallBefore,harm)?residual:harm;
}
export function recordVacantGateRound(world:WorldState,round:GrandSiegeRound,intents:readonly RoundIntent[]):WorldEvent[]{
  if(!intents.length)return [];
  const siege=only(world.sieges,intents[0].row.siegeId);
  if(!siege?.theatre?.rounds.includes(round))return [];
  return intents.flatMap(({row,actor})=>{
    if(row.roundTick!==world.tick||round.sourceEventId!==row.roundEventId||row.move==='guard'&&row.paidQi!==QI||
      row.move==='withdraw'&&(!row.destinationId||round.defenders.some(member=>member.actorId===row.actorId)))return [];
    (world.vacantGate??={records:[]}).records.push(row);
    actor.currentAction='VACANT_GATE';
    actor.innerMonologue=row.move==='guard'?'这一轮由我照实守住。':'我先退到近处，不替旁人作主。';
    const proof:WorldEvent={id:receiptId(row),tick:world.tick,year:world.year,month:world.month,category:'heavenly',
      actorIds:[row.actorId],locationId:row.destinationId??row.siteId,witnessScope:'participants',...words[row.move]};
    return row.requestedActorIds?.length?[{
      ...proof,id:appealId(row),actorIds:[row.actorId,...row.requestedActorIds],locationId:row.siteId,...appealWords,
    },proof]:[proof];
  });
}
export function projectVacantGate(world:WorldState,actor:Cultivator):VacantGateView|undefined{
  if(actorAt(world,actor.id)!==actor||!actor.alive||actor.positionPlane!==undefined)return;
  const options=availableVacantGateActions(actor,world);
  const own=world.vacantGate?.records.filter(row=>row.actorId===actor.id&&row.roundTick===world.tick&&
    (row.destinationId??row.siteId)===actor.locationId)??[];
  const receipt=own.length===1&&only(world.events,receiptId(own[0]));
  const heard=(world.vacantGate?.records??[]).find(row=>row.roundTick===world.tick&&
    (row.siteId===actor.locationId||own.some(other=>other.siegeId===row.siegeId&&other.move==='withdraw'))&&
    row.requestedActorIds?.includes(actor.id)&&
    validAppeal(world,row,only(world.events,appealId(row))));
  const notice=heard?appealWords.description:undefined;
  const site=siteAt(world,own[0]?.siteId??actor.locationId);
  if(!site)return;
  if(options.length){
    const siege=only(world.sieges,options[0].targetVacantGateSiegeId);
    const source=siege&&loss(world,siege,world.tick+1);
    if(source)return {siteName:site.name,lostRole:source.role,options,...(notice?{notice}:{})};
  }
  if(receipt&&isPrivateVacantGateEvent(receipt)&&receipt.actorIds.length===1&&receipt.actorIds[0]===actor.id&&
    receipt.title===words[own[0].move].title&&receipt.description===words[own[0].move].description)
    return {siteName:site.name,lostRole:own[0].lostRole,options:[],receipt:{title:receipt.title,description:receipt.description},...(notice?{notice}:{})};
  if(heard&&notice)return {siteName:site.name,lostRole:heard.lostRole,options:[],notice};
}

function validAppeal(world:WorldState,row:VacantGateRecord,event:WorldEvent|undefined):boolean{
  return !!event&&!!row.requestedActorIds?.length&&date(world,event,row.roundTick)&&isPrivateVacantGateEvent(event)&&
    event.category==='heavenly'&&event.locationId===row.siteId&&event.title===appealWords.title&&
    event.description===appealWords.description&&event.actorIds.length===row.requestedActorIds.length+1&&
    event.actorIds[0]===row.actorId&&row.requestedActorIds.every((id,index)=>event.actorIds[index+1]===id);
}

export function validateVacantGateSave(world:WorldState,fail:(path:string)=>never):void{
  const records=new Set<string>();
  for(const row of world.vacantGate?.records??[]){
    const key=receiptId(row),siege=only(world.sieges,row.siegeId);
    const rounds=siege?.theatre?.rounds.filter(round=>round.tick===row.roundTick);
    const round=rounds?.length===1?rounds[0]:undefined;
    const fallen=actorAt(world,row.lostActorId),responded=actorAt(world,row.actorId);
    const site=siteAt(world,row.siteId);
    if(records.has(key)||!siege||!round||!site||!fallen||fallen.alive||fallen.hp!==0||!responded||row.actorId===fallen.id||
      row.siteId!==siege.destinationId||row.lossTick+1!==row.roundTick||
      row.roundTick>world.tick||row.roundEventId!==round.sourceEventId||row.roundEventId!==roundEventId(row.roundTick,row.siegeId))
      fail('vacantGate.record');
    if(row.lostRole==='ward_keeper'){
      if(!row.wardProof||row.wardProof.dutyTick!==row.lossTick||!wardSources(world,site,fallen,row.wardProof,true))fail('vacantGate.ward');
    }else if(row.lostRole!=='leader'||row.wardProof!==undefined)fail('vacantGate.role');
    const death=world.events.filter(event=>event.id===row.lossEventId);
    if(death.length>1||death[0]&&!nativeLoss(world,row.siteId,row.lostActorId,row.lossTick,death[0]))
      fail('vacantGate.loss');
    const original=world.events.filter(event=>event.id===row.roundEventId);
    if(original.length>1||original[0]&&(!date(world,original[0],row.roundTick)||original[0].locationId!==row.siteId||
      original[0].witnessScope!==undefined||original[0].category!=='diplomacy'))fail('vacantGate.round');
    if(row.move==='guard'){
      if(row.paidQi!==QI||row.wallSaved===undefined||!Number.isSafeInteger(row.wallSaved)||row.wallSaved<1||
        row.wallSaved>Math.min(WALL_SAVING,round.wallBefore)||row.destinationId!==undefined||
        round.defenders.filter(member=>member.actorId===row.actorId&&member.sectId===siege.defenderSectId).length!==1)
        fail('vacantGate.guard');
    }else{
      const refuge=row.destinationId?siteAt(world,row.destinationId):undefined;
      const from=terrainTileAt(world,site.x,site.y),to=refuge&&terrainTileAt(world,refuge.x,refuge.y);
      if(!from||!to||Math.abs(from.col-to.col)+Math.abs(from.row-to.row)!==1||row.paidQi!==0||
        row.wallSaved!==undefined||round.defenders.some(member=>member.actorId===row.actorId))fail('vacantGate.withdraw');
    }
    if(row.requestedActorIds!==undefined){
      const recipients=row.requestedActorIds;
      if(row.move!=='withdraw'||!recipients.length||recipients.some((id,index)=>id===row.actorId||id===row.lostActorId||
        index>0&&recipients[index-1]>=id||!actorAt(world,id)||!(
          round.defenders.some(member=>member.actorId===id&&member.sectId===siege.defenderSectId)||
          world.vacantGate?.records.some(peer=>peer.roundTick===row.roundTick&&peer.siegeId===row.siegeId&&
            peer.actorId===id&&peer.move==='withdraw'))))fail('vacantGate.appealRecipients');
      const id=appealId(row),appeals=world.events.filter(event=>event.id===id);
      if(appeals.length>1||appeals[0]&&!validAppeal(world,row,appeals[0])||!appeals.length&&
        (world.events.length<120||world.events.some(event=>event.tick<row.roundTick)))fail('vacantGate.appeal');
      records.add(id);
    }
    const receipts=world.events.filter(event=>event.id===key);
    if(receipts.length>1||receipts[0]&&(!date(world,receipts[0],row.roundTick)||!isPrivateVacantGateEvent(receipts[0])||
      receipts[0].locationId!==(row.destinationId??row.siteId)||receipts[0].category!=='heavenly'||
      receipts[0].actorIds.length!==1||receipts[0].actorIds[0]!==row.actorId||
      receipts[0].title!==words[row.move].title||receipts[0].description!==words[row.move].description))fail('vacantGate.receipt');
    records.add(key);
  }
  for(const event of world.events)if(/^evt-\d+-vacant-gate-/.test(event.id)&&!records.has(event.id))fail('vacantGate.orphan');
}
