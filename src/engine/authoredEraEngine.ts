import {authoredEraId,authoredBranchSectId,isAuthoredEraProof,type AuthoredEraProof} from './authoredEraProof';
export {authoredEraId,authoredBranchSectId,isAuthoredEraProof,type AuthoredEraProof} from './authoredEraProof';
import type { AuthoredEraEffect, Cultivator, LocationNode, Sect, WorldState } from '../types/world';
import { createInitialWorld } from '../data/initialWorld';
import { planCampaignCalendar } from './fastForwardCalendar';
import { previewEraDesignDraft, validateEraDesignDraft } from './eraDesignDraft';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { DOCTRINE_FOUNDING_MIN_MEMBERS, DOCTRINE_FOUNDING_MIN_SUPPORT_QI, DOCTRINE_FOUNDING_MIN_WALLET } from './doctrineFoundingTerms';
import { isSectActive } from './sectActivity';
import { sectCreditExposure, SECT_CREDIT_RESERVE, SECT_CREDIT_TREASURY_CAP } from './sectCreditEngine';
import { terrainTileAt } from './terrainEngine';
import { routeWarningHazardValid } from './routeWarningProof';

export type AuthoredEraErrorCode='unsupported_target'|'unverified_source'|'design_conflict'|'changed_site'|'member_unavailable'|
  'parent_unavailable'|'insufficient_free_treasury'|'active_obligations'|'village_capacity_conflict';
export class AuthoredEraError extends Error {
  constructor(readonly code:AuthoredEraErrorCode,message:string,readonly conditionIndex?:number,readonly actorIds?:readonly string[]){
    super(message);this.name='AuthoredEraError';
  }
}
const DANXIA_ID='sect-danxia';
const alive=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0;
const actorAt=(world:WorldState,id:string|undefined)=>world.cultivators.find(row=>row.id===id);
const siteAt=(world:WorldState,id:string)=>world.locations.find(row=>row.id===id);
const fresh=(status:string)=>status==='offered'||status==='active'||status==='waiting'||status==='scheduled';
const finiteStock=(value:number)=>Number.isFinite(value)&&value>=0;
const ascii=(a:string,b:string)=>a<b?-1:a>b?1:0;
const siteHazard=(world:WorldState,site:LocationNode,minimum:number)=>{
  const tile=terrainTileAt(world,site.x,site.y);
  return !tile||tile.biome==='魔渊'||world.mapHazards.some(row=>row.tileId===tile.id&&row.intensity>=minimum&&
    routeWarningHazardValid(world,row,world.tick));
};

/** The author's target date is measured from the real seed's baseline, not the edit date. */
export function authoredEraTarget(input:unknown):{draft:ReturnType<typeof validateEraDesignDraft>;start:WorldState;months:number} {
  const draft=validateEraDesignDraft(input);
  const start=createInitialWorld(draft.seed,draft.profileId);
  const planned=planCampaignCalendar(start,String(draft.target.year),String(draft.target.month));
  if(!planned.ok)throw new AuthoredEraError('unsupported_target','拟定年月超出该种子能够实际复演的 1200 月范围，未换起点。');
  return {draft,start,months:planned.months};
}

