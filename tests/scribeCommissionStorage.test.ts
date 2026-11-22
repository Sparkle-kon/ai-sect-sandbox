import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {possessAvatar,queueAvatarScribeCommission} from '../src/engine/avatarEngine';
import {availableScribeCommissionActions} from '../src/engine/scribeCommissionEngine';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {commissionedActor,distantId,nativeScribeFact,patronId,scribeId,scribeMonth,scribeOrder} from './scribeCommissionNativeFixture';

const loaded=(world:WorldState)=>decodeWorldSave(encodeWorldSave(world));
const row=(world:WorldState)=>world.scribeCommissions!.commissions[0];
const reply=(move:'accept'|'verify'|'deliver'|'decline'|'withdraw',world:WorldState)=>scribeOrder('SCRIBE_COMMISSION',{
  scribeCommissionMove:move,targetScribeCommissionId:row(world).id,
});
function edit(raw:string,rewrite:(world:WorldState)=>void){
  const envelope=JSON.parse(raw) as {world:WorldState};
  rewrite(envelope.world);
  return ()=>decodeWorldSave(JSON.stringify(envelope));
}
function flow(world:WorldState,kind:'scribe_deposit'|'scribe_ink'|'scribe_wage'|'scribe_refund'){
  return world.resourceFlow.months.flatMap(month=>month.entries).find(entry=>entry.reason===kind)!;
}
function trackFlowAmount(world:WorldState,id:'scribe_wage'|'scribe_deposit',increment:number){
  const book=world.resourceFlow.months.find(month=>month.entries.some(entry=>entry.reason===id))!;
  book.totals.find(bucket=>bucket.good==='stone')!.transfer+=increment;
}
function startCommission(pauseUntil=0,correctAt?:'offer'|'verify'){
  const fact=nativeScribeFact();
  while(fact.world.tick<pauseUntil)fact.world=scribeMonth(fact.world);
  const editor='npc-6';
  const correction=scribeOrder('CHRONICLE_ERRATA',{chronicleErrataMove:'correct',targetChronicleSourceId:fact.factId});
  const offered=scribeMonth(fact.world,{...(correctAt==='offer'?{[editor]:correction}:{}),[patronId]:scribeOrder('SCRIBE_COMMISSION',{
    scribeCommissionMove:'offer',targetCultivatorId:scribeId,targetChronicleSourceId:fact.factId,
  })});
  expect(row(offered)).toMatchObject({status:'offered',sourceEventId:fact.factId,sourceTick:fact.factTick});
  const accepted=scribeMonth(loaded(offered),{[scribeId]:reply('accept',offered)});
  expect(row(accepted)).toMatchObject({status:'accepted',escrowStones:8});
  const verified=scribeMonth(loaded(accepted),{...(correctAt==='verify'?{[editor]:correction}:{}),
    [scribeId]:reply('verify',accepted)});
  expect(row(verified)).toMatchObject({status:'verified',escrowStones:6});
  const delivered=scribeMonth(loaded(verified),{[scribeId]:reply('deliver',verified)});
  expect(row(delivered)).toMatchObject({status:'delivered',escrowStones:0,manuscript:{wagePaid:6}});
  return {offered,accepted,verified,delivered};
}

