import type { Cultivator, DoctrineFounding, DoctrineFoundingMove, DoctrineFoundingsState, DoctrineSchool, LLMDecisionPayload,
  LocationNode, RelocationPlan, Sect, WorldEvent, WorldState } from '../types/world';
import { DOCTRINE_LABELS } from './doctrineEngine';
import { DOCTRINE_FOUNDING_MIN_MEMBERS, DOCTRINE_FOUNDING_MIN_SUPPORT_QI, DOCTRINE_FOUNDING_MIN_WALLET,
  DOCTRINE_FOUNDING_TERM_TICKS, doctrineFoundingId, independentDoctrineSectId } from './doctrineFoundingTerms';
import { activeRelocationForActor, activeRelocationForSect } from './relocationEngine';
import { activeEscortForActor } from './escortEngine';
import { activePilgrimageForActor, pilgrimageActedThisTick } from './pilgrimageEngine';
import { activeCourierForActor, courierActedThisTick } from './sealedCourierEngine';
import { activeOccasionForActor } from './occasionEngine';
import { activeSiegeForActor } from './diplomacyEngine';
import { isRetiredFromService } from './serviceRetirementEngine';
import { isTribulationActive } from './tribulationEngine';
import { activeDanxiaMedicineEscort, danxiaMedicineActedThisTick } from './danxiaMedicineTerms';
import { terrainTileAt } from './terrainEngine';
import { routeWarningHazardValid } from './routeWarningProof';

export const createDoctrineFoundingsState=():DoctrineFoundingsState=>({foundings:[]});

export type DoctrineFoundingOption=
  | {action:'DOCTRINE_FOUNDING';doctrineFoundingMove:'propose';targetDoctrineSchoolId:string;targetRelocationId:string;targetDoctrineFoundingId?:never}
  | {action:'DOCTRINE_FOUNDING';doctrineFoundingMove:Exclude<DoctrineFoundingMove,'propose'>;targetDoctrineFoundingId:string;
    targetDoctrineSchoolId?:never;targetRelocationId?:never};
const alive=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0;
const actorBy=(world:WorldState,id:string|undefined)=>world.cultivators.find(row=>row.id===id);
const sectBy=(world:WorldState,id:string)=>world.sects.find(row=>row.id===id);
const siteBy=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id);

export function doctrineFoundingPhysicallyAt(world:WorldState,actor:Cultivator,siteId:string,tick:number) {
  const duty=actor.guardAssignment;
  return alive(actor)&&actor.locationId===siteId&&!isRetiredFromService(actor)&&!isTribulationActive(actor)&&
    !activeRelocationForActor(world,actor)&&!activeEscortForActor(world,actor)&&!activePilgrimageForActor(world,actor)&&
    !activeCourierForActor(world,actor)&&!activeOccasionForActor(world,actor)&&!activeSiegeForActor(world,actor)&&
    !activeDanxiaMedicineEscort(world,actor)&&!(duty&&duty.expiresTick>tick&&duty.locationId!==siteId)&&
    !world.boundaryReliefs.cases.some(row=>row.incomingId===actor.id&&(row.status==='travelling'||row.status==='returning'))&&
    (tick!==world.tick||!danxiaMedicineActedThisTick(world,actor)&&!pilgrimageActedThisTick(world,actor)&&!courierActedThisTick(world,actor));
}

function manuscript(world:WorldState,school:DoctrineSchool,founder:Cultivator) {
  const authored=founder.authoredTechnique;
  if(!authored?.id||authored.authorId!==founder.id||authored.createdTick===undefined)return undefined;
  return world.scriptures.originals.find(row=>row.id===authored.id&&row.source==='authored'&&row.sourceSectId===school.parentSectId&&
    row.firstSeenTick===authored.createdTick&&row.technique.authorId===founder.id&&row.technique.createdTick===authored.createdTick&&
    row.technique.name===authored.name&&row.technique.spiritRoot===authored.spiritRoot);
}

