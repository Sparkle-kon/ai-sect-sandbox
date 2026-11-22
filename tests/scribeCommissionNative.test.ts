import {describe,expect,it,vi} from 'vitest';
import {availableScribeCommissionActions,resolveScribeCommissionAction,projectScribeCommissionManuscript,type ScribeCommissionOption} from '../src/engine/scribeCommissionEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {commissionedActor,nativeScribeFact,nativeScribeLocalActors,scribeMonth,scribeOrder,scribePlace,scribeVisit,distantId,patronId,scribeId}
  from './scribeCommissionNativeFixture';

const state=(world:WorldState)=>world.scribeCommissions?.commissions[0];
const moves=(world:WorldState)=>world.resourceFlow.months.flatMap(month=>month.entries)
  .filter(row=>row.mechanism==='scribe_commission');
const wallet=(world:WorldState,id:string)=>commissionedActor(world,id).spiritStones;
const payload=(option:ScribeCommissionOption)=>{
  const {action,...fields}=option;
  return scribeOrder(action,fields);
};
function option(world:WorldState,id:string,move:ScribeCommissionOption['scribeCommissionMove'],factId?:string){
  const op=availableScribeCommissionActions(commissionedActor(world,id),world,world.tick+1).find(row=>
    row.scribeCommissionMove===move&&(row.scribeCommissionMove!=='offer'||
      row.targetCultivatorId===scribeId&&row.targetChronicleSourceId===factId));
  expect(op).toBeDefined();
  return op!;
}
function go(world:WorldState,id:string,move:ScribeCommissionOption['scribeCommissionMove'],factId?:string){
  return scribeMonth(world,{[id]:payload(option(world,id,move,factId))});
}
function reload(world:WorldState){
  const raw=encodeEraWorldSave(world),decoded=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(decoded)).toBe(raw);
  return decoded;
}