function siteDuties(world:WorldState,siteId:string):boolean {
  const village=world.settlements.villages.find(row=>row.locationId===siteId);
  return world.relocations.plans.some(row=>(row.originId===siteId||row.destinationId===siteId)&&(row.status==='voting'||row.status==='in_transit'))||
    world.sieges.some(row=>row.destinationId===siteId&&(row.status==='marching'||row.status==='sieging'))||
    world.territorialLeases.leases.some(row=>row.siteId===siteId&&(fresh(row.status)||row.escrow>0))||
    world.sharedCommons.pacts.some(row=>row.siteId===siteId&&fresh(row.status))||
    world.sanctuary.charters.some(row=>row.siteId===siteId&&row.status==='active')||
    world.formations.links.some(row=>(row.siteAId===siteId||row.siteBId===siteId)&&(fresh(row.status)||row.heldA>0||row.heldB>0))||
    world.roads.links.some(row=>(row.anchorSiteId===siteId||row.otherSiteId===siteId)&&row.closedTick===undefined)||
    world.workshops.orders.some(row=>row.siteId===siteId&&(fresh(row.status)||row.escrowStones>0||row.escrowHerbs>0))||
    world.furnaceReservations.reservations.some(row=>row.siteId===siteId&&(row.status==='queued'||row.status==='reserved'))||
    world.pavilionLoans.copies.some(row=>row.siteId===siteId&&world.pavilionLoans.loans.some(loan=>loan.editionId===row.editionId&&!loan.returned))||
    world.relicExhibits.entries.some(row=>row.siteId===siteId&&(row.status!=='closed'||!!row.custody))||
    world.toolLoans.loans.some(row=>row.siteId===siteId&&(fresh(row.status)||!!row.custody))||
    world.markets.orders.some(row=>row.locationId===siteId&&row.status==='open')||
    world.markets.shipments.some(row=>(row.originId===siteId||row.destinationId===siteId)&&row.status==='in_transit')||
    !!village&&(
      world.villageSupply.agreements.some(row=>(row.fromSettlementId===village.id||row.toSettlementId===village.id)&&fresh(row.status))||
      world.villageWorks.projects.some(row=>row.settlementId===village.id&&row.status==='building')||
      world.villageFairs.fairs.some(row=>row.settlementId===village.id&&(row.status==='announced'||row.status==='open'))||
      world.seasonalHousing.claims.some(row=>row.settlementId===village.id&&(row.status==='offered'||row.status==='reserved'||row.status==='occupied'))||
      world.danxiaMedicine.commitments.some(row=>row.settlementId===village.id&&
        (row.status==='offered'||row.status==='in_transit'||row.status==='returning'||row.status==='arrived'))
    );
}

function memberDuties(world:WorldState,actor:Cultivator):boolean {
  const id=actor.id;
  return !!actor.guardAssignment&&actor.guardAssignment.expiresTick>world.tick||
    world.households.guardianships.some(row=>row.status==='active'&&(row.guardianId===id||row.wardId===id)&&row.expiresTick>world.tick)||
    world.doctrines.schools.some(row=>row.status==='autonomous'&&!row.foundedSectId&&row.memberIds.includes(id))||
    world.doctrines.proposals.some(row=>row.status==='pending'&&(row.stewardId===id||row.leaderId===id))||
    world.doctrineFoundings.foundings.some(row=>row.status==='proposed'&&(row.founderId===id||row.authorization?.actorId===id||
      row.consents.some(consent=>consent.actorId===id&&consent.withdrawnTick===undefined)))||
    world.mentorship.offers.some(row=>row.status==='pending'&&(row.mentorId===id||row.studentId===id))||
    world.mentorTransfers.transfers.some(row=>(row.status==='offered'||row.status==='accepted')&&
      (row.newMentorId===id||row.studentId===id))||
    world.oaths.contracts.some(row=>(row.requesterId===id||row.providerId===id)&&
      (fresh(row.status)||row.escrow.payment>0||row.escrow.collateral>0))||
    world.workshops.orders.some(row=>(row.patronId===id||row.makerId===id)&&
      (fresh(row.status)||row.escrowStones>0||row.escrowHerbs>0))||
    world.research.projects.some(row=>row.status==='open'&&(row.proposerId===id||
      row.contributors.some(person=>person.actorId===id&&person.withdrawnTick===undefined)))||
    world.territorialLeases.leases.some(row=>(row.ownerSignerId===id||row.lesseeSignerId===id)&&(fresh(row.status)||row.escrow>0))||
    world.credit.loans.some(row=>(row.lenderSignerId===id||row.borrowerSignerId===id)&&fresh(row.status))||
    world.infirmaries.cases.some(row=>row.patientId===id&&row.status==='waiting')||
    world.infirmaries.shifts.some(row=>row.guardId===id&&row.expiresTick>world.tick)||
    world.careFollowups.appointments.some(row=>row.patientId===id&&row.status==='scheduled')||
    world.apprenticeCohorts.cohorts.some(row=>row.status==='offered'&&(row.mentorId===id||
      row.seats.some(person=>person.studentId===id&&person.status==='accepted')))||
    world.pavilionLoans.loans.some(row=>row.borrowerId===id&&!row.returned)||
    world.toolLoans.loans.some(row=>(row.lenderId===id||row.borrowerId===id)&&(fresh(row.status)||!!row.custody))||
    world.sectStipends.stipends.some(row=>(row.recipientId===id||row.sponsorId===id)&&fresh(row.status))||
    world.shortShifts.shifts.some(row=>(row.workerId===id||row.hostId===id)&&(fresh(row.status)||row.escrowStones>0))||
    world.formations.links.some(row=>(row.proposerId===id||row.recipientLeaderId===id)&&
      (fresh(row.status)||row.heldA>0||row.heldB>0));
}

