import {REALM_ORDER} from '../data/initialWorld';
import {MANAGEMENT_BUILDING_IDS,type ManagementBuildingId} from '../types/sectManagement';
import {SECT_RATINGS,type SectGrowthCommand,type SectGrowthFailure,type SectRating} from '../types/sectGrowth';
import type {Cultivator,LocationNode,Sect,WorldEvent,WorldState} from '../types/world';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {flowActor,flowSect,recordResourceFlow} from './resourceFlowEngine';
import {isSectActive} from './sectActivity';
import {isRetiredFromService} from './serviceRetirementEngine';
import {sameGeneratedWorld} from './worldIdentity';
import {recordAuxiliaryActionEvent} from './recordAuxiliaryActionEvent';

const MAX_LEVEL=3;
const MAX_TREASURY=50_000;
const MAX_HOLDING=1_000_000_000;
const ANNUAL_MONTHS=12;
const BUILDINGS:Readonly<Record<ManagementBuildingId,{readonly name:string;readonly initialCost:number}>>={
  hall:{name:'大殿',initialCost:14},kitchen:{name:'饭堂',initialCost:12},furnace:{name:'丹房',initialCost:20},
  trainingGround:{name:'演武场',initialCost:16},gate:{name:'山门',initialCost:12},library:{name:'藏经阁',initialCost:18},
};
type Quote={readonly kind:'upgrade';readonly building:ManagementBuildingId;readonly level:number;readonly cost:number}|
  {readonly kind:'repay';readonly amount:number};
const unique=<T extends {id:string}>(rows:readonly T[],id:string|undefined):T|undefined=>{
  if(!id)return;
  const candidates=rows.filter(row=>row.id===id);
  return candidates.length===1?candidates[0]:undefined;
};
const real=(actor:Cultivator|undefined):actor is Cultivator=>!!actor&&actor.alive&&actor.hp>0&&actor.positionPlane!=='immortal';
const contained=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const buildingCost=(id:ManagementBuildingId,level:number)=>BUILDINGS[id].initialCost*(level+1);

function base(world:WorldState){
  const management=world.sectManagement;
  if(!management)return;
  const sect=unique(world.sects,management.sectId);
  const leader=unique(world.cultivators,management.leaderId);
  const home=unique(world.locations,management.homeSiteId);
  const creditor=unique(world.cultivators,management.debt?.creditorId);
  if(!sect||!home)return;
  return {management,sect,leader,home,creditor};
}
function ownsOffice(active:NonNullable<ReturnType<typeof base>>):boolean{
  const {management,sect,leader}=active;
  return isSectActive(sect)&&real(leader)&&leader.sectId===sect.id&&
    sect.leaderId===management.leaderId&&leader.sectRank==='掌门'&&!isRetiredFromService(leader);
}
function hasAuthority(active:NonNullable<ReturnType<typeof base>>):boolean{
  const {sect,home,leader}=active;
  return ownsOffice(active)&&leader?.positionPlane===undefined&&home.id===sect.headquartersId&&
    home.type==='sect_hq'&&home.ownerSectId===sect.id&&home.expeditionOmenId===undefined;
}
function livingMembers(world:WorldState,sect:Sect,leaderId:string){
  const seen=new Set<string>(),duplicates=new Set<string>();
  for(const actor of world.cultivators){
    if(seen.has(actor.id))duplicates.add(actor.id);
    seen.add(actor.id);
  }
  return world.cultivators.filter(actor=>actor.id!==leaderId&&actor.sectId===sect.id&&real(actor)&&
    !duplicates.has(actor.id)&&!isRetiredFromService(actor));
}
export function ratingForSectScore(score:number):SectRating{
  return SECT_RATINGS[contained(Math.floor(score/10),0,SECT_RATINGS.length-1)]??SECT_RATINGS[0];
}
export function sectAnnualStipend(rating:SectRating):number{
  const rank=SECT_RATINGS.indexOf(rating);
  return rank>=9?40:rank>=6?28:rank>=3?16:rank>=1?8:0;
}
function reviewScore(sect:Sect,members:readonly Cultivator[],buildings:Readonly<Record<ManagementBuildingId,number>>,overdue:number){
  const level=members.length?members.reduce((sum,actor)=>sum+Math.max(0,REALM_ORDER.indexOf(actor.realm))*3+(actor.realmStage-1)/9,0)/members.length:0;
  const ratingPoints=contained(sect.reputation,0,100)*.55+level*1.5+
    MANAGEMENT_BUILDING_IDS.reduce((sum,id)=>sum+buildings[id],0)*2+(overdue?-6:0);
  return contained(Math.floor(ratingPoints),0,100);
}

