import type {Cultivator,LLMDecisionPayload,MortalSettlement,MortalVolunteer,WorldEvent,WorldState} from '../types/world';
import type {VillageReunionMove,VillageReunionOption,VillageReunionPair,VillageReunionView} from '../types/villageReunion';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {recordMemory} from './memoryEngine';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
export type {VillageReunionMove,VillageReunionOption,VillageReunionView} from '../types/villageReunion';

const WINDOW=24, OFFER_TURNS=2;
const unique=<T>(rows:readonly T[],accept:(row:T)=>boolean)=>{let one:T|undefined;for(const row of rows)if(accept(row)){if(one)return;one=row;}return one;};
const person=(world:WorldState,id:string|undefined)=>id?unique(world.cultivators,row=>row.id===id):undefined;
const villageAt=(world:WorldState,id:string)=>unique(world.settlements.villages,row=>row.id===id);
const site=(world:WorldState,id:string)=>unique(world.locations,row=>row.id===id);
const recruitId=(villageId:string,id:string,tick:number)=>`settlement-${tick}-recruitment-${villageId}-${id}`;
const pairId=(first:string,second:string)=>`village-reunion-${first}--${second}`;
const idAt=(pair:VillageReunionPair,tick:number,action:string,actorId:string)=>`evt-${tick}-${pair.id}-${actorId}-${action}`;
const validVenue=(world:WorldState,id:string)=>{const place=site(world,id);return place?.type==='market'&&!isScopedExpeditionGate(place)?place:undefined;};
const aMember=(world:WorldState,id:string)=>unique(world.households.members,row=>row.volunteerId===id);
const isParty=(pair:VillageReunionPair,id:string)=>id===pair.firstActorId||id===pair.secondActorId;
const owns=(world:WorldState,actor:Cultivator)=>person(world,actor.id)===actor&&actor.alive&&actor.hp>0&&actor.positionPlane===undefined;
const present=(world:WorldState,actor:Cultivator,id:string)=>owns(world,actor)&&isGrandSiegeFighterPresent(world,actor,id);
const paired=(world:WorldState,pair:VillageReunionPair,actor:Cultivator,id:string)=>{
  const other=person(world,actor.id===pair.firstActorId?pair.secondActorId:pair.firstActorId);
  return isParty(pair,actor.id)&&other&&present(world,actor,id)&&present(world,other,id)?other:undefined;
};
type Speech={title:string;description:string};
const words:Record<VillageReunionMove|'arrival'|'refund',Speech>={
  arrival:{title:'坊市重遇旧时同乡',description:'先后自同一凡村入门的两人，今日在这座坊市亲自重逢。只是同乡，不以此断定亲族。'},
  remember:{title:'自己记下这次重逢',description:'在坊市认出曾同住一村的人。只记这一次照面，不替对方许诺。'},
  part:{title:'自己道别，各走各路',description:'本人说过别话；没有替别人决定行程，也没有结下新盟。'},
  offer:{title:'自愿留一枚灵石',description:'本人先把一枚灵石留作心意，等同乡另行应允；尚未交付。'},
  accept:{title:'亲自应允这份心意',description:'这次亲自应允，实际收下一枚灵石；不是立约或入盟。'},
  refund:{title:'未应允的心意退回原主',description:'先留下的一枚灵石未交给同乡，已退回原主。'},
};
export const isPrivateVillageReunionEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&/^evt-\d+-village-reunion-/.test(event.id);
const clock=(world:WorldState,tick:number)=>{const t=world.year*12+world.month-1-(world.tick-tick);return{year:Math.floor(t/12),month:t%12+1};};
function makeEvent(world:WorldState,pair:VillageReunionPair,actorId:string,move:keyof typeof words,actorIds:string[]):WorldEvent{
  return {id:idAt(pair,world.tick,move,actorId),tick:world.tick,...clock(world,world.tick),category:'diplomacy',
    locationId:pair.arrival!.siteId,actorIds,witnessScope:'participants',...words[move]};
}
function matches(world:WorldState,event:WorldEvent,pair:VillageReunionPair,tick:number,actorId:string,
  move:keyof typeof words,actorIds:string[]){
  const date=clock(world,tick);
  return event.id===idAt(pair,tick,move,actorId)&&event.tick===tick&&event.year===date.year&&event.month===date.month&&
    event.category==='diplomacy'&&event.locationId===pair.arrival?.siteId&&isPrivateVillageReunionEvent(event)&&
    event.title===words[move].title&&event.description===words[move].description&&
    event.actorIds.length===actorIds.length&&actorIds.every((id,i)=>event.actorIds[i]===id);
}

