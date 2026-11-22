import {FRONTIER_NIGHT_HUNT_BEAST as BEAST,FRONTIER_NIGHT_HUNT_BEAST_HP as MAX_BEAST_HP,
  FRONTIER_NIGHT_HUNT_HISTORY as HISTORY,FRONTIER_NIGHT_HUNT_SITE as SITE,FRONTIER_NIGHT_HUNT_TRACE_QI as TRACE_QI} from '../types/frontierNightHunt';
import type {FrontierNightHuntOption,FrontierNightHuntReceipt,FrontierNightHuntState,FrontierNightHuntTrace,FrontierNightHuntView} from '../types/frontierNightHunt';
import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import {activeFrontierVisit,availableFrontierMovementActions,frontierActedOnGeography,frontierAnchor,
  frontierPhysicalSite,resolveFrontierMovementAction} from './frontierMovementEngine';
import {localQiWeather,type QiWeatherReading} from './weatherEngine';

export type {FrontierNightHuntOption,FrontierNightHuntView} from '../types/frontierNightHunt';
const GATE='frontier-north-gate',WEST='frontier-north-lee-west',EAST='frontier-north-lee-east';
const appearance=(world:WorldState,tick:number)=>{
  const anchor=frontierAnchor(world,'north-snow');
  return anchor?localQiWeather(world,anchor,tick):undefined;
};
const wind=(weather:Pick<QiWeatherReading,'kind'|'intensity'>)=>weather.kind==='霜息'||weather.kind==='罡风'?weather.intensity:0;
const closedTrail=(weather:QiWeatherReading)=>wind(weather)>=.85;
const unique=(world:WorldState,actor:Cultivator)=>world.cultivators.includes(actor)&&world.cultivators.filter(row=>row.id===actor.id).length===1;

export function initializeFrontierNightHunt(world:WorldState,actor:Cultivator):void{
  const state=world.frontier;
  if(!state||state.nightHunt||actor.locationId!==GATE||!unique(world,actor))return;
  const visit=activeFrontierVisit(world,actor.id);
  if(!visit||visit.regionId!=='north-snow'||visit.enteredTick!==world.tick||visit.steps.length!==1||
    visit.steps[0].siteId!==GATE||visit.steps[0].tick!==world.tick||visit.paidStones!==8||visit.paidRoots!==1||
    frontierPhysicalSite(world,actor)?.id!==GATE)return;
  state.nightHunt={beast:{id:BEAST,siteId:SITE,introducedTick:world.tick,hp:MAX_BEAST_HP,alive:true},traces:[],receipts:[]};
}

function situation(world:WorldState,actor:Cultivator,tick:number){
  const state=world.frontier?.nightHunt;
  if(!state||actor.positionPlane!=='frontier'||!unique(world,actor))return;
  const site=frontierPhysicalSite(world,actor,tick);
  if(site?.regionId!=='north-snow'||![GATE,WEST,SITE,EAST].some(id=>id===site.id))return;
  const visit=activeFrontierVisit(world,actor.id),weather=appearance(world,tick);
  if(!visit||!weather)return;
  return {state,site,visit,weather};
}

function returnQuote(world:WorldState,actor:Cultivator,tick:number){
  const destination:typeof SITE|typeof WEST|typeof GATE|'loc-vein-north'|undefined=actor.locationId===EAST?SITE:actor.locationId===SITE?WEST:
    actor.locationId===WEST?GATE:actor.locationId===GATE?'loc-vein-north':undefined;
  if(!destination)return undefined;
  const quote=availableFrontierMovementActions(actor,world,tick).find(row=>
    row.targetFrontierSiteId===destination&&(row.frontierMove==='travel'||row.frontierMove==='exit'));
  return quote?{...quote,targetFrontierSiteId:destination}:undefined;
}

