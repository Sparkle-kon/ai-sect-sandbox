import type {SectJobAssignment,SectJobDefinition,SectJobEvidence,SectJobObservation,SectJobPlan} from '../types/sectJobs';
import type {Cultivator,HerbId,LLMDecisionPayload,LocationNode,WorldEvent,WorldState} from '../types/world';
import {availableAlchemy} from './alchemyEngine';
import {activeAvatar} from './avatarEngine';
import {availableCourierActions} from './sealedCourierEngine';
import {directorKnownReachableSites,directorSiteIsSafe} from './director/nudgeIntegrations';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {availableMarketActions,marketClosureReason} from './marketEngine';
import {availableOathActions} from './oathEngine';
import {rankOrdinaryIntents} from './ordinaryIntentEngine';
import {isSectActive} from './sectActivity';
import {rewardContribution} from './sectPoliticsEngine';
import {availableSectEconomyActions} from './sectEconomyEngine';
import {availableSettlementActions} from './settlementEngine';
import {availableSparringActions} from './sparringEngine';
import {isRetiredFromService} from './serviceRetirementEngine';
import {SECT_JOB_IDS,type SectJobId} from './sectQuirkCatalog';

export {SECT_JOB_IDS,type SectJobId} from './sectQuirkCatalog';
export type {SectJobAssignment,SectJobDefinition,SectJobEvidence,SectJobObservation,SectJobPlan} from '../types/sectJobs';

const card=(id:SectJobId,label:string,intent:string):SectJobDefinition=>({id,label,intent});
export const SECT_JOB_DEFINITIONS:Readonly<Record<SectJobId,SectJobDefinition>>={
  gather:card('gather','下山采药','有灵草便采，身边没有就先寻药圃。'),
  explore:card('explore','外出历练','挑一处认得的地方走走。机缘有没有，到了才知。'),
  cultivate:card('cultivate','闭关修炼','在脚下这处静坐吐纳。'),
  stall:card('stall','坊市摆摊','带货到坊市，挂价等买主；空手先问行市。'),
  kitchen:card('kitchen','饭堂掌勺','在本门用一份药材煮汤，让在场同门润一润气。'),
  guard:card('guard','看守山门','回本门巡一班；若已有守令，先到岗。'),
  deliver:card('deliver','跑腿送货','已有信件、货约或救济才接办；没货先去坊市问一问。'),
  recruit:card('recruit','下山招新','先去有村社的地方访人。入门要对方也愿意。'),
  challenge:card('challenge','去别宗踢馆','在场才能请人切磋，还得对方肯接这招。'),
  matchmaking:card('matchmaking','参加联谊','与现场道友说说话，结不结缘不由一席话定。'),
};
const herbNames:Readonly<Record<HerbId,string>>={jade_leaf:'翡翠灵叶',earth_root:'地脉灵根',star_bloom:'星辉花',shadow_moss:'幽影苔'};
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const unique=<T extends {id:string}>(rows:readonly T[],id:string):T|undefined=>{
  const matches=rows.filter(row=>row.id===id);
  return matches.length===1?matches[0]:undefined;
};
function authority(world:WorldState){
  const ledger=world.sectManagement;
  if(!ledger)return;
  const sect=unique(world.sects,ledger.sectId),home=unique(world.locations,ledger.homeSiteId),leader=unique(world.cultivators,ledger.leaderId);
  if(!isSectActive(sect)||sect.leaderId!==ledger.leaderId||!leader?.alive||leader.hp<=0||leader.sectId!==sect.id||
    !home||home.id!==sect.headquartersId||home.ownerSectId!==sect.id||home.type!=='sect_hq'||home.expeditionOmenId!==undefined)return;
  return {sect,home,ledger};
}
export function eligibleSectDisciples(world:WorldState):Cultivator[]{
  const active=authority(world);
  if(!active)return [];
  const duplicates=new Map<string,number>();
  for(const actor of world.cultivators)duplicates.set(actor.id,(duplicates.get(actor.id)??0)+1);
  const avatar=activeAvatar(world);
  return world.cultivators.filter(actor=>duplicates.get(actor.id)===1&&actor.sectId===active.sect.id&&
    actor.id!==active.ledger.leaderId&&actor.sectRank!=='掌门'&&actor.alive&&actor.hp>0&&actor.positionPlane!=='immortal'&&
    actor!==avatar&&!(world.playerAvatar.possessedId===actor.id&&(world.playerAvatar.possessionUntilTick??0)>world.tick)&&!isRetiredFromService(actor))
    .sort((a,b)=>compare(a.id,b.id));
}
const unavailable=(reason:string):SectJobPlan=>({kind:'blocked',reason});
const native=(decision:LLMDecisionPayload,siteId:string,phase:'performed'|'on_route'='performed'):SectJobPlan=>
  ({kind:'native',phase,decision,siteId});
