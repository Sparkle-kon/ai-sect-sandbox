import type { Cultivator, LLMDecisionPayload, LocationNode, PavilionCopy, PavilionLoan, PavilionLoanMove, PavilionStaffShift,
  ScriptureEdition, Sect, Technique, WorldEvent, WorldState } from '../types/world';
import { hasCohortStaffedDuty } from './apprenticeCohortEngine';
import { hasDueObservatoryDuty } from './staffedDutyEngine';
import { gainMastery } from './techniqueEngine';
import { terrainTileAt } from './terrainEngine';

export const PAVILION_LOAN_PERIOD_TICKS=4;
export const PAVILION_STAFF_SERVICE_TICKS=2;
export const PAVILION_LOAN_MASTERY_GAIN=2;
const MIN_CLERK_HEALTH=.75;
const role=new Set<Cultivator['sectRank']>(['真传弟子','长老','太上长老','掌门']);
export const createPavilionLoansState=():WorldState['pavilionLoans']=>({copies:[],shifts:[],loans:[],nextLoanId:1,nextShiftId:1});
const acceptedFields=new Set(['action','chosenAction','innerMonologue','spokenLine','pavilionLoanMove','targetScriptureEditionId','targetPavilionLoanId']);
const asc=(a:string,b:string)=>a<b?-1:a>b?1:0;
const living=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0;
const copyHeld=(row:PavilionLoan)=>!row.returned;

function physicalSite(world:WorldState,actor:Cultivator,tick:number):LocationNode|undefined {
  if(!living(actor)||!world.cultivators.includes(actor)||actor.tribulation?.stage==='lightning'||
    actor.tribulation?.stage==='heart_demon')return undefined;
  const site=world.locations.find(row=>row.id===actor.locationId&&(row.type==='market'||row.type==='sect_hq'));
  if(!site)return undefined;
  const id=actor.id;
  const guard=actor.guardAssignment;
  if(guard&&guard.assignedTick<=tick&&guard.expiresTick>tick&&guard.locationId!==site.id||
    world.couriers.dispatches.some(row=>row.courierId===id&&(row.status==='in_transit'||row.status==='returning'||
      row.acceptedTick===tick||row.lastAdvancedTick===tick||row.settledTick===tick))||
    world.escorts.contracts.some(row=>row.escortId===id&&row.status==='active')||
    world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id))||
    world.boundaryReliefs.cases.some(row=>row.incomingId===id&&(row.status==='travelling'||row.status==='returning'))||
    world.sieges.some(row=>row.participantIds.includes(id)&&(row.status==='marching'||row.status==='sieging'))||
    world.occasions.some(row=>row.participantIds.includes(id)&&(row.status==='registration'||row.status==='running')&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(id)))||
    world.pilgrimages.journeys.some(row=>(row.organizerId===id||row.companionId===id)&&
      (row.status==='active'&&row.path.length>0||row.startedTick===tick||row.lastMovedTick===tick||
        row.camps?.some(camp=>camp.openedTick===tick||camp.closedTick===tick))))return undefined;
  return site;
}