function protectedTreasury(world:WorldState,sect:Sect):number {
  const credit=sectCreditExposure(world,sect.id);
  const pension=world.sectStipends.stipends.filter(row=>row.sectId===sect.id&&(row.status==='active'||row.status==='offered'))
    .reduce((sum,row)=>sum+(3-row.periods.length)*12,0);
  const demands=world.tributeDemands.filter(row=>row.targetSectId===sect.id&&row.status==='pending')
    .reduce((sum,row)=>sum+row.amount,0);
  return SECT_CREDIT_RESERVE+credit.payable+credit.pendingOutgoing+pension+demands;
}

function parentAvailable(world:WorldState,sect:Sect,site:LocationNode){
  return isSectActive(sect)&&site.type==='sect_hq'&&site.ownerSectId===sect.id&&
    !world.relocations.plans.some(row=>row.sectId===sect.id&&(row.status==='voting'||row.status==='in_transit'))&&
    !world.sieges.some(row=>(row.attackerSectId===sect.id||row.defenderSectId===sect.id)&&
      (row.status==='marching'||row.status==='sieging'))&&!siteHazard(world,site,3);
}
function residentNames(world:WorldState,row:readonly string[]):string[] {
  return row.map(id=>actorAt(world,id)?.name??'原指定修士');
}