function parentSeat(world:WorldState,parent:Sect) {
  const site=siteBy(world,parent.headquartersId);
  return site?.type==='sect_hq'&&site.ownerSectId===parent.id&&!activeRelocationForSect(world,parent.id)?site:undefined;
}

function compatibleVacancy(world:WorldState,oldSite:LocationNode) {
  const tile=terrainTileAt(world,oldSite.x,oldSite.y);
  return oldSite.type==='spirit_vein'&&!oldSite.ownerSectId&&oldSite.spiritQi>=DOCTRINE_FOUNDING_MIN_SUPPORT_QI&&
    oldSite.herbs.earth_root>=1&&tile&&tile.biome!=='魔渊'&&!tile.ownerSectId&&
    !world.sects.some(sect=>sect.headquartersId===oldSite.id)&&
    !world.relocations.plans.some(row=>row.destinationId===oldSite.id&&(row.status==='voting'||row.status==='in_transit'))&&
    !world.mapHazards.some(row=>row.tileId===tile.id&&row.intensity>=2&&
      routeWarningHazardValid(world,row,world.tick))?tile:undefined;
}

function factualSource(world:WorldState,school:DoctrineSchool,plan:RelocationPlan) {
  const parent=sectBy(world,school.parentSectId);
  const founder=actorBy(world,school.stewardId);
  const oldSite=siteBy(world,plan.originId);
  const newSeat=parent&&parentSeat(world,parent);
  const abandoned=world.relocations.abandonedSites.find(row=>row.id===`abandoned-${plan.id}`&&row.planId===plan.id&&
    row.sectId===school.parentSectId&&row.originId===plan.originId&&row.destinationId===plan.destinationId&&
    row.tick===plan.settledTick&&row.originalType==='sect_hq');
  const autonomy=[...world.doctrines.proposals].reverse().find(row=>row.schoolId===school.id&&row.kind==='separation'&&row.status==='accepted'&&
    row.settledTick!==undefined&&row.settledTick<=(abandoned?.tick??-1)&&row.stewardId!==row.leaderId&&
    row.votes.some(vote=>vote.actorId===row.stewardId&&vote.verdict==='accept')&&
    row.votes.some(vote=>vote.actorId===row.leaderId&&vote.verdict==='accept'));
  if(!parent||!oldSite||!newSeat||!alive(founder)||!abandoned||!autonomy||
    school.status!=='autonomous'||school.foundedSectId||world.doctrines.proposals.some(row=>row.schoolId===school.id&&row.status==='pending')||
    !school.memberIds.includes(founder.id)||founder.sectId!==parent.id||
    !Number.isSafeInteger(school.treasury)||school.treasury<DOCTRINE_FOUNDING_MIN_WALLET||
    plan.sectId!==parent.id||plan.status!=='settled'||plan.destinationId!==newSeat.id||plan.settledTick===undefined||
    plan.settledTick>=world.tick||plan.originId===plan.destinationId)return undefined;
  const tile=compatibleVacancy(world,oldSite);
  const scripture=manuscript(world,school,founder);
  const leader=actorBy(world,parent.leaderId);
  if(!tile||!scripture||!alive(leader)||founder.id===leader.id||leader.sectId!==parent.id)return undefined;
  return {parent,founder,leader,oldSite,newSeat,abandoned,autonomy,scripture,tile};
}
type FactualSource=NonNullable<ReturnType<typeof factualSource>>;