function title(world:WorldState,site:LocationNode|undefined):Sect|undefined {
  if(!site||site.type!=='sect_hq'||!site.ownerSectId)return undefined;
  return world.sects.find(row=>row.id===site.ownerSectId&&row.headquartersId===site.id&&row.facilities.scripture_pavilion>0&&
    !world.relocations.plans.some(plan=>plan.sectId===row.id&&plan.status==='in_transit'));
}
function sameText(a:Technique,b:Readonly<Technique>){
  return a.id===b.id&&a.authorId===b.authorId&&a.createdTick===b.createdTick&&a.name===b.name&&a.spiritRoot===b.spiritRoot;
}
function nativeSource(world:WorldState,edition:ScriptureEdition|undefined,sect:Sect,siteId:string){
  if(!edition||edition.kind!=='corrected'||!edition.parentEditionId||edition.locationId!==siteId||edition.evidence?.kind!=='pavilion'||
    edition.evidence.sectId!==sect.id||edition.evidence.locationId!==siteId)return undefined;
  const parent=world.scriptures.editions.find(row=>row.id===edition.parentEditionId);
  const original=world.scriptures.originals.find(row=>row.id===edition.originalId);
  return parent?.kind==='misread'&&parent.originalId===edition.originalId&&original&&
    sect.pavilion.some(row=>sameText(row,original.technique))?original:undefined;
}
function activeSource(world:WorldState,copy:PavilionCopy){
  const source=world.locations.find(row=>row.id===copy.siteId);
  const sect=title(world,source);
  if(!sect||sect.id!==copy.sectId)return undefined;
  const original=nativeSource(world,world.scriptures.editions.find(row=>row.id===copy.editionId),sect,copy.siteId);
  return original?.id===copy.originalId?original:undefined;
}
function qualifiesClerk(actor:Cultivator,sect:Sect){
  return actor.sectId===sect.id&&actor.service?.status!=='retired'&&role.has(actor.sectRank)&&
    (actor.sectRank!=='掌门'||actor.id===sect.leaderId)&&actor.maxHp>0&&actor.hp/actor.maxHp>=MIN_CLERK_HEALTH;
}
function competingWork(world:WorldState,actor:Cultivator,siteId:string,tick:number){
  return hasDueObservatoryDuty(world,actor,siteId,tick)||hasCohortStaffedDuty(world,actor,siteId,tick)||
    world.infirmaries.shifts.some(row=>row.guardId===actor.id&&row.siteId===siteId&&row.startedTick<tick&&tick<row.expiresTick)||
    world.shortShifts.shifts.some(row=>row.workerId===actor.id&&row.siteId===siteId&&row.shiftTick===tick&&
      (row.status==='active'||row.status==='completed'));
}
function staffAvailable(world:WorldState,sect:Sect,siteId:string,tick:number,applicantId?:string,includeServed=false){
  return world.pavilionLoans.shifts.filter(row=>row.siteId===siteId&&row.sectId===sect.id&&row.startsTick<=tick&&tick<row.endsTick&&
    (includeServed||row.lastServedTick!==tick)&&row.actorId!==applicantId).filter(row=>{
      const clerk=world.cultivators.find(actor=>actor.id===row.actorId);
      return living(clerk)&&physicalSite(world,clerk,tick)?.id===siteId&&qualifiesClerk(clerk,sect)&&!competingWork(world,clerk,siteId,tick);
    }).sort((a,b)=>a.signedTick-b.signedTick||asc(a.actorId,b.actorId));
}
function acted(world:WorldState,actor:Cultivator,tick:number){
  const state=world.pavilionLoans;
  return state.shifts.some(row=>row.actorId===actor.id&&row.signedTick===tick)||
    state.copies.some(row=>row.shelvedById===actor.id&&row.shelvedTick===tick)||
    state.loans.some(row=>row.borrowerId===actor.id&&(row.checkoutTick===tick||row.read?.tick===tick||row.returned?.tick===tick));
}
function safelyRead(world:WorldState,site:LocationNode,tick:number){
  const tile=terrainTileAt(world,site.x,site.y);
  return tile&&!world.mapHazards.some(row=>row.tileId===tile.id&&row.createdTick<=tick&&tick<row.expiresTick&&row.intensity>=2);
}

export type PavilionLoanOption =
  | {action:'PAVILION_LOAN';pavilionLoanMove:'staff';targetScriptureEditionId?:never;targetPavilionLoanId?:never}
  | {action:'PAVILION_LOAN';pavilionLoanMove:'shelve'|'checkout';targetScriptureEditionId:string;targetPavilionLoanId?:never}
  | {action:'PAVILION_LOAN';pavilionLoanMove:'read'|'return';targetPavilionLoanId:string;targetScriptureEditionId?:never};

