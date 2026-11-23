import type {BoundaryGapMove,BoundaryGapResponse} from '../types/boundaryGap';
import type {BoundaryRelief,WorldEvent,WorldState} from '../types/world';
export const GAP_QI=6,GAP_HP_MAX=12,GAP_WINDOW=4;
export function onlyGap<T>(rows:readonly T[],test:(row:T)=>boolean){
  let match:T|undefined;for(const row of rows)if(test(row)){if(match!==undefined)return;match=row;}
  return match;
}
export const gapActor=(world:WorldState,id:string)=>onlyGap(world.cultivators,row=>row.id===id);
export const gapSite=(world:WorldState,id:string)=>onlyGap(world.locations,row=>row.id===id);
export const nativeRelief=(world:WorldState,id:string)=>onlyGap(world.boundaryReliefs.cases,row=>row.id===id);
export const gapRows=(world:WorldState)=>world.boundaryGapResponses?.responses??[];
const clock=(world:WorldState,tick:number)=>{const months=world.year*12+world.month-1-(world.tick-tick);return {year:Math.floor(months/12),month:months%12+1};};
export function gapEventAt(world:WorldState,event:WorldEvent,tick:number){
  const d=clock(world,tick);return event.tick===tick&&event.year===d.year&&event.month===d.month;
}
const words:Record<BoundaryGapMove|'applied',{title:string;description:string}>={
  cover:{title:'本人准备临时护住在场者',description:'只备下一道护势，没有获任守备，也未扣灵气。'},
  refuse:{title:'本人不接临时照护',description:'没有代他人拒绝，也没有改变正式岗旗和来人的路。'},
  stay:{title:'本人留在空档关口',description:'只留本人在原地，不把留守者算作正式授任的守备。'},
  applied:{title:'临时护势挡下实际一击',description:'实付六点灵气，挡下本轮冲向现场一人的部分伤害。原来的换防空档并未抹掉。'},
};
export const gapEventId=(row:BoundaryGapResponse,kind:BoundaryGapMove|'applied',tick:number)=>
  `evt-boundary-gap-${row.reliefId}-${row.actorId}-${kind}-${tick}`;
export const isPrivateBoundaryGapEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&event.id.startsWith('evt-boundary-gap-');
export function gapReceipt(world:WorldState,row:BoundaryGapResponse,kind:BoundaryGapMove|'applied',tick=world.tick):WorldEvent{
  const line=words[kind];
  return {id:gapEventId(row,kind,tick),tick,...clock(world,tick),category:'diplomacy',witnessScope:'participants',
    actorIds:kind==='applied'&&row.targetCultivatorId!==row.actorId?[row.actorId,row.targetCultivatorId!]:[row.actorId],
    locationId:row.postSiteId,title:line.title,description:kind==='applied'?`${line.description}实减${row.applied?.preventedHp}点。`:line.description};
}
export function matchesGapReceipt(world:WorldState,row:BoundaryGapResponse,kind:BoundaryGapMove|'applied',tick:number,event:WorldEvent){
  const expected=gapReceipt(world,row,kind,tick);
  return event.id===expected.id&&gapEventAt(world,event,tick)&&event.category===expected.category&&event.locationId===expected.locationId&&
    isPrivateBoundaryGapEvent(event)&&event.title===expected.title&&event.description===expected.description&&
    event.actorIds.length===expected.actorIds.length&&event.actorIds.every((id,i)=>id===expected.actorIds[i]);
}
export function gapTerminalSource(world:WorldState,row:BoundaryRelief,kind:'handover'|'returned'){
  const tick=row.closedTick;
  if(tick===undefined)return;
  const event=onlyGap(world.events,event=>event.id===`evt-${row.id}-${tick}-${kind}`);
  return event&&gapEventAt(world,event,tick)&&event.category==='diplomacy'&&event.witnessScope==='participants'&&
    event.locationId===(kind==='handover'?row.postSiteId:row.originSiteId)&&
    event.title===(kind==='handover'?'候补实到关口后完成换防':'候补沿实路返回山门')&&
    event.description===(kind==='handover'?'只在实际走到原约定岗点时任命原候补；未发放战利品或额外位阶。':'没有任命或瞬移；已行进的气力不返还。')&&
    event.actorIds.length===3&&[row.leaderId,row.incumbentId,row.incomingId].every((id,index)=>event.actorIds[index]===id)?event:undefined;
}
export function validateBoundaryGapSave(world:WorldState,fail:(path:string)=>never):void{
  const data=world.boundaryGapResponses;
  if(!data)return;
  if(!data.responses.length)fail('boundaryGapResponses.empty');
  const choices=new Set<string>(),known=new Set<string>(),applied=new Set<string>();
  const fresh=(tick:number)=>world.events.length<120||world.events.some(event=>event.tick<tick);
  for(const row of data.responses){
    const relief=nativeRelief(world,row.reliefId),actor=gapActor(world,row.actorId),site=gapSite(world,row.postSiteId);
    const key=JSON.stringify([row.reliefId,row.actorId]);
    if(choices.has(key)||!relief||!actor||!site||relief.postSiteId!==site.id||relief.firstGapTick!==row.gapTick||
      !Number.isSafeInteger(row.tick)||row.gapTick>=row.tick||row.tick-row.gapTick>GAP_WINDOW||row.tick>world.tick||
      relief.acceptedTick===undefined||row.gapTick<=relief.acceptedTick||row.actorId===relief.incomingId||
      relief.status==='completed'&&relief.closedTick!==undefined&&row.tick>relief.closedTick)
      fail('boundaryGapResponses.origin');
    choices.add(key);
    if(row.move==='cover'?(!row.targetCultivatorId||!gapActor(world,row.targetCultivatorId)):
      row.targetCultivatorId!==undefined||row.applied!==undefined)fail('boundaryGapResponses.target');
    function check(kind:BoundaryGapMove|'applied',tick:number){
      const id=gapEventId(row,kind,tick),events=world.events.filter(event=>event.id===id);
      if(events.length>1||!events.length&&fresh(tick)||events[0]&&!matchesGapReceipt(world,row,kind,tick,events[0]))
        fail('boundaryGapResponses.receipt');
      known.add(id);
    }
    check(row.move,row.tick);
    if(row.applied){
      const result=row.applied,sourceId=`evt-${result.tick}-${result.hazardId}`;
      const raw=world.events.filter(event=>event.id===sourceId);
      const unique=JSON.stringify([result.tick,result.hazardId,row.targetCultivatorId]);
      if(applied.has(unique)||row.move!=='cover'||result.tick!==row.tick+1||result.tick>world.tick||
        !Number.isSafeInteger(result.preventedHp)||result.preventedHp<1||result.preventedHp>GAP_HP_MAX||
        relief.status==='completed'&&relief.closedTick!==undefined&&result.tick>relief.closedTick||
        raw.length>1||!raw.length&&fresh(result.tick)||raw[0]&&(!gapEventAt(world,raw[0],result.tick)||
          raw[0].witnessScope!==undefined||!['瘴气蔓延','兽潮席卷'].includes(raw[0].title)||
          !raw[0].damage?.some(hit=>hit.cultivatorId===row.targetCultivatorId&&hit.amount>0)))fail('boundaryGapResponses.applied');
      applied.add(unique);check('applied',result.tick);
    }
  }
  for(const event of world.events)if(event.id.startsWith('evt-boundary-gap-')&&!known.has(event.id))fail('boundaryGapResponses.orphan');
}
