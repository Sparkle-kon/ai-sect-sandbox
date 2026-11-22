import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { decodeEraWorldSave, decodeWorldSave, encodeEraWorldSave, encodeWorldSave } from '../src/engine/storageEngine';
import { validateDramaticBondHistory } from '../src/engine/storageDramaticBondValidation';
import { terrainTileAt } from '../src/engine/terrainEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import type { DramaticBondFact } from '../src/types/dramaticBond';
import type { LLMDecisionPayload,WorldState } from '../src/types/world';
import { actualCommonBond,actualDefenderWinsLethally,bondActor,bondSite,firstId,nearId,noAct,secondId } from './dramaticBondNativeFixture';

function facts(world:WorldState){
  if(!world.dramaticBonds)throw Error('Expected actual native public pair evidence');
  return world.dramaticBonds.facts;
}
function fact(world:WorldState,kind:DramaticBondFact['kind']){
  const value=facts(world).find(row=>row.kind===kind);
  if(!value)throw Error(`Expected native ${kind}`);
  return value;
}
function reopen(world:WorldState){
  const bytes=encodeWorldSave(world);
  const decoded=decodeWorldSave(bytes);
  expect(encodeWorldSave(decoded)).toBe(bytes);
  return decoded;
}
function reject(world:WorldState,patch:(copy:WorldState)=>void,error:RegExp){
  const copy=structuredClone(world);
  patch(copy);
  expect(()=>encodeWorldSave(copy)).toThrow(error);
}