function eligibleMember(world:WorldState,school:DoctrineSchool,source:FactualSource,actor:Cultivator,tick:number) {
  return actor.sectId===source.parent.id&&actor.id!==source.leader.id&&school.memberIds.includes(actor.id)&&
    doctrineFoundingPhysicallyAt(world,actor,source.oldSite.id,tick);
}
function independentName(parent:Sect,school:DoctrineSchool) {
  return `${parent.name.slice(0,40)}·${DOCTRINE_LABELS[school.theme]}别宗`;
}
function originalFor(world:WorldState,row:DoctrineFounding) {
  const school=world.doctrines.schools.find(value=>value.id===row.schoolId);
  const plan=world.relocations.plans.find(value=>value.id===row.relocationPlanId);
  const source=school&&plan&&factualSource(world,school,plan);
  if(!school||!plan||!source||source.founder.id!==row.founderId||source.abandoned.id!==row.abandonedSiteId||
    source.autonomy.id!==row.autonomyProposalId||source.scripture.id!==row.scriptureId||source.oldSite.id!==row.oldSiteId||
    school.treasury!==row.schoolTreasury||source.parent.id!==row.parentSectId||
    independentName(source.parent,school)!==row.independentName||
    world.sects.some(sect=>sect.id===row.independentSectId||sect.name===row.independentName))return undefined;
  return {school,plan,source};
}
function currentFoundingMembers(world:WorldState,row:DoctrineFounding,school:DoctrineSchool,source:FactualSource,tick:number) {
  if(!row.authorization||row.authorization.tick>=tick||row.authorization.actorId!==source.leader.id||
    row.authorization.siteId!==source.newSeat.id)return [];
  const ids=[row.founderId,...row.consents.filter(value=>value.tick<tick&&value.withdrawnTick===undefined).map(value=>value.actorId)];
  const members=ids.flatMap(id=>{
    const actor=actorBy(world,id);
    return actor&&eligibleMember(world,school,source,actor,tick)?[actor]:[];
  });
  const staying=world.cultivators.some(actor=>alive(actor)&&actor.sectId===source.parent.id&&actor.id!==source.leader.id&&
    !members.includes(actor));
  return staying?members:[];
}

export function availableDoctrineFoundingActions(actor:Cultivator,world:WorldState,executionTick=world.tick):DoctrineFoundingOption[] {
  if(!world.cultivators.includes(actor)||!alive(actor)||(executionTick!==world.tick&&executionTick!==world.tick+1))return [];
  const result:DoctrineFoundingOption[]=[];
  const base={action:'DOCTRINE_FOUNDING' as const};
  for(const row of world.doctrineFoundings.foundings) {
    if(row.status!=='proposed'||executionTick<=row.proposedTick||executionTick>=row.expiresTick)continue;
    const original=originalFor(world,row);
    if(!original)continue;
    const {school,source}=original;
    const target={...base,targetDoctrineFoundingId:row.id};
    const joined=row.consents.find(value=>value.actorId===actor.id);
    if(actor.id===source.founder.id&&eligibleMember(world,school,source,actor,executionTick)){
      result.push({...target,doctrineFoundingMove:'withdraw'});
      if(currentFoundingMembers(world,row,school,source,executionTick).length>=DOCTRINE_FOUNDING_MIN_MEMBERS)
        result.push({...target,doctrineFoundingMove:'establish'});
    } else if(actor.id===source.leader.id&&doctrineFoundingPhysicallyAt(world,actor,source.newSeat.id,executionTick)&&!row.authorization) {
      result.push({...target,doctrineFoundingMove:'authorize'},{...target,doctrineFoundingMove:'decline'});
    } else if(eligibleMember(world,school,source,actor,executionTick)){
      if(!joined&&executionTick+1<row.expiresTick)result.push({...target,doctrineFoundingMove:'join'});
      else if(joined&&joined.withdrawnTick===undefined&&executionTick>joined.tick)result.push({...target,doctrineFoundingMove:'withdraw'});
    }
  }
  for(const school of world.doctrines.schools) {
    if(school.stewardId!==actor.id||school.parentSectId!==actor.sectId||school.foundedSectId||
        world.doctrineFoundings.foundings.some(row=>row.schoolId===school.id&&row.status==='proposed'))continue;
    for(const plan of world.relocations.plans){
      if(plan.sectId!==school.parentSectId||plan.originId!==actor.locationId)continue;
      const source=factualSource(world,school,plan);
      if(!source||!eligibleMember(world,school,source,actor,executionTick)||
        world.doctrineFoundings.foundings.some(row=>row.oldSiteId===plan.originId&&row.status==='proposed')||
        world.sects.some(sect=>sect.id===independentDoctrineSectId(school.id)||sect.name===independentName(source.parent,school)))continue;
      result.push({...base,doctrineFoundingMove:'propose',targetDoctrineSchoolId:school.id,targetRelocationId:plan.id});
    }
  }
  return result;
}

