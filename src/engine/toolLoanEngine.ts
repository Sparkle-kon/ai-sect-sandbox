import type {Artifact,Cultivator,LLMDecisionPayload,ToolLoan,ToolLoanMove,ToolLoansState,WorkshopOrder,WorkshopWorkReceipt,
  WorldEvent,WorldState} from '../types/world';
import {ARTIFACT_RULES} from './artifactEngine';
import {proveWorkshopArtifactOrigin} from './artifactSalvageEngine';
import {isFurnaceSafetyClosed} from './furnaceSafetyEngine';
import {pilgrimageCheckpoint} from './pilgrimageEngine';
import {effectiveWorkshopDeadline} from './workshopCapacityTerms';

export const TOOL_LOAN_OFFER_TICKS=3;
export const TOOL_LOAN_USE_TICKS=4;
export const TOOL_LOAN_WEAR=2;
export const TOOL_LOAN_QUALITY_BONUS=2;
const ARTIFACT_CAPACITY=12;
const REALMS=['练气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫'] as const;
export const createToolLoansState=():ToolLoansState=>({loans:[],nextId:1});
export type ToolLoanOption={
  action:'TOOL_LOAN';toolLoanMove:'offer';targetArtifactId:string;targetWorkshopId:string;targetToolLoanId?:never;
}|{
  action:'TOOL_LOAN';toolLoanMove:Exclude<ToolLoanMove,'offer'>;targetToolLoanId:string;targetArtifactId?:never;targetWorkshopId?:never;
};

const live=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0;
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);
const job=(world:WorldState,id:string)=>world.workshops.orders.find(row=>row.id===id);
const siteAt=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id&&row.type!=='abyss'&&row.type!=='secret_realm');
const pending=(loan:ToolLoan,tick:number)=>loan.status==='offered'&&loan.offeredTick<=tick&&tick<loan.expiresTick;
const contains=(loan:ToolLoan)=>loan.status==='active'||loan.status==='awaiting_recovery';

function there(world:WorldState,actor:Cultivator|undefined,siteId:string,tick:number):actor is Cultivator{
  if(!live(actor)||actor.age<18||actor.locationId!==siteId||!siteAt(world,siteId)||pilgrimageCheckpoint(world,actor)||
    actor.tribulation?.stage==='lightning'||actor.tribulation?.stage==='heart_demon')return false;
  const id=actor.id;
  return !(actor.guardAssignment&&actor.guardAssignment.assignedTick<=tick&&tick<actor.guardAssignment.expiresTick&&
      actor.guardAssignment.locationId!==siteId)&&
    !world.pilgrimages.journeys.some(row=>(row.organizerId===id||row.companionId===id)&&
      (row.status==='active'||row.startedTick===tick||row.lastMovedTick===tick))&&
    !world.couriers.dispatches.some(row=>row.courierId===id&&(row.status==='in_transit'||row.status==='returning'||
      row.acceptedTick!==undefined&&(row.acceptedTick===tick||row.lastAdvancedTick===tick||row.settledTick===tick)))&&
    !world.relocations.plans.some(row=>row.status==='in_transit'&&row.garrisonIds.includes(id))&&
    !world.boundaryReliefs.cases.some(row=>row.incomingId===id&&(row.status==='travelling'||row.status==='returning'))&&
    !world.escorts.contracts.some(row=>row.escortId===id&&row.status==='active')&&
    !world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(id))&&
    !world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(id)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(id)))&&
    !world.expeditionRescues.requests.some(row=>row.gateSiteId===siteId&&(row.explorerId===id||row.rescuerId===id)&&
      row.supplySpent===1&&(row.status==='extracting'||row.status==='interrupted'&&row.pathIndex>0&&
        !row.arrivedIds?.includes(id)&&world.occasions.some(occasion=>occasion.id===row.occasionId&&occasion.status==='running')));
}