const inward='听掌门安排，先把眼前这一件办好。';
function travel(target:LocationNode|undefined):SectJobPlan|undefined{
  return target?native({chosenAction:'EXPLORE',targetLocationId:target.id,innerMonologue:'循熟路过去，到了再办。'},target.id,'on_route'):undefined;
}
function holdable(world:WorldState,actor:Cultivator,site:LocationNode){
  return world.cultivators.includes(actor)&&isGrandSiegeFighterPresent(world,actor,site.id)&&directorSiteIsSafe(world,site);
}
function ingredient(site:LocationNode):HerbId|undefined{
  return site.herbs.earth_root>0?'earth_root':site.herbs.jade_leaf>0?'jade_leaf':undefined;
}
function diners(world:WorldState,actor:Cultivator,site:LocationNode){
  return world.cultivators.filter(member=>member.sectId===actor.sectId&&member.qiProgress<100&&holdable(world,member,site))
    .sort((a,b)=>compare(a.id,b.id)).slice(0,8);
}
function homeChore(world:WorldState,actor:Cultivator,jobId:'kitchen'|'guard'):SectJobPlan {
  const active=authority(world);
  if(!active)return unavailable('本宗无人能主持这项差事。');
  const site=active.home;
  if(active.ledger.buildings[jobId==='kitchen'?'kitchen':'gate']<1)
    return unavailable(jobId==='kitchen'?'饭堂还不能开灶。':'山门未修，还不能在门下排值。');
  if(actor.locationId!==site.id)return travel(directorKnownReachableSites(world,actor).find(row=>row===site))??unavailable('回山的路现在走不通。');
  if(!holdable(world,actor,site))return unavailable('眼下不能在此留班。');
  if(jobId==='kitchen'&&(!ingredient(site)||!diners(world,actor,site).length))
    return unavailable(!ingredient(site)?'饭堂连一份能下锅的灵材也没有。':'同门气足，且把灵材留下。');
  if(jobId==='guard'&&actor.contribution>=9999)return unavailable('此人本月的门中贡献已记满。');
  const decision={chosenAction:'REST',innerMonologue:jobId==='kitchen'?'留在饭堂掌这一灶。':'留在山门巡一班。'} as const;
  return {kind:'chore',phase:'performed',chore:jobId,siteId:site.id,decision};
}

