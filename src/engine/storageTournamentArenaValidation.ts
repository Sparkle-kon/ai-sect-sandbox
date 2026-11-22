import type { ChronicleAnchor, WorldEvent, WorldState } from '../types/world';

type Fail=(path:string)=>never;
const path='occasions.arena';
const exactIds=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,index)=>id===b[index]);
const uniqueIds=(ids:readonly string[])=>new Set(ids).size===ids.length;
const endpoint=(tick:number,arenaId:string,slug:string)=>`evt-${tick}-${arenaId}-${slug}`;
const prizeId=(arenaId:string)=>`tournament-champion-${arenaId}`;

/** Check new durable display rounds against the actual native bracket, never re-roll a tournament on load. */
export function validateTournamentArenaHistory(world:WorldState,fail:Fail):void{
  const shows=world.occasions.filter(row=>row.arena!==undefined);
  if(!shows.length&&!world.tournamentWagers)return;
  const actorIds=new Set(world.cultivators.map(actor=>actor.id));
  const sites=new Map(world.locations.map(site=>[site.id,site]));
  const wanted=new Set(shows.flatMap(show=>[endpoint(show.arena!.openedTick,show.id,'commence'),
    ...show.arena!.rounds.map(round=>round.eventId),...(show.arena!.terminal?[show.arena!.terminal.eventId]:[])]));
  const sources=new Map<string,WorldEvent[]>(), archived=new Map<string,ChronicleAnchor[]>();
  const addArchived=(source:ChronicleAnchor)=>{
    if(!wanted.has(source.id))return;
    const list=archived.get(source.id);
    if(list)list.push(source);
    else archived.set(source.id,[source]);
  };
  world.chronicleArchive.anchors.forEach(addArchived);
  for(const chapter of [...world.chronicleArchive.chapters,...world.coldHistory.chapters])
    chapter.anchors.forEach(addArchived);
  for(const event of world.events){
    if(!wanted.has(event.id))continue;
    const list=sources.get(event.id);
    if(list)list.push(event);
    else sources.set(event.id,[event]);
  }
  const authority=(id:string,tick:number,siteId:string,actorIds:readonly string[])=>{
    const originals=sources.get(id);
    if(originals){
      const source=originals[0];
      if(originals.length!==1||source.tick!==tick||source.locationId!==siteId||
        source.category!=='heavenly'||source.witnessScope!==undefined||!exactIds(source.actorIds,actorIds))
        return fail(path+'.source');
    }
    // Native chronicle anchors preserve at most twelve of the original actors.
    const prefix=actorIds.slice(0,12);
    if(archived.get(id)?.some(source=>source.tick!==tick||source.locationId!==siteId||
      source.category!=='heavenly'||!exactIds(source.actorIds,prefix)))return fail(path+'.source');
  };
  const ids=new Set<string>();
  const artifacts=new Map<string,{name:string;tier?:string}[]>();
  for(const actor of world.cultivators){
    for(const item of actor.artifacts){
      if(!item.id?.startsWith('tournament-champion-'))continue;
      const copies=artifacts.get(item.id);
      if(copies)copies.push(item);
      else artifacts.set(item.id,[item]);
    }
  }
  for(const show of shows){
    const arena=show.arena!,site=sites.get(show.locationId);
    // An independently dated abandoned public HQ may be physically retyped by a later relocation.
    const publicSite=site&&(site.type==='market'||site.type==='sect_hq'||site.type==='spirit_vein'&&
      world.relocations.abandonedSites.some(row=>row.originId===site.id&&row.originalType==='sect_hq'&&row.tick>=arena.openedTick));
    if(ids.has(show.id)||show.kind!=='tournament'||show.status==='registration'||show.omenId!==undefined||show.anchorSiteId!==undefined||
      show.id!==`occasion-${show.startedTick}-tournament`||show.startedTick<1||show.startedTick%60!==0||
      !publicSite||site.expeditionOmenId!==undefined||show.registrationClosesTick!==show.startedTick+3||
      show.expiresTick!==show.startedTick+12||arena.openedTick<show.registrationClosesTick||arena.openedTick>=show.expiresTick||
      arena.openedTick>world.tick||show.lastResolvedTick===undefined||show.lastResolvedTick<arena.openedTick||
      show.lastResolvedTick>world.tick||![8,16].includes(arena.seededIds.length)||show.participantIds.length>16||
      !uniqueIds(show.participantIds)||!uniqueIds(arena.seededIds)||
      arena.seededIds.some(id=>!actorIds.has(id)||!show.participantIds.includes(id))||
      show.round!==arena.rounds.length||show.expeditions.length) return fail(path+'.opening');
    ids.add(show.id);
    authority(endpoint(arena.openedTick,show.id,'commence'),arena.openedTick,show.locationId,show.participantIds);
    let survivors=[...arena.seededIds],previousTick=arena.openedTick,legacyIndex=0;
    for(const [index,round] of arena.rounds.entries()){
      if(!survivors.length||round.round!==index+1||round.tick<=previousTick||round.tick>show.lastResolvedTick||
        round.tick>=show.expiresTick||!uniqueIds(round.absentIds)||
        !exactIds(round.absentIds,survivors.filter(id=>round.absentIds.includes(id))))return fail(path+'.round');
      const attendance=survivors.filter(id=>!round.absentIds.includes(id));
      if(round.bouts.length!==Math.ceil(attendance.length/2))return fail(path+'.pair');
      for(const [i,bout] of round.bouts.entries()){
        const first=attendance[i],last=attendance[attendance.length-1-i],isBye=first===last;
        const mirror=show.bouts[legacyIndex++];
        if(bout.firstId!==first||bout.secondId!==(isBye?undefined:last)||
          (isBye?(bout.winnerId!==first||bout.firstDamage!==0||bout.secondDamage!==undefined):
            (bout.winnerId!==first&&bout.winnerId!==last||bout.secondDamage===undefined||
              bout.firstDamage>(bout.winnerId===first?70_000_000:140_000_000)||
              (bout.secondDamage??0)>(bout.winnerId===last?70_000_000:140_000_000)))||
          !mirror||mirror.round!==round.round||mirror.firstId!==bout.firstId||mirror.secondId!==bout.secondId||mirror.winnerId!==bout.winnerId)
          return fail(path+'.pair');
      }
      survivors=round.bouts.map(row=>row.winnerId);
      previousTick=round.tick;
      const slug=survivors.length===0?'close':survivors.length===1?'champion':'round';
      if(round.eventId!==endpoint(round.tick,show.id,slug)||(survivors.length<2&&index!==arena.rounds.length-1))
        return fail(path+'.round');
      authority(round.eventId,round.tick,show.locationId,slug==='champion'?survivors:show.participantIds);
    }
    if(legacyIndex!==show.bouts.length)return fail(path+'.pair');
    const terminal=arena.terminal;
    if(!terminal){
      if(show.status!=='running'||show.championId!==undefined||survivors.length<2||!exactIds(show.remainingIds,survivors)||
        arena.prize!==undefined)return fail(path+'.terminal');
      continue;
    }
    const last=arena.rounds.at(-1);
    if(terminal.status!==show.status||terminal.tick!==show.lastResolvedTick||terminal.tick<=arena.openedTick||
      terminal.tick<previousTick||show.remainingIds.length||
      terminal.eventId!==endpoint(terminal.tick,show.id,terminal.status==='completed'?'champion':'close'))
      return fail(path+'.terminal');
    if(terminal.status==='completed'){
      if(!last||last.eventId!==terminal.eventId||survivors.length!==1||show.championId!==survivors[0])
        return fail(path+'.terminal');
    }else if(show.championId!==undefined||(terminal.tick<show.expiresTick&&(!last||last.eventId!==terminal.eventId||survivors.length)))
      return fail(path+'.terminal');
    authority(terminal.eventId,terminal.tick,show.locationId,terminal.status==='completed'?survivors:show.participantIds);
    const prizeText='擂台依实赛颁「百年论剑魁首」称号与通天灵宝「万宗照夜印」。';
    const crown=terminal.status==='completed'?sources.get(terminal.eventId)?.[0]:undefined;
    if((crown&&crown.description.endsWith(prizeText)!==(arena.prize!==undefined))||
      (arena.prize===undefined&&(artifacts.has(prizeId(show.id))||
        archived.get(terminal.eventId)?.some(source=>source.description.endsWith(prizeText)))))return fail(path+'.prize');
    if(arena.prize){
      const prize=arena.prize,bout=last?.bouts[0],copies=artifacts.get(prize.artifactId)??[];
      if(terminal.status!=='completed'||!bout?.secondId||last?.bouts.length!==1||bout.winnerId!==prize.actorId||
        prize.actorId!==show.championId||prize.tick!==terminal.tick||prize.artifactId!==prizeId(show.id)||
        copies.length>1||copies.some(row=>row.name!=='万宗照夜印'||row.tier!=='通天灵宝'))
        return fail(path+'.prize');
    }
  }
  validateTournamentWagerHistory(world,fail);
}