export function availablePavilionLoanActions(actor:Cultivator,world:WorldState,executionTick=world.tick):PavilionLoanOption[]{
  if(executionTick!==world.tick&&executionTick!==world.tick+1)return [];
  if(world.pilgrimages.journeys.some(row=>row.status==='active'&&(row.expiresTick??Infinity)>executionTick&&
    (row.organizerId===actor.id||row.companionId===actor.id)))return [];
  const site=physicalSite(world,actor,executionTick);
  if(!site||!safelyRead(world,site,executionTick)||acted(world,actor,executionTick))return [];
  const state=world.pavilionLoans;
  const currentTitle=title(world,site);
  const clerk=currentTitle?staffAvailable(world,currentTitle,site.id,executionTick,actor.id)[0]:undefined;
  const options:PavilionLoanOption[]=[];
  if(currentTitle&&qualifiesClerk(actor,currentTitle)&&!state.shifts.some(row=>
    (row.actorId===actor.id||row.siteId===site.id)&&
    row.startsTick<executionTick+1+PAVILION_STAFF_SERVICE_TICKS&&row.endsTick>executionTick+1)){
    options.push({action:'PAVILION_LOAN',pavilionLoanMove:'staff'});
  }
  const holding=state.loans.find(row=>row.borrowerId===actor.id&&copyHeld(row));
  if(holding){
    const copy=state.copies.find(row=>row.editionId===holding.editionId);
    const original=copy&&activeSource(world,copy);
    if(copy&&original&&holding.checkoutTick<executionTick){
      if(!holding.read&&executionTick<holding.dueTick&&sameText(actor.technique,original.technique)&&
        Number.isFinite(actor.techniqueMastery)&&actor.techniqueMastery>=0&&actor.techniqueMastery<=100)
        options.push({action:'PAVILION_LOAN',pavilionLoanMove:'read',targetPavilionLoanId:holding.id});
      if(clerk&&site.id===copy.siteId&&currentTitle?.id===copy.sectId)
        options.push({action:'PAVILION_LOAN',pavilionLoanMove:'return',targetPavilionLoanId:holding.id});
    }
  }
  if(!currentTitle||!clerk||actor.sectId!==currentTitle.id)return options;
  for(const edition of world.scriptures.editions){
    if(edition.authorId!==actor.id||edition.createdTick>=executionTick||state.copies.some(row=>row.editionId===edition.id)||
      !nativeSource(world,edition,currentTitle,site.id))continue;
    options.push({action:'PAVILION_LOAN',pavilionLoanMove:'shelve',targetScriptureEditionId:edition.id});
  }
  if(!holding)for(const copy of state.copies){
    if(copy.siteId!==site.id||copy.sectId!==currentTitle.id||copy.shelvedTick>=executionTick||
      state.loans.some(row=>row.editionId===copy.editionId&&copyHeld(row)))continue;
    const original=activeSource(world,copy);
    if(original&&sameText(actor.technique,original.technique))options.push({
      action:'PAVILION_LOAN',pavilionLoanMove:'checkout',targetScriptureEditionId:copy.editionId});
  }
  return options;
}

function event(world:WorldState,actor:Cultivator,id:string,move:PavilionLoanMove,staff?:PavilionStaffShift):WorldEvent{
  const [titleText,desc]={
    staff:['自愿签定藏经阁坐值','本轮仅登记；下一轮起须实际在阁和无冲突时方可经办。'],
    shelve:['核实校订本上架','经实际值守验本，登记现有的一册校订本，不另复制或改写原典。'],
    checkout:['当场交接校订本','经值守核对后转交现有一册，限期阅读并须本人还回原阁。'],
    read:['核验实持借本参读','按实持这一本记录参读，私人的研习回执不随借还账公开。'],
    return:['藏经阁实收原借本','由当值人现场核收这一本，结束该条真实持有，未复制第二册。'],
  }[move];
  return {id:`evt-${id}-${move}-${world.tick}`,tick:world.tick,year:world.year,month:world.month,category:'breakthrough',
   title:titleText,description:desc,actorIds:[actor.id,...(staff?[staff.actorId]:[])],locationId:actor.locationId,witnessScope:'participants'};
}

