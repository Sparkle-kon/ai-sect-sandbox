import { isScopedExpeditionGate } from './expeditionOmenTerms';
import type { GrandSiegeFighter } from '../types/grandSiege';
import type { ChronicleAnchor, SectSiege, WorldEvent, WorldState } from '../types/world';

type Fail = (path:string)=>never;
type EventProof = WorldEvent | ChronicleAnchor;
const nativeId = (siege:SectSiege,tick:number) => `evt-${tick}-dip-${siege.id}`;
const allUnique = (ids:readonly string[]) => new Set(ids).size===ids.length;
const isPublic = (source:EventProof) => !('witnessScope' in source && source.witnessScope==='participants');
const isDiplomacy = (source:EventProof,tick:number) => source.tick===tick && source.category==='diplomacy' && isPublic(source);

export function validateGrandSiegeHistory(world:WorldState,fail:Fail):void {
  const theatres=world.sieges.filter(siege=>siege.theatre!==undefined);
  if (!theatres.length) return;
  const usedSources=new Set<string>();
  for (const siege of theatres) {
    const frame=siege.theatre!;
    usedSources.add(frame.sourceLaunchId);
    usedSources.add(nativeId(siege,frame.openedTick+2));
    if (frame.arrivedTick!==undefined) usedSources.add(nativeId(siege,frame.arrivedTick));
    for (const round of frame.rounds) usedSources.add(round.sourceEventId);
    if (frame.terminal) usedSources.add(frame.terminal.sourceEventId);
  }
  const proofs=new Map<string,EventProof[]>();
  const remember=(source:EventProof)=>{
    if (!usedSources.has(source.id)) return;
    const candidates=proofs.get(source.id);
    if (candidates) candidates.push(source);
    else proofs.set(source.id,[source]);
  };
  world.events.forEach(remember);
  for (const archive of [world.chronicleArchive,world.coldHistory]) for (const chapter of archive.chapters) chapter.anchors.forEach(remember);
  // A retained earlier hot event guarantees the newer source still belongs to the contiguous native ring.
  const earliestHot=world.events.reduce((earliest,event)=>Math.min(earliest,event.tick),Infinity);
  const retained=(sourceId:string,tick:number,test:(source:EventProof)=>boolean,path:string)=>{
    const candidates=proofs.get(sourceId);
    if ((!candidates&&tick>earliestHot)||candidates?.some(source=>!test(source))) fail(path);
  };
  const actors=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const factions=new Map(world.sects.map(sect=>[sect.id,sect]));
  const sites=new Map(world.locations.map(site=>[site.id,site]));
  const causality=new Map(world.chronicleCausality.nodes.map(node=>[node.eventId,node]));
  for (const siege of theatres) {
    const frame=siege.theatre!;
    const attacker=factions.get(siege.attackerSectId), defender=factions.get(siege.defenderSectId);
    const origin=frame.openedTick;
    const site=sites.get(siege.destinationId);
    const expectedId=`siege-${origin}-${siege.attackerSectId}-${siege.defenderSectId}`;
    const launchId=`evt-${origin}-dip-${siege.attackerSectId}-${siege.defenderSectId}-launch_siege`;
    const participants=siege.participantIds;
    const active=siege.status==='marching'||siege.status==='sieging';
    const destinationGone=site===undefined && siege.status==='repelled' && siege.outcome==='出征目的地或宗门不复存在。';
    const aligned=Boolean(attacker && defender && ((attacker.alignment==='正道' && defender.alignment==='魔道') ||
      (attacker.alignment==='魔道' && defender.alignment==='正道')));
    if (!aligned||(!site&&!destinationGone)||(site&&isScopedExpeditionGate(site))||origin!==siege.startedTick||origin>world.tick||siege.id!==expectedId||
        frame.sourceLaunchId!==launchId||participants.length<5||participants.length>8||!allUnique(participants)||
        participants.some(id=>!actors.has(id))||frame.rounds.length!==siege.rounds||
        (siege.lastResolvedTick!==undefined && (siege.lastResolvedTick<=origin||siege.lastResolvedTick>world.tick))) fail('sieges.theatre.launch');
    const launchCause=causality.get(launchId);
    if (launchCause && (launchCause.kind!=='siege_launched'||launchCause.entityId!==siege.id||launchCause.tick!==origin)) fail('sieges.theatre.launch');
    retained(launchId,origin,source=>isDiplomacy(source,origin) && source.title==='宗门集结攻山' && !!source.locationId &&
      (!launchCause || launchCause.locationId===source.locationId) && source.actorIds.length===participants.length &&
      participants.every((id,index)=>source.actorIds[index]===id),'sieges.theatre.launch');
    const arrival=frame.arrivedTick;
    if ((arrival!==undefined && (arrival<origin+2||arrival>world.tick||arrival>(siege.lastResolvedTick??-1)))||
        (arrival===undefined && (frame.rounds.length!==0||siege.status==='sieging'))||
        (arrival!==undefined && siege.status==='marching')) fail('sieges.theatre.arrival');
    const normalArrivalId=nativeId(siege,origin+2);
    if (arrival!==origin+2 && proofs.get(normalArrivalId)?.some(source=>source.title==='联军抵达山门')) fail('sieges.theatre.arrival');
    if (arrival!==undefined) retained(nativeId(siege,arrival),arrival,source=>isDiplomacy(source,arrival) &&
      source.title==='联军抵达山门' && source.locationId===siege.destinationId,'sieges.theatre.arrival');
    const validFighter=(fighter:GrandSiegeFighter)=>fighter.rank!==undefined&&actors.has(fighter.actorId)&&factions.has(fighter.sectId);
    let lastRoundTick=arrival??origin;
    let heroCount=0;
    for (const [index,round] of frame.rounds.entries()) {
      if (round.round!==index+1||round.tick<=lastRoundTick||round.tick>world.tick||round.tick>(siege.lastResolvedTick??-1)||
          round.sourceEventId!==nativeId(siege,round.tick)||round.wallBefore>round.wallMax||round.wallAfter>round.wallBefore||
          round.wallBefore-round.wallAfter>128||!allUnique([...round.attackers,...round.defenders].map(fighter=>fighter.actorId))||
          round.attackers.some(fighter=>!validFighter(fighter)||!participants.includes(fighter.actorId)||fighter.sectId===siege.defenderSectId)||
          round.defenders.some(fighter=>!validFighter(fighter)||participants.includes(fighter.actorId)||fighter.sectId===siege.attackerSectId)) fail('sieges.theatre.round');
      lastRoundTick=round.tick;
      const clash=round.clash;
      if (clash && (round.round!==1||!round.attackers.some(row=>row.actorId===clash.attackerId)||
          !round.defenders.some(row=>row.actorId===clash.defenderId)||![clash.attackerId,clash.defenderId].includes(clash.winnerId)||
          clash.attackerDamage<=0||clash.attackerDamage>12||clash.defenderDamage<=0||clash.defenderDamage>12)) fail('sieges.theatre.clash');
      const hero=round.hero;
      if (hero) {
        heroCount++;
        const elder=hero.move==='elder-rescue';
        const fighter=round.defenders.find(row=>row.actorId===hero.actorId);
        if (heroCount>1||!fighter||fighter.sectId!==siege.defenderSectId||fighter.rank!==hero.rank||
            hero.rank!==(elder?'太上长老':'掌门')||hero.paidQi!==(elder?24:18)||hero.paidHp!==(elder?0:12)||
            round.wallBefore<=0||round.wallBefore>150||hero.wallSaved<=0||hero.wallSaved>(elder?28:22)||
            round.wallBefore-round.wallAfter+hero.wallSaved>Math.min(round.wallBefore,128)||
            (hero.wallSaved<(elder?28:22)&&round.wallAfter!==round.wallBefore)) fail('sieges.theatre.hero');
      }
      retained(round.sourceEventId,round.tick,source=>isDiplomacy(source,round.tick)&&source.locationId===siege.destinationId&&
        round.attackers.every(row=>source.actorIds.includes(row.actorId)) &&
        (source.title==='护山阵接战'
          ?source.description===`护山阵受损${round.wallBefore-round.wallAfter}，尚余${round.wallAfter}阵力。`
          :['攻山告捷','攻山退兵'].includes(source.title)&&frame.terminal?.sourceEventId===source.id&&
            round.defenders.every(row=>source.actorIds.includes(row.actorId))),'sieges.theatre.round.source');
    }
    if (frame.queued) {
      const queued=frame.queued, actor=actors.get(queued.actorId);
      if (siege.status!=='sieging'||frame.terminal||heroCount||queued.queuedTick!==world.tick||queued.queuedTick<(arrival??Infinity)||
          !actor||participants.includes(actor.id)) fail('sieges.theatre.queued');
    }
    const terminal=frame.terminal;
    if (!terminal) {
      if (!active&&!destinationGone) fail('sieges.theatre.terminal');
      continue;
    }
    if (active||terminal.status!==siege.status||terminal.tick<=origin||terminal.tick>world.tick||
        terminal.tick!==siege.lastResolvedTick||terminal.tick<lastRoundTick||
        terminal.battlefield!==(frame.rounds.length>0)||
        (terminal.status==='victory'&&(frame.rounds.at(-1)?.tick!==terminal.tick||frame.rounds.at(-1)?.wallAfter!==0))) fail('sieges.theatre.terminal');
    if (terminal.status==='withdrawn') {
      const prefix=`evt-${terminal.tick}-ceasefire-`;
      if (!terminal.sourceEventId.startsWith(prefix)||!/^\d+-signed$/.test(terminal.sourceEventId.slice(prefix.length))) fail('sieges.theatre.withdrawn');
      const dealId=terminal.sourceEventId.slice(`evt-${terminal.tick}-`.length,-'-signed'.length);
      const agreement=world.ceasefires.agreements.find(row=>row.id===dealId);
      const signedCause=causality.get(terminal.sourceEventId);
      if (signedCause && (signedCause.entityId!==dealId||signedCause.tick!==terminal.tick||
          signedCause.kind!=='truce_signed'||signedCause.outcome!=='truce_with_withdrawal'||
          (launchCause&&!signedCause.predecessors.some(link=>link.eventId===launchId&&link.relation==='withdrew_siege')))) fail('sieges.theatre.withdrawn');
      if (agreement && (agreement.signedTick!==terminal.tick||!agreement.withdrawnSiegeIds.includes(siege.id)||
          ![agreement.proposerSectId,agreement.targetSectId].includes(siege.attackerSectId)||
          ![agreement.proposerSectId,agreement.targetSectId].includes(siege.defenderSectId))) fail('sieges.theatre.withdrawn');
      retained(terminal.sourceEventId,terminal.tick,source=>isDiplomacy(source,terminal.tick)&&source.title==='两宗签署停战撤军议约'&&
        (!agreement||(source.actorIds[0]===agreement.proposerId&&source.actorIds[1]===agreement.targetLeaderId)),'sieges.theatre.withdrawn');
    } else {
      if (terminal.sourceEventId!==nativeId(siege,terminal.tick)) fail('sieges.theatre.terminal');
      retained(terminal.sourceEventId,terminal.tick,source=>isDiplomacy(source,terminal.tick)&&source.locationId===siege.destinationId&&
        source.title===(terminal.status==='victory'?'攻山告捷':'攻山退兵'),'sieges.theatre.terminal');
    }
  }
}