function realOrder(order:WorkshopOrder|undefined,tick:number):order is WorkshopOrder{
  if(!order||order.status!=='active'||order.acceptedTick===undefined||order.acceptedTick>=tick||
      tick>=(effectiveWorkshopDeadline(order)??0)||order.patronId===order.makerId)return false;
  return true;
}
function staffedOrder(world:WorldState,order:WorkshopOrder|undefined,tick:number):order is WorkshopOrder{
  if(!realOrder(order,tick))return false;
  const maker=person(world,order.makerId),lender=person(world,order.patronId);
  const site=siteAt(world,order.siteId), rule=ARTIFACT_RULES[order.tier];
  return !!site&&site.furnaceGrade>=rule.grade&&!isFurnaceSafetyClosed(world,site.id,tick)&&
    there(world,maker,site.id,tick)&&there(world,lender,site.id,tick)&&
    maker.techniqueMastery>=rule.mastery&&REALMS.indexOf(maker.realm)>=REALMS.indexOf(rule.realm);
}
function nonOwnedDuplicate(world:WorldState,id:string,lenderId?:string,item?:Artifact,current?:ToolLoan):boolean{
  return world.cultivators.some(actor=>actor.artifacts.some(other=>other.id===id&&
      (actor.id!==lenderId||other!==item))) ||
    world.estates.entries.some(row=>row.holdings.artifacts.some(other=>other.id===id)) ||
    world.relicExhibits.entries.some(row=>row.custody?.id===id||
      row.artifactId===id&&row.status!=='closed') ||
    world.artifactSalvages.receipts.some(row=>row.artifactId===id) ||
    world.toolLoans.loans.some(row=>row!==current&&row.custody?.id===id);
}
function personTool(world:WorldState,lender:Cultivator,id:string,tick:number){
  const items=lender.artifacts.filter(row=>row.id===id);
  const item=items.length===1?items[0]:undefined;
  if(!item||item.tier!=='法器'||item.boundTo||item.soul||item.relicSetId||item.relicFragmentIds||
      item.resonance!==undefined&&item.resonance!==0||
      item.durability===undefined||item.maxDurability===undefined||!Number.isSafeInteger(item.durability)||
      item.durability<TOOL_LOAN_WEAR||item.durability>item.maxDurability||![
        ARTIFACT_RULES.法器.durability,Math.ceil(ARTIFACT_RULES.法器.durability*1.2),
      ].includes(item.maxDurability)||nonOwnedDuplicate(world,id,lender.id,item))return undefined;
  const origin=proveWorkshopArtifactOrigin(world,item);
  return origin&&origin.finishedTick<tick ? {item,origin,durability:item.durability,maxDurability:item.maxDurability}:undefined;
}
const equalOrigin=(a:ToolLoan['origin'],b:ToolLoan['origin'])=>
  a.orderId===b.orderId&&a.piece===b.piece&&a.makerId===b.makerId&&a.siteId===b.siteId&&a.blankTick===b.blankTick&&a.finishedTick===b.finishedTick;
function exactTool(world:WorldState,lender:Cultivator,loan:ToolLoan,tick:number){
  const current=personTool(world,lender,loan.artifactId,tick);
  return current&&current.durability===loan.initialDurability&&current.maxDurability===loan.maxDurability&&
    current.item.name===loan.artifactName&&equalOrigin(current.origin,loan.origin)?current:undefined;
}

