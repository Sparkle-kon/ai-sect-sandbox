import type { DramaticBondFact } from '../types/dramaticBond';
import type { ChronicleAnchor, WorldEvent, WorldState } from '../types/world';
import { dramaticBondReadVenue, dramaticBondSourceId, dramaticBondWitnessIds, matchesDramaticBondFact } from './dramaticBondTerms';

type Fail = (path:string)=>never;
const chronological = (row: {year:number;month:number}) => row.year*12+row.month;
const equalIds = (a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const expectedCategory = (kind:DramaticBondFact['kind'])=>kind==='duel'?'combat':kind==='lethal_duel'?'death':'diplomacy';
const nativeWitnessKind = (kind:DramaticBondFact['kind'])=>kind==='encounter'?'socialize':kind==='duel'?'duel':undefined;

function matchesArchivedBond(fact:DramaticBondFact,source:ChronicleAnchor) {
  // The generic archive trims prose/dialogue and does not retain a combat winner.
  // It may corroborate or contradict shared public metadata, never invent a winner.
  return source.tick===fact.tick&&source.year===fact.year&&source.month===fact.month&&source.locationId===fact.siteId&&
    source.category===expectedCategory(fact.kind)&&equalIds(source.actorIds,fact.actorIds)&&
    (fact.kind!=='practice'||!source.dialogue||source.dialogue.kind==='dual_cultivation');
}

export function validateDramaticBondHistory(world:WorldState,fail:Fail):void {
  const facts=world.dramaticBonds?.facts;
  if (!facts?.length) return;
  const actors=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const byId=new Map(facts.map(fact=>[fact.sourceEventId,fact]));
  if (byId.size!==facts.length) fail('dramaticBonds.facts.source');
  const originals=new Map<string,WorldEvent>();
  for(const event of world.events) {
    const fact=byId.get(event.id);
    if(!fact)continue;
    if(originals.has(event.id)||!matchesDramaticBondFact(fact,event)) fail('dramaticBonds.facts.native');
    originals.set(event.id,event);
  }
  const archiveMatches=(source:ChronicleAnchor)=>{
    const fact=byId.get(source.id);
    if(fact&&!matchesArchivedBond(fact,source)) fail('dramaticBonds.facts.archive');
  };
  world.chronicleArchive.anchors.forEach(archiveMatches);
  for(const archive of [world.chronicleArchive,world.coldHistory]){
    for(const chapter of archive.chapters) chapter.anchors.forEach(archiveMatches);
  }
  for(const native of world.witnesses.facts){
    const fact=byId.get(native.eventId);
    if(fact&&(fact.tick!==native.tick||fact.siteId!==native.locationId||
      fact.winnerId!==native.winnerId||!equalIds(fact.actorIds,native.participantIds))) fail('dramaticBonds.facts.winner');
  }
  for(const native of [...world.chronicleErrata.sources,...(world.eraHeritage?.facts.map(row=>row.source)??[])]){
    const fact=byId.get(native.sourceEventId);
    if(fact&&(native.kind!=='duel'||fact.tick!==native.tick||fact.siteId!==native.locationId||
      fact.winnerId!==native.winnerId||!equalIds(fact.actorIds,native.participantIds))) fail('dramaticBonds.facts.winner');
  }
  const scenes=new Map(world.witnessedPersonalStory.scenes.map(scene=>[scene.eventId,scene]));
  const abandoned=world.relocations.abandonedSites;
  const abandonedTail=abandoned.map(row=>row.tick).sort((a,b)=>b-a).slice(0,64);
  // Relocation retypes the genuine old HQ as a public vein. A still-retained
  // abandonment must support that historic site, unless it is older than the
  // bounded native abandonment horizon and only the original stamp remains.
  const supportsRetypedVenue=(fact:DramaticBondFact)=>abandoned.some(row=>
    row.originId===fact.siteId&&row.originalType==='sect_hq'&&row.tick>=fact.tick)||
    (abandonedTail.length===64&&fact.tick<abandonedTail[63]);
  let previous:DramaticBondFact|undefined;
  for(const fact of facts){
    const [first,second]=fact.actorIds;
    const site=dramaticBondReadVenue(world,fact);
    if(fact.actorIds.length!==2||first===second||!actors.has(first)||!actors.has(second)||!site||
      (site.type==='spirit_vein'&&!supportsRetypedVenue(fact))||
      fact.tick>world.tick||chronological(fact)>chronological(world)||
      fact.sourceEventId!==dramaticBondSourceId(fact.tick,first,fact.kind)||
      previous&&(previous.tick>fact.tick||chronological(previous)>chronological(fact)||
        previous.tick===fact.tick&&(chronological(previous)!==chronological(fact)||previous.sourceEventId>=fact.sourceEventId)))
      fail('dramaticBonds.facts.source');
    const isCombat=fact.kind==='duel'||fact.kind==='lethal_duel';
    if(isCombat?fact.winnerId!==first&&fact.winnerId!==second:fact.winnerId!==undefined)
      fail('dramaticBonds.facts.winner');
    if(fact.kind==='lethal_duel'){
      const loser=fact.winnerId===first?second:first;
      const fallen=actors.get(loser);
      if(fact.fallenId!==loser||!fallen||fallen.alive||fallen.hp!==0) fail('dramaticBonds.facts.fallen');
    }else if(fact.fallenId!==undefined) fail('dramaticBonds.facts.fallen');
    const alignments=fact.alignmentsAtSource;
    if(fact.kind==='practice'?!alignments||alignments.length!==2:alignments!==undefined) fail('dramaticBonds.facts.alignment');
    const scene=scenes.get(fact.sourceEventId),witnessIds=fact.witnessIds;
    const expectedWitnessKind=nativeWitnessKind(fact.kind);
    if(witnessIds&&(!expectedWitnessKind||!witnessIds.length||
      witnessIds.some((id,i)=>id===first||id===second||!actors.has(id)||i>0&&witnessIds[i-1]>=id))) fail('dramaticBonds.facts.witness');
    if(scene){
      if(!expectedWitnessKind||scene.kind!==expectedWitnessKind||scene.tick!==fact.tick||scene.year!==fact.year||
        scene.month!==fact.month||scene.siteId!==fact.siteId||!equalIds(scene.actorIds,fact.actorIds)) fail('dramaticBonds.facts.witness');
      const original=originals.get(fact.sourceEventId);
      if(original){
        // A retained private personal-scope row is not a public witness credential on its own.
        const corroborated=dramaticBondWitnessIds(world,original);
        if(!equalIds(witnessIds??[],corroborated??[])) fail('dramaticBonds.facts.witness');
      }
    }
    previous=fact;
  }
}