describe('verified paid manuscript native codec',()=>{
  it('does not attach the optional ledger or alter historical encoding before an actual offer',()=>{
    for(const world of [createInitialWorld(42,'classic'),nativeScribeFact().world]){
      const once=encodeWorldSave(world),era=encodeEraWorldSave(world);
      expect(once).not.toContain('"scribeCommissions"');
      expect(encodeWorldSave(decodeWorldSave(once))).toBe(once);
      expect(encodeEraWorldSave(decodeEraWorldSave(era))).toBe(era);
    }
  });

  it('retains exactly both native conflicting readings, dates, source identity and wages, not invented manuscript fields',()=>{
    const {offered,accepted,verified,delivered}=startCommission();
    expect(encodeWorldSave(scribeMonth(loaded(offered),{[scribeId]:reply('accept',offered)}))).toBe(encodeWorldSave(accepted));
    expect(encodeWorldSave(scribeMonth(loaded(verified),{[scribeId]:reply('deliver',verified)}))).toBe(encodeWorldSave(delivered));
    const exact=encodeWorldSave(delivered),native=encodeEraWorldSave(delivered);
    expect(encodeEraWorldSave(decodeEraWorldSave(native))).toBe(native);
    expect(encodeWorldSave(decodeWorldSave(exact))).toBe(exact);
    const correction=delivered.eraHeritage!.facts.find(fact=>fact.source.sourceEventId===row(delivered).sourceEventId)!;
    expect(row(delivered).verification!.retellingIds).toHaveLength(2);
    expect([...row(delivered).verification!.retellingIds].sort()).toEqual(correction.retellings.map(entry=>entry.id).sort());

    const mutations:Array<[string,(world:WorldState)=>void]>=[
      ['scribeCommissions.commissions[0].manuscript.draft',w=>Object.assign(row(w).manuscript!,{draft:'未经来源核验的捏造结论'})],
      ['scribeCommissions.source',w=>{row(w).sourceEventId='invented-original';}],
      ['scribeCommissions.source',w=>{row(w).sourceTick++;}],
      ['scribeCommissions.source',w=>{row(w).siteId='loc-market-east';}],
      ['scribeCommissions.verification',w=>{row(w).verification!.retellingIds=[correction.retellings[0].id,correction.retellings[0].id];}],
      ['scribeCommissions.verification',w=>{row(w).verification!.retellingIds=[];}],
      ['scribeCommissions.verification',w=>{row(w).verification!.correctionId='invented-correction';}],
      ['scribeCommissions.sequence',w=>{delete row(w).verification;}],
      ['scribeCommissions.deadline',w=>{row(w).closedTick=row(w).verification!.tick;}],
      ['scribeCommissions.manuscript',w=>{row(w).manuscript!.id='old-other-manuscript';}],
      ['scribeCommissions.custody',w=>{row(w).refundedStones=6;}],
      ['scribeCommissions.references',w=>{row(w).scribeId=patronId;}],
      ['scribeCommissions.references',w=>{w.scribeCommissions!.commissions.push(structuredClone(row(w)));}],
      ['scribeCommissions.event',w=>{
        const event=w.events.find(entry=>entry.id==='evt-'+row(w).id+'-'+row(w).closedTick+'-deliver')!;
        delete event.witnessScope;
      }],
    ];
    for(const [field,forgery] of mutations)expect(edit(exact,forgery)).toThrow(field);
  });

  it('confirms one actual payer, ink sink and receiver and rejects coherent yet false financial journal entries',()=>{
    const {verified,delivered}=startCommission(),exact=encodeWorldSave(delivered);
    const refund=scribeMonth(loaded(verified),{[scribeId]:reply('decline',verified)});
    expect(row(loaded(refund))).toMatchObject({status:'declined',escrowStones:0,refundedStones:6});
    expect(flow(refund,'scribe_refund')).toMatchObject({amount:6,kind:'transfer',to:{kind:'actor',id:patronId}});
    expect(flow(delivered,'scribe_deposit')).toMatchObject({amount:8,kind:'transfer',from:{kind:'actor',id:patronId}});
    expect(flow(delivered,'scribe_ink')).toMatchObject({amount:2,kind:'consumption',from:{kind:'scribe_commission',id:row(delivered).id}});
    expect(flow(delivered,'scribe_wage')).toMatchObject({amount:6,kind:'transfer',to:{kind:'actor',id:scribeId}});
    const double=edit(exact,w=>{
      const produced=flow(w,'scribe_wage');
      const book=w.resourceFlow.months.find(month=>month.tick===produced.tick)!;
      book.entries.push({...structuredClone(produced),id:w.resourceFlow.nextId++});
      book.totalEntries++;
      trackFlowAmount(w,'scribe_wage',produced.amount);
    });
    const extra=edit(exact,w=>{
      trackFlowAmount(w,'scribe_wage',1);
      flow(w,'scribe_wage').amount++;
    });
    const wrongPerson=edit(exact,w=>{
      const paid=flow(w,'scribe_wage');
      if (paid.kind==='transfer') paid.to.id=distantId;
    });
    const lost=edit(exact,w=>{flow(w,'scribe_wage').refId='unrelated-row';});
    const leaked=edit(exact,w=>{flow(w,'scribe_deposit').visibility={kind:'observer'};});
    for(const invalid of [double,extra,wrongPerson,lost,leaked])expect(invalid).toThrow('scribeCommissions.resourceJournal');
    expect(edit(exact,w=>{delete w.scribeCommissions;})).toThrow('scribeCommissions.event');
  });

  it('binds actual dated corrections before verification and rejects even a real correction from the same work month',()=>{
    for(const when of ['offer','verify'] as const){
      const {delivered}=startCommission(0,when),raw=encodeWorldSave(delivered),commission=row(decodeWorldSave(raw));
      const fact=delivered.eraHeritage!.facts.find(fact=>fact.source.sourceEventId===commission.sourceEventId)!;
      const correction=fact.correction!;
      expect(correction).toBeDefined();
      expect(correction.contestedRetellingIds).toHaveLength(2);
      expect(commission.verification?.retellingIds).toHaveLength(2);
      expect(commission.verification?.correctionId).toBe(when==='offer'?correction.id:undefined);
      expect(correction.tick).toBe(when==='offer'?commission.offeredTick:commission.verification!.tick);
      expect(edit(raw,w=>{
        if(when==='offer')delete row(w).verification!.correctionId;
        else row(w).verification!.correctionId=correction.id;
      })).toThrow('scribeCommissions.verification');
      let older=delivered;
      for(let i=0;i<7;i++)older=scribeMonth(older);
      expect(row(loaded(older)).verification).toEqual(commission.verification);
    }
  });

  it('unavailability must be the same actual original death and its remaining money enters the real estate',()=>{
    let world=loaded(startCommission(7).verified);
    expect(row(world).workExpiresTick!).toBeGreaterThan(13);
    const patron=commissionedActor(world,patronId);
    // Isolate the existing age mechanism; native month/year, age increment, death, closure and probate are untouched.
    patron.age=patron.lifespan-1;
    while(world.tick<12)world=scribeMonth(world);
    const proof=scribeMonth(world);
    expect(proof.tick).toBe(13);
    expect(commissionedActor(proof,patronId)).toMatchObject({alive:false,hp:0});
    expect(proof.estates.entries.find(entry=>entry.deceasedId===patronId)).toMatchObject({openedTick:13});
    const raw=encodeWorldSave(proof),reopened=decodeWorldSave(raw);
    expect(row(reopened)).toMatchObject({status:'unavailable',unavailableActorId:patronId,closedTick:13,refundedStones:6});
    expect(flow(reopened,'scribe_refund')).toMatchObject({amount:6,kind:'transfer',to:{kind:'actor',id:patronId}});
    expect(reopened.resourceFlow.months.flatMap(book=>book.entries).some(r=>r.reason==='scribe_wage')).toBe(false);
    expect(row(reopened).manuscript).toBeUndefined();
    expect(edit(raw,w=>{row(w).unavailableActorId=scribeId;})).toThrow('scribeCommissions.unavailable');
    expect(edit(raw,w=>{row(w).closedTick=12;})).toThrow('scribeCommissions.unavailable');
  });

  it('persists only exact next local avatar intent, with identity and move-specific field whitelist',()=>{
    const {world,factId}=nativeScribeFact();
    expect(possessAvatar(world,patronId)).toBe(true);
    const chosen=availableScribeCommissionActions(commissionedActor(world,patronId),world,world.tick+1)
      .find(choice=>choice.scribeCommissionMove==='offer'&&choice.targetCultivatorId===scribeId&&choice.targetChronicleSourceId===factId);
    expect(chosen).toBeDefined();
    expect(queueAvatarScribeCommission(world,patronId,chosen!)).toBe(true);
    const raw=encodeWorldSave(world),reopened=decodeWorldSave(raw);
    expect(reopened.playerAvatar.pendingOrder).toEqual(world.playerAvatar.pendingOrder);
    expect(reopened.scribeCommissions).toBeUndefined();
    expect(row(scribeMonth(reopened)).status).toBe('offered');
    expect(edit(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetScribeCommissionId:'scribe-commission-1'});}))
      .toThrow('pendingOrder.targetScribeCommissionId');
    expect(edit(raw,w=>{Object.assign(w.playerAvatar.pendingOrder!,{targetChronicleSourceId:'invented-source'});}))
      .toThrow('playerAvatar.scribeCommissionOrder');
    expect(edit(raw,w=>{w.playerAvatar.pendingOrder!.queuedTick--;})).toThrow('playerAvatar.scribeCommissionOrder');
  });
});