describe('native chronology, consent and material delivery of a verified manuscript',()=>{
  it('physically drafts once, separately keeps two contradictory signed statements, and releases precisely six stones',()=>{
    const {world,factId,factTick,retellings}=nativeScribeFact();
    const networking=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('The native commission must not send a request.'));
    try{
      const offered=go(world,patronId,'offer',factId);
      expect(state(offered)).toMatchObject({status:'offered'});
      expect(wallet(offered,patronId)).toBe(wallet(world,patronId));
      expect(availableScribeCommissionActions(commissionedActor(offered,scribeId),offered).some(row=>row.scribeCommissionMove==='accept')).toBe(false);
      const funded=go(offered,scribeId,'accept');
      expect(state(funded)).toMatchObject({status:'accepted',escrowStones:8});
      expect(wallet(funded,patronId)).toBe(wallet(world,patronId)-8);
      expect(wallet(funded,scribeId)).toBe(wallet(world,scribeId));
      expect(availableScribeCommissionActions(commissionedActor(funded,scribeId),funded).some(row=>row.scribeCommissionMove==='verify')).toBe(false);
      const valid=option(funded,scribeId,'verify');
      const verified=scribeMonth(funded,{[scribeId]:payload(valid)});
      expect(state(verified)).toMatchObject({status:'verified',escrowStones:6,sourceTick:factTick,
        verification:{tick:verified.tick,inkPaid:2,retellingIds:retellings.map(row=>row.id)}});
      expect(wallet(verified,scribeId)).toBe(wallet(world,scribeId));
      expect(projectScribeCommissionManuscript(verified,commissionedActor(verified,patronId),state(verified)!.id)).toBeUndefined();
      expect(encodeEraWorldSave(scribeMonth(reload(funded),{[scribeId]:payload(valid)}))).toBe(encodeEraWorldSave(verified));
      expect(availableScribeCommissionActions(commissionedActor(verified,scribeId),verified).some(row=>row.scribeCommissionMove==='deliver')).toBe(false);
      const completed=go(verified,scribeId,'deliver');
      expect(state(completed)).toMatchObject({status:'delivered',escrowStones:0,
        manuscript:{tick:completed.tick,wagePaid:6}});
      expect(moves(completed).map(({reason,amount,tick})=>({reason,amount,tick}))).toEqual([
        {reason:'scribe_deposit',amount:8,tick:funded.tick},{reason:'scribe_ink',amount:2,tick:verified.tick},
        {reason:'scribe_wage',amount:6,tick:completed.tick}]);
      const id=state(completed)!.id;
      const patron=commissionedActor(completed,patronId);
      const book=projectScribeCommissionManuscript(completed,patron,id);
      const originalSource=world.eraHeritage?.facts.find(row=>row.source.sourceEventId===factId)?.source;
      if(originalSource?.kind!=='duel')throw Error('The genuine typed duel is missing');
      expect(book).toMatchObject({sourceTitle:'斗法原据',body:expect.stringContaining(commissionedActor(completed,originalSource.winnerId).name),
        disagreement:{witnessA:expect.stringContaining(patron.name),
          witnessB:expect.stringContaining(commissionedActor(completed,scribeId).name)}});
      expect(book?.disagreement?.witnessA).not.toBe(book?.disagreement?.witnessB);
      expect(projectScribeCommissionManuscript(completed,commissionedActor(completed,distantId),id)).toBeUndefined();
      expect(completed.scribeCommissions?.commissions.filter(row=>row.manuscript)).toHaveLength(1);
      expect(resolveScribeCommissionAction(completed,commissionedActor(completed,scribeId),
        scribeOrder('SCRIBE_COMMISSION',{scribeCommissionMove:'deliver',targetScribeCommissionId:id}))).toBeNull();
      expect(moves(completed).filter(row=>row.reason==='scribe_wage')).toHaveLength(1);
      expect(wallet(completed,scribeId)).toBe(wallet(verified,scribeId)+6);
      expect(wallet(completed,patronId)).toBe(wallet(world,patronId)-8);
      expect(completed.chronicleErrata.retellings.filter(row=>row.sourceEventId===factId)).toEqual(retellings);
      const fact=completed.eraHeritage?.facts.find(row=>row.source.sourceEventId===factId);
      expect(fact).toMatchObject({tick:factTick,retellings});
      expect(completed.events.find(row=>row.id===factId)).toEqual(world.events.find(row=>row.id===factId));
      expect(encodeEraWorldSave(go(reload(verified),scribeId,'deliver'))).toBe(encodeEraWorldSave(completed));
      expect(encodeEraWorldSave(scribeMonth(reload(completed)))).toBe(encodeEraWorldSave(scribeMonth(completed)));
      expect(networking).not.toHaveBeenCalled();
    }finally{networking.mockRestore();}
  });

  it('does not pre-charge refusal, and only refunds what remains after native voluntary withdrawal',()=>{
    const {world,factId}=nativeScribeFact();
    const offered=go(world,patronId,'offer',factId);
    const refusal=go(offered,scribeId,'decline');
    expect(state(refusal)).toMatchObject({status:'declined',escrowStones:0,refundedStones:0});
    expect(wallet(refusal,patronId)).toBe(wallet(world,patronId));
    expect(wallet(refusal,scribeId)).toBe(wallet(world,scribeId));
    const funded=go(offered,scribeId,'accept');
    const unworked=go(funded,patronId,'withdraw');
    expect(state(unworked)).toMatchObject({status:'withdrawn',escrowStones:0,refundedStones:8});
    expect(wallet(unworked,patronId)).toBe(wallet(world,patronId));
    expect(wallet(unworked,scribeId)).toBe(wallet(world,scribeId));
    const worked=go(funded,scribeId,'verify');
    const stopped=go(worked,patronId,'withdraw');
    expect(wallet(stopped,patronId)).toBe(wallet(world,patronId)-2);
    expect(wallet(stopped,scribeId)).toBe(wallet(world,scribeId));
    expect(state(stopped)).toMatchObject({status:'withdrawn',escrowStones:0,refundedStones:6});
    expect(state(stopped)?.manuscript).toBeUndefined();
    for(const [stage,refund] of [[funded,8],[worked,6]] as const){
      const closed=go(stage,scribeId,'decline');
      expect(state(closed)).toMatchObject({status:'declined',escrowStones:0,refundedStones:refund});
      expect(wallet(closed,patronId)).toBe(wallet(world,patronId)-8+refund);
      expect(wallet(closed,scribeId)).toBe(wallet(world,scribeId));
      expect(moves(closed).filter(row=>row.reason==='scribe_refund')).toHaveLength(1);
      expect(moves(closed).some(row=>row.reason==='scribe_wage')).toBe(false);
    }
    const replay=scribeMonth(reload(stopped));
    expect(wallet(replay,patronId)).toBe(wallet(stopped,patronId));
    expect(wallet(replay,scribeId)).toBe(wallet(stopped,scribeId));
  });

  it('stops lost evidence and expires at the native deadline, refunding the correct unpaid balance once',()=>{
    const {world,factId}=nativeScribeFact();
    const accepted=go(go(world,patronId,'offer',factId),scribeId,'accept');
    const work=go(accepted,scribeId,'verify');
    const lost=structuredClone(work);
    // Detached adversarial input: a public source shadowed by participant-only history no longer certifies delivery.
    const hidden=lost.events.find(row=>row.id===factId);
    expect(hidden).toBeDefined();
    if(hidden)hidden.witnessScope='participants';
    expect(availableScribeCommissionActions(commissionedActor(lost,scribeId),lost,lost.tick+1)
      .some(row=>row.scribeCommissionMove==='deliver')).toBe(false);
    expect(wallet(lost,scribeId)).toBe(wallet(work,scribeId));
    expect(state(lost)?.manuscript).toBeUndefined();

    for(const [start,refund] of [[accepted,8],[work,6]] as const){
      let current=reload(start);
      const deadline=state(start)!.workExpiresTick!;
      while(current.tick<deadline)current=scribeMonth(current);
      expect(state(current)).toMatchObject({status:'expired',closedTick:deadline,refundedStones:refund,escrowStones:0});
      expect(wallet(current,patronId)).toBe(wallet(world,patronId)-8+refund);
      expect(wallet(current,scribeId)).toBe(wallet(world,scribeId));
      expect(moves(current).filter(row=>row.reason==='scribe_refund')).toHaveLength(1);
      expect(moves(current).some(row=>row.reason==='scribe_wage')).toBe(false);
      expect(state(current)?.manuscript).toBeUndefined();
      expect(encodeEraWorldSave(scribeMonth(reload(current)))).toBe(encodeEraWorldSave(scribeMonth(current)));
    }
  });

  it('rejects unseen or invented sources and never reuses a sibling-only fact as authority',()=>{
    const {world,factId}=nativeScribeFact();
    const offer=option(world,patronId,'offer',factId);
    expect(availableScribeCommissionActions(commissionedActor(world,distantId),world,world.tick+1)).toEqual([]);
    expect(availableScribeCommissionActions(structuredClone(commissionedActor(world,patronId)),world,world.tick+1)).toEqual([]);
    const stale=scribeOrder('SCRIBE_COMMISSION',{scribeCommissionMove:'offer',targetCultivatorId:scribeId,targetChronicleSourceId:'evt-invented'});
    const snapshot=encodeEraWorldSave(world);
    expect(resolveScribeCommissionAction(world,commissionedActor(world,patronId),stale)).toBeNull();
    expect(encodeEraWorldSave(world)).toBe(snapshot);
    const sibling=scribeMonth(scribeMonth(nativeScribeLocalActors()));
    expect(sibling.tick).toBe(world.tick);
    expect(sibling.eraHeritage).toBeUndefined();
    expect(resolveScribeCommissionAction(sibling,commissionedActor(sibling,patronId),payload(offer))).toBeNull();
    expect(sibling.scribeCommissions).toBeUndefined();
    const away=structuredClone(world);
    scribeVisit(away,scribeId,'loc-market-east');
    expect(commissionedActor(away,scribeId).locationId).not.toBe(scribePlace);
    expect(resolveScribeCommissionAction(away,commissionedActor(away,patronId),payload(offer))).toBeNull();
    expect(away.scribeCommissions).toBeUndefined();
  });
});