export function planSectJob(world:WorldState,actor:Cultivator,jobId:SectJobId):SectJobPlan {
  if(!SECT_JOB_IDS.includes(jobId)||!eligibleSectDisciples(world).includes(actor))return unavailable('此人不在本宗这次晨会的名册上。');
  const here=unique(world.locations,actor.locationId);
  if(!here||!holdable(world,actor,here))return unavailable('此人另有要事在身，这次差事先搁下。');
  const known=()=>directorKnownReachableSites(world,actor);
  const toward=(type:LocationNode['type'])=>travel(known().find(site=>site.type===type));
  const localTalk=(differentSect:boolean)=>{
    const target=rankOrdinaryIntents(world,actor).find(option=>option.action==='SOCIALIZE'&&
      (!differentSect||world.cultivators.some(row=>row.id===option.targetCultivatorId&&row.sectId!==actor.sectId)));
    return target?.action==='SOCIALIZE'?native({chosenAction:'SOCIALIZE',targetCultivatorId:target.targetCultivatorId,innerMonologue:inward},here.id,jobId==='matchmaking'?'performed':'on_route'):undefined;
  };
  switch(jobId){
    case 'gather':{
      const choice=availableAlchemy(actor,world).find(row=>row.action==='GATHER_HERBS');
      if(choice?.targetHerbId)return native({chosenAction:'GATHER_HERBS',targetHerbId:choice.targetHerbId,innerMonologue:inward},here.id);
      return travel(known().find(row=>row.type==='spirit_vein'&&(!row.ownerSectId||row.ownerSectId===actor.sectId)&&Object.values(row.herbs).some(amount=>amount>0)))??unavailable('近处没有认得的药地。');
    }
    case 'explore':
      return travel(known()[0])??unavailable('眼下没有认得又能走的去处。');
    case 'cultivate':
      return native({chosenAction:'CULTIVATE',innerMonologue:inward},here.id);
    case 'stall':{
      if(here.type!=='market')return toward('market')??unavailable('没找到走得通的坊市。');
      if(marketClosureReason(world,here.id))return unavailable('此处今日不开市。');
      const order=availableMarketActions(actor,world).find(row=>row.action==='PLACE_MARKET_SELL');
      if(order?.marketGood)return native({chosenAction:'PLACE_MARKET_SELL',marketGood:order.marketGood,
        marketQuantity:order.marketQuantity,marketLimitPrice:order.marketLimitPrice,innerMonologue:inward},here.id,'on_route');
      return localTalk(false)??unavailable('手中没有货，也找不到可问行市的人。');
    }
    case 'kitchen':return homeChore(world,actor,'kitchen');
    case 'guard':{
      const guard=availableSectEconomyActions(actor,world).find(row=>row.action==='GUARD_DUTY'&&row.targetLocationId);
      if(guard?.targetLocationId)return native({chosenAction:'GUARD_DUTY',targetLocationId:guard.targetLocationId,innerMonologue:inward},guard.targetLocationId);
      return homeChore(world,actor,'guard');
    }
    case 'deliver':{
      const oath=availableOathActions(actor,world,false).find(row=>row.action==='FULFILL_OATH');
      if(oath?.targetOathId)return native({chosenAction:'FULFILL_OATH',targetOathId:oath.targetOathId,innerMonologue:inward},here.id);
      const relief=availableSettlementActions(actor,world).find(row=>row.action==='DELIVER_RELIEF');
      if(relief)return native({chosenAction:'DELIVER_RELIEF',targetSettlementId:relief.targetSettlementId,innerMonologue:inward},here.id);
      const parcel=availableCourierActions(actor,world,false).find(row=>row.courierMove==='accept');
      if(parcel?.targetDispatchId)return native({chosenAction:'SEALED_COURIER',courierMove:'accept',targetDispatchId:parcel.targetDispatchId,innerMonologue:inward},here.id,'on_route');
      if(here.type!=='market')return toward('market')??unavailable('暂时没有能接的货件。');
      return localTalk(false)??unavailable('这处没有可接的货件。');
    }
    case 'recruit':{
      const volunteer=availableSettlementActions(actor,world).find(row=>row.action==='RECRUIT_SETTLER');
      if(volunteer)return native({chosenAction:'RECRUIT_SETTLER',targetSettlementId:volunteer.targetSettlementId,
        targetVolunteerId:volunteer.targetVolunteerId,innerMonologue:inward},here.id);
      if(world.settlements.villages.some(row=>row.locationId===here.id&&row.population>0))
        return localTalk(true)??unavailable('村里暂没有可打听入门的人。');
      return travel(known().find(site=>world.settlements.villages.some(row=>row.locationId===site.id&&row.population>0)))??
        unavailable('没有认得路的村社可去。');
    }
    case 'challenge':{
      const offer=availableSparringActions(actor,world).find(row=>row.sparringMove==='offer'&&row.sparringRounds===1&&
        world.cultivators.some(peer=>peer.id===row.targetCultivatorId&&peer.sectId!==actor.sectId));
      if(offer?.sparringMove==='offer')return native({chosenAction:'SPARRING',sparringMove:'offer',sparringRounds:1,
        targetCultivatorId:offer.targetCultivatorId,innerMonologue:inward},here.id,'on_route');
      return travel(known().find(site=>site.type==='sect_hq'&&site.ownerSectId&&site.ownerSectId!==actor.sectId))??
        unavailable('附近没有肯听招呼的擂台。');
    }
    case 'matchmaking':
      return localTalk(true)??(here.type==='market'?localTalk(false):toward('market'))??unavailable('眼下没有能当面交谈的道友。');
  }
}

export function snapshotSectJobEvidence(world:WorldState,actor:Cultivator):SectJobEvidence {
  return {tick:world.tick,discipleId:actor.id,siteId:actor.locationId,qi:actor.qiProgress,herbs:{...actor.herbs}};
}