function validateTournamentWagerHistory(world:WorldState,fail:Fail):void{
  const state=world.tournamentWagers;
  if(!state)return;
  const path='tournamentWagers.tickets';
  if(!state.tickets.length)return fail(path);
  const shows=new Map(world.occasions.map(row=>[row.id,row]));
  const actors=new Map(world.cultivators.map(row=>[row.id,row]));
  const seen=new Set<string>();
  let previous=0;
  for(const ticket of state.tickets){
    const show=shows.get(ticket.arenaId),arena=show?.arena,spectator=actors.get(ticket.spectatorId);
    if(!show||!arena||!spectator||seen.has(ticket.arenaId)||ticket.id!==`tournament-wager-${show.id}`||
      ticket.siteId!==show.locationId||ticket.placedTick!==arena.openedTick||ticket.placedTick<=previous||
      show.participantIds.includes(ticket.spectatorId)||!arena.seededIds.includes(ticket.contenderId))
      return fail(path+'.source');
    seen.add(ticket.arenaId);previous=ticket.placedTick;
    const end=arena.terminal,receipt=ticket.settlement,final=arena.rounds.at(-1);
    if(!receipt){
      if(ticket.status!=='open'||show.status!=='running'||end!==undefined)return fail(path+'.settlement');
      continue;
    }
    if(!end||ticket.status==='open'||receipt.tick!==end.tick||receipt.eventId!==end.eventId)return fail(path+'.settlement');
    const madeFinal=final?.eventId===end.eventId&&final.bouts.length===1&&final.bouts[0].secondId!==undefined;
    const walkover=final?.eventId===end.eventId&&final.bouts.length===1&&final.bouts[0].secondId===undefined;
    const contested=end.status==='completed'&&madeFinal&&!!arena.prize;
    const cancelled=end.status==='cancelled'||end.status==='completed'&&walkover&&!arena.prize;
    const winner=contested?show.championId:undefined;
    if((!contested&&!cancelled)||receipt.winnerId!==winner)return fail(path+'.settlement');
    const expected=contested?(ticket.contenderId===winner?'won':'lost'):'refunded';
    if(ticket.status==='forfeited'?spectator.alive&&spectator.hp>0:ticket.status!==expected)
      return fail(path+'.settlement');
    const awarded=ticket.status==='won'?ticket.stake:0;
    const paid=ticket.status==='won'?ticket.stake*2:ticket.status==='refunded'?ticket.stake:0;
    if(receipt.award!==awarded||receipt.payout!==paid)return fail(path+'.amount');
  }
}
