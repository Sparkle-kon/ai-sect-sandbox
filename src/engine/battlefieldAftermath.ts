import type {Cultivator,LLMDecisionPayload,SectSiege,WorldEvent,WorldState} from '../types/world';
import type {BattlefieldAftermathApproach,BattlefieldAftermathCase,BattlefieldAftermathMove,BattlefieldAftermathOption,BattlefieldAftermathView} from '../types/battlefieldAftermath';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {projectSiegeWitness} from './grandSiegeWitnessView';
import {roundEventId} from './grandSiegeProof';
import {knownMapLocations} from './terrainEngine';
export type {BattlefieldAftermathMove,BattlefieldAftermathOption,BattlefieldAftermathView} from '../types/battlefieldAftermath';

const APPROACH_WINDOW=24, AFTERMATH_WINDOW=4, CARE_WINDOW=2, CARE_QI=6, CARE_HP=12;
const exact=<T>(rows:readonly T[],test:(row:T)=>boolean)=>{let one:T|undefined;for(const row of rows)if(test(row)){if(one!==undefined)return;one=row;}return one;};
const body=(world:WorldState,id:string)=>exact(world.cultivators,actor=>actor.id===id);
const venue=(world:WorldState,id:string)=>{
  const site=exact(world.locations,row=>row.id===id);
  return site&&site.type!=='secret_realm'&&!isScopedExpeditionGate(site)?site:undefined;
};
const canonical=(world:WorldState,actor:Cultivator)=>body(world,actor.id)===actor&&actor.alive&&actor.hp>0&&actor.positionPlane===undefined;
const present=(world:WorldState,actor:Cultivator,siteId:string)=>canonical(world,actor)&&isGrandSiegeFighterPresent(world,actor,siteId);
const state=(world:WorldState)=>world.battlefieldAftermath??={approaches:[],cases:[]};
const idAt=(siegeId:string,actorId:string)=>`battlefield-aftermath-${siegeId}-${actorId}`;
const privateId=(row:BattlefieldAftermathCase,decision:NonNullable<BattlefieldAftermathCase['decision']>)=>
  `evt-${decision.tick}-${row.id}-${decision.move}`;
const clock=(world:WorldState,tick:number)=>{const absolute=world.year*12+world.month-1-(world.tick-tick);return{year:Math.floor(absolute/12),month:absolute%12+1};};
const rightDate=(world:WorldState,event:WorldEvent,tick:number)=>{
  const date=clock(world,tick);return event.tick===tick&&event.year===date.year&&event.month===date.month;
};
export const isPrivateBattlefieldAftermathEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&/^evt-\d+-battlefield-aftermath-/.test(event.id);

function closeSeparatedCase(world:WorldState,row:BattlefieldAftermathCase,actor:Cultivator){
  if(!row.decision&&row.leftTick===undefined&&row.actorId===actor.id&&
    world.tick>row.terminalTick&&world.tick-row.terminalTick<=AFTERMATH_WINDOW&&
    (actor.positionPlane!==undefined||actor.locationId!==row.siteId))row.leftTick=world.tick;
}

export function recordBattlefieldAftermathApproach(world:WorldState,actor:Cultivator,fromSiteId:string):void{
  if(fromSiteId!==actor.locationId&&actor.currentAction==='EXPLORE'&&body(world,actor.id)===actor)
    for(const row of world.battlefieldAftermath?.cases??[])if(row.siteId===fromSiteId)closeSeparatedCase(world,row,actor);
  const site=venue(world,actor.locationId),prior=venue(world,fromSiteId);
  if(actor.currentAction!=='EXPLORE'||!site||!prior||site.id===prior.id||!present(world,actor,site.id))return;
  const sect=exact(world.sects,row=>row.id===actor.sectId&&row.headquartersId===site.id&&site.ownerSectId===row.id);
  if(!sect||!world.diplomacy.some(row=>row.pact==='war'&&(row.sectAId===sect.id||row.sectBId===sect.id)))return;
  const rows=state(world).approaches;
  const previous=rows.findIndex(row=>row.actorId===actor.id);
  const stamp={actorId:actor.id,defenderSectId:sect.id,siteId:site.id,fromSiteId:prior.id,tick:world.tick};
  if(previous<0)rows.push(stamp);else if(rows[previous].tick<world.tick)rows[previous]=stamp;
}