describe('dramatic bond storage provenance',()=>{
  it('preserves legacy absence and reopens native public encounter then actual defender-win death in initiating order',()=>{
    const initial=encodeWorldSave(createInitialWorld());
    expect(initial).not.toContain('"dramaticBonds"');
    expect(encodeWorldSave(decodeWorldSave(initial))).toBe(initial);
    const {socially,clash}=actualCommonBond();
    expect(facts(reopen(socially)).every(row=>row.kind==='encounter')).toBe(true);
    const {world:lethal,death}=actualDefenderWinsLethally(clash);
    const bytes=encodeEraWorldSave(lethal);
    const restored=decodeEraWorldSave(bytes);
    expect(encodeEraWorldSave(restored)).toBe(bytes);
    expect(fact(restored,'lethal_duel')).toMatchObject({
      sourceEventId:death.id,actorIds:[firstId,secondId],winnerId:secondId,fallenId:firstId,siteId:bondSite,
    });
  });

  it('rejects duplicated, private, or same-name substituted raw proof and independently contradictory archive cues',()=>{
    const {clash}=actualCommonBond();
    reject(clash,w=>{facts(w).push(fact(w,'duel'));},/dramaticBonds.facts.source/);
    const withoutPersonal=structuredClone(clash);
    const pairSource=fact(withoutPersonal,'encounter').sourceEventId;
    withoutPersonal.witnessedPersonalStory.scenes=withoutPersonal.witnessedPersonalStory.scenes.filter(scene=>scene.eventId!==pairSource);
    reject(withoutPersonal,w=>{
      const original=w.events.find(event=>event.id===pairSource)!;
      w.events.unshift(structuredClone(original));
    },/dramaticBonds.facts.native/);
    reject(withoutPersonal,w=>{w.events.find(event=>event.id===pairSource)!.witnessScope='participants';},/dramaticBonds.facts.native/);
    reject(clash,w=>{fact(w,'duel').actorIds[1]=nearId;},/dramaticBonds.facts.native/);
    reject(clash,w=>{fact(w,'duel').venueKindAtSource='sect_hq';},/dramaticBonds.facts.source/);
    const restricted=structuredClone(clash);
    restricted.locations.find(site=>site.id===bondSite)!.type='secret_realm';
    expect(()=>validateDramaticBondHistory(restricted,path=>{throw Error(path);})).toThrow(/dramaticBonds.facts.source/);
    reject(clash,w=>{
      const source=fact(w,'encounter');
      const anchor=w.chronicleArchive.anchors.find(item=>item.id===source.sourceEventId)!;
      anchor.actorIds.reverse();
    },/dramaticBonds.facts.archive/);
  });

  it('does not upgrade a vanished raw source into fake chronology or a different winner',()=>{
    const {clash}=actualCommonBond();
    const {world:lethal}=actualDefenderWinsLethally(clash);
    const withoutHot=structuredClone(lethal);
    const evicted=fact(withoutHot,'lethal_duel');
    withoutHot.events=withoutHot.events.filter(event=>event.id!==evicted.sourceEventId);
    // This exercises the missing representation branch without claiming natural hot-ring retirement.
    expect(fact(reopen(withoutHot),'lethal_duel')).toEqual(evicted);
    reject(withoutHot,w=>{fact(w,'lethal_duel').winnerId=firstId;},/dramaticBonds.facts.(winner|fallen)/);
    reject(lethal,w=>{fact(w,'lethal_duel').fallenId=secondId;},/dramaticBonds.facts.native/);
    reject(lethal,w=>{bondActor(w).hp=1;},/dramaticBonds.facts.fallen/);
    reject(lethal,w=>{fact(w,'duel').month=12;},/dramaticBonds.facts.native/);
    const calendar=structuredClone(clash);
    const unbacked=facts(calendar).filter(row=>row.kind==='encounter')[1];
    calendar.events=calendar.events.filter(event=>event.id!==unbacked.sourceEventId);
    calendar.chronicleArchive.anchors=calendar.chronicleArchive.anchors.filter(anchor=>anchor.id!==unbacked.sourceEventId);
    calendar.witnessedPersonalStory.scenes=calendar.witnessedPersonalStory.scenes.filter(scene=>scene.eventId!==unbacked.sourceEventId);
    expect(facts(reopen(calendar))).toContainEqual(unbacked);
    reject(calendar,w=>{facts(w).find(row=>row.sourceEventId===unbacked.sourceEventId)!.year++;},/dramaticBonds.facts.source/);
    reject(calendar,w=>{facts(w).find(row=>row.sourceEventId===unbacked.sourceEventId)!.month=1;},/dramaticBonds.facts.source/);
  });

  it('offers no witness authority to a participant or an unrelated current observer just because they are nearby',()=>{
    const {clash}=actualCommonBond();
    const original=fact(clash,'duel');
    expect(original.witnessIds).toContain(nearId);
    reject(clash,w=>{fact(w,'duel').witnessIds=[firstId];},/dramaticBonds.facts.witness/);
    reject(clash,w=>{fact(w,'duel').witnessIds=['npc-1'];},/dramaticBonds.facts.witness/);
    reject(clash,w=>{fact(w,'duel').witnessIds=[nearId,nearId];},/dramaticBonds.facts.witness/);
  });

  it('reopens genuine native joint practice with typed source alignments and no motive or raw relationship fields',()=>{
    const initial=createInitialWorld(2031);
    const [actorId,partnerId]=['npc-2','npc-8'];
    for(const id of [actorId,partnerId])initial.cultivators.find(row=>row.id===id)!.locationId=bondSite;
    const practice:LLMDecisionPayload={chosenAction:'DUAL_CULTIVATE',targetCultivatorId:partnerId,innerMonologue:'相约依法同修。'};
    const next=advanceWorldTick(initial,Object.fromEntries(initial.cultivators.map(row=>[row.id,row.id===actorId?practice:noAct])),()=>.1,'utility');
    expect(fact(reopen(next),'practice')).toMatchObject({actorIds:[actorId,partnerId],alignmentsAtSource:['正道','中立']});
    reject(next,w=>{fact(w,'practice').alignmentsAtSource=undefined;},/dramaticBonds.facts.alignment/);
    reject(next,w=>{Object.assign(fact(w,'practice'),{affinity:100,privateMotive:'fabricated'});},/affinity/);
    reject(next,w=>{fact(w,'practice').witnessIds=[nearId];},/dramaticBonds.facts.witness/);
  });

  it('keeps a genuine old HQ fact through actual quorum, paid convoy, and native retyping without accepting a fabricated vein',()=>{
    const start=createInitialWorld(51);
    const own=start.sects[0], leaderId=own.leaderId!;
    const origin=start.locations.find(row=>row.id===own.headquartersId)!;
    const destination=start.locations.find(row=>row.id==='loc-vein-north')!;
    const tile=terrainTileAt(start,destination.x,destination.y)!;
    // Controlled opening tableau only; formal proposal, votes, custody, route and site type change are actual months.
    delete destination.ownerSectId;
    delete tile.ownerSectId;
    for(const actor of start.cultivators.filter(row=>row.sectId===own.id)) actor.locationId=origin.id;
    start.cultivators.find(row=>row.id===leaderId)!.exploredTileIds.push(tile.id);
    const elderId=start.cultivators.find(row=>row.sectId===own.id&&row.sectRank==='长老')!.id;
    own.arrayHp=0;
    own.arrayMaxHp=400;
    own.facilities.defense_array=2;
    origin.herbs.earth_root=Math.max(2,origin.herbs.earth_root);
    const turn=(world:WorldState,inputs:Record<string,LLMDecisionPayload>={})=>
      advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,inputs[row.id]??noAct])),()=>.99,'utility');
    const meeting=turn(start,{[leaderId]:{chosenAction:'SOCIALIZE',targetCultivatorId:elderId,innerMonologue:'山门当面商谈。'}});
    const source=fact(meeting,'encounter');
    expect(source).toMatchObject({siteId:origin.id,venueKindAtSource:'sect_hq'});
    const opened=turn(meeting,{[leaderId]:{chosenAction:'RELOCATE',relocationMove:'propose',
      targetLocationId:destination.id,innerMonologue:'依例请长老议迁。'}});
    const proposal=opened.relocations.plans[0]!;
    expect(proposal.status).toBe('voting');
    const ballots:Record<string,LLMDecisionPayload>=Object.fromEntries(proposal.voterIds.filter(id=>id!==leaderId).map(id=>[id,{
      chosenAction:'RELOCATE',relocationMove:'approve',targetRelocationId:proposal.id,innerMonologue:'同意议案。',
    }]));
    let arrived=turn(opened,ballots);
    for(let month=0;month<8&&['voting','in_transit'].includes(arrived.relocations.plans[0].status);month++)arrived=turn(arrived);
    expect(arrived.relocations.plans[0].status).toBe('settled');
    expect(arrived.locations.find(row=>row.id===origin.id)?.type).toBe('spirit_vein');
    expect(fact(reopen(arrived),'encounter')).toEqual(source);
    reject(arrived,w=>{w.relocations.abandonedSites=[];},/dramaticBonds.facts.source/);
  });
});