function choreId(world:WorldState,actor:Cultivator,chore:'kitchen'|'guard'){
  return `evt-${world.tick}-${actor.id}-management-${chore}`;
}
export function settleSectJobChore(world:WorldState,actor:Cultivator,plan:Extract<SectJobPlan,{kind:'chore'}>):WorldEvent|undefined{
  const active=authority(world);
  if(!active||actor.currentAction!=='REST'||actor.locationId!==plan.siteId||active.home.id!==plan.siteId||
    !eligibleSectDisciples(world).includes(actor))return;
  const current=homeChore(world,actor,plan.chore),id=choreId(world,actor,plan.chore);
  if(current.kind!=='chore'||current.siteId!==plan.siteId||world.events.some(event=>event.id===id))return;
  const base={id,tick:world.tick,year:world.year,month:world.month,locationId:plan.siteId,witnessScope:'participants'} as const;
  if(plan.chore==='guard'){
    const before=actor.contribution;
    rewardContribution(actor,world,2);
    if(actor.contribution<=before)return;
    return {...base,category:'diplomacy',actorIds:[actor.id],title:'山门这一班',
      description:`${actor.name}在山门留守，门中记下${actor.contribution-before}点贡献。`};
  }
  const herb=ingredient(active.home),present=diners(world,actor,active.home);
  if(!herb||!present.length)return;
  active.home.herbs[herb]--;
  const portions=present.map(member=>{
    const restore=Math.min(3,100-member.qiProgress);
    member.qiProgress+=restore;
    return restore;
  });
  return {...base,category:'diplomacy',actorIds:[...new Set([actor.id,...present.map(member=>member.id)])],title:'饭堂开了一灶',
    description:`${actor.name}用了1份${herbNames[herb]}煮汤，在场${present.length}人合计恢复${portions.reduce((a,b)=>a+b,0)}点灵气。`};
}

function workLine(job:SectJobAssignment['jobId'],action:LLMDecisionPayload['chosenAction']):string{
  if(action==='SOCIALIZE'){
    switch(job){
      case 'stall':return '在坊市跟人聊了几句，尚未摆货。';
      case 'deliver':return '在坊市与人说过几句，尚未接到货件。';
      case 'recruit':return '同当地人交谈过，未有人入门。';
      default:return '和在场道友说过几句。';
    }
  }
  if(action==='PLACE_MARKET_SELL')return '货已挂上价牌，尚不能说卖出。';
  if(action==='SEALED_COURIER')return '已经接下信件，尚未送到。';
  if(action==='SPARRING')return '已当面邀人切磋，还没有交手。';
  if(action==='GUARD_DUTY')return '已到守地当值。';
  if(action==='RECRUIT_SETTLER')return '同意入门的人已正式列入名册。';
  return '这项差事已经办妥。';
}