function event(world:WorldState,row:DoctrineFounding,step:string,title:string,description:string,actors:string[]):WorldEvent{
  return {id:`evt-${world.tick}-${row.id}-${step}`,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',
    title,description,actorIds:[...new Set(actors)],witnessScope:'participants'};
}

export function resolveDoctrineFoundingAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null {
  if(payload.chosenAction!=='DOCTRINE_FOUNDING')return null;
  const move=payload.doctrineFoundingMove;
  const fields=['chosenAction','innerMonologue','spokenLine','doctrineFoundingMove',...(move==='propose'?
    ['targetDoctrineSchoolId','targetRelocationId']:['targetDoctrineFoundingId'])];
  if(Object.entries(payload).some(([key,value])=>value!==undefined&&!fields.includes(key)&&
    !(key==='action'&&value==='DOCTRINE_FOUNDING')))return null;
  const permit=availableDoctrineFoundingActions(actor,world).find(option=>option.doctrineFoundingMove===move&&
    option.targetDoctrineFoundingId===payload.targetDoctrineFoundingId&&option.targetDoctrineSchoolId===payload.targetDoctrineSchoolId&&
    option.targetRelocationId===payload.targetRelocationId);
  if(!permit)return null;
  if(permit.doctrineFoundingMove==='propose'){
    const school=world.doctrines.schools.find(row=>row.id===permit.targetDoctrineSchoolId)!;
    const plan=world.relocations.plans.find(row=>row.id===permit.targetRelocationId)!;
    const source=factualSource(world,school,plan)!;
    const row:DoctrineFounding={id:doctrineFoundingId(school.id,world.tick),schoolId:school.id,parentSectId:source.parent.id,
      independentSectId:independentDoctrineSectId(school.id),oldSiteId:source.oldSite.id,relocationPlanId:plan.id,
      abandonedSiteId:source.abandoned.id,autonomyProposalId:source.autonomy.id,scriptureId:source.scripture.id,founderId:actor.id,
      independentName:independentName(source.parent,school),schoolTreasury:school.treasury,proposedTick:world.tick,
      expiresTick:world.tick+DOCTRINE_FOUNDING_TERM_TICKS,status:'proposed',consents:[]};
    world.doctrineFoundings.foundings.push(row);
    return event(world,row,'proposal','道统在旧址拟议独立','原山门确已迁出，仅建立筹议；此前的债权债务、资产与宗籍均未移动。',[actor.id,source.leader.id]);
  }
  const row=world.doctrineFoundings.foundings.find(current=>current.id===permit.targetDoctrineFoundingId)!;
  const origin=originalFor(world,row)!;
  const {school,source}=origin;
  if(permit.doctrineFoundingMove==='authorize'){
    row.authorization={actorId:actor.id,tick:world.tick,siteId:source.newSeat.id};
    return event(world,row,'authorized','原宗掌门独立签署同意','只同意既有学舍钱库和个人传承依法独立，原宗旧约不随同划拨。',[actor.id,row.founderId]);
  }
  if(permit.doctrineFoundingMove==='join'){
    row.consents.push({actorId:actor.id,tick:world.tick});
    return event(world,row,`join-${actor.id}`,'同门到旧址单独同意入宗','签署只是本人同意；立宗前未改宗籍。',[actor.id,row.founderId]);
  }
  if(permit.doctrineFoundingMove==='decline'||permit.doctrineFoundingMove==='withdraw'&&actor.id===row.founderId){
    row.status=permit.doctrineFoundingMove==='decline'?'declined':'withdrawn';
    row.settlement={tick:world.tick,actorId:actor.id};
    return event(world,row,row.status,'独立筹议终止','未移动学舍钱库、地权、宗籍或既有合同。',[actor.id,row.founderId,source.leader.id]);
  }
  if(permit.doctrineFoundingMove==='withdraw'){
    const consent=row.consents.find(value=>value.actorId===actor.id)!;
    consent.withdrawnTick=world.tick;
    return event(world,row,`withdraw-${actor.id}`,'同门撤回本人同意','原宗籍和个人物件仍按原有账目保留。',[actor.id,row.founderId]);
  }
  const members=currentFoundingMembers(world,row,school,source,world.tick);
  if(members.length<DOCTRINE_FOUNDING_MIN_MEMBERS||!members.includes(actor))return null;
  const opening: Sect={id:row.independentSectId,name:row.independentName,alignment:source.parent.alignment,color:source.parent.color,
    doctrine:DOCTRINE_LABELS[school.theme],reputation:0,spiritStones:school.treasury,headquartersId:source.oldSite.id,
    leaderId:actor.id,pavilion:[{...source.scripture.technique}],
    facilities:{qi_array:0,alchemy_hall:0,scripture_pavilion:0,defense_array:0,spirit_mine:0},arrayHp:0,arrayMaxHp:0};
  world.sects.push(opening);
  source.oldSite.ownerSectId=opening.id;
  source.oldSite.type='sect_hq';
  source.tile.ownerSectId=opening.id;
  for(const member of members){
    member.sectId=opening.id;
    member.sectRank=member.id===actor.id?'掌门':'外门弟子';
    member.contribution=0;
    if(member.guardAssignment?.locationId===source.oldSite.id)delete member.guardAssignment;
  }
  school.treasury=0;
  school.foundedSectId=opening.id;
  school.memberIds=[];
  delete school.stewardId;
  school.lastChangeTick=world.tick;
  row.status='established';
  const memberIds=members.map(member=>member.id);
  row.settlement={tick:world.tick,actorId:actor.id,memberIds,transferredStones:opening.spiritStones};
  return event(world,row,'established','在旧址实际建立独立宗门','同意者才实际变更宗籍；仅接收学舍实有款项和本人授权的传承抄本，原宗旧账不移。',
    [row.founderId,row.authorization!.actorId,...memberIds]);
}