export function resolvePavilionLoanAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='PAVILION_LOAN'||Object.entries(decision).some(([key,value])=>value!==undefined&&
    (!acceptedFields.has(key)||key==='action'&&value!=='PAVILION_LOAN')))return null;
  const choice=availablePavilionLoanActions(actor,world).find(row=>row.pavilionLoanMove===decision.pavilionLoanMove&&
    row.targetScriptureEditionId===decision.targetScriptureEditionId&&row.targetPavilionLoanId===decision.targetPavilionLoanId);
  if(!choice)return null;
  const at=physicalSite(world,actor,world.tick)!;
  const currentTitle=title(world,at);
  const state=world.pavilionLoans;
  const tick=world.tick;
  if(choice.pavilionLoanMove==='staff'&&currentTitle){
    const row:PavilionStaffShift={id:`pavilion-shift-${state.nextShiftId++}`,actorId:actor.id,sectId:currentTitle.id,siteId:at.id,
      signedTick:tick,startsTick:tick+1,endsTick:tick+1+PAVILION_STAFF_SERVICE_TICKS};
    state.shifts.push(row);
    return event(world,actor,row.id,'staff');
  }
  if(choice.pavilionLoanMove==='read'){
    const row=state.loans.find(entry=>entry.id===choice.targetPavilionLoanId)!;
    const copy=state.copies.find(entry=>entry.editionId===row.editionId)!;
    const credited=!state.loans.some(loan=>loan.borrowerId===actor.id&&loan.read?.credited&&
      state.copies.some(book=>book.editionId===loan.editionId&&book.originalId===copy.originalId));
    const masteryBefore=actor.techniqueMastery;
    if(credited)gainMastery(actor,PAVILION_LOAN_MASTERY_GAIN);
    row.read={tick,siteId:at.id,masteryBefore,masteryAfter:actor.techniqueMastery,credited};
    return event(world,actor,row.id,'read');
  }
  if(!currentTitle)return null;
  const staff=staffAvailable(world,currentTitle,at.id,tick,actor.id)[0];
  if(!staff)return null;
  if(choice.pavilionLoanMove==='shelve'){
    const edition=world.scriptures.editions.find(row=>row.id===choice.targetScriptureEditionId)!;
    state.copies.push({editionId:edition.id,originalId:edition.originalId,sectId:currentTitle.id,siteId:at.id,
      shelvedTick:tick,shelvedById:actor.id,shelvingShiftId:staff.id});
    staff.lastServedTick=tick;
    return event(world,actor,edition.id,'shelve',staff);
  }
  if(choice.pavilionLoanMove==='checkout'){
    const row:PavilionLoan={id:`pavilion-loan-${state.nextLoanId++}`,editionId:choice.targetScriptureEditionId,borrowerId:actor.id,
      checkoutTick:tick,dueTick:tick+PAVILION_LOAN_PERIOD_TICKS,checkoutShiftId:staff.id};
    state.loans.push(row);
    staff.lastServedTick=tick;
    return event(world,actor,row.id,'checkout',staff);
  }
  if(choice.pavilionLoanMove==='return'){
    const row=state.loans.find(entry=>entry.id===choice.targetPavilionLoanId)!;
    row.returned={tick,shiftId:staff.id};
    staff.lastServedTick=tick;
    return event(world,actor,row.id,'return',staff);
  }
  return null;
}


export interface PavilionDeskView {siteId:string;staffed:boolean;availableCopies:number;heldCopies:number}
export interface PavilionShelfView {
  editionId:string;originalId:string;title:string;phase:'shelved'|'held'|'overdue'|'unresolved';shelvedTick:number;
  lastCheckoutTick?:number;lastReturnedTick?:number;
}
export interface PavilionOwnLoanView {
  id:string;editionId:string;originalId:string;title:string;siteId:string;status:'held'|'overdue'|'unresolved'|'returned';
  checkoutTick:number;dueTick:number;returnedTick?:number;unresolvedReason?:'borrower_lost'|'title_closed';
  read?:{tick:number;siteId:string;masteryGained:number;credited:boolean};
}
export interface PavilionLoanView {desk?:PavilionDeskView;shelves:PavilionShelfView[];ownLoans:PavilionOwnLoanView[]}

