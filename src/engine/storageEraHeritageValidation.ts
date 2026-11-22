import type {ChronicleReading,ChronicleSourceFact,EraHeritageDate,WorldState} from '../types/world';
import {CHRONICLE_ERRATA_WINDOW} from './chronicleErrataEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {OATH_TERMS} from './oathEngine';
import {SETTLEMENT_RELIEF} from './settlementReliefTerms';

const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const compact=(values:readonly string[])=>new Set(values).size===values.length;
const claimValue=(reading:ChronicleReading)=>reading.kind==='duel'?reading.winnerId:reading.delivery;
function sameFact(a:ChronicleSourceFact,b:ChronicleSourceFact):boolean{
  if(a.tick!==b.tick||a.sourceEventId!==b.sourceEventId||a.locationId!==b.locationId)return false;
  return a.kind==='duel'&&b.kind==='duel'?a.winnerId===b.winnerId&&same(a.participantIds,b.participantIds):
    a.kind==='relief'&&b.kind==='relief'&&a.actorId===b.actorId&&a.settlementId===b.settlementId&&
    a.stones===b.stones&&a.herbs===b.herbs;
}

/** Dated provenance does not prove possession; only current legal native source can open an original. */
export function validateEraHeritage(world:WorldState,fail:(path:string)=>never):void{
  const heritage=world.eraHeritage;
  if(!heritage)return;
  const actors=new Set(world.cultivators.map(row=>row.id));
  const locations=new Map(world.locations.map(site=>[site.id,site]));
  const events=new Map<string,typeof world.events>();
  for(const event of world.events){
    const matches=events.get(event.id)??[];
    matches.push(event);events.set(event.id,matches);
  }
  const legalSite=(id:string)=>{
    const site=locations.get(id);
    return !!site&&site.type!=='secret_realm'&&site.type!=='abyss'&&!isScopedExpeditionGate(site);
  };
  const clock=({tick,year,month}:EraHeritageDate)=>{
    return tick>=1&&tick<=world.tick&&(year<world.year||year===world.year&&month<=world.month)&&
      (tick!==world.tick||year===world.year&&month===world.month);
  };
  const clockMatches=(news:{tick:number;year:number;month:number},row:EraHeritageDate)=>news.tick===row.tick&&news.year===row.year&&news.month===row.month;
  const checkSerial=(id:string,prefix:string,cap:number)=>{
    const suffix=id.startsWith(prefix)?id.slice(prefix.length):'';
    return /^[1-9][0-9]*$/u.test(suffix)&&Number.isSafeInteger(Number(suffix))&&Number(suffix)<cap;
  };
  const contracts=new Map(world.oaths.contracts.map(row=>[row.id,row]));
  const signatures=new Set<string>();
  for(const row of heritage.oaths){
    const live=contracts.get(row.oathId),kind=OATH_TERMS[row.term],news=events.get(row.eventId);
    if(signatures.has(row.oathId)||!clock(row)||!legalSite(row.locationId)||row.requesterId===row.providerId||
      !actors.has(row.requesterId)||!actors.has(row.providerId)||!checkSerial(row.oathId,'oath-',world.oaths.nextId)||
      row.eventId!==`evt-${row.oathId}-${row.tick}-accept`||row.quantity!==kind.quantity||row.payment!==kind.payment||row.collateral!==kind.collateral||
      live&&(live.offeredTick>row.tick||live.offerExpiresTick<row.tick||live.locationId!==row.locationId||
        live.requesterId!==row.requesterId||live.providerId!==row.providerId||live.term!==row.term||
        live.status==='offered'||live.status==='declined'||live.status==='expired')||
      news&&(news.length!==1||!clockMatches(news[0],row)||news[0].category!=='diplomacy'||news[0].locationId!==row.locationId||
        !same(news[0].actorIds,[row.requesterId,row.providerId])))fail('eraHeritage.oaths.provenance');
    signatures.add(row.oathId);
  }
  const fragments=new Map(world.relics.fragments.map(row=>[row.id,row]));
  const relics=new Set<string>();
  for(const row of heritage.artifacts){
    const [first,second]=row.fragmentIds.map(id=>fragments.get(id));
    const news=events.get(row.eventId);
    if(relics.has(row.artifactId)||!clock(row)||!legalSite(row.locationId)||!actors.has(row.makerId)||row.fragmentIds.length!==2||
      !compact(row.fragmentIds)||!first||!second||first.slot===second.slot||
      [first,second].some(item=>item.setId!==row.setId||item.holder.kind!=='consumed'||item.holder.id!==row.artifactId)||
      row.eventId!==`evt-${row.tick}-assemble-${row.artifactId}`||
      news&&(news.length!==1||!clockMatches(news[0],row)||news[0].locationId!==row.locationId||
        !same(news[0].actorIds,[row.makerId])))fail('eraHeritage.artifacts.provenance');
    relics.add(row.artifactId);
  }
  const boards=new Map(world.chronicleErrata.sources.map(row=>[row.sourceEventId,row]));
  const witnesses=new Map(world.witnesses.facts.map(row=>[row.eventId,row]));
  const villages=new Map(world.settlements.villages.map(row=>[row.id,row]));
  const facts=new Set<string>(),claims=new Set<string>();
  for(const row of heritage.facts){
    const source=row.source,board=boards.get(source.sourceEventId),news=events.get(source.sourceEventId);
    const witness=witnesses.get(source.sourceEventId);
    const subjects=source.kind==='duel'?source.participantIds:[source.actorId];
    if(facts.has(source.sourceEventId)||!clock(row)||source.tick!==row.tick||!legalSite(source.locationId)||
      !row.firsthandIds.length||!compact(row.firsthandIds)||row.firsthandIds.some(id=>!actors.has(id)||
        (source.kind==='relief'?!subjects.includes(id):witness&&!subjects.includes(id)&&!witness.witnessIds.includes(id)))||
      subjects.some(id=>!actors.has(id))||board&&!sameFact(source,board)||
      news&&(news.length!==1||!clockMatches(news[0],row)||news[0].locationId!==source.locationId||
        news[0].witnessScope==='participants'||subjects.some(id=>!news[0].actorIds.includes(id))))fail('eraHeritage.facts.provenance');
    if(source.kind==='duel'){
      if(subjects.length!==2||!compact(subjects)||!subjects.includes(source.winnerId)||
        !['duel','kill'].some(suffix=>source.sourceEventId===`evt-${row.tick}-${subjects[0]}-${suffix}`)||
        news&&news[0].duelWinnerId!==source.winnerId)fail('eraHeritage.facts.duel');
    }else if(villages.get(source.settlementId)?.locationId!==source.locationId||source.stones!==SETTLEMENT_RELIEF.stones||
      source.herbs!==SETTLEMENT_RELIEF.jade_leaf||
      source.sourceEventId!==`evt-settlement-${row.tick}-relief-${source.settlementId}-${source.actorId}`)fail('eraHeritage.facts.relief');
    facts.add(source.sourceEventId);
    const linked=(tick:number)=>tick>=row.tick&&tick<=world.tick&&tick<row.tick+CHRONICLE_ERRATA_WINDOW;
    const authors=new Set<string>();
    for(const claim of row.retellings){
      if(claims.has(claim.id)||authors.has(claim.authorId)||!actors.has(claim.authorId)||!linked(claim.tick)||
        claim.sourceEventId!==source.sourceEventId||!checkSerial(claim.id,'chronicle-retelling-',world.chronicleErrata.nextId)||
        claim.reading.kind!==source.kind||source.kind==='duel'&&!subjects.includes(claimValue(claim.reading)))
        fail('eraHeritage.facts.readings');
      claims.add(claim.id);authors.add(claim.authorId);
    }
    const correction=row.correction;
    if(correction){
      const actualClaims=new Set(correction.contestedRetellingIds);
      if(claims.has(correction.id)||!actors.has(correction.editorId)||subjects.includes(correction.editorId)||
        !linked(correction.tick)||correction.sourceEventId!==source.sourceEventId||
        !checkSerial(correction.id,'chronicle-correction-',world.chronicleErrata.nextId)||
        correction.reading.kind!==source.kind||claimValue(correction.reading)!==(source.kind==='duel'?source.winnerId:'full_supplies')||
        !compact(correction.contestedRetellingIds)||actualClaims.size!==row.retellings.length||
        new Set(row.retellings.map(claim=>claimValue(claim.reading))).size<2||
        row.retellings.some(claim=>claim.authorId===correction.editorId||claim.tick>=correction.tick||!actualClaims.has(claim.id)))
        fail('eraHeritage.facts.correction');
      claims.add(correction.id);
    }
    const learners=new Set<string>();
    for(const relay of row.relays){
      if(learners.has(relay.learnerId)||!actors.has(relay.learnerId)||relay.learnedTick<row.tick||relay.learnedTick>world.tick||
        row.firsthandIds.includes(relay.learnerId)||!row.firsthandIds.includes(relay.originWitnessId))fail('eraHeritage.facts.relays');
      learners.add(relay.learnerId);
    }
  }
}
