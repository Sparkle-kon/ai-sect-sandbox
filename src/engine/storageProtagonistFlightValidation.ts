import {FLIGHT_ROUNDS,type ProtagonistFlight} from '../types/protagonistFlight';
import type {WorldState,MapPoint,WorldEvent,ChronicleAnchor} from '../types/world';
import {terrainTileAt} from './terrainEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';

type Fail=(field:string)=>never;
const same=(a:MapPoint,b:MapPoint)=>a.x===b.x&&a.y===b.y;
const sit=(world:WorldState,id:string)=>world.locations.find(site=>site.id===id&&site.type!=='secret_realm'&&!isScopedExpeditionGate(site));
// Native events retain the newest 120. The oldest tick may legitimately be split at the hard buffer limit.
const HOT_EVENTS_LIMIT=120;
const dated=(world:WorldState,event:WorldEvent|ChronicleAnchor,tick:number)=>{
  const calendar=(world.year*12+world.month-1)-(world.tick-tick);
  return event.tick===tick&&event.year===Math.floor(calendar/12)&&event.month===calendar%12+1;
};
const nativeId=(scene:ProtagonistFlight,event:WorldEvent,tick:number,kinds:readonly string[])=>event.tick===tick&&
  event.category==='diplomacy'&&event.witnessScope==='participants'&&event.actorIds.length===2&&
  event.actorIds[0]===scene.actorId&&event.actorIds[1]===scene.guideId&&
  kinds.some(kind=>event.id===`evt-${scene.journeyId}-${kind}-${tick}`);