function workReceipt(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload,event:WorldEvent){
  const tick=world.tick;
  switch(decision.chosenAction){
    case 'SOCIALIZE':return event.id===`evt-${tick}-${actor.id}-social`&&event.actorIds[0]===actor.id&&
      event.actorIds[1]===decision.targetCultivatorId&&event.locationId===actor.locationId;
    case 'PLACE_MARKET_SELL':return world.markets.orders.some(row=>row.actorId===actor.id&&row.side==='sell'&&
      row.locationId===actor.locationId&&row.placedTick===tick&&row.good===decision.marketGood&&
      row.quantity===decision.marketQuantity&&row.limitPrice===decision.marketLimitPrice&&event.id===`evt-${tick}-market-${row.id}`);
    case 'FULFILL_OATH':{
      const row=unique(world.oaths.contracts,decision.targetOathId??'');
      const proof=row?.providerId===actor.id&&row.evidence.find(entry=>entry.tick===tick&&entry.actorId===actor.id&&
        entry.quantity>0&&entry.locationId===actor.locationId);
      if(!proof||!row||event.id!==`evt-${row.id}-${tick}-${proof.kind}`)return false;
      return proof.kind==='delivery'&&proof.requesterPresent&&row.status==='fulfilled'?'delivered':
        proof.kind==='tender'&&!proof.requesterPresent?'tendered':false;
    }
    case 'DELIVER_RELIEF':
    case 'RECRUIT_SETTLER':return world.settlements.records.some(row=>row.tick===tick&&row.actorId===actor.id&&
      row.settlementId===decision.targetSettlementId&&event.id===`evt-${row.id}`&&
      (decision.chosenAction==='RECRUIT_SETTLER'?row.kind==='recruitment'&&row.volunteerId===decision.targetVolunteerId&&!!row.cultivatorId:
        row.kind==='relief'&&row.stones>0&&row.herbs>0));
    case 'SEALED_COURIER':return world.couriers.dispatches.some(row=>row.id===decision.targetDispatchId&&row.courierId===actor.id&&
      row.acceptedTick===tick&&event.id===`evt-${row.id}-accepted-${tick}`);
    case 'SPARRING':return world.sparring.agreements.some(row=>row.proposerId===actor.id&&row.partnerId===decision.targetCultivatorId&&
      row.offeredTick===tick&&row.siteId===actor.locationId&&event.id===`evt-${row.id}-${tick}-offer`);
    case 'GUARD_DUTY':return event.id===`evt-${tick}-${actor.id}-guard_duty`&&event.locationId===actor.locationId;
    default:return false;
  }
}
export function observeSectJob(world:WorldState,actor:Cultivator,assignment:SectJobAssignment,plan:SectJobPlan,
  before:SectJobEvidence,event?:WorldEvent,nativeApplied=false):SectJobObservation{
  const base={tick:world.tick,discipleId:assignment.discipleId,jobId:assignment.jobId};
  const blocked=(line:string):SectJobObservation=>({...base,phase:'unavailable',line});
  if(plan.kind==='blocked')return blocked(plan.reason);
  if(!nativeApplied||before.tick!==world.tick||before.discipleId!==actor.id||assignment.discipleId!==actor.id||
    !world.cultivators.includes(actor)||!actor.alive||actor.currentAction!==plan.decision.chosenAction)
    return blocked('这回未能照差事行事。');
  const validEvent=event&&event.tick===world.tick&&event.year===world.year&&event.month===world.month&&
    (event.actorIds.includes(actor.id)||plan.decision.chosenAction==='SEALED_COURIER'&&
      world.couriers.dispatches.some(row=>row.id===plan.decision.targetDispatchId&&row.courierId===actor.id&&
        row.acceptedTick===world.tick&&event.id===`evt-${row.id}-accepted-${world.tick}`))?event:undefined;
  const result=(phase:'performed'|'on_route',line:string):SectJobObservation=>({...base,phase,line,siteId:actor.locationId,
    ...(validEvent?{sourceEventId:validEvent.id}:{})});
  if(plan.kind==='chore'){
    return validEvent?.id===choreId(world,actor,plan.chore)&&actor.locationId===plan.siteId?
      result('performed',validEvent.description):blocked('这回没能完成山上的差事。');
  }
  const decision=plan.decision;
  if(decision.chosenAction==='EXPLORE'){
    if(actor.locationId===before.siteId||actor.locationId!==plan.siteId)return blocked('这回没走到预定去处。');
    const site=unique(world.locations,actor.locationId);
    if(!site)return blocked('这回没走到预定去处。');
    return assignment.jobId==='explore'?result('performed',`已到${site.name}。`):result('on_route',`已到${site.name}，差事才刚开头。`);
  }
  if(actor.locationId!==plan.siteId)return blocked('人已不在原处，这回没办成。');
  if(decision.chosenAction==='CULTIVATE'){
    const delta=actor.qiProgress-before.qi;
    return delta>0?result('performed',`静修后增长${Math.round(delta*10)/10}点灵气。`):blocked('坐了一回关，灵气未见精进。');
  }
  if(decision.chosenAction==='GATHER_HERBS'&&decision.targetHerbId){
    const delta=actor.herbs[decision.targetHerbId]-before.herbs[decision.targetHerbId];
    return delta>0&&validEvent?.id===`evt-${world.tick}-${actor.id}-alchemy`?result('performed',`采得${delta}份${herbNames[decision.targetHerbId]}。`):blocked('这回没采到灵草。');
  }
  const receipt=validEvent&&workReceipt(world,actor,decision,validEvent);
  if(!receipt)return blocked('这回没有办成。');
  if(receipt==='tendered')return result('on_route','已携货到场，对方未到，货还在手里。');
  const action=decision.chosenAction;
  const preliminary=action==='PLACE_MARKET_SELL'||action==='SEALED_COURIER'||action==='SPARRING'||
    action==='SOCIALIZE'&&assignment.jobId!=='matchmaking';
  return result(preliminary?'on_route':'performed',workLine(assignment.jobId,action));
}