function unresolved(world:WorldState,copy:PavilionCopy,loan?:PavilionLoan):PavilionOwnLoanView['unresolvedReason']{
  if(loan&&!living(world.cultivators.find(row=>row.id===loan.borrowerId)))return 'borrower_lost';
  if(!activeSource(world,copy))return 'title_closed';
  return undefined;
}
const copyName=(world:WorldState,copy:PavilionCopy)=>world.scriptures.originals.find(row=>row.id===copy.originalId)?.technique.name??'校订借本';

function localDesk(world:WorldState,viewer?:Cultivator){
  if(!viewer)return undefined;
  const at=physicalSite(world,viewer,world.tick);
  const sect=title(world,at);
  return at&&sect?{at,sect,copies:world.pavilionLoans.copies.filter(row=>row.siteId===at.id&&row.sectId===sect.id)}:undefined;
}

export function projectLocalPavilionDesk(world:WorldState,viewer?:Cultivator):PavilionDeskView|undefined{
  const local=localDesk(world,viewer);
  if(!local)return undefined;
  let availableCopies=0,heldCopies=0;
  for(const copy of local.copies){
    if(world.pavilionLoans.loans.some(row=>row.editionId===copy.editionId&&copyHeld(row)))heldCopies++;
    else if(activeSource(world,copy))availableCopies++;
  }
  return {siteId:local.at.id,staffed:!!safelyRead(world,local.at,world.tick)&&
    staffAvailable(world,local.sect,local.at.id,world.tick,undefined,true).length>0,availableCopies,heldCopies};
}

/** Visitors see only anonymous local physical custody; exact study and credit belong only to the borrower. */
export function projectPavilionLoans(world:WorldState,viewer?:Cultivator):PavilionLoanView{
  if(!viewer||!world.cultivators.includes(viewer))return {shelves:[],ownLoans:[]};
  const local=localDesk(world,viewer);
  const desk=projectLocalPavilionDesk(world,viewer);
  const shelves:PavilionShelfView[]=local?.copies.map(copy=>{
    const history=world.pavilionLoans.loans.filter(row=>row.editionId===copy.editionId);
    const held=history.find(copyHeld);
    const lastCheckout=history.at(-1)?.checkoutTick;
    const lastReturned=history.filter(row=>!!row.returned).at(-1)?.returned?.tick;
    return {editionId:copy.editionId,originalId:copy.originalId,title:copyName(world,copy),shelvedTick:copy.shelvedTick,
      phase:unresolved(world,copy,held)?'unresolved':held?world.tick>=held.dueTick?'overdue':'held':'shelved',
      ...(lastCheckout===undefined?{}:{lastCheckoutTick:lastCheckout}),
      ...(lastReturned===undefined?{}:{lastReturnedTick:lastReturned})};
  })??[];
  const ownLoans=world.pavilionLoans.loans.flatMap((row):PavilionOwnLoanView[]=>{
    if(row.borrowerId!==viewer.id)return [];
    const copy=world.pavilionLoans.copies.find(book=>book.editionId===row.editionId);
    if(!copy)return [];
    const unavailable=row.returned?undefined:unresolved(world,copy,row);
    return [{id:row.id,editionId:copy.editionId,originalId:copy.originalId,title:copyName(world,copy),siteId:copy.siteId,
      checkoutTick:row.checkoutTick,dueTick:row.dueTick,
      status:row.returned?'returned':unavailable?'unresolved':world.tick>=row.dueTick?'overdue':'held',
      ...(row.returned?{returnedTick:row.returned.tick}:{}),...(unavailable?{unresolvedReason:unavailable}:{}),
      ...(row.read?{read:{tick:row.read.tick,siteId:row.read.siteId,credited:row.read.credited,
        masteryGained:row.read.masteryAfter-row.read.masteryBefore}}:{})}];
  });
  return {...(desk?{desk}:{}),shelves,ownLoans};
}