export function validateProtagonistFlightHistory(world:WorldState,fail:Fail):void{
  if(!world.protagonistFlights)return;
  const arcs=new Set<string>(),keys=new Set<string>();
  const earliestHot=world.events.reduce((first,row)=>Math.min(first,row.tick),Infinity);
  const mustBeHot=(tick:number)=>world.events.length<HOT_EVENTS_LIMIT||tick>earliestHot;
  let previous=0;
  for(const scene of world.protagonistFlights){
    const {actorId,guideId,pursuerId,openedTick}=scene;
    const arc=world.protagonistSuccession.arcs.find(row=>row.id===scene.arcId);
    const bounty=world.bounties.find(row=>row.id===scene.bountyId);
    const journey=world.pilgrimages.journeys.find(row=>row.id===scene.journeyId);
    const origin=sit(world,scene.originId),destination=sit(world,scene.destinationId);
    const at=journey?.stopIds.indexOf(scene.originId)??-1;
    if(scene.id!==`flight-${openedTick}`||openedTick>world.tick||openedTick<=previous||
      keys.has(scene.id)||arcs.has(scene.arcId)||new Set([actorId,guideId,pursuerId]).size!==3||
      ![actorId,guideId,pursuerId].every(id=>world.cultivators.some(row=>row.id===id))||
      !arc||arc.actorId!==actorId||arc.openedTick>=openedTick||(arc.endedTick??Infinity)<openedTick||
      !bounty||bounty.targetCultivatorId!==actorId||bounty.issuedTick>=openedTick||(bounty.settledTick??Infinity)<=openedTick||
      !journey||journey.organizerId!==actorId||journey.companionId!==guideId||(journey.startedTick??Infinity)>=openedTick||
      !origin||!destination||at<0||journey.stopIds[at+1]!==scene.destinationId||
      journey.stopsVisited.filter(row=>row.tick<openedTick).at(-1)?.locationId!==scene.originId||
      scene.rounds.length!==Math.min(FLIGHT_ROUNDS,world.tick-openedTick)||
      scene.contactEventId!==`evt-${openedTick}-${pursuerId}-duel`) fail('protagonistFlights.opening');
    const contact=world.events.filter(row=>row.id===scene.contactEventId);
    if(contact.length>1||mustBeHot(openedTick)&&contact.length!==1||contact.some(row=>!dated(world,row,openedTick)||row.category!=='combat'||row.locationId!==origin!.id||
      row.witnessScope!==undefined||row.actorIds.length!==2||row.actorIds[0]!==pursuerId||row.actorIds[1]!==actorId||
      row.duelWinnerId!==actorId||!row.damage?.some(hit=>hit.cultivatorId===actorId&&hit.amount>0)))fail('protagonistFlights.contact');
    const anchors=world.chronicleArchive.anchors.filter(row=>row.id===scene.contactEventId);
    if(anchors.length>1||openedTick===world.tick&&!contact.length&&!anchors.length)fail('protagonistFlights.missingCurrentSource');
    for(const row of anchors){
      if(!dated(world,row,openedTick)||row.category!=='combat'||row.locationId!==origin!.id||
        row.actorIds.length!==2||row.actorIds[0]!==pursuerId||row.actorIds[1]!==actorId)
        fail('protagonistFlights.archiveContact');
    }
    let point:MapPoint=origin!;
    let terminal=false;
    for(let i=0;i<scene.rounds.length;i++){
      const mark=scene.rounds[i];
      if(mark.round!==i+1||mark.tick!==openedTick+i+1||terminal&&mark.outcome!=='held'||
        (mark.outcome==='retreated')!==Boolean(mark.reason&&mark.reason!=='time_elapsed')||
        (mark.reason==='time_elapsed')!==(mark.round===FLIGHT_ROUNDS&&mark.outcome!=='reached'&&
          mark.outcome!=='retreated'&&!terminal))
        fail('protagonistFlights.chronology');
      const advanced=mark.outcome==='moved'||mark.outcome==='reached'||mark.outcome==='retreated'&&mark.points.length>0;
      if(advanced!==Boolean(mark.points.length)||advanced&&
        (mark.points.length<2||!mark.sourceEventId||!same(mark.points[0],point)))
        fail('protagonistFlights.path');
      if(mark.locationId!==undefined&&(!sit(world,mark.locationId)||
          journey!.stopsVisited.filter(row=>row.tick<=mark.tick).at(-1)?.locationId!==mark.locationId))
        fail('protagonistFlights.stop');
      if(mark.outcome==='reached'&&(mark.locationId!==scene.destinationId||!same(mark.points.at(-1)!,destination!)||
        !journey!.stopsVisited.some(row=>row.locationId===scene.destinationId&&row.tick===mark.tick)))
        fail('protagonistFlights.arrival');
      if(mark.outcome==='moved'&&mark.locationId!==undefined)fail('protagonistFlights.falseArrival');
      let from=point;
      for(const next of mark.points.slice(1)){
        const a=terrainTileAt(world,from.x,from.y),b=terrainTileAt(world,next.x,next.y);
        const canonical=!!b&&(same(next,destination!)||(next.x===(b.col+.5)*1000/world.terrain.columns&&
          next.y===(b.row+.5)*600/world.terrain.rows));
        if(!a||!b||!canonical||same(from,next)||Math.abs(a.col-b.col)+Math.abs(a.row-b.row)>1)
          fail('protagonistFlights.geometry');
        from=next;
      }
      const kind=mark.outcome==='reached'?['arrival','completed']:mark.outcome==='moved'?['stride','resumed']:
        mark.outcome==='camped'?['camp']:mark.outcome==='aided'?
          journey!.aid.filter(r=>r.tick===mark.tick).map(r=>`relief-${journey!.aid.indexOf(r)+1}`):
          mark.outcome==='retreated'?mark.points.length?['stride','resumed']:['withdrawn','member_missing','lost_site','journey_expiry']:terminal?[]:['dismantled'];
      if(!mark.sourceEventId&&(advanced||mark.outcome==='aided'||mark.outcome==='camped')||mark.sourceEventId&&
        !kind.some(value=>mark.sourceEventId===`evt-${scene.journeyId}-${value}-${mark.tick}`))
        fail('protagonistFlights.nativeReceipt');
      if(mark.sourceEventId){
        const events=world.events.filter(row=>row.id===mark.sourceEventId);
        if(events.length>1||mustBeHot(mark.tick)&&events.length!==1||
          events.some(row=>!dated(world,row,mark.tick)||!nativeId(scene,row,mark.tick,kind)||
            mark.outcome==='reached'&&row.locationId!==mark.locationId||
            (mark.outcome==='moved'||advanced&&mark.outcome==='retreated')&&row.locationId!==undefined))
          fail('protagonistFlights.retainedReceipt');
      }
      if(mark.outcome==='retreated'&&(mark.reason==='guide_lost'&&journey!.reason!=='member_missing'||
        mark.reason==='withdrawn'&&journey!.reason!=='withdrawn'||mark.reason==='destination_lost'&&journey!.reason!=='lost_site'))
        fail('protagonistFlights.retreat');
      if(advanced)point=from;
      terminal ||= mark.outcome==='reached'||mark.outcome==='retreated';
    }
    if(!terminal&&journey!.path.length&&scene.rounds.some(row=>row.outcome==='moved')&&
      scene.rounds.length<FLIGHT_ROUNDS&&!same(point,journey!.path[journey!.pathIndex]))
      fail('protagonistFlights.currentCheckpoint');
    previous=openedTick;keys.add(scene.id);arcs.add(scene.arcId);
  }
}
