import {describe,expect,it} from 'vitest';
import {resolveSectCreditAction} from '../src/engine/sectCreditEngine';
import {maintainSectPolitics} from '../src/engine/sectPoliticsEngine';
import {advanceSectStipends,availableSectStipendActions,projectSectStipends,resolveSectStipendAction} from '../src/engine/sectStipendEngine';
import {resolveServiceRetirementAction} from '../src/engine/serviceRetirementEngine';
import {acceptedSectStipend,offeredSectStipend,retiredClinicGuard,stipendDecision,stipendPayload,stipendPerson,stipendSect,stipendTurn}
  from './fixtures/sectStipendFixture';
import type {WorldState} from '../src/types/world';

const book=(world:WorldState)=>world.sectStipends.stipends[0];
const moves=(world:WorldState)=>world.resourceFlow.months.flatMap(month=>month.entries).filter(row=>row.mechanism==='sect_stipend');
const act=(f:ReturnType<typeof offeredSectStipend>,actorId:string,mode:'accept'|'adopt'|'decline'|'withdraw')=>
  resolveSectStipendAction(f.world,stipendPerson(f.world,actorId),stipendDecision(mode,f.stipendId));

describe('real paid former clinic service verified for finite voluntary stipends',()=>{
  it('rejects same-era unsigned/empty treatment or senior rank alone, then authorizes only exact native prior receipt',()=>{
    const f=retiredClinicGuard(),{world}=f;
    const leader=stipendPerson(world,f.leaderId);
    expect(resolveSectStipendAction(world,leader,stipendDecision('offer',f.caseId))).toBeNull();
    world.tick++;
    expect(availableSectStipendActions(leader,world).filter(row=>row.stipendMove==='offer')).toHaveLength(1);
    const stale=structuredClone(world);
    const caseRow=stale.infirmaries.cases[0];
    caseRow.status='waiting';
    delete caseRow.receipt;
    expect(resolveSectStipendAction(stale,stipendPerson(stale,leader.id),stipendDecision('offer',f.caseId))).toBeNull();
    const treasury=stipendSect(world,f.sectId).spiritStones,recipient=stipendPerson(world,f.recipientId),cash=recipient.spiritStones;
    expect(resolveSectStipendAction(world,leader,stipendDecision('offer',f.caseId))?.witnessScope).toBe('participants');
    expect(book(world).service).toMatchObject({retirementId:f.retirementId,caseId:f.caseId,shiftId:f.shiftId,patientId:f.patientId});
    expect(availableSectStipendActions(leader,world).some(row=>row.stipendMove==='offer')).toBe(false);
    expect(resolveSectStipendAction(world,recipient,stipendDecision('accept',book(world).id))).toBeNull();
    expect(stipendSect(world,f.sectId).spiritStones).toBe(treasury);
    expect(recipient.spiritStones).toBe(cash);
    expect(projectSectStipends(world,stipendPerson(world,f.patientId))).toEqual([]);
    expect(JSON.stringify(projectSectStipends(world,recipient))).not.toContain(f.patientId);
  });

  it('spends only twelve from actual uncommitted treasury in each paid month; records isolated shortfall without arrears',()=>{
    const f=acceptedSectStipend(),{world}=f,sect=stipendSect(world,f.sectId),recipient=stipendPerson(world,f.recipientId);
    const cash=recipient.spiritStones,rank=recipient.sectRank,tick=world.tick;
    const treasury=sect.spiritStones;
    world.tick++;
    expect(advanceSectStipends(world)).toHaveLength(1);
    expect(advanceSectStipends(world)).toEqual([]);
    expect(recipient.spiritStones).toBe(cash+12);
    expect(sect.spiritStones).toBe(treasury-12);
    sect.spiritStones=91;
    world.tick++;
    advanceSectStipends(world);
    expect(sect.spiritStones).toBe(91);
    expect(recipient.spiritStones).toBe(cash+12);
    sect.spiritStones=104;
    world.tick++;
    advanceSectStipends(world);
    expect(sect.spiritStones).toBe(92);
    expect(recipient.spiritStones).toBe(cash+24);
    expect(recipient.sectRank).toBe(rank);
    expect(book(world).status).toBe('completed');
    expect(book(world).periods).toMatchObject([
      {dueTick:tick+1,settledTick:tick+1,dueAmount:12,paidAmount:12,status:'paid'},
      {dueTick:tick+2,settledTick:tick+2,dueAmount:12,paidAmount:0,status:'unpaid',reason:'treasury_short'},
      {dueTick:tick+3,settledTick:tick+3,dueAmount:12,paidAmount:12,status:'paid'},
    ]);
    expect(moves(world).map(row=>[row.kind,row.amount])).toEqual([['transfer',12],['transfer',12]]);
    world.tick++;
    expect(advanceSectStipends(world)).toEqual([]);
  });

  it('protects genuine higher-priority credit offers and leaves no save-unsafe wallet transfer',()=>{
    const f=acceptedSectStipend(),{world}=f,sect=stipendSect(world,f.sectId),recipient=stipendPerson(world,f.recipientId);
    const lender=stipendPerson(world,f.leaderId);
    const borrower=world.sects.find(row=>row.id!==sect.id&&row.leaderId)!;
    const borrowerLeader=stipendPerson(world,borrower.leaderId!);
    borrowerLeader.locationId=borrower.headquartersId;
    expect(resolveSectCreditAction(world,lender,stipendPayload('SECT_CREDIT',{creditMove:'offer',targetSectId:borrower.id}))).not.toBeNull();
    expect(world.credit.loans[0]).toMatchObject({principal:120,status:'offered'});
    sect.spiritStones=211.75;
    world.tick++;
    advanceSectStipends(world);
    expect(book(world).periods[0]).toMatchObject({reason:'treasury_short',paidAmount:0});
    expect(sect.spiritStones).toBe(211.75);
    sect.spiritStones=212.25;
    recipient.spiritStones=999_999_988.5;
    world.tick++;
    advanceSectStipends(world);
    expect(book(world).periods[1]).toMatchObject({reason:'recipient_capacity',paidAmount:0});
    expect(recipient.spiritStones).toBe(999_999_988.5);
    expect(sect.spiritStones).toBe(212.25);
    recipient.spiritStones=999_999_988;
    world.tick++;
    advanceSectStipends(world);
    expect(book(world).periods[2]).toMatchObject({status:'paid',paidAmount:12});
    expect(recipient.spiritStones).toBe(1_000_000_000);
    expect(sect.spiritStones).toBe(200.25);
  });

  it('never auto-appoints elected successor to stipend; adopts explicit exact direct succession without catch-up',()=>{
    const f=acceptedSectStipend(),{world}=f;
    const sect=stipendSect(world,f.sectId),old=stipendPerson(world,f.leaderId);
    old.alive=false;old.hp=0;
    world.tick++;
    maintainSectPolitics(world);
    const success=sect.succession;
    expect(success).toMatchObject({method:'election',previousLeaderId:f.leaderId,tick:world.tick});
    if(!success)throw Error('expected real election');
    expect(act(f,success.leaderId,'adopt')).toBeNull();
    advanceSectStipends(world);
    expect(book(world).periods[0]).toMatchObject({paidAmount:0,reason:'authority_absent'});
    world.tick++;
    const successor=stipendPerson(world,success.leaderId);
    successor.locationId=f.siteId;
    expect(act(f,f.outsiderId,'adopt')).toBeNull();
    expect(act(f,successor.id,'adopt')?.witnessScope).toBe('participants');
    expect(act(f,successor.id,'adopt')).toBeNull();
    expect(book(world).handoffs).toEqual([{fromId:f.leaderId,toId:successor.id,successionTick:success.tick,adoptedTick:world.tick}]);
    advanceSectStipends(world);
    expect(book(world).periods[1]).toMatchObject({paidAmount:12,authorityId:successor.id});
    expect(book(world).periods[0].paidAmount).toBe(0);
  });

  it('pays no posthumous due or estate increment and closes the exact authored return epoch before the next due',()=>{
    const f=acceptedSectStipend();
    let world=stipendTurn(f.world);
    expect(book(world).periods).toHaveLength(1);
    const recipient=stipendPerson(world,f.recipientId);
    const realCash=recipient.spiritStones;
    const continuing=structuredClone(world);
    recipient.alive=false;recipient.hp=0;
    world=stipendTurn(world);
    expect(book(world)).toMatchObject({status:'closed',closure:'recipient_died'});
    expect(book(world).periods).toHaveLength(1);
    expect(world.estates.entries.find(row=>row.deceasedId===f.recipientId)?.holdings.stones).toBe(realCash);
    expect(moves(world)).toHaveLength(1);
    const returner=stipendPerson(continuing,f.recipientId);
    expect(resolveServiceRetirementAction(continuing,returner,stipendPayload('SECT_SERVICE',{serviceMove:'return'}))).not.toBeNull();
    const returned=stipendTurn(continuing);
    expect(book(returned)).toMatchObject({status:'closed',closure:'returned_to_service'});
    expect(book(returned).periods).toHaveLength(1);
  });

  it('retired recipient can decline or withdraw; sponsor cannot silently terminate an active accepted promise',()=>{
    const f=offeredSectStipend();
    expect(act(f,f.recipientId,'decline')).toBeNull();
    f.world.tick++;
    expect(act(f,f.recipientId,'decline')).not.toBeNull();
    expect(book(f.world)).toMatchObject({status:'declined',closedById:f.recipientId});
    const active=acceptedSectStipend();
    expect(act(active,active.leaderId,'withdraw')).toBeNull();
    expect(act(active,active.recipientId,'withdraw')).not.toBeNull();
    expect(book(active.world)).toMatchObject({status:'withdrawn',closedById:active.recipientId});
    active.world.tick++;
    advanceSectStipends(active.world);
    expect(moves(active.world)).toEqual([]);
  });
});