const MIN_SHARED_RESIDENCE_TURNS=3;

export function villageReunionBeforeRecruit(world:WorldState,village:MortalSettlement,volunteer:MortalVolunteer){
  const own=aMember(world,volunteer.id);
  if(own?.status!=='resident'||own.settlementId!==village.id||volunteer.age<18||volunteer.enlistedCultivatorId)return [];
  return village.volunteers.flatMap(other=>{
    if(other.id===volunteer.id||other.age<18||other.enlistedCultivatorId)return [];
    const member=aMember(world,other.id);
    return member?.status==='resident'&&member.settlementId===village.id&&member.householdId!==own.householdId&&
      world.tick-Math.max(own.registeredTick,member.registeredTick)>=MIN_SHARED_RESIDENCE_TURNS?
      [{secondVolunteerId:other.id,firstHouseholdId:own.householdId,secondHouseholdId:member.householdId}]:[];
  });
}
function hasRecruit(world:WorldState,villageId:string,volunteerId:string,householdId:string,actorId:string,recruiterId:string,tick:number){
  const member=aMember(world,volunteerId);
  const native=unique(world.settlements.records,row=>row.id===recruitId(villageId,volunteerId,tick));
  const recruit=person(world,actorId);
  const linked=member?.status==='recruited'&&member.settledTick===tick||
    member?.status==='deceased'&&recruit?.alive===false&&recruit.hp===0&&member.settledTick!==undefined&&
      member.settledTick>=tick&&member.settledTick<=world.tick;
  return actorId===`recruit-${volunteerId}`&&!!recruit&&!!person(world,recruiterId)&&actorId!==recruiterId&&
    tick<=world.tick&&member?.householdId===householdId&&member.settlementId===villageId&&linked&&
    member.recruitedId===actorId&&member.registeredTick<=tick&&
    native?.kind==='recruitment'&&native.tick===tick&&native.settlementId===villageId&&native.volunteerId===volunteerId&&
    native.actorId===recruiterId&&native.cultivatorId===actorId&&native.stones===25&&native.people===1&&native.herbs===0;
}
export function villageReunionAfterRecruit(world:WorldState,village:MortalSettlement,volunteer:MortalVolunteer,
  recruit:Cultivator,recruiter:Cultivator,overlap:ReturnType<typeof villageReunionBeforeRecruit>){
  if(!overlap.length&&!world.villageReunions)return;
  const state=world.villageReunions??={pairs:[]};
  for(const pair of state.pairs){
    if(pair.villageId!==village.id||pair.secondVolunteerId!==volunteer.id||pair.secondActorId||
      pair.firstRecruitTick>=world.tick||world.tick-pair.firstRecruitTick>WINDOW||
      !hasRecruit(world,village.id,volunteer.id,pair.secondHouseholdId,recruit.id,recruiter.id,world.tick))continue;
    pair.secondActorId=recruit.id;pair.secondRecruitTick=world.tick;pair.secondRecruiterId=recruiter.id;
  }
  for(const item of overlap)if(hasRecruit(world,village.id,volunteer.id,item.firstHouseholdId,recruit.id,recruiter.id,world.tick)){
    state.pairs.push({id:pairId(volunteer.id,item.secondVolunteerId),villageId:village.id,firstVolunteerId:volunteer.id,
      firstRecruitTick:world.tick,firstRecruiterId:recruiter.id,firstActorId:recruit.id,...item});
  }
}
export function villageReunionPinnedRecruitmentIds(world:WorldState){
  const ids:string[]=[];
  for(const pair of world.villageReunions?.pairs??[]){
    ids.push(recruitId(pair.villageId,pair.firstVolunteerId,pair.firstRecruitTick));
    if(pair.secondRecruitTick!==undefined)ids.push(recruitId(pair.villageId,pair.secondVolunteerId,pair.secondRecruitTick));
  }
  return ids;
}
export function recordVillageReunionMovement(world:WorldState,actor:Cultivator,fromSiteId:string):WorldEvent|undefined{
  const state=world.villageReunions;
  if(!state||actor.currentAction!=='EXPLORE'||fromSiteId===actor.locationId||!site(world,fromSiteId)||!validVenue(world,actor.locationId))return;
  for(const pair of state.pairs){
    const village=villageAt(world,pair.villageId);
    if(pair.arrival||!village||pair.secondRecruitTick===undefined||pair.secondRecruitTick>=world.tick||
      world.tick-pair.secondRecruitTick>WINDOW||village.locationId===actor.locationId)continue;
    const other=paired(world,pair,actor,actor.locationId);
    if(!other)continue;
    pair.arrival={tick:world.tick,siteId:actor.locationId,fromSiteId,actorId:actor.id};
    return makeEvent(world,pair,actor.id,'arrival',[pair.firstActorId,pair.secondActorId!]);
  }
}
function pending(pair:VillageReunionPair){
  return pair.refundTick===undefined&&!pair.decisions?.some(row=>row.move==='accept')?
    pair.decisions?.find(row=>row.move==='offer'):undefined;
}
function livePair(world:WorldState,pair:VillageReunionPair,actor:Cultivator,tick:number){
  const arrival=pair.arrival;
  if(!arrival||!pair.secondActorId||arrival.tick>=tick||tick-arrival.tick>WINDOW||!validVenue(world,arrival.siteId))return;
  const source=unique(world.events,event=>event.id===idAt(pair,arrival.tick,'arrival',arrival.actorId));
  return source&&matches(world,source,pair,arrival.tick,arrival.actorId,'arrival',[pair.firstActorId,pair.secondActorId])&&
    paired(world,pair,actor,arrival.siteId);
}
export function availableVillageReunionActions(actor:Cultivator,world:WorldState,tick=world.tick+1):VillageReunionOption[]{
  if(!world.villageReunions||(tick!==world.tick&&tick!==world.tick+1)||!owns(world,actor))return [];
  for(const pair of world.villageReunions.pairs){
    if(!isParty(pair,actor.id)||!livePair(world,pair,actor,tick)||
      pair.decisions?.some(row=>row.actorId===actor.id||row.move==='part'))continue;
    const options:VillageReunionMove[]=['remember','part'];
    const offer=pending(pair);
    if(offer&&offer.actorId!==actor.id&&offer.tick<tick&&tick<=offer.expiresTick!)options.push('accept');
    else if(!pair.decisions?.length&&actor.spiritStones>=1)options.push('offer');
    return options.map(villageReunionMove=>({action:'VILLAGE_REUNION',targetVillageReunionId:pair.id,villageReunionMove}));
  }
  return [];
}
export function resolveVillageReunionAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='VILLAGE_REUNION'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','targetVillageReunionId','villageReunionMove'].includes(key)))return null;
  const option=availableVillageReunionActions(actor,world,world.tick).find(row=>
    row.targetVillageReunionId===decision.targetVillageReunionId&&row.villageReunionMove===decision.villageReunionMove);
  const pair=option&&unique(world.villageReunions?.pairs??[],row=>row.id===option.targetVillageReunionId);
  if(!option||!pair)return null;
  const move=option.villageReunionMove,offer=pending(pair);
  actor.currentAction='VILLAGE_REUNION';
  if(move==='offer')actor.spiritStones--;
  if(move==='remember')recordMemory(actor,world.tick,'记下这一次意外的照面，仍各自走自己的路。',5,'cultivation',1);
  if(move==='accept')actor.spiritStones++;
  (pair.decisions??=[]).push({actorId:actor.id,tick:world.tick,move,...(move==='offer'?{expiresTick:world.tick+OFFER_TURNS}:{})});
  const actors=move==='accept'?[actor.id,offer!.actorId]:move==='offer'?[actor.id,actor.id===pair.firstActorId?pair.secondActorId!:pair.firstActorId]:[actor.id];
  return makeEvent(world,pair,actor.id,move,actors);
}
export function advanceVillageReunions(world:WorldState):WorldEvent[]{
  const state=world.villageReunions;
  if(!state)return [];
  state.pairs=state.pairs.filter(pair=>{
    if(pair.secondActorId)return true;
    const remaining=aMember(world,pair.secondVolunteerId),first=person(world,pair.firstActorId);
    return world.tick-pair.firstRecruitTick<=WINDOW&&first?.alive&&first.hp>0&&remaining?.status==='resident'&&
      remaining.settlementId===pair.villageId&&remaining.householdId===pair.secondHouseholdId;
  });
  const events:WorldEvent[]=[];
  for(const pair of state.pairs){
    const offer=pending(pair);
    if(!offer)continue;
    const proposer=person(world,offer.actorId);
    if(proposer&&(!pair.arrival||!paired(world,pair,proposer,pair.arrival.siteId)||world.tick>=offer.expiresTick!||
      pair.decisions?.some(row=>row.move==='part'||row.actorId!==proposer.id&&row.move==='remember'))){
      proposer.spiritStones++;pair.refundTick=world.tick;
      events.push(makeEvent(world,pair,proposer.id,'refund',[proposer.id]));
    }
  }
  if(!state.pairs.length)delete world.villageReunions;
  return events;
}
export function projectVillageReunion(world:WorldState,actor:Cultivator):VillageReunionView|undefined{
  if(!world.villageReunions||!owns(world,actor))return;
  const options=availableVillageReunionActions(actor,world);
  for(const pair of world.villageReunions.pairs){
    const arrival=pair.arrival,place=arrival&&validVenue(world,arrival.siteId),village=villageAt(world,pair.villageId);
    if(!arrival||!place||!village||!present(world,actor,place.id)||!isParty(pair,actor.id))continue;
    if(options.length&&options[0].targetVillageReunionId!==pair.id)continue;
    const expected:{tick:number;id:string;move:keyof typeof words;actors:string[]}[]=[];
    const peer=actor.id===pair.firstActorId?pair.secondActorId!:pair.firstActorId;
    expected.push({tick:arrival.tick,id:arrival.actorId,move:'arrival',actors:[pair.firstActorId,pair.secondActorId!]});
    for(const row of pair.decisions??[]){
      if(row.actorId!==actor.id&&row.move!=='offer'&&row.move!=='accept')continue;
      expected.push({tick:row.tick,id:row.actorId,move:row.move,actors:row.move==='offer'||row.move==='accept'?
        [row.actorId,row.actorId===actor.id?peer:actor.id]:[actor.id]});
    }
    if(pair.refundTick!==undefined&&pair.decisions?.some(row=>row.actorId===actor.id&&row.move==='offer'))
      expected.push({tick:pair.refundTick,id:actor.id,move:'refund',actors:[actor.id]});
    const seen=expected.filter(row=>row.tick===world.tick&&!!unique(world.events,event=>event.id===idAt(pair,row.tick,row.move,row.id))&&
      matches(world,unique(world.events,event=>event.id===idAt(pair,row.tick,row.move,row.id))!,pair,row.tick,row.id,row.move,row.actors)).at(-1);
    if(options.length||seen)return {siteId:place.id,siteName:place.name,villageName:village.name,options,...(seen?{receipt:words[seen.move]}:{})};
  }
}