export function advanceDoctrineFoundings(world:WorldState):WorldEvent[] {
  const events:WorldEvent[]=[];
  for(const row of world.doctrineFoundings.foundings){
    if(row.status==='proposed'){
      const state=originalFor(world,row);
      if(world.tick<row.expiresTick&&state)continue;
      row.status=world.tick>=row.expiresTick?'expired':'invalidated';
      row.settlement={tick:world.tick};
      events.push(event(world,row,row.status,'独立筹议无法继续','条件已变化或期限已过，没有划拨资产或更改宗籍。',
        [row.founderId,...(row.authorization?[row.authorization.actorId]:[]),...row.consents.map(consent=>consent.actorId)]));
    }
    if(row.status!=='established'||row.continuity)continue;
    const sect=sectBy(world,row.independentSectId),succession=sect?.succession;
    const founder=actorBy(world,row.founderId);
    const successor=actorBy(world,succession?.leaderId);
    if(!sect||!succession||succession.method!=='election'||succession.previousLeaderId!==row.founderId||
      succession.tick!==(world.tick)||succession.tick<=(row.settlement?.tick??Infinity)||
      !alive(successor)||successor.sectId!==sect.id||sect.leaderId!==successor.id||alive(founder)&&founder.sectId===sect.id&&!isRetiredFromService(founder))continue;
    row.continuity={tick:succession.tick,previousLeaderId:row.founderId,successorId:successor.id,eventId:`evt-${world.tick}-${sect.id}-leadership-vacancy-${successor.id}`,cause:'native_succession'};
  }
  return events;
}

