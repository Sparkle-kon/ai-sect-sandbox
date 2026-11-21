import {describe,expect,it} from 'vitest';
import {advanceDamageAssurance,availableDamageAssuranceActions,damageAssuranceImpactKey,damageAssuranceRemaining,damageAssuranceWorkKey,
  projectDamageAssurance,projectLocalDamageAssurance,resolveDamageAssuranceAction} from '../src/engine/damageAssuranceEngine';
import {isFurnaceSafetyClosed} from '../src/engine/furnaceSafetyEngine';
import {createTimeline,forkTimeline,readTimelineHead,recordTimelineWorld,selectTimelineBranch} from '../src/engine/timelineEngine';
import {applyNativeAssuranceSafety,assuranceCase,assuranceChoice,assurancePerson,assuranceTurn,damagedAssuranceFacility,
  inspectedDamageAssurance,nativeSafetyChoice,paidDamageAssurance,sealedDamageAssurance} from './fixtures/damageAssuranceFixture';
import type {WorldState} from '../src/types/world';

const claim=(world:WorldState)=>world.damageAssurance.claims[0];
const repairSpends=(world:WorldState)=>world.resourceFlow.months.flatMap(row=>row.entries).filter(row=>row.reason==='furnace_safety_repair');

describe('real physical damage assurance and exact paid repair receipts',()=>{
  it('seals one exact native damage and later actual inspection without paying, healing or consuming a furnace slot',()=>{
    const before=damagedAssuranceFacility();
    expect(availableDamageAssuranceActions(assurancePerson(before.world,before.actorId),before.world)).toEqual([]);
    const f=inspectedDamageAssurance(),{world}=f,supervisor=assurancePerson(world,f.actorId);
    const request=assuranceChoice('seal',f.caseId);
    expect(resolveDamageAssuranceAction(world,supervisor,request)).toBeNull();
    world.tick++;
    supervisor.spiritStones=0;supervisor.herbs.earth_root=0;
    const exact=structuredClone({source:assuranceCase(world,f.caseId),purse:supervisor.spiritStones,
      roots:supervisor.herbs.earth_root,slots:world.furnaceReservations,flows:world.resourceFlow});
    expect(resolveDamageAssuranceAction(world,assurancePerson(world,f.outsiderId),request)).toBeNull();
    expect(resolveDamageAssuranceAction(world,supervisor,request)?.witnessScope).toBe('participants');
    expect(resolveDamageAssuranceAction(world,supervisor,request)).toBeNull();
    expect({source:assuranceCase(world,f.caseId),purse:supervisor.spiritStones,
      roots:supervisor.herbs.earth_root,slots:world.furnaceReservations,flows:world.resourceFlow}).toEqual(exact);
    expect(claim(world)).toMatchObject({status:'open',sourceCaseId:f.caseId,hazardId:exact.source.hazardId,
      integrityBefore:100,integrityAfterDamage:60,initialLoss:40,contributions:[]});
    const outsider=assurancePerson(world,f.outsiderId);
    expect(projectDamageAssurance(world,outsider)).toEqual([]);
    expect(projectLocalDamageAssurance(world,supervisor)).toEqual({siteId:f.siteId,status:'open',initialLoss:40,remaining:40});
    expect(projectLocalDamageAssurance(world,outsider)).toEqual({siteId:f.siteId,status:'open',initialLoss:40,remaining:40});
    outsider.locationId='loc-market';
    expect(projectLocalDamageAssurance(world,outsider)).toBeUndefined();
  });

  it('lets the actual inspector see the private receipt after leaving, but never exposes the ordinary local observer details',()=>{
    const f=inspectedDamageAssurance(),{world}=f,native=assuranceCase(world,f.caseId);
    const inspector=assurancePerson(world,f.actorId);
    const alternate=world.cultivators.find(actor=>actor.alive&&actor.sectId===f.sectId&&actor.id!==inspector.id)!;
    alternate.locationId=f.siteId;alternate.age=40;alternate.sectRank='长老';alternate.hp=alternate.maxHp;
    alternate.tribulation=undefined;alternate.guardAssignment=undefined;
    world.tick++;
    expect(resolveDamageAssuranceAction(world,alternate,assuranceChoice('seal',f.caseId))).not.toBeNull();
    expect(claim(world)).toMatchObject({sealedById:alternate.id,inspectorId:native.receipts[0].actorId});
    inspector.locationId='loc-market';
    expect(projectDamageAssurance(world,inspector)).toHaveLength(1);
    expect(projectLocalDamageAssurance(world,inspector)).toBeUndefined();
    expect(projectDamageAssurance(world,assurancePerson(world,f.outsiderId))).toEqual([]);
  });

  it('makes one explicit affordable native repair; cash and parts are costs, only actual delta counts',()=>{
    const f=sealedDamageAssurance(),{world}=f,supervisor=assurancePerson(world,f.actorId);
    const request=assuranceChoice('make_good',f.claimId);
    expect(resolveDamageAssuranceAction(world,supervisor,request)).toBeNull();
    world.tick++;
    const native=assuranceCase(world,f.caseId),funds=supervisor.spiritStones,roots=supervisor.herbs.earth_root;
    expect(resolveDamageAssuranceAction(world,supervisor,assuranceChoice('make_good','forged-serial'))).toBeNull();
    supervisor.herbs.earth_root=1;
    expect(resolveDamageAssuranceAction(world,supervisor,request)).toBeNull();
    expect(native.integrity).toBe(60);
    supervisor.herbs.earth_root=roots;
    expect(resolveDamageAssuranceAction(world,supervisor,request)?.witnessScope).toBe('participants');
    expect(native.integrity).toBe(90);
    expect(native.receipts.filter(row=>row.kind==='repair')).toMatchObject([{assuranceClaimId:f.claimId}]);
    expect(claim(world).contributions).toMatchObject([{tick:world.tick,actorId:f.actorId,
      integrityBefore:60,integrityAfter:90,creditedPoints:30,stonesSpent:8,rootsSpent:2}]);
    expect(supervisor.spiritStones).toBe(funds-8);
    expect(supervisor.herbs.earth_root).toBe(roots-2);
    expect(repairSpends(world).map(row=>[row.good,row.amount])).toEqual([['stone',8],['earth_root',2]]);
    expect(resolveDamageAssuranceAction(world,supervisor,request)).toBeNull();
    expect(damageAssuranceRemaining(claim(world))).toBe(10);
    expect(isFurnaceSafetyClosed(world,f.siteId)).toBe(true);
    world.tick++;
    expect(applyNativeAssuranceSafety(world,f.actorId,f.caseId,'reopen')).not.toBeNull();
    advanceDamageAssurance(world);
    expect(claim(world)).toMatchObject({status:'closed',closedTick:world.tick,closure:'native_reopened'});
    expect(damageAssuranceRemaining(claim(world))).toBe(10);
    expect(projectDamageAssurance(world,supervisor)[0]).toMatchObject({physicalRemaining:10,remaining:10});
  });

  it('caps credit to original loss even in a two-actual-payment restoration; does not authorize reopening',()=>{
    const f=paidDamageAssurance(3),{world}=f;
    const request=assuranceChoice('make_good',f.claimId);
    expect(damageAssuranceRemaining(claim(world))).toBe(20);
    const next=assuranceTurn(world,{[f.actorId]:request});
    expect(claim(next)).toMatchObject({status:'fulfilled',closedTick:next.tick,contributions:[
      {creditedPoints:30,integrityBefore:50,integrityAfter:80},
      {creditedPoints:20,integrityBefore:80,integrityAfter:100},
    ]});
    expect(repairSpends(next).map(row=>[row.good,row.amount])).toEqual([['stone',8],['earth_root',2],['stone',8],['earth_root',2]]);
    expect(isFurnaceSafetyClosed(next,f.siteId)).toBe(true);
    expect(damageAssuranceRemaining(claim(next))).toBe(0);
  });

  it('keeps the separate physical and assurance deficits after ordinary work, and stops payment on title change',()=>{
    const f=sealedDamageAssurance(),{world}=f;
    const regular=assuranceTurn(world,{[f.actorId]:nativeSafetyChoice('repair',f.caseId)});
    expect(claim(regular).contributions).toEqual([]);
    expect(assuranceCase(regular,f.caseId).receipts.at(-1)?.assuranceClaimId).toBeUndefined();
    expect(projectDamageAssurance(regular,assurancePerson(regular,f.actorId))[0]).toMatchObject({physicalRemaining:10,remaining:40});
    const current=world.locations.find(row=>row.id===f.siteId)!;
    current.ownerSectId=world.sects.find(row=>row.id!==f.sectId)!.id;
    world.tick++;
    const supervised=assurancePerson(world,f.actorId);
    const saved=supervised.spiritStones;
    expect(resolveDamageAssuranceAction(world,supervised,assuranceChoice('make_good',f.claimId))).toBeNull();
    expect(advanceDamageAssurance(world)).toHaveLength(1);
    expect(claim(world)).toMatchObject({status:'closed',closure:'title_changed',contributions:[]});
    expect(supervised.spiritStones).toBe(saved);
  });

  it('replays genuinely same-source work only once per isolated branch and retains the frozen original viewpoint',()=>{
    const f=sealedDamageAssurance(),original=createTimeline(f.world);
    const alternate=forkTimeline(original,f.world.tick,{type:'WHISPER_MIND',targetCultivatorId:f.outsiderId,whisperText:'两支分别记录。'});
    const main=readTimelineHead(alternate,'main')!;
    const branch=readTimelineHead(alternate)!;
    const work={[f.actorId]:assuranceChoice('make_good',f.claimId)};
    const left=assuranceTurn(main,work),right=assuranceTurn(branch,work);
    expect(damageAssuranceImpactKey(claim(left))).toBe(damageAssuranceImpactKey(claim(right)));
    expect(damageAssuranceWorkKey(claim(left),claim(left).contributions[0])).toBe(damageAssuranceWorkKey(claim(right),claim(right).contributions[0]));
    expect(claim(left).contributions).toHaveLength(1);
    expect(claim(right).contributions).toHaveLength(1);
    expect(claim(readTimelineHead(alternate,'main')!).contributions).toEqual([]);
    const recorded=recordTimelineWorld(alternate,right);
    expect(claim(readTimelineHead(recorded)!).contributions).toHaveLength(1);
    expect(claim(readTimelineHead(selectTimelineBranch(recorded,'main'))!).contributions).toEqual([]);
    expect(resolveDamageAssuranceAction(right,assurancePerson(right,f.actorId),work[f.actorId])).toBeNull();
    expect(repairSpends(right)).toHaveLength(2);
  });
});
