import type { DaoIntentActivation, DaoPathMove, DaoPathState } from '../types/daoPath';
import type { WorldEvent, WorldState } from '../types/world';
import { isScopedExpeditionGate } from './expeditionOmenTerms';
import { DAO_INTENT_HISTORY, DAO_INTENT_QI, DAO_INTENT_READY_TICKS, DAO_PATHS, daoPathEventId, daoPathRank } from './daoPathTerms';

type Fail=(path:string)=>never;
const path='cultivators.daoPath';
const privateId=/^evt-([1-9]\d*)-(.+)-dao-(choose|practice|ready|cancel)$/u;
const isPrivateId=(id:string)=>privateId.test(id);
const duelId=/^evt-([1-9]\d*)-(.+)-(duel|kill)$/u;
const equalIntent=(a:DaoIntentActivation,b:DaoIntentActivation)=>a.actorId===b.actorId&&a.pathId===b.pathId&&
  a.rank===b.rank&&a.tick===b.tick&&a.readyTick===b.readyTick&&a.readySiteId===b.readySiteId&&
  a.siteId===b.siteId&&a.eventId===b.eventId&&
  a.qiPaid===b.qiPaid&&a.artifactId===b.artifactId;
const rankAt=(state:DaoPathState,tick:number)=>daoPathRank(state.practices.filter(row=>row.tick<tick).length);