export function availableToolLoanActions(actor:Cultivator,world:WorldState,executionTick=world.tick):ToolLoanOption[]{
  if((executionTick!==world.tick&&executionTick!==world.tick+1)||person(world,actor.id)!==actor||
      !there(world,actor,actor.locationId,executionTick))return [];
  const result:ToolLoanOption[]=[];
  const add=(toolLoanMove:Exclude<ToolLoanMove,'offer'>,targetToolLoanId:string)=>
    result.push({action:'TOOL_LOAN',toolLoanMove,targetToolLoanId});
  for(const loan of world.toolLoans.loans){
    if(loan.siteId!==actor.locationId||(loan.lenderId!==actor.id&&loan.borrowerId!==actor.id))continue;
    if(pending(loan,executionTick)){
      if(loan.lenderId===actor.id) add('withdraw',loan.id);
      if(loan.borrowerId!==actor.id||executionTick<=loan.offeredTick)continue;
      add('decline',loan.id);
      const order=job(world,loan.workshopId),lender=person(world,loan.lenderId);
      if(staffedOrder(world,order,executionTick)&&order.makerId===actor.id&&order.patronId===loan.lenderId&&lender&&
          executionTick+1<(effectiveWorkshopDeadline(order)??0)&&exactTool(world,lender,loan,executionTick))
        add('accept',loan.id);
    } else if(loan.status==='active'&&loan.borrowerId===actor.id&&executionTick>(loan.acceptedTick??Infinity)&&executionTick<(loan.useUntilTick??0)){
      add('release',loan.id);
    } else if(loan.status==='awaiting_recovery'&&loan.lenderId===actor.id&&loan.custody&&
        executionTick>(loan.release?.tick??Infinity)&&actor.artifacts.length<ARTIFACT_CAPACITY&&
        !nonOwnedDuplicate(world,loan.artifactId,undefined,undefined,loan)) add('reclaim',loan.id);
  }
  for(const order of world.workshops.orders){
    if(order.patronId!==actor.id||order.siteId!==actor.locationId||!staffedOrder(world,order,executionTick)||
        executionTick+2>=(effectiveWorkshopDeadline(order)??0)||world.toolLoans.loans.some(row=>row.workshopId===order.id&&
          (pending(row,executionTick)||contains(row)||row.wear)))continue;
    for(const item of actor.artifacts){
      if(!item.id||!personTool(world,actor,item.id,executionTick)||world.toolLoans.loans.some(row=>row.artifactId===item.id&&
          (pending(row,executionTick)||contains(row))))continue;
      result.push({action:'TOOL_LOAN',toolLoanMove:'offer',targetArtifactId:item.id,targetWorkshopId:order.id});
    }
  }
  return result;
}
const base=['chosenAction','innerMonologue','spokenLine','toolLoanMove'];
function event(world:WorldState,row:ToolLoan,suffix:string,title:string,description:string):WorldEvent{
  return {id:`evt-${world.tick}-${row.id}-${suffix}`,tick:world.tick,year:world.year,month:world.month,
    title,description,actorIds:[row.lenderId,row.borrowerId],category:'diplomacy',witnessScope:'participants',
    ...(siteAt(world,row.siteId)?{locationId:row.siteId}:{})};
}
function closeRelease(world:WorldState,loan:ToolLoan,reason:NonNullable<ToolLoan['release']>['reason']):WorldEvent{
  loan.release={tick:world.tick,reason};
  loan.status='awaiting_recovery';
  return event(world,loan,'release','共器停止使用，待物主领取','唯一原件仍在封存账，不自动交给借用人，也不凭远程状态交回。');
}
export function resolveToolLoanAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  const move=payload.toolLoanMove;
  const allowed=new Set([...base,...(move==='offer'?['targetArtifactId','targetWorkshopId']:['targetToolLoanId'])]);
  if(payload.chosenAction!=='TOOL_LOAN'||Object.keys(payload).some(key=>!allowed.has(key)))return null;
  const option=availableToolLoanActions(actor,world).find(row=>row.toolLoanMove===move&&row.targetArtifactId===payload.targetArtifactId&&
    row.targetWorkshopId===payload.targetWorkshopId&&row.targetToolLoanId===payload.targetToolLoanId);
  if(!option)return null;
  if(option.toolLoanMove==='offer'){
    const order=job(world,option.targetWorkshopId);
    const tool=personTool(world,actor,option.targetArtifactId,world.tick);
    if(!order||!tool)return null;
    const row:ToolLoan={id:`tool-loan-${world.toolLoans.nextId++}`,artifactId:option.targetArtifactId,artifactName:tool.item.name,
      lenderId:actor.id,borrowerId:order.makerId,siteId:order.siteId,workshopId:order.id,origin:tool.origin,
      initialDurability:tool.durability,maxDurability:tool.maxDurability,offeredTick:world.tick,
      expiresTick:world.tick+TOOL_LOAN_OFFER_TICKS,status:'offered'};
    world.toolLoans.loans.push(row);
    return event(world,row,'offer','工坊共器借用邀约','只向实际委托工匠提出借用；未交实物。');
  }
  const row=world.toolLoans.loans.find(item=>item.id===option.targetToolLoanId);
  if(!row)return null;
  if(option.toolLoanMove==='accept'){
    const lender=person(world,row.lenderId),order=job(world,row.workshopId);
    const tool=lender&&exactTool(world,lender,row,world.tick);
    if(!lender||!tool||!order)return null;
    const index=lender.artifacts.indexOf(tool.item);
    if(index<0)return null;
    lender.artifacts.splice(index,1);
    tool.item.workshopOrigin??={...tool.origin};
    row.custody=tool.item;row.acceptedTick=world.tick;
    row.useUntilTick=Math.min(world.tick+TOOL_LOAN_USE_TICKS,effectiveWorkshopDeadline(order)??Infinity);
    row.status='active';
    return event(world,row,'accept','共器原件入专账','同一原件从物主储物戒移入工坊封存，不进入借用人装备。');
  }
  if(option.toolLoanMove==='release') return closeRelease(world,row,'borrower_released');
  if(option.toolLoanMove==='reclaim'){
    if(!row.custody)return null;
    actor.artifacts.push(row.custody);
    delete row.custody;
    row.status='returned';row.closedTick=world.tick;
    return event(world,row,'returned','物主实地领回共器','同一原件交还，保留实际磨损；没有另造器物。');
  }
  row.status=option.toolLoanMove==='decline'?'declined':'withdrawn';row.closedTick=world.tick;
  return event(world,row,'withdrawn','共器邀约结束','实物没有从原主人处转出。');
}
export function workshopToolLoanForFinish(world:WorldState,maker:Cultivator,order:WorkshopOrder,loanId:string,
  executionTick=world.tick):ToolLoan|undefined{
  if(order.work.length%2!==1||order.makerId!==maker.id||!staffedOrder(world,order,executionTick))return undefined;
  const row=world.toolLoans.loans.find(loan=>loan.id===loanId);
  return row?.status==='active'&&row.workshopId===order.id&&row.siteId===order.siteId&&
    row.borrowerId===maker.id&&row.lenderId===order.patronId&&executionTick>(row.acceptedTick??Infinity)&&
    executionTick<(row.useUntilTick??0)&&!row.wear&&row.custody&&row.custody.id===row.artifactId&&
    row.custody.durability!==undefined&&row.custody.durability===row.initialDurability&&
    !nonOwnedDuplicate(world,row.artifactId,undefined,undefined,row)?row:undefined;
}
export function availableWorkshopToolUses(world:WorldState,maker:Cultivator,order:WorkshopOrder,executionTick=world.tick):string[]{
  return world.toolLoans.loans.flatMap(row=>workshopToolLoanForFinish(world,maker,order,row.id,executionTick)?[row.id]:[]);
}
export function applyWorkshopToolUse(world:WorldState,loan:ToolLoan,row:WorkshopWorkReceipt,baseScore:number):void{
  const item=loan.custody,before=item?.durability;
  if(item===undefined||before===undefined||loan.wear||row.stage!=='finish')return;
  item.durability=before-TOOL_LOAN_WEAR;
  row.toolUse={loanId:loan.id,baseScore,scoreBonus:TOOL_LOAN_QUALITY_BONUS};
  loan.wear={tick:world.tick,workshopId:loan.workshopId,piece:row.piece,stage:'finish',
    durabilityBefore:before,durabilityAfter:item.durability,scoreBonus:TOOL_LOAN_QUALITY_BONUS};
}
export function advanceToolLoans(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const loan of world.toolLoans.loans){
    if(loan.status==='offered'){
      if(world.tick>=loan.expiresTick){loan.status='expired';loan.closedTick=world.tick;}
      continue;
    }
    if(!contains(loan)||!loan.custody)continue;
    const lender=person(world,loan.lenderId),borrower=person(world,loan.borrowerId);
    if(lender&&!lender.alive&&!nonOwnedDuplicate(world,loan.artifactId,undefined,undefined,loan)){
      lender.artifacts.push(loan.custody);
      delete loan.custody;
      loan.status='probate';loan.closedTick=world.tick;
      events.push(event(world,loan,'probate','共器原件交原主遗产','原件进入原物主的身后财物流程，不进入借用人的遗产。'));
      continue;
    }
    if(loan.status!=='active')continue;
    const order=job(world,loan.workshopId);
    if(borrower&&!borrower.alive)events.push(closeRelease(world,loan,'borrower_died'));
    else if(!order||order.status!=='active')events.push(closeRelease(world,loan,'workshop_closed'));
    else if(world.tick>=(loan.useUntilTick??Infinity))events.push(closeRelease(world,loan,'term_expired'));
  }
  return events;
}
export function projectToolLoans(world:WorldState,viewer?:Cultivator){
  if(!viewer||person(world,viewer.id)!==viewer)return [];
  return world.toolLoans.loans.filter(row=>row.lenderId===viewer.id||row.borrowerId===viewer.id).map(row=>({
    id:row.id,status:row.status,role:row.lenderId===viewer.id?'lender' as const:'borrower' as const,
    siteId:row.siteId,artifactName:row.artifactName,workshopId:row.workshopId,initialDurability:row.initialDurability,
    maxDurability:row.maxDurability,offeredTick:row.offeredTick,expiresTick:row.expiresTick,acceptedTick:row.acceptedTick,
    useUntilTick:row.useUntilTick,closedTick:row.closedTick,wear:row.wear&&projectWear(world,row),release:row.release&&{...row.release},
  }));
}
function projectWear(world:WorldState,loan:ToolLoan){
  const wear=loan.wear;
  if(!wear)return undefined;
  const receipt=job(world,loan.workshopId)?.work.find(work=>work.tick===wear.tick&&work.piece===wear.piece&&
    work.stage==='finish'&&work.toolUse?.loanId===loan.id);
  return {...wear,
    ...(receipt?.toolUse&&receipt.qualityScore!==undefined?{baseScore:receipt.toolUse.baseScore,finalScore:receipt.qualityScore}:{})};
}
export function projectLocalToolLoanStatus(world:WorldState,viewer?:Cultivator):{siteId:string;active:number;awaiting:number}|undefined {
  if(!viewer||person(world,viewer.id)!==viewer||!there(world,viewer,viewer.locationId,world.tick))return undefined;
  const loans=world.toolLoans.loans.filter(row=>row.siteId===viewer.locationId&&
    (viewer.id===row.lenderId||viewer.id===row.borrowerId)&&contains(row)&&row.custody?.id===row.artifactId);
  if(loans.length===0)return undefined;
  const active=loans.filter(row=>row.status==='active'&&world.tick<(row.useUntilTick??0)).length;
  return {siteId:viewer.locationId,active,awaiting:loans.length-active};
}