export function availableFrontierNightHuntActions(actor:Cultivator,world:WorldState,executionTick=world.tick+1):FrontierNightHuntOption[]{
  const local=situation(world,actor,executionTick);
  if(!local||frontierActedOnGeography(world,actor.id,executionTick)||
    local.state.receipts.some(row=>row.actorId===actor.id&&row.tick===executionTick))return [];
  const result:FrontierNightHuntOption[]=[];
  if(local.site.id===SITE){
    if(actor.qiProgress>=TRACE_QI)result.push({action:'FRONTIER_NIGHT_HUNT',frontierNightHuntMove:'trace',targetFrontierSiteId:SITE});
    // A storm can close the lookout itself; the ordinary lee return stays governed by geography.
    if(!closedTrail(local.weather))result.push({action:'FRONTIER_NIGHT_HUNT',frontierNightHuntMove:'wait',targetFrontierSiteId:SITE});
  }
  const returning=returnQuote(world,actor,executionTick);
  if(returning)result.push({action:'FRONTIER_NIGHT_HUNT',frontierNightHuntMove:'return',targetFrontierSiteId:returning.targetFrontierSiteId});
  return result;
}

const receiptId=(row:Pick<FrontierNightHuntReceipt,'tick'|'actorId'|'move'>)=>
  `evt-frontier-night-hunt-${row.tick}-${row.actorId}-${row.move}`;
export const isPrivateFrontierNightHuntEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&event.id.startsWith('evt-frontier-night-hunt-');
const words={
  found:['石隙见妖迹','风势未掩石隙的爪痕，这一处确有活物。'],
  obscured:['未辨出新迹','循隙查了一回，没有认出这夜可用的新迹。'],
  quiet:['背风守候','守了一夜，没有发生交手。'],
  contact:['背风台交锋','已察明的野物仍在原处，一人一兽实有交伤。'],
} satisfies Record<FrontierNightHuntReceipt['outcome'],readonly [string,string]>;
const fresh=(trace:FrontierNightHuntTrace,tick:number)=>trace.found&&tick>trace.tick&&tick<=trace.tick+2;
function remember(world:WorldState,state:FrontierNightHuntState,row:FrontierNightHuntReceipt){
  state.receipts.push(row);
  const keep=new Set(state.receipts.slice(-HISTORY));
  const hot=new Set(world.events.filter(isPrivateFrontierNightHuntEvent).map(event=>event.id));
  const pinned=new Set(state.receipts.filter(r=>r.outcome==='contact').map(r=>`${r.actorId}:${r.traceTick}`));
  state.traces=state.traces.filter(t=>t.tick>=row.tick-2);
  for (const trace of state.traces) pinned.add(`${trace.actorId}:${trace.tick}`);
  state.receipts=state.receipts.filter(r=>keep.has(r)||r.outcome==='contact'||r.tick===world.tick||hot.has(receiptId(r))||
    pinned.has(`${r.actorId}:${r.tick}`));
}