export function validateDaoPathHistory(world:WorldState,fail:Fail):void{
  const stateful=world.cultivators.filter(actor=>actor.daoPath!==undefined);
  const originals=world.events.filter(event=>event.daoIntents!==undefined||isPrivateId(event.id));
  // Private training events may be read by their owner, but can never grant a
  // public Chronicle, authored fact, witness, map or gossip proof of an intent.
  const leaked=(rows:readonly {id:string}[])=>rows.some(row=>isPrivateId(row.id));
  if(leaked(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(row=>leaked(row.anchors))||
    world.coldHistory.chapters.some(row=>leaked(row.anchors))||
    world.chronicleCausality.nodes.some(row=>isPrivateId(row.eventId))||
    world.chronicleErrata.sources.some(row=>isPrivateId(row.sourceEventId))||
    world.eraHeritage?.facts.some(row=>isPrivateId(row.source.sourceEventId))||
    world.witnesses.facts.some(row=>isPrivateId(row.eventId))||
    world.witnessedPersonalStory.scenes.some(row=>isPrivateId(row.eventId))||
    world.dramaticBonds?.facts.some(row=>isPrivateId(row.sourceEventId))||
    world.protagonistSuccession.arcs.some(row=>row.opening.some(item=>isPrivateId(item.eventId))||
      row.support.some(item=>isPrivateId(item.eventId))||!!row.death&&isPrivateId(row.death.eventId))||
    world.mapPresentation.effects.some(row=>isPrivateId(row.id))||
    world.cultivators.some(actor=>actor.rumors.some(rumor=>!!rumor.originEventId&&isPrivateId(rumor.originEventId)||
      rumor.id.startsWith('rumor-')&&isPrivateId(rumor.id.slice('rumor-'.length)))))
    return fail(path+'.privateSource');
  if(!stateful.length&&!originals.length)return;
  const actors=new Map(world.cultivators.map(row=>[row.id,row]));
  const sites=new Set(world.locations.filter(site=>site.type!=='secret_realm'&&site.type!=='abyss'&&!isScopedExpeditionGate(site)).map(site=>site.id));
  const events=new Map<string,WorldEvent[]>();
  for(const event of world.events){
    const same=events.get(event.id);
    if(same)same.push(event);else events.set(event.id,[event]);
  }
  const uniqueTraining=new Set<string>();
  const oldestHot=world.events.reduce((min,row)=>Math.min(min,row.tick),Infinity);
  const needsHot=(tick:number)=>tick>oldestHot||tick===world.tick&&world.events.length<120;

  const privateSource=(actorId:string,tick:number,siteId:string,move:DaoPathMove)=>{
    const id=daoPathEventId(actorId,tick,move),rows=events.get(id);
    if(!rows){if(needsHot(tick))return fail(path+'.source');return;}
    const event=rows[0],state=actors.get(actorId)?.daoPath;
    if(!state)return fail(path+'.source');
    const rule=DAO_PATHS[state.pathId];
    const practiceIndex=state.practices.findIndex(work=>work.tick===tick);
    const expectedTitle=move==='choose'?`初问${rule.name}`:move==='ready'?`蓄势：${rule.intent}`:move==='cancel'?'散去蓄势':
      daoPathRank(practiceIndex+1)>daoPathRank(practiceIndex)?`初见${rule.intent}`:`实修${rule.name}`;
    if(event.title!==expectedTitle||rows.length!==1||event.tick!==tick||event.actorIds.length!==1||event.actorIds[0]!==actorId||
      event.category!=='breakthrough'||!event.locationId||!sites.has(event.locationId)||
      event.locationId!==siteId||event.witnessScope!=='participants'||
      event.dialogue!==undefined||event.duelWinnerId!==undefined||event.damage!==undefined||
      event.daoIntents!==undefined||event.forbiddenArt!==undefined)return fail(path+'.source');
  };
  for(const actor of stateful){
    const state=actor.daoPath!,blade=state.bladeId,rule=DAO_PATHS[state.pathId];
    if((state.pathId==='sword')!==(blade!==undefined)||state.chosenTick<1||state.chosenTick>world.tick||
      !sites.has(state.chosenSiteId)||state.lastActedTick<state.chosenTick||state.lastActedTick>world.tick)return fail(path+'.choice');
    privateSource(actor.id,state.chosenTick,state.chosenSiteId,'choose');
    let lastPractice=state.chosenTick;
    for(const work of state.practices){
      if(work.tick<=lastPractice||work.tick>state.lastActedTick||!sites.has(work.siteId)||
        work.qiPaid!==rule.qi||work.herbPaid!==rule.herb||work.stonesPaid!==rule.stones||
        work.hpPaid!==rule.hp||work.artifactId!==blade||
        work.durabilityGain!==(blade?1:undefined))return fail(path+'.practice');
      lastPractice=work.tick;
      privateSource(actor.id,work.tick,work.siteId,'practice');
    }
    let lastActivated=state.chosenTick;
    for(const row of state.activations){
      const match=duelId.exec(row.eventId);
      if(row.actorId!==actor.id||row.pathId!==state.pathId||row.artifactId!==blade||row.qiPaid!==DAO_INTENT_QI||
        row.readyTick<=lastActivated||row.tick<=row.readyTick||row.tick>world.tick||
        row.tick>row.readyTick+DAO_INTENT_READY_TICKS||row.rank!==rankAt(state,row.readyTick)||
        !sites.has(row.siteId)||!sites.has(row.readySiteId)||!match||Number(match[1])!==row.tick||
        !actors.has(match[2])||row.readyTick>state.lastActedTick||state.practices.some(work=>work.tick===row.readyTick))
        return fail(path+'.activation');
      lastActivated=row.tick;
      privateSource(actor.id,row.readyTick,row.readySiteId,'ready');
      const sources=events.get(row.eventId);
      if(!sources?needsHot(row.tick):sources.length!==1||!sources[0].daoIntents?.some(intent=>equalIntent(intent,row)))return fail(path+'.duelSource');
    }
    const ready=state.ready;
    if(ready){
      if(ready.tick<=lastActivated||ready.tick>state.lastActedTick||ready.artifactId!==blade||!rankAt(state,ready.tick)||
        !sites.has(ready.siteId)||state.practices.some(work=>work.tick===ready.tick))return fail(path+'.ready');
      privateSource(actor.id,ready.tick,ready.siteId,'ready');
    }
    const onLast=['choose','practice','ready','cancel'].flatMap(move=>
      events.get(daoPathEventId(actor.id,state.lastActedTick,move as DaoPathMove))??[]);
    if(onLast.length>1||!onLast.length&&needsHot(state.lastActedTick))return fail(path+'.lastAction');
  }

  for(const event of originals){
    const privateMatch=privateId.exec(event.id);
    if(privateMatch){
      const [,stamp,actorId,move]=privateMatch;
      const state=actors.get(actorId)?.daoPath,trainTurn=JSON.stringify([actorId,event.tick]);
      if(uniqueTraining.has(trainTurn))return fail(path+'.lastAction');
      uniqueTraining.add(trainTurn);
      if(!state||Number(stamp)!==event.tick||event.tick<state.chosenTick||event.tick>state.lastActedTick||
        !event.locationId||!sites.has(event.locationId))return fail(path+'.source');
      privateSource(actorId,event.tick,event.locationId,move as DaoPathMove);
      if(move==='choose'&&event.tick!==state.chosenTick||
        move==='practice'&&!state.practices.some(work=>work.tick===event.tick&&work.siteId===event.locationId)||
        (move==='ready'||move==='cancel')&&(event.tick<=state.chosenTick||!rankAt(state,event.tick)))
        return fail(path+'.source');
      continue;
    }
    const match=duelId.exec(event.id),[attacker,defender]=event.actorIds,intents=event.daoIntents!;
    if(!match||Number(match[1])!==event.tick||match[2]!==attacker||event.tick<1||event.tick>world.tick||
      event.category!==(match[3]==='kill'?'death':'combat')||event.actorIds.length!==2||attacker===defender||
      !actors.has(attacker)||!actors.has(defender)||event.witnessScope!==undefined||!event.duelWinnerId||
      !event.actorIds.includes(event.duelWinnerId)||!event.locationId||!sites.has(event.locationId)||
      events.get(event.id)?.length!==1||!intents.length||intents.length>2)return fail('events.daoIntents.source');
    let previous=-1;
    for(const row of intents){
      const order=event.actorIds.indexOf(row.actorId),state=actors.get(row.actorId)?.daoPath;
      if(order<=previous||!state||row.eventId!==event.id||row.tick!==event.tick||row.siteId!==event.locationId||
        row.pathId!==state.pathId||row.artifactId!==state.bladeId||row.rank!==rankAt(state,row.readyTick)||
        !sites.has(row.readySiteId)||
        row.tick<=row.readyTick||row.tick>row.readyTick+DAO_INTENT_READY_TICKS||
        !state.activations.some(known=>equalIntent(known,row))&&
          (state.activations.length!==DAO_INTENT_HISTORY||row.tick>=state.activations[0].tick))
        return fail('events.daoIntents.receipt');
      privateSource(row.actorId,row.readyTick,row.readySiteId,'ready');
      previous=order;
    }
  }
}