export interface DoctrineFoundingView {
  id:string;role:'founder'|'parent_leader'|'school_member'|'independent_member';
  status:DoctrineFounding['status'];oldSiteName:string;independentName:string;founderName?:string;scriptureName?:string;
  proposedTick:number;expiresTick:number;consentCount:number;schoolTreasury:number;
  authorizedTick?:number;authorizationSiteName?:string;
  joins?:Array<{tick:number;withdrawnTick?:number;own?:true}>;
  establishedTick?:number;confirmedMemberCount?:number;transferredStones?:number;
  continuity?:{tick:number;successorName?:string};
}
export function projectDoctrineFoundings(world:WorldState,viewer?:Cultivator):DoctrineFoundingView[] {
  if(!viewer||!world.cultivators.includes(viewer))return [];
  return world.doctrineFoundings.foundings.flatMap((row):DoctrineFoundingView[]=>{
    const school=world.doctrines.schools.find(item=>item.id===row.schoolId);
    const parent=sectBy(world,row.parentSectId);
    const old=siteBy(world,row.oldSiteId);
    const founder=actorBy(world,row.founderId);
    const scripture=world.scriptures.originals.find(item=>item.id===row.scriptureId&&item.technique.authorId===row.founderId);
    const isNamedMember=row.consents.some(item=>item.actorId===viewer.id);
    if(!old||!school||!parent)return [];
    const role=viewer.id===row.founderId?'founder':viewer.id===row.authorization?.actorId||
      viewer.id===parent.leaderId&&row.status==='proposed'?'parent_leader':
      row.settlement?.memberIds?.includes(viewer.id)||viewer.sectId===row.independentSectId?'independent_member':
      isNamedMember||row.status==='proposed'&&viewer.sectId===row.parentSectId&&school.memberIds.includes(viewer.id)?'school_member':undefined;
    if(!role)return [];
    const joined=row.consents.filter(item=>item.withdrawnTick===undefined).length;
    const oldSignSite=row.authorization&&siteBy(world,row.authorization.siteId);
    const successor=row.continuity&&actorBy(world,row.continuity.successorId);
    return [{id:row.id,role,status:row.status,oldSiteName:old.name,independentName:row.independentName,
      ...(founder?{founderName:founder.name}:{}),...(scripture?{scriptureName:scripture.technique.name}:{}),
      proposedTick:row.proposedTick,expiresTick:row.expiresTick,consentCount:joined+1,schoolTreasury:row.schoolTreasury,
      ...(row.authorization?{authorizedTick:row.authorization.tick,
        ...(oldSignSite&&(role==='parent_leader'||role==='founder')?{authorizationSiteName:oldSignSite.name}:{})}:{}),
      joins:row.consents.map(consent=>({tick:consent.tick,
        ...(consent.withdrawnTick!==undefined?{withdrawnTick:consent.withdrawnTick}:{}),
        ...(consent.actorId===viewer.id?{own:true as const}:{})})),
      ...(row.status==='established'&&row.settlement?.memberIds?{establishedTick:row.settlement.tick,
        confirmedMemberCount:row.settlement.memberIds.length,transferredStones:row.settlement.transferredStones}:{}),
      ...(row.continuity?{continuity:{tick:row.continuity.tick,...(successor?{successorName:successor.name}:{})}}:{})}];
  });
}



export function localDoctrineFoundingNotice(world:WorldState,viewer?:Cultivator):{siteId:string;established:boolean}|undefined {
  if(!viewer||!world.cultivators.includes(viewer))return undefined;
  const allowed=new Set(projectDoctrineFoundings(world,viewer).map(row=>row.id));
  const found=world.doctrineFoundings.foundings.find(row=>allowed.has(row.id)&&
    (row.status==='proposed'||row.status==='established'&&!row.maturity?.settlement)&&doctrineFoundingPhysicallyAt(world,viewer,row.oldSiteId,world.tick));
  return found?{siteId:found.oldSiteId,established:found.status==='established'}:undefined;
}