function original(world:WorldState,siege:SectSiege,event:WorldEvent){
  const term=siege.theatre?.terminal,last=siege.theatre?.rounds.at(-1);
  return !!term?.battlefield&&(term.status==='victory'||term.status==='repelled')&&term.status===siege.status&&
    last?.tick===term.tick&&last.sourceEventId===term.sourceEventId&&event.id===roundEventId(term.tick,siege.id)&&
    event.id===term.sourceEventId&&event.witnessScope===undefined&&event.locationId===siege.destinationId&&
    event.category==='diplomacy'&&rightDate(world,event,term.tick)&&
    event.title===(term.status==='victory'?'攻山告捷':'攻山退兵')&&!!venue(world,siege.destinationId);
}
export function recordBattlefieldAftermathTerminal(world:WorldState,events:readonly WorldEvent[]):void{
  if(world.battlefieldAftermath){
    const ledger=world.battlefieldAftermath;
    for(const row of ledger.cases){
      if(row.decision||row.leftTick!==undefined||world.tick<=row.terminalTick||world.tick-row.terminalTick>AFTERMATH_WINDOW)continue;
      const actor=body(world,row.actorId);if(actor)closeSeparatedCase(world,row,actor);
    }
    ledger.approaches=ledger.approaches.filter(row=>world.tick-row.tick<=APPROACH_WINDOW&&body(world,row.actorId)?.alive);
    if(!ledger.approaches.length&&!ledger.cases.length)delete world.battlefieldAftermath;
  }
  for(const siege of world.sieges){
    const terminal=siege.theatre?.terminal,last=siege.theatre?.rounds.at(-1);
    if(!terminal?.battlefield||terminal.tick!==world.tick||!last)continue;
    const event=exact(world.events,row=>row.id===terminal.sourceEventId);
    if(!event||exact(events,row=>row.id===event.id)!==event||!original(world,siege,event))continue;
    for(const member of [...last.attackers,...last.defenders]){
      const actor=body(world,member.actorId);
      if(!actor||!present(world,actor,siege.destinationId)||!projectSiegeWitness(world,siege,actor)?.rounds.some(row=>row.sourceId===event.id))continue;
      const id=idAt(siege.id,actor.id),ledger=state(world);
      if(ledger.cases.some(row=>row.id===id))continue;
      const approach=exact(ledger.approaches,row=>row.actorId===actor.id&&row.defenderSectId===siege.defenderSectId&&
        row.siteId===siege.destinationId&&row.tick<terminal.tick&&terminal.tick-row.tick<=APPROACH_WINDOW);
      ledger.cases.push({id,siegeId:siege.id,siteId:siege.destinationId,actorId:actor.id,terminalTick:terminal.tick,
        terminalEventId:event.id,...(approach?{approach:{tick:approach.tick,fromSiteId:approach.fromSiteId}}:{})});
    }
  }
}
function active(world:WorldState,row:BattlefieldAftermathCase,actor:Cultivator,tick:number){
  if(row.actorId!==actor.id||row.leftTick!==undefined||row.terminalTick>=tick||tick-row.terminalTick>AFTERMATH_WINDOW||!present(world,actor,row.siteId))return;
  const siege=exact(world.sieges,siege=>siege.id===row.siegeId),event=exact(world.events,event=>event.id===row.terminalEventId);
  return siege&&event&&original(world,siege,event)&&projectSiegeWitness(world,siege,actor)?.rounds.some(round=>round.sourceId===event.id)?row:undefined;
}
const heal=(actor:Cultivator)=>Math.min(CARE_HP,Math.max(0,actor.maxHp-actor.hp));
function careDonor(world:WorldState,recipient:BattlefieldAftermathCase,tick:number){
  return (world.battlefieldAftermath?.cases??[]).filter(row=>row.siegeId===recipient.siegeId&&row.actorId!==recipient.actorId&&
    row.decision?.move==='offer_care'&&row.decision.targetCultivatorId===recipient.actorId&&row.decision.tick<tick&&
    tick-row.decision.tick<=CARE_WINDOW).find(row=>{
      const donor=body(world,row.actorId);
      return !!donor&&donor.qiProgress>=CARE_QI&&!!active(world,row,donor,tick);
    });
}
export function availableBattlefieldAftermathActions(actor:Cultivator,world:WorldState,tick=world.tick+1):BattlefieldAftermathOption[]{
  if(!world.battlefieldAftermath||!canonical(world,actor)||(tick!==world.tick&&tick!==world.tick+1))return [];
  for(const row of world.battlefieldAftermath.cases){
    if(row.decision||!active(world,row,actor,tick))continue;
    const base={action:'BATTLEFIELD_AFTERMATH',targetBattlefieldAftermathId:row.id} as const;
    const options:BattlefieldAftermathOption[]=[{...base,battlefieldAftermathMove:'remain'}];
    if(row.approach&&knownMapLocations(world,actor).some(place=>place.id===row.approach?.fromSiteId)&&
      venue(world,row.approach.fromSiteId))options.push({...base,battlefieldAftermathMove:'return',targetLocationId:row.approach.fromSiteId});
    const donor=heal(actor)>0?careDonor(world,row,tick):undefined;
    if(donor)options.push({...base,battlefieldAftermathMove:'accept_care',targetCultivatorId:donor.actorId});
    else if(actor.qiProgress>=CARE_QI){
      const injured=world.battlefieldAftermath.cases.flatMap(current=>{
        if(current.siegeId!==row.siegeId||current.actorId===actor.id||current.decision)return [];
        const peer=body(world,current.actorId);
        return peer&&heal(peer)>0&&active(world,current,peer,tick)?[peer]:[];
      }).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||(a.id<b.id?-1:1))[0];
      if(injured)options.push({...base,battlefieldAftermathMove:'offer_care',targetCultivatorId:injured.id});
    }
    return options;
  }
  return [];
}
const wording:Record<BattlefieldAftermathMove,{title:string;description:string}>={
  remain:{title:'本人留在阵痕之旁',description:'这一月仍留在真正接战的地方；没有替同门发号，也没有收取战功。'},
  return:{title:'沿旧路回到来处',description:'本人确实离开了战地，回到曾经来过的原处；没有让同门随行。'},
  offer_care:{title:'问一声愿不愿疗伤',description:'本人只提出照料；尚未耗费灵气，也没有替伤者答应。'},
  accept_care:{title:'亲自答应并受了一次疗护',description:'伤者另行答应后，照料的人实付六点灵气，伤者实际恢复了一些气血。'},
};
function eventFor(world:WorldState,row:BattlefieldAftermathCase):WorldEvent{
  const decision=row.decision!;
  const words=wording[decision.move];
  const description=decision.move==='accept_care'
    ?`伤者另行答应后，照料的人实付六点灵气，伤者实际恢复了${decision.healedHp}点气血。`:words.description;
  return {id:privateId(row,decision),tick:decision.tick,...clock(world,decision.tick),category:'heavenly',witnessScope:'participants',
    actorIds:decision.targetCultivatorId?[row.actorId,decision.targetCultivatorId]:[row.actorId],
    locationId:decision.targetLocationId??row.siteId,title:words.title,description};
}
function matches(world:WorldState,row:BattlefieldAftermathCase,event:WorldEvent){
  const expected=eventFor(world,row);
  return event.id===expected.id&&rightDate(world,event,expected.tick)&&event.category===expected.category&&
    event.witnessScope===expected.witnessScope&&event.locationId===expected.locationId&&event.title===expected.title&&
    event.description===expected.description&&event.actorIds.length===expected.actorIds.length&&
    event.actorIds.every((id,index)=>id===expected.actorIds[index]);
}
export function resolveBattlefieldAftermathAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload,
  returnNative:(siteId:string)=>boolean):WorldEvent|null{
  if(decision.chosenAction!=='BATTLEFIELD_AFTERMATH'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','battlefieldAftermathMove','targetBattlefieldAftermathId','targetLocationId','targetCultivatorId'].includes(key)))return null;
  const option=availableBattlefieldAftermathActions(actor,world,world.tick).find(row=>
    row.targetBattlefieldAftermathId===decision.targetBattlefieldAftermathId&&row.battlefieldAftermathMove===decision.battlefieldAftermathMove&&
    row.targetLocationId===decision.targetLocationId&&row.targetCultivatorId===decision.targetCultivatorId);
  const row=option&&exact(world.battlefieldAftermath?.cases??[],row=>row.id===option.targetBattlefieldAftermathId);
  if(!row||!option)return null;
  const move=option.battlefieldAftermathMove;
  if(move==='return'&&(!returnNative(option.targetLocationId)||actor.locationId!==option.targetLocationId||actor.locationId===row.siteId))return null;
  let healedHp:number|undefined;
  if(move==='accept_care'){
    const donor=body(world,option.targetCultivatorId),healed=heal(actor);
    if(!donor||healed<=0||donor.qiProgress<CARE_QI)return null;
    donor.qiProgress-=CARE_QI;actor.hp+=healed;healedHp=healed;
  }
  row.decision={move,tick:world.tick,
    ...(option.targetCultivatorId?{targetCultivatorId:option.targetCultivatorId}:{}),
    ...(option.targetLocationId?{targetLocationId:option.targetLocationId}:{}),...(healedHp!==undefined?{healedHp}:{})};
  actor.currentAction='BATTLEFIELD_AFTERMATH';
  return eventFor(world,row);
}
export function projectBattlefieldAftermath(world:WorldState,actor:Cultivator):BattlefieldAftermathView|undefined{
  if(!world.battlefieldAftermath||!canonical(world,actor))return;
  const options=availableBattlefieldAftermathActions(actor,world);
  for(const row of world.battlefieldAftermath.cases){
    if(row.actorId!==actor.id&&row.decision?.targetCultivatorId!==actor.id)continue;
    const site=venue(world,row.siteId),decision=row.decision;
    if(!site||!present(world,actor,row.actorId===actor.id&&decision?.move==='return'?decision.targetLocationId!:site.id))continue;
    if(options.length&&options[0].targetBattlefieldAftermathId===row.id)return {siteId:site.id,siteName:site.name,options};
    if(decision?.tick===world.tick){
      const event=exact(world.events,event=>event.id===privateId(row,decision));
      if(event&&matches(world,row,event))return {siteId:site.id,siteName:site.name,options:[],receipt:{title:event.title,description:event.description}};
    }
  }
}

export function validateBattlefieldAftermathSave(world:WorldState,fail:(path:string)=>never){
  const ledger=world.battlefieldAftermath;
  if(!ledger)return;
  if(!ledger.approaches.length&&!ledger.cases.length)fail('battlefieldAftermath.empty');
  const dates=(tick:number)=>Number.isSafeInteger(tick)&&tick>=1&&tick<=world.tick;
  const hot=(tick:number)=>world.events.length<120||world.events.some(event=>event.tick<tick);
  const approachIds=new Set<string>(),cases=new Map<string,BattlefieldAftermathCase>(),receipts=new Set<string>();
  const truthfulApproach=(row:Pick<BattlefieldAftermathApproach,'siteId'|'tick'|'fromSiteId'>)=>
    dates(row.tick)&&row.siteId!==row.fromSiteId&&!!venue(world,row.siteId)&&!!venue(world,row.fromSiteId);
  for(const row of ledger.approaches){
    if(approachIds.has(row.actorId)||!body(world,row.actorId)||!truthfulApproach(row)||world.tick-row.tick>APPROACH_WINDOW||
      !exact(world.sects,sect=>sect.id===row.defenderSectId))fail('battlefieldAftermath.approach');
    approachIds.add(row.actorId);
  }
  for(const row of ledger.cases){
    const siege=exact(world.sieges,siege=>siege.id===row.siegeId),actor=body(world,row.actorId);
    const terminal=siege?.theatre?.terminal,last=siege?.theatre?.rounds.at(-1);
    if(cases.has(row.id)||row.id!==idAt(row.siegeId,row.actorId)||!siege||!actor||!venue(world,row.siteId)||
      row.siteId!==siege.destinationId||!dates(row.terminalTick)||!terminal?.battlefield||
      terminal.tick!==row.terminalTick||terminal.sourceEventId!==row.terminalEventId||terminal.status!==siege.status||
      (terminal.status!=='victory'&&terminal.status!=='repelled')||last?.tick!==row.terminalTick||last.sourceEventId!==row.terminalEventId||
      [...last.attackers,...last.defenders].filter(member=>member.actorId===row.actorId).length!==1||
      row.terminalEventId!==roundEventId(row.terminalTick,row.siegeId))fail('battlefieldAftermath.case');
    const sources=world.events.filter(event=>event.id===row.terminalEventId);
    if(sources.length>1||!sources.length&&hot(row.terminalTick)||sources[0]&&!original(world,siege,sources[0]))
      fail('battlefieldAftermath.terminal');
    if(row.approach){
      const latest=ledger.approaches.find(approach=>approach.actorId===row.actorId);
      if(!truthfulApproach({siteId:row.siteId,...row.approach})||row.approach.tick>=row.terminalTick||
        row.terminalTick-row.approach.tick>APPROACH_WINDOW||!last.defenders.some(member=>member.actorId===row.actorId&&
          member.sectId===siege.defenderSectId)||latest&&latest.tick<=row.terminalTick&&
        (latest.tick!==row.approach.tick||latest.fromSiteId!==row.approach.fromSiteId||latest.siteId!==row.siteId))
        fail('battlefieldAftermath.caseApproach');
    }
    if(row.leftTick!==undefined&&(!dates(row.leftTick)||row.leftTick<=row.terminalTick||
      row.leftTick-row.terminalTick>AFTERMATH_WINDOW||row.decision))fail('battlefieldAftermath.left');
    cases.set(row.id,row);
    const decision=row.decision;
    if(!decision)continue;
    const move=decision.move;
    if(!dates(decision.tick)||decision.tick<=row.terminalTick||decision.tick-row.terminalTick>AFTERMATH_WINDOW||
      move==='return'&&(!row.approach||decision.targetLocationId!==row.approach.fromSiteId)||
      move!=='return'&&decision.targetLocationId!==undefined||
      (move==='offer_care'||move==='accept_care')!==(decision.targetCultivatorId!==undefined)||
      decision.targetCultivatorId===row.actorId||
      move==='accept_care'&&(!Number.isFinite(decision.healedHp)||decision.healedHp!<=0||decision.healedHp!>CARE_HP)||
      move!=='accept_care'&&decision.healedHp!==undefined)fail('battlefieldAftermath.decision');
    const id=privateId(row,decision),events=world.events.filter(event=>event.id===id);
    if(receipts.has(id)||events.length>1||!events.length&&hot(decision.tick)||events[0]&&!matches(world,row,events[0]))
      fail('battlefieldAftermath.receipt');
    receipts.add(id);
  }
  for(const row of ledger.cases){
    const decision=row.decision;
    if(!decision?.targetCultivatorId)continue;
    const peer=cases.get(idAt(row.siegeId,decision.targetCultivatorId));
    if(!peer||decision.move==='accept_care'&&(peer.decision?.move!=='offer_care'||peer.decision.targetCultivatorId!==row.actorId||
      peer.decision.tick>=decision.tick||decision.tick-peer.decision.tick>CARE_WINDOW))fail('battlefieldAftermath.care');
  }
  for(const event of world.events)if(/^evt-\d+-battlefield-aftermath-/.test(event.id)&&!receipts.has(event.id))
    fail('battlefieldAftermath.orphan');
}
