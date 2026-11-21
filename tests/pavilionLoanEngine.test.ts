import {describe,expect,it} from 'vitest';
import {availablePavilionLoanActions,projectLocalPavilionDesk,projectPavilionLoans} from '../src/engine/pavilionLoanEngine';
import {resolveObservatoryAction} from '../src/engine/fieldObservatoryEngine';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {pavilionAct,pavilionActor,pavilionChoice,pavilionLoanCheckedOutFixture,pavilionMove,pavilionNativeEdition,pavilionTurn}
  from './fixtures/pavilionLoanFixture';

describe('one established corrected book and real staff lending',()=>{
  it('uses a separate prior healthy local clerk and one exact stock act per service turn, with no duplicate shelf',()=>{
    const {world,siteId,clerk,author,borrower,rival,editionId}=pavilionNativeEdition();
    const shelves=()=>world.pavilionLoans.copies;
    const scripture=structuredClone(world.scriptures);
    expect(pavilionAct(world,author,pavilionMove('shelve',editionId))).toBeNull();
    pavilionActor(world,rival).sectRank='真传弟子';
    expect(pavilionAct(world,clerk,pavilionMove('staff'))).not.toBeNull();
    expect(pavilionAct(world,rival,pavilionMove('staff'))).toBeNull();
    expect(pavilionAct(world,author,pavilionMove('shelve',editionId))).toBeNull();
    world.tick++;
    expect(pavilionAct(world,author,pavilionMove('shelve','unissued-edition'))).toBeNull();
    const person=pavilionActor(world,clerk);
    person.hp=Math.floor(person.maxHp*.70);
    expect(projectLocalPavilionDesk(world,pavilionActor(world,author))).toMatchObject({siteId,staffed:false,availableCopies:0});
    expect(pavilionAct(world,author,pavilionMove('shelve',editionId))).toBeNull();
    person.hp=person.maxHp;
    expect(pavilionAct(world,author,pavilionMove('shelve',editionId))?.witnessScope).toBe('participants');
    expect(pavilionAct(world,rival,pavilionMove('checkout',editionId))).toBeNull();
    expect(shelves()).toHaveLength(1);
    world.tick++;
    expect(pavilionAct(world,author,pavilionMove('shelve',editionId))).toBeNull();
    expect(pavilionAct(world,clerk,pavilionMove('checkout',editionId))).toBeNull();
    expect(pavilionAct(world,clerk,pavilionMove('staff'))).not.toBeNull();
    expect(pavilionAct(world,rival,pavilionMove('staff'))).toBeNull();
    expect(pavilionAct(world,borrower,pavilionMove('checkout',editionId))).not.toBeNull();
    expect(pavilionAct(world,rival,pavilionMove('checkout',editionId))).toBeNull();
    expect(world.scriptures).toEqual(scripture);
    expect(world.pavilionLoans.loans).toHaveLength(1);
  });

  it('preserves a real prepaid observatory duty before the scheduled clerk can serve',()=>{
    const {world,siteId,clerk,author,editionId}=pavilionNativeEdition();
    expect(resolveObservatoryAction(world,pavilionActor(world,clerk),pavilionChoice('FIELD_OBSERVATORY',{
      observatoryMove:'fund',targetLocationId:siteId,
    }))).not.toBeNull();
    const fundedAt=world.tick;
    const signed=pavilionTurn(world,{[clerk]:pavilionMove('staff')});
    const due=pavilionTurn(signed,{[clerk]:pavilionChoice('FIELD_OBSERVATORY',{observatoryMove:'measure',
      targetLocationId:siteId,targetObservatoryTick:fundedAt}),[author]:pavilionMove('shelve',editionId)});
    expect(due.fieldObservatories.byActor[clerk].runs[0].status).toBe('measured');
    expect(due.pavilionLoans.copies).toEqual([]);
    expect(due.pavilionLoans.shifts[0].lastServedTick).toBeUndefined();
    const subsequently=pavilionTurn(due,{[author]:pavilionMove('shelve',editionId)});
    expect(subsequently.pavilionLoans.copies[0]).toMatchObject({editionId,shelvedTick:subsequently.tick});
  });

  it('reads while holding the exact copy at a genuinely arrived safe public site and gives once-only capped credit',()=>{
    const {world,siteId,clerk,borrower,rival,editionId,loanId,originalId}=pavilionLoanCheckedOutFixture();
    const privateBefore=pavilionActor(world,borrower).techniqueMastery;
    const activeEdition=pavilionActor(world,borrower).activeEdition;
    const moved=pavilionTurn(world,{[borrower]:pavilionChoice('EXPLORE',{targetLocationId:'loc-market'})});
    expect(pavilionActor(moved,borrower).locationId).toBe('loc-market');
    expect(pavilionAct(moved,rival,pavilionMove('read',loanId))).toBeNull();
    const read=pavilionTurn(moved,{[borrower]:pavilionMove('read',loanId),[clerk]:pavilionMove('staff')});
    expect(pavilionActor(read,borrower)).toMatchObject({technique:{id:originalId},techniqueMastery:Math.min(100,privateBefore+2)});
    expect(pavilionActor(read,borrower).activeEdition).toEqual(activeEdition);
    expect(read.pavilionLoans.loans[0].read).toMatchObject({tick:read.tick,siteId:'loc-market',credited:true});
    expect(projectPavilionLoans(read,pavilionActor(read,rival)).ownLoans).toEqual([]);
    expect(projectPavilionLoans(read,pavilionActor(read,rival)).shelves[0]).not.toHaveProperty('read');
    expect(projectPavilionLoans(read,pavilionActor(read,borrower)).ownLoans[0].read)
      .toMatchObject({credited:true,masteryGained:2});
    expect(pavilionAct(read,borrower,pavilionMove('return',loanId))).toBeNull();
    const home=pavilionTurn(read,{[borrower]:pavilionChoice('EXPLORE',{targetLocationId:siteId})});
    const returned=pavilionTurn(home,{[clerk]:pavilionMove('staff'),[borrower]:pavilionMove('return',loanId)});
    expect(returned.pavilionLoans.loans[0].returned).toMatchObject({tick:returned.tick});
    expect(projectPavilionLoans(returned,pavilionActor(returned,rival)).shelves[0])
      .toMatchObject({phase:'shelved',lastReturnedTick:returned.tick});
    const rebooked=pavilionTurn(returned,{[borrower]:pavilionMove('checkout',editionId)});
    const again=rebooked.pavilionLoans.loans[1];
    expect(again.id).not.toBe(loanId);
    const reread=pavilionTurn(rebooked,{[borrower]:pavilionMove('read',again.id)});
    expect(reread.pavilionLoans.loans[1].read).toMatchObject({credited:false,masteryBefore:privateBefore+2,masteryAfter:privateBefore+2});
    expect(decodeWorldSave(encodeWorldSave(reread)).pavilionLoans).toEqual(reread.pavilionLoans);
    expect(reread.scriptures.editions.filter(row=>row.id===editionId)).toHaveLength(1);
  });

  it('never treats overdue or a lost custodian/title as a real return; delayed checked return is still lawful',()=>{
    const {world,clerk,borrower,rival,loanId,siteId,sectId,editionId}=pavilionLoanCheckedOutFixture();
    let overdue=world;
    while(overdue.tick<world.pavilionLoans.loans[0].dueTick)overdue=pavilionTurn(overdue);
    expect(overdue.pavilionLoans.loans[0].returned).toBeUndefined();
    expect(projectPavilionLoans(overdue,pavilionActor(overdue,borrower)).ownLoans[0]).toMatchObject({status:'overdue'});
    expect(availablePavilionLoanActions(pavilionActor(overdue,borrower),overdue).some(row=>row.pavilionLoanMove==='read')).toBe(false);
    expect(pavilionAct(overdue,clerk,pavilionMove('staff'))).not.toBeNull();
    const late=pavilionTurn(overdue,{[borrower]:pavilionMove('return',loanId)});
    expect(late.pavilionLoans.loans[0].returned).toMatchObject({tick:late.tick});
    const lossWorld=structuredClone(world);
    const victim=pavilionActor(lossWorld,borrower);
    lossWorld.month=12;
    victim.age=victim.lifespan-1;
    const lost=pavilionTurn(lossWorld,{[borrower]:pavilionMove('return',loanId)});
    expect(pavilionActor(lost,borrower).alive).toBe(false);
    expect(lost.pavilionLoans.loans[0].returned).toBeUndefined();
    expect(projectPavilionLoans(lost,pavilionActor(lost,borrower)).ownLoans[0])
      .toMatchObject({status:'unresolved',unresolvedReason:'borrower_lost'});
    expect(pavilionAct(lost,rival,pavilionMove('checkout',editionId))).toBeNull();
    const shut=structuredClone(world);
    shut.sects.find(row=>row.id===sectId)!.facilities.scripture_pavilion=0;
    const closed=pavilionTurn(shut,{[borrower]:pavilionMove('return',loanId)});
    expect(closed.pavilionLoans.loans[0].returned).toBeUndefined();
    expect(projectLocalPavilionDesk(closed,pavilionActor(closed,rival))).toBeUndefined();
    expect(projectPavilionLoans(closed,pavilionActor(closed,borrower)).ownLoans[0])
      .toMatchObject({siteId,status:'unresolved',unresolvedReason:'title_closed'});
  });
});
