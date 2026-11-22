import type {WorldState} from '../types/world';
import {terrainTileAt} from './terrainEngine';
import {FRONTIER_CHARTS,FRONTIER_ENTER_ROOTS,FRONTIER_ENTER_STONES,FRONTIER_SETTLE_ROOTS,FRONTIER_SETTLE_STONES,
  frontierEdge,frontierResidenceId,frontierSite,frontierVisitId,frontierWinter,type FrontierVisit}
  from './frontierTerms';

export function validateFrontierMovement(world:WorldState,fail:(path:string)=>never):void {
  const state=world.frontier;
  if(world.locations.some(row=>frontierSite(row.id)))fail('frontier.lowerAddressReuse');
  const identities=new Map(world.cultivators.map(row=>[row.id,row]));
  if(!state){
    if(world.cultivators.some(row=>row.positionPlane==='frontier'||frontierSite(row.locationId))||
      world.resourceFlow.months.some(month=>month.entries.some(row=>row.mechanism==='frontier')))
      fail('frontier.missing');
    return;
  }
  if(!state.visits.length&&!state.trade?.agreements.length&&!state.port?.trade?.agreements.length)fail('frontier.noNativeEntry');
  const byId=new Map<string,FrontierVisit>(),latest=new Map<string,FrontierVisit>();
  const time=(tick:number)=>Number.isSafeInteger(tick)&&tick>=1&&tick<=world.tick;
  const atMonth=(tick:number)=>((world.month-1-(world.tick-tick))%12+12)%12+1;
  const money=new Map<string,{actorId:string;tick:number;stones:number;roots:number;reason:string}>();
  const evidence=new Map<string,{actorId:string;tick:number;siteId:string}>();
  const evt=(ref:string,move:string,tick:number,actorId:string,siteId:string)=>
    evidence.set(`evt-frontier-movement-${ref}-${move}-${tick}`,{actorId,tick,siteId});
  let entered=0;
  for(const visit of state.visits){
    const first=visit.steps[0],last=visit.steps.at(-1),chart=FRONTIER_CHARTS[visit.regionId];
    const anchor=world.locations.find(row=>row.id===visit.anchorId);
    const previous=latest.get(visit.actorId);
    if(!chart||!anchor||chart.anchorId!==visit.anchorId||terrainTileAt(world,anchor.x,anchor.y)?.id!==chart.anchorTileId||
      !identities.has(visit.actorId)||byId.has(visit.id)||!time(visit.enteredTick)||visit.enteredTick<entered||
      visit.id!==frontierVisitId(visit.enteredTick,visit.actorId)||visit.paidStones!==FRONTIER_ENTER_STONES||visit.paidRoots!==FRONTIER_ENTER_ROOTS||
      !first||!last||first.tick!==visit.enteredTick||first.siteId!==chart.gateId||
      (previous&&(previous.exitedTick===undefined||visit.enteredTick<=previous.exitedTick)))
      fail('frontier.visit.origin');
    for(let index=1;index<visit.steps.length;index++){
      const prior=visit.steps[index-1],step=visit.steps[index];
      const edge=frontierEdge(prior.siteId,step.siteId);
      if(!time(step.tick)||step.tick<=prior.tick||!edge||frontierSite(step.siteId)?.regionId!==visit.regionId||
        edge.winterClosed&&frontierWinter(atMonth(step.tick)))fail('frontier.visit.step');
    }
    if(visit.exitedTick!==undefined&&(!time(visit.exitedTick)||visit.exitedTick<=last.tick||last.siteId!==chart.gateId||
      visit.deceasedTick!==undefined))fail('frontier.visit.exit');
    if(visit.deceasedTick!==undefined&&(!time(visit.deceasedTick)||visit.deceasedTick<last.tick))
      fail('frontier.visit.mortality');
    money.set(visit.id,{actorId:visit.actorId,tick:visit.enteredTick,stones:FRONTIER_ENTER_STONES,roots:FRONTIER_ENTER_ROOTS,reason:'frontier_entry_paid'});
    evt(visit.id,'enter',first.tick,visit.actorId,first.siteId);
    for(const step of visit.steps.slice(1))evt(visit.id,'travel',step.tick,visit.actorId,step.siteId);
    if(visit.exitedTick!==undefined)evt(visit.id,'exit',visit.exitedTick,visit.actorId,visit.anchorId);
    entered=visit.enteredTick;
    byId.set(visit.id,visit);
    latest.set(visit.actorId,visit);
  }

  for(const actor of world.cultivators){
    const recent=latest.get(actor.id);
    if(actor.positionPlane==='frontier'){
      if(!recent||recent.exitedTick!==undefined||recent.steps.at(-1)?.siteId!==actor.locationId||
        (recent.deceasedTick!==undefined)!==(!actor.alive||actor.hp<=0))fail('frontier.person.body');
    }else if(frontierSite(actor.locationId)||recent&&recent.exitedTick===undefined)
      fail('frontier.person.location');
  }
  const signed=new Set<string>();
  for(const home of state.residences){
    const visit=byId.get(home.visitId),chart=FRONTIER_CHARTS[home.regionId];
    const arrived=visit?.steps.filter(step=>step.tick<=home.settledTick).at(-1);
    if(signed.has(home.actorId)||!time(home.settledTick)||home.id!==frontierResidenceId(home.settledTick,home.actorId)||
      !chart||home.homeSiteId!==chart.homeId||!visit||visit.actorId!==home.actorId||visit.regionId!==home.regionId||
      home.settledTick>=Math.min(visit.exitedTick??Infinity,visit.deceasedTick??Infinity)||arrived?.siteId!==home.homeSiteId||
      arrived.tick>=home.settledTick||home.paidStones!==FRONTIER_SETTLE_STONES||home.paidRoots!==FRONTIER_SETTLE_ROOTS)
      fail('frontier.residence');
    signed.add(home.actorId);
    evt(home.id,'settle',home.settledTick,home.actorId,home.homeSiteId);
    money.set(home.id,{actorId:home.actorId,tick:home.settledTick,stones:FRONTIER_SETTLE_STONES,
      roots:FRONTIER_SETTLE_ROOTS,reason:'frontier_home_paid'});
  }

  const actualFrontierDeaths=new Set(state.visits.flatMap(visit=>visit.deceasedTick!==undefined?
    [`evt-frontier-${visit.deceasedTick}-${visit.actorId}-oldage`]:[]));
  for(const event of world.events)if(/^evt-frontier-[0-9]+-.+-oldage$/u.test(event.id)){
    if(!actualFrontierDeaths.has(event.id)||event.locationId!==undefined||event.category!=='death'||
      event.witnessScope!=='participants'||event.actorIds.length!==1||
      event.id!==`evt-frontier-${event.tick}-${event.actorIds[0]}-oldage`)fail('frontier.mortality.event');
  }
  const audited=new Set<string>();
  for(const month of world.resourceFlow.months)for(const entry of month.entries){
    if(entry.mechanism!=='frontier'||(!money.has(entry.refId)&&
      entry.reason!=='frontier_entry_paid'&&entry.reason!=='frontier_home_paid'))continue;
    const row=money.get(entry.refId),key=JSON.stringify([entry.refId,entry.good]);
    if(!row||audited.has(key)||entry.kind!=='consumption'||entry.tick!==row.tick||entry.reason!==row.reason||
      (entry.good==='stone'?entry.amount!==row.stones:entry.good==='earth_root'?entry.amount!==row.roots:true)||
      entry.from.kind!=='actor'||entry.from.id!==row.actorId||entry.visibility.kind!=='participants'||
      entry.visibility.actorIds.length!==1||entry.visibility.actorIds[0]!==row.actorId)
      fail('frontier.movement.flow');
    audited.add(key);
  }
  const completeMonths=new Set(world.resourceFlow.months.filter(month=>month.totalEntries===month.entries.length).map(month=>month.tick));
  for(const [id,row] of money)if(completeMonths.has(row.tick)&&
    (!audited.has(JSON.stringify([id,'stone']))||!audited.has(JSON.stringify([id,'earth_root']))))
    fail('frontier.movement.flowMissing');
  for(const entry of world.events){
    if(!entry.id.startsWith('evt-frontier-movement-'))continue;
    const row=evidence.get(entry.id);
    if(!row||entry.tick!==row.tick||entry.locationId!==row.siteId||entry.witnessScope!=='participants'||
      entry.actorIds.length!==1||entry.actorIds[0]!==row.actorId)fail('frontier.movement.event');
  }
}