export function quoteSectGrowthCommand(world:WorldState,command:SectGrowthCommand):Quote|undefined{
  const active=base(world);
  if(!active||!command||typeof command!=='object'||active.management.growth?.failure||!hasAuthority(active))return;
  const {management,sect,creditor,leader,home}=active;
  if(!leader||!isGrandSiegeFighterPresent(world,leader,home.id)||!Number.isFinite(sect.spiritStones))return;
  if(command.kind==='upgrade'){
    if(Object.keys(command).some(key=>key!=='kind'&&key!=='building')||!MANAGEMENT_BUILDING_IDS.includes(command.building))return;
    const level=management.buildings[command.building];
    if(!Number.isSafeInteger(level)||level<0||level>=MAX_LEVEL)return;
    const cost=buildingCost(command.building,level);
    return sect.spiritStones>=cost?{kind:'upgrade',building:command.building,cost,level:level+1}:undefined;
  }
  if(command.kind!=='repay'||Object.keys(command).some(key=>key!=='kind'&&key!=='amount'))return;
  const debt=management.debt;
  if(!debt||world.tick<=management.foundedTick||!real(creditor)||creditor.positionPlane!==undefined||
    !Number.isFinite(creditor.spiritStones)||creditor.spiritStones<0)return;
  const maximum=Math.floor(Math.min(sect.spiritStones,debt.principal,MAX_HOLDING-creditor.spiritStones));
  const amount=command.amount===undefined?maximum:command.amount;
  if(!Number.isSafeInteger(amount)||amount<=0||amount>maximum)return;
  return {kind:'repay',amount};
}
const receipt=(world:WorldState,id:string,title:string,description:string,actors:string[],site?:LocationNode):WorldEvent=>({
  id,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',witnessScope:'participants',actorIds:actors,
  title,description,...(site?{locationId:site.id}:{}),
});

export function applySectGrowthCommand(world:WorldState,command:SectGrowthCommand):boolean{
  const quote=quoteSectGrowthCommand(world,command),active=base(world);
  if(!quote||!active)return false;
  const {management,sect,home,creditor}=active;
  const from=flowSect(sect.id);
  if(quote.kind==='upgrade'){
    const {building,level,cost}=quote;
    sect.spiritStones-=cost;
    management.buildings[building]=level;
    if(building==='furnace'){
      const nativeLevel=level>=3?3:level>=2?2:1;
      home.furnaceGrade=home.furnaceGrade>=nativeLevel?home.furnaceGrade:nativeLevel;
      sect.facilities.alchemy_hall=Math.max(sect.facilities.alchemy_hall,level);
    }
    if(building==='library')sect.facilities.scripture_pavilion=Math.max(sect.facilities.scripture_pavilion,level);
    recordResourceFlow(world,{kind:'consumption',from,mechanism:'sect_economy',refId:sect.id,reason:'management_building',
      good:'stone',amount:cost,visibility:{kind:'participants',actorIds:[management.leaderId]}});
    recordAuxiliaryActionEvent(world,receipt(world,`evt-${world.tick}-${sect.id}-upgrade-${building}-${level}`,
      `${BUILDINGS[building].name}修好了`,`从公库拿出${cost}灵石，${BUILDINGS[building].name}升到${level}级。`,[management.leaderId],home));
    return true;
  }
  const debt=management.debt;
  if(!debt||!creditor)return false;
  sect.spiritStones-=quote.amount;
  creditor.spiritStones+=quote.amount;
  debt.principal-=quote.amount;
  const remaining=debt.principal;
  const actors=[management.leaderId,creditor.id];
  recordResourceFlow(world,{kind:'transfer',from,to:flowActor(creditor.id),mechanism:'sect_economy',refId:sect.id,
    reason:'management_debt_repaid',good:'stone',amount:quote.amount,visibility:{kind:'participants',actorIds:actors}});
  if(!remaining)delete management.debt;
  const words=remaining?`公库已还${quote.amount}灵石，借条上还剩${remaining}。`:`公库还了最后${quote.amount}灵石，借条已经结清。`;
  recordAuxiliaryActionEvent(world,receipt(world,`evt-${world.tick}-${sect.id}-debt-${remaining}`,'公库还款',words,actors));
  return true;
}

