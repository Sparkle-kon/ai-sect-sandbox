import type { CultivationUnion } from '../types/cultivationClan';
import type { ChronicleAnchor, WorldState } from '../types/world';
import {
  CLAN_ADULT_AGE, CLAN_BIRTH_EARNED_MONTHS, CLAN_CEREMONY_QI, CLAN_MATURITY_TICKS, CLAN_REPLY_TICKS,
  clanChildActorId, clanChildInborn, clanEventId,
} from './cultivationClanTerms';

type Fail=(path:string)=>never;
type Move=Parameters<typeof clanEventId>[2];
const path='cultivationClans';
const eventPattern=/^evt-([1-9]\d*)-(clan-union-[1-9]\d*)-(propose|accept|refuse|ceremony_offer|ceremony|family_offer|family_accept|family_refuse|birth|mature|lost|expired)$/u;
const privateSource=(id:string)=>{
  const match=eventPattern.exec(id);
  return !!match&&match[3]!=='ceremony'&&match[3]!=='mature';
};
const equal=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const allowedReply=(offer:number,reply:number)=>reply>offer&&reply<=offer+CLAN_REPLY_TICKS;

export function validateCultivationClanHistory(world:WorldState,fail:Fail):void{
  const state=world.cultivationClans;
  const leaked=(rows:readonly {id:string}[])=>rows.some(row=>privateSource(row.id));
  if(leaked(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(row=>leaked(row.anchors))||
    world.coldHistory.chapters.some(row=>leaked(row.anchors))||
    world.chronicleCausality.nodes.some(row=>privateSource(row.eventId))||
    world.chronicleErrata.sources.some(row=>privateSource(row.sourceEventId))||
    world.eraHeritage?.facts.some(row=>privateSource(row.source.sourceEventId))||
    world.witnesses.facts.some(row=>privateSource(row.eventId))||
    world.witnessedPersonalStory.scenes.some(row=>privateSource(row.eventId))||
    world.protagonistSuccession.arcs.some(row=>row.opening.some(item=>privateSource(item.eventId))||
      row.support.some(item=>privateSource(item.eventId))||!!row.death&&privateSource(row.death.eventId))||
    world.cultivators.some(actor=>actor.rumors.some(rumor=>!!rumor.originEventId&&privateSource(rumor.originEventId)||
      rumor.id.startsWith('rumor-')&&privateSource(rumor.id.slice('rumor-'.length)))))
    return fail(path+'.privateSource');
  const original=world.events.filter(event=>eventPattern.test(event.id));
  if(!state){
    if(original.length||world.cultivators.some(actor=>actor.clanHeritage!==undefined||actor.id.startsWith('cultivator-clan-child-')))
      return fail(path+'.authority');
    return;
  }
  if(!state.unions.length)return fail(path+'.unions');
  const actors=new Map(world.cultivators.map(row=>[row.id,row]));
  const sites=new Map(world.locations.map(row=>[row.id,row]));
  const unions=new Map<string,CultivationUnion>();
  const children=new Map<string,(typeof state.children)[number]>();
  const parentOrigin=new Map(state.children.filter(row=>row.maturedTick!==undefined).map(row=>[clanChildActorId(row.id),row]));
  const ancestry=(actorId:string)=>{
    const visited=new Set<string>(),pending=[actorId];
    while(pending.length){
      const next=pending.pop()!;
      if(visited.has(next))continue;
      visited.add(next);
      pending.push(...parentOrigin.get(next)?.parentIds??[]);
    }
    return visited;
  };
  const active=new Map<string,number>();
  const earlierUnions=new Map<string,CultivationUnion[]>();
  const deaths=new Map(world.estates.entries.map(row=>[row.deceasedId,row.openedTick]));
  for(const stamp of world.eraHistory.receipts)if(stamp.kind==='death')
    deaths.set(stamp.actorId,Math.min(stamp.tick,deaths.get(stamp.actorId)??Infinity));
  for(const trip of [...(world.upperPassage?.journeys??[]),...(world.frontier?.visits??[])])
    if(trip.deceasedTick!==undefined)
      deaths.set(trip.actorId,Math.min(trip.deceasedTick,deaths.get(trip.actorId)??Infinity));
  const sources=new Map<string,{union:CultivationUnion;tick:number;move:Move;actorIds:string[]}>();
  const localTurn=new Set<string>();
  let serial=0,previousBirth=0,previousProposal=0;
  const expected=(union:CultivationUnion,tick:number,move:Move,actorIds:string[]=[...union.parents])=>{
    const key=clanEventId(tick,union.id,move);
    if(sources.has(key))return fail(path+'.source');
    sources.set(key,{union,tick,move,actorIds});
  };
  const once=(actorId:string,tick:number)=>{
    const id=JSON.stringify([actorId,tick]);
    if(localTurn.has(id))return fail(path+'.turn');
    localTurn.add(id);
  };
  for(const row of state.unions){
    const idSerial=Number(/^clan-union-([1-9]\d*)$/u.exec(row.id)?.[1]);
    const [first,second]=row.parents,a=actors.get(first),b=actors.get(second),site=sites.get(row.siteId);
    if(!Number.isSafeInteger(idSerial)||idSerial!==serial+1||idSerial>=state.nextId||
      row.parents.length!==2||first===second||!a||!b||a.age<CLAN_ADULT_AGE||b.age<CLAN_ADULT_AGE||
      !site||site.type==='secret_realm'||site.type==='abyss'||site.expeditionOmenId!==undefined||
      row.proposedTick<1||row.proposedTick<previousProposal||row.proposedTick>world.tick)return fail(path+'.union');
    serial=idSerial;previousProposal=row.proposedTick;
    const open=row.status==='proposed'||row.status==='accepted'||row.status==='bonded';
    const accepted=row.status==='accepted'||row.status==='bonded';
    if(open!==(row.closedTick===undefined)||accepted!==(row.acceptedTick!==undefined)||
      row.status==='proposed'&&world.tick>row.proposedTick+CLAN_REPLY_TICKS||
      row.acceptedTick!==undefined&&(!allowedReply(row.proposedTick,row.acceptedTick)||row.acceptedTick>world.tick)||
      row.closedTick!==undefined&&(row.closedTick<=row.proposedTick||row.closedTick>world.tick||
        row.status==='expired'&&row.closedTick<=row.proposedTick+CLAN_REPLY_TICKS||
        row.status==='refused'&&!allowedReply(row.proposedTick,row.closedTick)))return fail(path+'.consent');
    const key=JSON.stringify([...row.parents].sort());
    if((active.get(key)??0)>row.proposedTick)return fail(path+'.overlap');
    active.set(key,row.closedTick??Infinity);
    for(const id of row.parents){
      const earlier=earlierUnions.get(id)??[];
      for(const prior of earlier){
        if(prior.closedTick!==undefined&&prior.closedTick<=row.proposedTick)continue;
        const counterpart=prior.parents.find(other=>other!==id)!;
        const body=actors.get(counterpart),death=deaths.get(counterpart);
        if(!body||body.alive&&body.hp>0||death!==undefined&&death>row.proposedTick)return fail(path+'.overlap');
      }
      earlier.push(row);
      earlierUnions.set(id,earlier);
    }
    const ancestors=[...new Set(row.parents.flatMap(id=>parentOrigin.get(id)?.clanId??[]))].sort();
    const cross=ancestry(first);
    if(row.parents.some(id=>(parentOrigin.get(id)?.maturedTick??0)>=row.proposedTick)||
      [...ancestry(second)].some(id=>cross.has(id))||
      row.clanId!==(ancestors.length===1?ancestors[0]:`clan-line-${idSerial}`)||
      (ancestors.length>1?row.ancestorClanIds===undefined||!equal(row.ancestorClanIds,ancestors):row.ancestorClanIds!==undefined))
      return fail(path+'.lineage');
    unions.set(row.id,row);
    once(first,row.proposedTick);
    expected(row,row.proposedTick,'propose');
    if(row.acceptedTick!==undefined){once(second,row.acceptedTick);expected(row,row.acceptedTick,'accept',[second,first]);}
    if(row.status==='refused'){
      once(second,row.closedTick!);expected(row,row.closedTick!,'refuse',[second,first]);
    }
    if(row.status==='expired')expected(row,row.closedTick!,'expired');

    const invite=row.ceremonyOffer,ceremony=row.ceremony;
    if((row.status==='bonded')!==(ceremony!==undefined)||(!accepted&&(invite!==undefined||row.plan!==undefined))||
      invite&&(!row.parents.includes(invite.actorId)||invite.tick<=(row.acceptedTick??Infinity)||invite.tick>world.tick)||
      ceremony&&(!invite||!row.parents.includes(ceremony.actorId)||ceremony.actorId===invite.actorId||
        ceremony.qiPaidEach!==CLAN_CEREMONY_QI||!allowedReply(invite.tick,ceremony.tick)||ceremony.tick>world.tick))
      return fail(path+'.ceremony');
    if(invite){once(invite.actorId,invite.tick);expected(row,invite.tick,'ceremony_offer',[invite.actorId,row.parents.find(id=>id!==invite.actorId)!]);}
    if(ceremony){once(ceremony.actorId,ceremony.tick);expected(row,ceremony.tick,'ceremony',[ceremony.actorId,invite!.actorId]);}
    const plan=row.plan;
    if(!plan)continue;
    const didAccept=plan.acceptedTick!==undefined;
    const completed=plan.status==='declined'||plan.status==='born'||plan.status==='lost';
    const includesChild=plan.status==='born';
    const earned=plan.earnedTicks,final=earned.at(-1);
    if(!ceremony||!row.parents.includes(plan.offeredBy)||plan.offeredTick<=ceremony.tick||plan.offeredTick>world.tick||
      completed!==(plan.closedTick!==undefined)||didAccept!==(plan.acceptedBy!==undefined)||
      didAccept&&(!allowedReply(plan.offeredTick,plan.acceptedTick!)||plan.acceptedTick!>world.tick||
        !row.parents.includes(plan.acceptedBy!)||plan.acceptedBy===plan.offeredBy)||
      didAccept!==(plan.status==='expecting'||plan.status==='born'||plan.status==='lost')||
      plan.status==='declined'&&!allowedReply(plan.offeredTick,plan.closedTick??0)||
      !didAccept&&earned.length!==0||includesChild!==(plan.childId!==undefined)||
      includesChild!==(earned.length===CLAN_BIRTH_EARNED_MONTHS)||
      earned.some((tick,i)=>tick<=(earned[i-1]??plan.acceptedTick??Infinity)||tick>world.tick)||
      plan.closedTick!==undefined&&(plan.closedTick<=plan.offeredTick||plan.closedTick>world.tick||
        plan.closedTick<(final??plan.acceptedTick??0)||plan.status==='lost'&&
        (plan.closedTick<=(final??plan.acceptedTick??0)||a.alive&&b.alive&&a.hp>0&&b.hp>0))||
      includesChild&&(plan.childId!==`clan-child-${row.id}`||plan.closedTick!==final))
      return fail(path+'.family');
    once(plan.offeredBy,plan.offeredTick);
    const respondent=row.parents.find(id=>id!==plan.offeredBy)!;
    expected(row,plan.offeredTick,'family_offer',[plan.offeredBy,respondent]);
    if(didAccept){once(plan.acceptedBy!,plan.acceptedTick!);expected(row,plan.acceptedTick!,'family_accept',[respondent,plan.offeredBy]);}
    if(plan.status==='declined'){once(respondent,plan.closedTick!);expected(row,plan.closedTick!,'family_refuse',[respondent,plan.offeredBy]);}
    if(plan.status==='lost')expected(row,plan.closedTick!,'lost');
    if(plan.status==='born')expected(row,plan.closedTick!,'birth');
  }
  if(serial+1!==state.nextId)return fail(path+'.serial');
  for(const child of state.children){
    const union=unions.get(child.unionId),plan=union?.plan;
    const a=actors.get(child.parentIds[0]),b=actors.get(child.parentIds[1]);
    if(children.has(child.id)||!union||!plan||plan.status!=='born'||plan.childId!==child.id||plan.closedTick!==child.birthTick||
      !equal(child.parentIds,union.parents)||child.clanId!==union.clanId||child.siteId!==union.siteId||
      !a||!b||!equal(child.parentRoots,[a.spiritRoot,b.spiritRoot])||
      child.birthTick<previousBirth||child.birthTick<1||child.birthTick>world.tick||
      child.maturesAtTick!==child.birthTick+CLAN_MATURITY_TICKS)return fail(path+'.child');
    const inborn=clanChildInborn(world.random.seed,child.id,child.parentRoots);
    if(!equal(child.roots,inborn.roots)||child.gender!==inborn.gender||child.name!==inborn.name||
      child.innateTrait!==inborn.innateTrait)return fail(path+'.inborn');
    previousBirth=child.birthTick;
    children.set(child.id,child);
    const actor=actors.get(clanChildActorId(child.id));
    const proof=actor?.clanHeritage;
    if(child.maturedTick===undefined){
      if(actor||world.tick>=child.maturesAtTick)return fail(path+'.maturity');
    }else{
      if(child.maturedTick<child.maturesAtTick||child.maturedTick>world.tick||!actor||!proof||actor.age<CLAN_ADULT_AGE||
        actor.name!==child.name||actor.gender!==child.gender||actor.spiritRoot!==child.roots[0]||
        proof.childId!==child.id||proof.clanId!==child.clanId||!equal(proof.roots,child.roots)||
        proof.innateTrait!==child.innateTrait)return fail(path+'.maturity');
      expected(union,child.maturedTick,'mature',[actor.id]);
    }
  }
  for(const union of state.unions)
    if(union.plan?.childId!==undefined&&!children.has(union.plan.childId))return fail(path+'.child');
  for(const actor of world.cultivators)if(actor.clanHeritage!==undefined||actor.id.startsWith('cultivator-clan-child-')){
    const child=actor.clanHeritage&&children.get(actor.clanHeritage.childId);
    if(!child||child.maturedTick===undefined||actor.id!==clanChildActorId(child.id))return fail(path+'.heritage');
  }
  const storedEvent=(event:ChronicleAnchor)=>{
    if(event.actorIds.some(id=>id.startsWith('cultivator-clan-child-')&&
      (parentOrigin.get(id)?.maturedTick??Infinity)>event.tick))return fail(path+'.maturity');
    const match=eventPattern.exec(event.id);
    if(!match)return;
    const source=sources.get(event.id);
    if(!source||privateSource(event.id)||event.tick!==source.tick||event.locationId!==source.union.siteId||
      event.category!==(source.move==='mature'?'breakthrough':'diplomacy')||!equal(event.actorIds,source.actorIds))
      return fail(path+'.publicSource');
  };
  world.chronicleArchive.anchors.forEach(storedEvent);
  for(const history of [world.chronicleArchive,world.coldHistory])
    for(const chapter of history.chapters)chapter.anchors.forEach(storedEvent);
  const seen=new Set<string>();
  const oldestHot=world.events.reduce((min,row)=>Math.min(min,row.tick),Infinity);
  for(const event of original){
    const [,at,unionId,move]=eventPattern.exec(event.id)!;
    const union=unions.get(unionId),source=sources.get(event.id);
    if(!union||seen.has(event.id)||Number(at)!==event.tick||event.tick>world.tick||
      event.locationId!==union.siteId||event.witnessScope!==(privateSource(event.id)?'participants':undefined)||
      event.category!==(move==='mature'?'breakthrough':'diplomacy')||event.dialogue!==undefined||event.duelWinnerId!==undefined||event.damage!==undefined||event.daoIntents!==undefined||
      event.forbiddenArt!==undefined||source&&source.tick!==event.tick)return fail(path+'.source');
    if(source){
      if(!equal(event.actorIds,source.actorIds))return fail(path+'.source');
    }else if(move!=='ceremony_offer'||union.acceptedTick===undefined||union.ceremonyOffer===undefined||
      event.tick<=union.acceptedTick||event.tick+CLAN_REPLY_TICKS>=union.ceremonyOffer.tick||
      event.actorIds.length!==2||event.actorIds[0]===event.actorIds[1]||event.actorIds.some(id=>!union.parents.includes(id)))
      return fail(path+'.source');
    seen.add(event.id);
  }
  for(const [id,source] of sources)
    if(!seen.has(id)&&(source.tick>oldestHot||source.tick===world.tick&&world.events.length<120))return fail(path+'.source');
}