export function validateVillageReunionSave(world:WorldState,fail:(path:string)=>never){
  const state=world.villageReunions;
  if(!state)return;
  if(!state.pairs.length)fail('villageReunions.empty');
  const ids=new Set<string>(),eventIds=new Set<string>();
  const hot=(tick:number)=>world.events.length<120||world.events.some(row=>row.tick<tick);
  for(const pair of state.pairs){
    const village=villageAt(world,pair.villageId),first=aMember(world,pair.firstVolunteerId),second=aMember(world,pair.secondVolunteerId);
    if(ids.has(pair.id)||pair.id!==pairId(pair.firstVolunteerId,pair.secondVolunteerId)||
      !village||pair.firstVolunteerId===pair.secondVolunteerId||pair.firstHouseholdId===pair.secondHouseholdId||
      !hasRecruit(world,pair.villageId,pair.firstVolunteerId,pair.firstHouseholdId,pair.firstActorId,pair.firstRecruiterId,pair.firstRecruitTick)||
      !first||!second||second.householdId!==pair.secondHouseholdId||second.settlementId!==village.id||
      pair.firstRecruitTick-Math.max(first.registeredTick,second.registeredTick)<MIN_SHARED_RESIDENCE_TURNS||second.settledTick!==undefined&&second.settledTick<pair.firstRecruitTick)
      fail('villageReunions.origin');
    ids.add(pair.id);
    if(pair.secondActorId!==undefined){
      if(!pair.secondRecruiterId||pair.secondRecruitTick===undefined||pair.secondRecruitTick<=pair.firstRecruitTick||
        pair.secondRecruitTick-pair.firstRecruitTick>WINDOW||
        !hasRecruit(world,pair.villageId,pair.secondVolunteerId,pair.secondHouseholdId,pair.secondActorId,pair.secondRecruiterId,pair.secondRecruitTick))
        fail('villageReunions.second');
    }else if(pair.secondRecruiterId!==undefined||pair.secondRecruitTick!==undefined||pair.arrival||
      world.tick-pair.firstRecruitTick>WINDOW)fail('villageReunions.incomplete');
    const arrival=pair.arrival;
    if(!arrival){
      if(pair.decisions!==undefined||pair.refundTick!==undefined)fail('villageReunions.arrival');
      continue;
    }
    if(!pair.secondActorId||pair.secondRecruitTick===undefined||arrival.tick<=pair.secondRecruitTick||
      arrival.tick-pair.secondRecruitTick>WINDOW||arrival.tick>world.tick||!isParty(pair,arrival.actorId)||
      !site(world,arrival.fromSiteId)||arrival.siteId===arrival.fromSiteId||arrival.siteId===village.locationId||
      !validVenue(world,arrival.siteId))fail('villageReunions.arrival');
    const requireEvent=(tick:number,actorId:string,move:keyof typeof words,actors:string[])=>{
      const id=idAt(pair,tick,move,actorId),rows=world.events.filter(event=>event.id===id);
      if(eventIds.has(id)||rows.length>1||!rows.length&&hot(tick)||
        rows[0]&&!matches(world,rows[0],pair,tick,actorId,move,actors))fail('villageReunions.receipt');
      eventIds.add(id);
    };
    requireEvent(arrival.tick,arrival.actorId,'arrival',[pair.firstActorId,pair.secondActorId]);
    const decisions=pair.decisions??[],owners=new Set<string>();
    let lastTick=arrival.tick,offer:NonNullable<VillageReunionPair['decisions']>[number]|undefined,accepted=false,parted=false;
    if(pair.decisions&&!decisions.length||decisions.length>2)fail('villageReunions.decisions');
    for(const row of decisions){
      if(parted||!isParty(pair,row.actorId)||owners.has(row.actorId)||row.tick<=arrival.tick||row.tick<lastTick||
        row.tick>world.tick||row.tick-arrival.tick>WINDOW||row.move!=='offer'&&row.expiresTick!==undefined)fail('villageReunions.decision');
      const peer=row.actorId===pair.firstActorId?pair.secondActorId:pair.firstActorId;
      if(row.move==='offer'){
        if(offer||owners.has(peer)||row.expiresTick!==row.tick+OFFER_TURNS)fail('villageReunions.offer');
        offer=row;
      }
      if(row.move==='accept'){
        if(!offer||row.tick<=offer.tick||row.tick>offer.expiresTick!||accepted)fail('villageReunions.accept');
        accepted=true;
      }
      if(row.move==='part')parted=true;
      requireEvent(row.tick,row.actorId,row.move,row.move==='accept'||row.move==='offer'?[row.actorId,peer]:[row.actorId]);
      owners.add(row.actorId);lastTick=row.tick;
    }
    if(pair.refundTick!==undefined){
      if(!offer||accepted||pair.refundTick<offer.tick||pair.refundTick>world.tick||pair.refundTick>offer.expiresTick!)
        fail('villageReunions.refund');
      requireEvent(pair.refundTick,offer.actorId,'refund',[offer.actorId]);
    }else if(offer&&!accepted&&world.tick>=offer.expiresTick!)fail('villageReunions.expiry');
  }
  for(const event of world.events)if(/^evt-\d+-village-reunion-/.test(event.id)&&!eventIds.has(event.id))fail('villageReunions.orphan');
}