function debtNotice(amount:number,due:number,tick:number){
  return tick<due?`借条上还欠${amount}灵石，距还款还有${due-tick}个月。`:
    tick===due?`借条这一月到期，还剩${amount}灵石。`:`借条已逾期${tick-due}个月，还剩${amount}灵石。`;
}
export function projectSectGrowth(world:WorldState){
  const active=base(world);
  if(!active)return;
  const {management,sect,creditor}=active;
  const old=management.growth,debt=management.debt;
  const repayment=quoteSectGrowthCommand(world,{kind:'repay'});
  const maxPayment=repayment?.kind==='repay'?repayment.amount:0;
  return {sectName:sect.name,rating:old?.review?.rating??SECT_RATINGS[0],treasury:sect.spiritStones,
    livingDisciples:livingMembers(world,sect,management.leaderId).length,
    nextReviewTick:management.foundedTick+(Math.floor((world.tick-management.foundedTick)/ANNUAL_MONTHS)+1)*ANNUAL_MONTHS,
    ...(old?{closing:{...old.closing}}:{}),...(old?.review?{review:{...old.review}}:{}),
    ...(old?.failure?{failure:{...old.failure}}:{}),
    ...(debt?{debt:{creditorName:creditor?.name??'王掌柜',principal:debt.principal,dueTick:debt.dueTick,
      monthsRemaining:Math.max(0,debt.dueTick-world.tick),overdueMonths:Math.max(0,world.tick-debt.dueTick),
      notice:debtNotice(debt.principal,debt.dueTick,world.tick),canRepay:maxPayment>0,maxPayment}}:{}),
    buildings:MANAGEMENT_BUILDING_IDS.map(id=>{
      const level=management.buildings[id];
      return {id,name:BUILDINGS[id].name,level,maxLevel:MAX_LEVEL,...(level<MAX_LEVEL?{cost:buildingCost(id,level)}:{}),
        canUpgrade:quoteSectGrowthCommand(world,{kind:'upgrade',building:id})!==undefined};
    })};
}

export function advanceSectGrowth(world:WorldState,prevWorld:WorldState):readonly WorldEvent[]{
  const active=base(world),former=prevWorld.sectManagement;
  if(!active||!former||world.tick!==prevWorld.tick+1||!sameGeneratedWorld(world,prevWorld))return [];
  const {management,sect,creditor}=active,old=management.growth;
  if(old?.failure||old?.closing.tick===world.tick)return [];
  const members=livingMembers(world,sect,management.leaderId),debt=management.debt;
  const overduePrincipal=debt&&world.tick>debt.dueTick?debt.principal:0;
  const closingNet=sect.spiritStones-overduePrincipal;
  const last=former.growth?.closing;
  const negativeMonths=overduePrincipal>0&&closingNet<0?Math.min(3,(last?.tick===prevWorld.tick?last.negativeMonths:0)+1):0;
  const closing={tick:world.tick,treasury:sect.spiritStones,overduePrincipal,closingNet,livingDisciples:members.length,negativeMonths};
  const failure:SectGrowthFailure|undefined=!ownsOffice(active)?{tick:world.tick,reason:'leader_lost'}:
    !members.length?{tick:world.tick,reason:'disciples_gone'}:negativeMonths>=3?{tick:world.tick,reason:'bankruptcy'}:undefined;
  const rows:WorldEvent[]=[];
  const actors=[management.leaderId];
  let review=old?.review;
  if(failure){
    const reason=failure.reason==='bankruptcy'?'逾期已久，公库连续三个月还不起余款。':
      failure.reason==='disciples_gone'?'门下已无可继续领事的弟子。':'这一门暂无人还能以原掌门身份主持。';
    rows.push(receipt(world,`evt-${world.tick}-${sect.id}-management-failed`,'这座山门暂歇',reason,actors));
  }else{
    if(debt&&real(creditor)&&creditor.positionPlane===undefined){
      rows.push(receipt(world,`evt-${world.tick}-${sect.id}-debt-notice`,'王掌柜的借条',
        debtNotice(debt.principal,debt.dueTick,world.tick),[...actors,creditor.id]));
    }
    if(world.tick>management.foundedTick&&(world.tick-management.foundedTick)%ANNUAL_MONTHS===0&&world.month===1){
      const score=reviewScore(sect,members,management.buildings,overduePrincipal);
      const rating=ratingForSectScore(score),previousRating=review?.rating??SECT_RATINGS[0];
      const stipend=Math.max(0,Math.min(sectAnnualStipend(rating),Math.floor(MAX_TREASURY-sect.spiritStones)));
      if(stipend){
        sect.spiritStones+=stipend;
        recordResourceFlow(world,{kind:'production',to:flowSect(sect.id),mechanism:'sect_economy',refId:sect.id,
          reason:'management_annual_stipend',good:'stone',amount:stipend,visibility:{kind:'participants',actorIds:actors}});
      }
      review={tick:world.tick,year:world.year,previousRating,rating,score,stipend};
      rows.push(receipt(world,`evt-${world.tick}-${sect.id}-annual-review`,'仙盟年考',
        `本门评为${rating}。${stipend?`本次公库收到${stipend}灵石。`:'本次没有补贴。'}`,actors));
    }
  }
  management.growth={closing,...(review?{review}:{}),...(failure?{failure}:{})};
  return rows;
}
