import type { PavilionStaffShift,WorldState } from '../types/world';
import { PAVILION_LOAN_MASTERY_GAIN,PAVILION_LOAN_PERIOD_TICKS } from './pavilionLoanEngine';

type Window={from:number;until:number};
function nonOverlapping(windows:Map<string,Window[]>) {
  for(const rows of windows.values()){
    rows.sort((a,b)=>a.from-b.from || a.until-b.until);
    if(rows.some((row,index)=>index>0 && row.from<rows[index-1].until))return false;
  }
  return true;
}

export function validatePavilionLoanHistory(world:WorldState,actors:ReadonlySet<string>,sects:ReadonlySet<string>,
  fail:(path:string)=>never):void {
  const {copies,shifts,loans,nextShiftId,nextLoanId}=world.pavilionLoans;
  if(!copies.length&&!shifts.length&&!loans.length)return;
  const byShift=new Map<string,PavilionStaffShift>(),byCopy=new Map<string,typeof copies[number]>();
  const locations=new Map(world.locations.map((site)=>[site.id,site]));
  const editions=new Map(world.scriptures.editions.map((edition)=>[edition.id,edition]));
  const originals=new Set(world.scriptures.originals.map((original)=>original.id));
  const staffWindows=new Map<string,Window[]>(),deskWindows=new Map<string,Window[]>();
  const editionWindows=new Map<string,Window[]>(),holderWindows=new Map<string,Window[]>();
  const usedShiftTicks=new Map<string,Set<number>>();
  const add=(map:Map<string,Window[]>,id:string,window:Window)=>{
    const group=map.get(id)??[];group.push(window);map.set(id,group);
  };
  const exactSerial=(id:string,pattern:RegExp,limit:number)=>{
    const value=Number(pattern.exec(id)?.[1]);return Number.isSafeInteger(value)&&value<limit;
  };
  for(const row of shifts){
    if(!exactSerial(row.id,/^pavilion-shift-([1-9]\d*)$/,nextShiftId)||byShift.has(row.id)||!actors.has(row.actorId)||
        !sects.has(row.sectId)||!locations.has(row.siteId)||row.signedTick>world.tick||row.startsTick!==row.signedTick+1||
        row.endsTick!==row.signedTick+3 || (row.lastServedTick!==undefined &&
          (row.lastServedTick<row.startsTick || row.lastServedTick>=row.endsTick || row.lastServedTick>world.tick)))
      fail('pavilionLoans.shifts.source');
    byShift.set(row.id,row);
    const window={from:row.startsTick,until:row.endsTick};
    add(staffWindows,row.actorId,window);add(deskWindows,row.siteId,window);
  }
  if(!nonOverlapping(staffWindows)||!nonOverlapping(deskWindows))fail('pavilionLoans.shifts.overlap');
  function serve(shiftId:string,siteId:string,sectId:string,visitorId:string,tick:number) {
    const shift=byShift.get(shiftId),ticks=usedShiftTicks.get(shiftId)??new Set<number>();
    if(!shift||shift.siteId!==siteId||shift.sectId!==sectId||shift.actorId===visitorId||
        tick<shift.startsTick||tick>=shift.endsTick||tick>world.tick||ticks.has(tick))
      fail('pavilionLoans.shifts.service');
    ticks.add(tick);usedShiftTicks.set(shiftId,ticks);
  }
  for(const row of copies){
    const edition=editions.get(row.editionId);
    if(byCopy.has(row.editionId)||!edition||edition.kind!=='corrected'||edition.evidence?.kind!=='pavilion'||
        edition.evidence.locationId!==row.siteId||edition.evidence.sectId!==row.sectId||edition.locationId!==row.siteId||
        edition.originalId!==row.originalId||edition.authorId!==row.shelvedById||!originals.has(row.originalId)||
        !actors.has(row.shelvedById)||!sects.has(row.sectId)||!locations.has(row.siteId)||
        row.shelvedTick<=edition.createdTick||row.shelvedTick>world.tick)
      fail('pavilionLoans.copies.provenance');
    serve(row.shelvingShiftId,row.siteId,row.sectId,row.shelvedById,row.shelvedTick);
    byCopy.set(row.editionId,row);
  }
  const loanIds=new Set<string>();
  const studies=new Map<string,Array<{tick:number;credited:boolean}>>();
  for(const row of loans){
    const copy=byCopy.get(row.editionId);
    const {read,returned}=row;
    if(!exactSerial(row.id,/^pavilion-loan-([1-9]\d*)$/,nextLoanId)||loanIds.has(row.id)||!copy||!actors.has(row.borrowerId)||
        row.checkoutTick<=copy.shelvedTick||row.checkoutTick>world.tick||row.dueTick!==row.checkoutTick+PAVILION_LOAN_PERIOD_TICKS)
      return fail('pavilionLoans.loans.source');
    loanIds.add(row.id);
    serve(row.checkoutShiftId,copy.siteId,copy.sectId,row.borrowerId,row.checkoutTick);
    if(returned){
      if(returned.tick<=row.checkoutTick||returned.tick>world.tick)fail('pavilionLoans.loans.return');
      serve(returned.shiftId,copy.siteId,copy.sectId,row.borrowerId,returned.tick);
    }
    // A writer performs at most one site service in a tick; later same-tick use of this copy is not genuine.
    const held={from:row.checkoutTick,until:returned===undefined?Infinity:returned.tick+1};
    add(editionWindows,row.editionId,held);add(holderWindows,row.borrowerId,held);
    if(read){
      if(read.tick<=row.checkoutTick||read.tick>=row.dueTick||read.tick>world.tick||read.tick>=(returned?.tick??Infinity)||
          !locations.has(read.siteId) || locations.get(read.siteId)?.type==='secret_realm' ||
          locations.get(read.siteId)?.type==='abyss' ||
          read.masteryAfter!==(read.credited?Math.min(100,read.masteryBefore+PAVILION_LOAN_MASTERY_GAIN):read.masteryBefore))
        fail('pavilionLoans.loans.read');
      const key=JSON.stringify([row.borrowerId,copy.originalId]);
      const group=studies.get(key)??[];group.push(read);studies.set(key,group);
    }
  }
  if(!nonOverlapping(editionWindows)||!nonOverlapping(holderWindows))fail('pavilionLoans.loans.custody');
  for(const group of studies.values()){
    group.sort((a,b)=>a.tick-b.tick);
    if(!group[0].credited||group.slice(1).some((row)=>row.credited))fail('pavilionLoans.loans.repeatCredit');
  }
  for(const shift of shifts){
    const served=usedShiftTicks.get(shift.id);
    if(shift.lastServedTick!==(served?.size?Math.max(...served):undefined))fail('pavilionLoans.shifts.lastService');
  }
}