export function resolveFrontierNightHunt(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='FRONTIER_NIGHT_HUNT'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','frontierNightHuntMove','targetFrontierSiteId'].includes(key)))return null;
  const option=availableFrontierNightHuntActions(actor,world,world.tick).find(row=>
    row.frontierNightHuntMove===decision.frontierNightHuntMove&&row.targetFrontierSiteId===decision.targetFrontierSiteId);
  if(!option)return null;
  if(option.frontierNightHuntMove==='return'){
    const returning=returnQuote(world,actor,world.tick);
    return returning?resolveFrontierMovementAction(world,actor,{chosenAction:'FRONTIER',frontierMove:returning.frontierMove,
      targetFrontierSiteId:returning.targetFrontierSiteId,innerMonologue:'由亲到的背风路原样回撤。'}):null;
  }
  const local=situation(world,actor,world.tick);
  if(!local||local.site.id!==SITE)return null;
  const {state,visit,weather}=local,beast=state.beast;
  const row:FrontierNightHuntReceipt={actorId:actor.id,visitId:visit.id,tick:world.tick,siteId:SITE,
    move:option.frontierNightHuntMove,outcome:'quiet',paidQi:0,damage:0,beastDamage:0};
  if(option.frontierNightHuntMove==='trace'){
    const found=beast.alive&&beast.siteId===SITE&&wind(weather)<.75;
    row.outcome=found?'found':'obscured';
    row.paidQi=TRACE_QI;
    actor.qiProgress-=TRACE_QI;
    state.traces=state.traces.filter(trace=>trace.actorId!==actor.id);
    state.traces.push({actorId:actor.id,visitId:visit.id,tick:world.tick,siteId:SITE,
      weatherKind:weather.kind,intensity:weather.intensity,found});
  }else{
    const trace=state.traces.find(old=>old.actorId===actor.id&&old.visitId===visit.id);
    if(trace&&fresh(trace,world.tick)&&beast.alive&&beast.siteId===SITE&&actor.hp>30&&
      !state.receipts.some(old=>old.actorId===actor.id&&old.outcome==='contact'&&old.traceTick===trace.tick)){
      row.outcome='contact';row.traceTick=trace.tick;
      row.damage=8+Math.round(wind(weather)*16);
      row.beastDamage=Math.min(beast.hp,15);
      actor.hp-=row.damage;beast.hp-=row.beastDamage;
      if(beast.hp===0)beast.alive=false;
    }
  }
  remember(world,state,row);
  const [title,description]=words[row.outcome];
  return {id:receiptId(row),tick:world.tick,year:world.year,month:world.month,title,description,
    actorIds:[actor.id],locationId:SITE,witnessScope:'participants',category:row.outcome==='contact'?'combat':'heavenly',
    ...(row.damage?{damage:[{cultivatorId:actor.id,amount:row.damage}]}:{})};
}

export function projectFrontierNightHunt(world:WorldState,actor:Cultivator):FrontierNightHuntView|undefined{
  const local=situation(world,actor,world.tick);
  if(!local)return;
  const {state,site,visit,weather}=local;
  const last=[...state.receipts].reverse().find(row=>row.actorId===actor.id&&row.visitId===visit.id);
  const track=state.traces.find(row=>row.actorId===actor.id&&row.visitId===visit.id&&row.found&&row.tick<=world.tick&&row.tick>=world.tick-2);
  return {siteId:site.id,weather:{kind:weather.kind,intensity:weather.intensity},
    options:availableFrontierNightHuntActions(actor,world),...(last?{last:{move:last.move,outcome:last.outcome,tick:last.tick,
      paidQi:last.paidQi,damage:last.damage,beastDamage:last.beastDamage}}:{}),
    ...(track&&last&&site.id===SITE?{observed:{kind:'妖兽',siteId:SITE,alive:state.beast.alive}}:{})};
}

const receiptKey=(actorId:string,tick:number)=>`${actorId}:${tick}`;