/** No current game state is accepted or mutated; the worker supplies an independently replayed native opening frame. */
export function applyAuthoredEraDesign(input:unknown,baseline:WorldState,proof:AuthoredEraProof):WorldState {
  const preview=previewEraDesignDraft(input);
  if(!preview.ready)throw new AuthoredEraError('design_conflict','草案的基础条件互相冲突，请先返回编辑。');
  const {draft,start,months}=authoredEraTarget(preview.draft);
  const generation=baseline.worldgen;
  if(!isAuthoredEraProof(proof)||baseline.authoredEraOrigin||baseline.scenarioOrigin||baseline.playerAvatar.possessedId||
    baseline.playerAvatar.pendingOrder||baseline.interventionSequence!==start.interventionSequence||
    !generation||generation.algorithm!==start.worldgen?.algorithm||generation.seed!==draft.seed||generation.profileId!==draft.profileId||
    generation.birthTick!==start.tick||baseline.random.seed!==draft.seed||baseline.random.algorithm!==start.random.algorithm||
    baseline.tick!==start.tick+months||baseline.year!==draft.target.year||baseline.month!==draft.target.month)
    throw new AuthoredEraError('unverified_source','隔离复演帧与指定种子、规则或目标年月不吻合。');
  // Validate and apply in an isolated clone; no partial candidate, generated fake actor, or original world escapes.
  const world=structuredClone(baseline);
  const eraId=authoredEraId(proof);
  const effects=new Map<number,AuthoredEraEffect>();
  // Fixed dependency order: depleted Qi/local stock defines whether independent northern tenure can survive.
  for(const [index,condition] of draft.conditions.entries()){
    if(condition.kind!=='jade_vein_depleted')continue;
    const site=siteAt(world,condition.siteId);
    if(!site||site.type!=='spirit_vein'||!(site.id==='loc-vein-north'||site.spiritRoot==='水')||
      condition.spiritQi>site.spiritQi||condition.jadeCapacity>site.herbCapacity.jade_leaf||
      condition.spiritQi===site.spiritQi&&condition.jadeCapacity===site.herbCapacity.jade_leaf)
      throw new AuthoredEraError('changed_site','寒玉脉的当代地形或库存已变化，不能按原定数值解释为衰竭。',index);
    if(siteDuties(world,site.id))throw new AuthoredEraError('active_obligations','寒玉脉尚有真实通行、地契或托管职责，不能覆盖。',index);
    const before={spiritQi:site.spiritQi,jadeCapacity:site.herbCapacity.jade_leaf,jade:site.herbs.jade_leaf};
    site.spiritQi=condition.spiritQi;
    site.herbCapacity.jade_leaf=condition.jadeCapacity;
    site.herbs.jade_leaf=Math.min(before.jade,condition.jadeCapacity);
    effects.set(index,{kind:condition.kind,siteId:site.id,before,
      after:{spiritQi:site.spiritQi,jadeCapacity:site.herbCapacity.jade_leaf,jade:site.herbs.jade_leaf}});
  }
  for(const [index,condition] of draft.conditions.entries()){
    if(condition.kind==='jade_vein_depleted')continue;
    if(condition.kind==='village_capacity'){
      const village=world.settlements.villages.find(row=>row.id===condition.settlementId);
      const site=village&&siteAt(world,village.locationId);
      if(!village||!site||village.population<1||condition.capacity<village.population||siteHazard(world,site,3))
        throw new AuthoredEraError('village_capacity_conflict','当代村落的实际人口、地址或风险与设定承载不能同时成立。',index);
      if(condition.capacity<village.capacity&&siteDuties(world,site.id))
        throw new AuthoredEraError('active_obligations','村落仍有真实职责，不能以设定削减现有承载。',index);
      effects.set(index,{kind:condition.kind,settlementId:village.id,siteId:site.id,
        capacityBefore:village.capacity,capacityAfter:condition.capacity,population:village.population});
      village.capacity=condition.capacity;
      continue;
    }
    const parent=world.sects.find(row=>row.id===DANXIA_ID);
    const parentLeader=parent&&actorAt(world,parent.leaderId);
    const origin=parent&&siteAt(world,parent.headquartersId);
    if(!parent||!origin||!alive(parentLeader)||parentLeader.sectId!==parent.id||
      !parentAvailable(world,parent,origin))
      throw new AuthoredEraError('parent_unavailable','当代丹霞没有可确证的原宗、合法山门或留任掌门。',index);
    const destination=siteAt(world,condition.destinationId);
    const tile=destination&&terrainTileAt(world,destination.x,destination.y);
    if(!destination||!tile||destination.type!=='spirit_vein'||destination.y>=origin.y||
      destination.id===origin.id||destination.ownerSectId||tile.ownerSectId||siteHazard(world,destination,2)||
      destination.spiritQi<DOCTRINE_FOUNDING_MIN_SUPPORT_QI||destination.herbs.earth_root<1||
      world.sects.some(row=>isSectActive(row)&&row.headquartersId===destination.id))
      throw new AuthoredEraError('changed_site','当代北地已占、已失去安全通行或现有供养不足；不能按地名创立分支。',index);
    if(siteDuties(world,destination.id))
      throw new AuthoredEraError('active_obligations','北地仍有实际在途或契约职责，不能由作者设定直接转移。',index);
    const moving=condition.memberIds.map(id=>actorAt(world,id)).filter((actor):actor is Cultivator=>
      alive(actor)&&actor.id!==parentLeader.id&&actor.sectId===parent.id&&
      doctrineFoundingPhysicallyAt(world,actor,origin.id,world.tick)&&!memberDuties(world,actor));
    if(moving.length!==condition.memberIds.length||moving.length<DOCTRINE_FOUNDING_MIN_MEMBERS){
      const blockedIds=condition.memberIds.filter(id=>!moving.some(row=>row.id===id));
      throw new AuthoredEraError('member_unavailable',
        `指定成员有未在世、改宗、不在场或仍有职责者：${residentNames(world,blockedIds).join('、')}。不自动补人。`,index,blockedIds);
    }
    const staying=world.cultivators.filter(actor=>alive(actor)&&actor.sectId===parent.id&&doctrineFoundingPhysicallyAt(world,actor,origin.id,world.tick)&&
      !moving.includes(actor));
    if(!staying.includes(parentLeader)||staying.length<2)
      throw new AuthoredEraError('parent_unavailable','当代原宗须有实际留任掌门和至少一位在场同门，不能把原宗掏空。',index);
    const protectedStones=protectedTreasury(world,parent);
    if(condition.stones<DOCTRINE_FOUNDING_MIN_WALLET||condition.stones>SECT_CREDIT_TREASURY_CAP||
      !finiteStock(parent.spiritStones)||!Number.isFinite(protectedStones)||parent.spiritStones-condition.stones<protectedStones)
      throw new AuthoredEraError('insufficient_free_treasury','当代灵石余额不够；不可挪用真实负债、承诺和原宗最低储备。',index);
    const branchId=authoredBranchSectId(eraId);
    const branchName=`${parent.name.slice(0,32)}·${destination.name.slice(0,24)}支`;
    if(world.sects.some(row=>row.id===branchId||row.name===branchName))
      throw new AuthoredEraError('changed_site','拟用稳定名号与当代已有实体冲突。',index);
    const branchLeader=[...moving].sort((a,b)=>b.contribution-a.contribution||b.combatPower-a.combatPower||ascii(a.id,b.id))[0];
    const parentStonesBefore=parent.spiritStones;
    const branch:Sect={id:branchId,name:branchName,alignment:parent.alignment,color:parent.color,doctrine:'北地分支（作者设定）',
      reputation:0,spiritStones:condition.stones,headquartersId:destination.id,pavilion:[],leaderId:branchLeader.id,
      facilities:{qi_array:0,alchemy_hall:0,scripture_pavilion:0,defense_array:0,spirit_mine:0},arrayHp:0,arrayMaxHp:0};
    parent.spiritStones-=condition.stones;
    world.sects.push(branch);
    destination.ownerSectId=branch.id;destination.type='sect_hq';tile.ownerSectId=branch.id;
    for(const actor of moving){
      // Author assigns the native opening position; this is not a fake move/arrival event or permission to change age.
      actor.sectId=branch.id;actor.sectRank=actor===branchLeader?'掌门':'外门弟子';actor.contribution=0;actor.locationId=destination.id;
    }
    effects.set(index,{kind:condition.kind,parentSectId:parent.id,parentSiteId:origin.id,branchSectId:branch.id,destinationId:destination.id,
      tileId:tile.id,memberIds:moving.map(row=>row.id),branchLeaderId:branchLeader.id,parentLeaderId:parentLeader.id,
      stayingIds:staying.map(row=>row.id).sort(ascii),parentStonesBefore,parentStonesAfter:parent.spiritStones,
      branchStones:branch.spiritStones,protectedStones});
  }
  world.authoredEraOrigin={version:1,id:eraId,openedTick:world.tick,year:world.year,month:world.month,draft,
    baselineDigest:proof.baselineDigest,designDigest:proof.designDigest,rulesRevision:proof.rulesRevision,
    openingEventIds:[...new Set(baseline.events.filter(event=>event.tick===baseline.tick).map(event=>event.id))].sort(ascii),
    effects:[...effects.entries()].sort((a,b)=>a[0]-b[0]).map(([,effect])=>effect)};
  return world;
}