export function validFrontierNightHuntSave(world:WorldState,fail:(path:string)=>never):void{
  const frontier=world.frontier,state=frontier?.nightHunt;
  if(!frontier||!state)return;
  const visits=new Map(frontier.visits.map(row=>[row.id,row]));
  const actors=new Set(world.cultivators.map(row=>row.id));
  const {beast}=state;
  if(beast.id!==BEAST||beast.siteId!==SITE||!Number.isSafeInteger(beast.hp)||beast.hp<0||beast.hp>MAX_BEAST_HP||
    beast.alive!==(beast.hp>0)||beast.introducedTick>world.tick||
    !frontier.visits.some(v=>v.regionId==='north-snow'&&v.enteredTick===beast.introducedTick&&v.steps[0]?.siteId===GATE))
    fail('frontier.nightHunt.beast');
  const physicallyRecorded=(row:Pick<FrontierNightHuntReceipt,'actorId'|'visitId'|'siteId'|'tick'>)=>{
    const visit=visits.get(row.visitId);
    if(!visit||!actors.has(row.actorId)||visit.actorId!==row.actorId||visit.regionId!=='north-snow'||
      row.siteId!==SITE||row.tick<=visit.enteredTick||row.tick>world.tick||row.tick<=beast.introducedTick||
      (visit.exitedTick!==undefined&&row.tick>=visit.exitedTick)||(visit.deceasedTick!==undefined&&row.tick>visit.deceasedTick))return false;
    let last:typeof visit.steps[number]|undefined;
    for(const step of visit.steps){if(step.tick>row.tick)break;last=step;}
    return last?.siteId===SITE&&last.tick<row.tick;
  };
  const byKey=new Map<string,FrontierNightHuntReceipt>();
  const byId=new Map<string,FrontierNightHuntReceipt>();
  const paidTraces=new Set<string>();
  const lastTraceByActor=new Map<string,number>();
  let total=0,previous=0;
  const lastWriteTick=state.receipts.at(-1)?.tick;
  const hotIds=new Set(world.events.filter(isPrivateFrontierNightHuntEvent).map(event=>event.id));
  const currentAndHot=state.receipts.filter(row=>row.tick===lastWriteTick||hotIds.has(receiptId(row))).length;
  if(state.receipts.length>HISTORY+2*MAX_BEAST_HP/15+state.traces.length+currentAndHot+120)fail('frontier.nightHunt.history');
  for(const row of state.receipts){
    const key=receiptKey(row.actorId,row.tick);
    if(!physicallyRecorded(row)||row.tick<previous||byKey.has(key))fail('frontier.nightHunt.receipts');
    previous=row.tick;
    const traceOutcome=row.outcome==='found'||row.outcome==='obscured';
    const contact=row.outcome==='contact';
    if(row.move==='trace'?(!traceOutcome||row.paidQi!==TRACE_QI):traceOutcome||row.paidQi!==0)
      fail('frontier.nightHunt.cost');
    if(contact){
      const traceKey=receiptKey(row.actorId,row.traceTick??0),origin=byKey.get(traceKey);
      if(!origin||origin.visitId!==row.visitId||origin.outcome!=='found'||row.tick<=origin.tick||row.tick>origin.tick+2||
        paidTraces.has(traceKey)||!Number.isSafeInteger(row.damage)||row.damage<8||row.damage>21||
        row.beastDamage!==Math.min(15,MAX_BEAST_HP-total)||row.beastDamage<=0)fail('frontier.nightHunt.contact');
      paidTraces.add(traceKey);total+=row.beastDamage;
    }else if(row.damage!==0||row.beastDamage!==0||row.traceTick!==undefined)fail('frontier.nightHunt.damage');
    if(row.move==='trace')lastTraceByActor.set(row.actorId,row.tick);
    byKey.set(key,row);byId.set(receiptId(row),row);
  }
  if(beast.hp!==MAX_BEAST_HP-total)fail('frontier.nightHunt.hp');
  const seenTracks=new Set<string>();
  for(const trace of state.traces){
    const row=byKey.get(receiptKey(trace.actorId,trace.tick));
    if(seenTracks.has(trace.actorId)||!physicallyRecorded(trace)||row?.visitId!==trace.visitId||row.move!=='trace'||
      trace.found!==(row.outcome==='found')||(trace.found&&wind({kind:trace.weatherKind,intensity:trace.intensity})>=.75)||
      lastTraceByActor.get(trace.actorId)!==trace.tick)
      fail('frontier.nightHunt.traces');
    seenTracks.add(trace.actorId);
  }
  const seenEvents=new Set<string>();
  for(const event of world.events){
    if(!event.id.startsWith('evt-frontier-night-hunt-'))continue;
    const row=byId.get(event.id);
    if(!row)fail('frontier.nightHunt.event');
    const [title,description]=words[row.outcome];
    const date=world.year*12+world.month-1-(world.tick-row.tick);
    if(seenEvents.has(event.id)||!isPrivateFrontierNightHuntEvent(event)||event.tick!==row.tick||
      event.year!==Math.floor(date/12)||event.month!==date%12+1||
      event.locationId!==SITE||event.actorIds.length!==1||event.actorIds[0]!==row.actorId||
      event.category!==(row.outcome==='contact'?'combat':'heavenly')||event.title!==title||event.description!==description||
      (row.damage?event.damage?.length!==1||event.damage[0].cultivatorId!==row.actorId||event.damage[0].amount!==row.damage:
        event.damage!==undefined))fail('frontier.nightHunt.event');
    seenEvents.add(event.id);
  }
}
