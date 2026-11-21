import {isSectActive} from './sectActivity';
import type { Cultivator, DoctrineFounding, DoctrineMaturity, DoctrineMaturityMove, DoctrineMaturityOffer, LLMDecisionPayload,
  LocationNode, Sect, WorldEvent, WorldState } from '../types/world';
import { DOCTRINE_MATURITY_HAZARD_TICKS, DOCTRINE_MATURITY_OFFER_TICKS, DOCTRINE_MATURITY_SUPPORT_WINDOW } from './doctrineMaturityTerms';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';
import { routeWarningHazardValid } from './routeWarningProof';
import { terrainTileAt } from './terrainEngine';
import { SECT_CREDIT_TREASURY_CAP } from './sectCreditTerms';

export interface DoctrineMaturityOption {
  action:'DOCTRINE_MATURITY';doctrineMaturityMove:DoctrineMaturityMove;targetDoctrineFoundingId:string;
}
const alive=(actor:Cultivator|undefined):actor is Cultivator=>!!actor?.alive&&actor.hp>0;
const actorAt=(world:WorldState,id:string|undefined)=>world.cultivators.find(item=>item.id===id);
const sectAt=(world:WorldState,id:string)=>world.sects.find(item=>item.id===id);
const here=(world:WorldState,id:string)=>world.locations.find(item=>item.id===id);
const titled=(sect:Sect,site:LocationNode|undefined)=>!!site&&site.id===sect.headquartersId&&site.ownerSectId===sect.id&&
  site.type==='sect_hq'&&isSectActive(sect);
const members=(world:WorldState,sectId:string)=>world.cultivators.filter(actor=>actor.sectId===sectId&&alive(actor));
const idSort=(a:string,b:string)=>a<b?-1:a>b?1:0;
const sameIds=(first:readonly string[],second:readonly string[])=>first.length===second.length&&first.every((id,index)=>id===second[index]);
const sortedMemberIds=(world:WorldState,sectId:string)=>members(world,sectId).map(actor=>actor.id).sort(idSort);
const offered=(maturity:DoctrineMaturity)=>maturity.offers.find(row=>row.status==='offered');
const closeable=(status:string)=>status==='offered'||status==='active';
const at=(world:WorldState,actor:Cultivator,siteId:string,tick:number)=>world.cultivators.includes(actor)&&
  !!here(world,siteId)&&doctrineFoundingPhysicallyAt(world,actor,siteId,tick);

/** Existing named obligations stay in their own ledgers; any live one prevents successor/dispersal. */
export function doctrineMaturityHasOpenDuties(world:WorldState,sect:Sect):boolean {
  const id=sect.id, siteId=sect.headquartersId;
  const paired=(a:string,b:string)=>a===id||b===id;
  const seat=here(world,siteId), HQTile=seat&&terrainTileAt(world,seat.x,seat.y)?.id;
  const localCopies=new Set(world.pavilionLoans.copies.filter(row=>row.sectId===id).map(row=>row.editionId));
  return world.credit.loans.some(row=>paired(row.lenderSectId,row.borrowerSectId)&&closeable(row.status))||
    world.relocations.plans.some(row=>row.sectId===id&&(row.status==='voting'||row.status==='in_transit'))||
    world.sieges.some(row=>paired(row.attackerSectId,row.defenderSectId)&&(row.status==='marching'||row.status==='sieging'))||
    world.tributeDemands.some(row=>paired(row.demanderSectId,row.targetSectId)&&row.status==='pending')||
    world.diplomacy.some(row=>paired(row.sectAId,row.sectBId)&&row.pact!=='neutral')||
    world.ceasefires.agreements.some(row=>paired(row.proposerSectId,row.targetSectId)&&
      (closeable(row.status)||row.escrow.proposerBond>0||row.escrow.targetBond>0||row.escrow.aid>0))||
    world.formations.links.some(row=>paired(row.sectAId,row.sectBId)&&
      (closeable(row.status)||row.status==='broken'||row.heldA>0||row.heldB>0))||
    world.territorialLeases.leases.some(row=>paired(row.ownerSectId,row.lesseeSectId)&&(closeable(row.status)||row.escrow>0))||
    world.sharedCommons.pacts.some(row=>(row.proposerSectId===id||row.parties.some(party=>party.sectId===id))&&closeable(row.status))||
    world.research.projects.some(row=>row.sectId===id&&row.status==='open')||
    world.sanctuary.charters.some(row=>row.sponsorSectId===id&&row.status==='active')||
    world.bounties.some(row=>row.status==='open'&&(row.sponsorSectIds.includes(id)||row.escrow.some(share=>share.sectId===id)))||
    world.relicExhibits.entries.some(row=>row.hostSectId===id&&(row.status!=='closed'||!!row.custody))||
    world.workshops.orders.some(row=>(row.institution?.sectId===id||row.siteId===siteId)&&
      (closeable(row.status)||row.escrowStones>0||row.escrowHerbs>0))||
    world.toolLoans.loans.some(row=>row.siteId===siteId&&(closeable(row.status)||row.status==='awaiting_recovery'||!!row.custody))||
    world.furnaceReservations.reservations.some(row=>row.siteId===siteId&&(row.status==='queued'||row.status==='reserved'))||
    world.pavilionLoans.loans.some(row=>localCopies.has(row.editionId)&&!row.returned)||
    world.infirmaries.shifts.some(row=>row.sectId===id&&row.expiresTick>world.tick)||
    world.infirmaries.cases.some(row=>row.sectId===id&&row.status==='waiting')||
    world.careFollowups.appointments.some(row=>row.sectId===id&&row.status==='scheduled')||
    world.apprenticeCohorts.cohorts.some(row=>row.sectId===id&&row.status==='offered')||
    world.boundaryReliefs.cases.some(row=>row.sectId===id&&(row.status==='offered'||row.status==='travelling'||row.status==='returning'))||
    world.shortShifts.shifts.some(row=>paired(row.hostSectId,row.workerSectId)&&(closeable(row.status)||row.escrowStones>0))||
    world.sectStipends.stipends.some(row=>row.sectId===id&&closeable(row.status))||
    world.villageWorks.projects.some(row=>row.sponsorSectId===id&&row.status==='building')||
    world.doctrines.proposals.some(row=>row.status==='pending'&&world.doctrines.schools.some(school=>school.id===row.schoolId&&school.parentSectId===id))||
    world.doctrineFoundings.foundings.some(row=>row.parentSectId===id&&row.status==='proposed')||
    world.locations.some(site=>site.id!==siteId&&site.ownerSectId===id)||
    world.terrain.tiles.some(tile=>tile.ownerSectId===id&&tile.id!==HQTile);
}

function copiedScripture(world:WorldState,source:DoctrineFounding,outgoing:Sect,receiving:Sect) {
  const author=world.scriptures.originals.find(row=>row.id===source.scriptureId);
  const copy=outgoing.pavilion.find(row=>row.id===source.scriptureId);
  if(!author||!copy||copy.authorId!==source.founderId||author.technique.authorId!==source.founderId||
    copy.name!==author.technique.name||copy.spiritRoot!==author.technique.spiritRoot||copy.createdTick!==author.technique.createdTick)return undefined;
  const prior=receiving.pavilion.find(row=>row.id===source.scriptureId);
  if(prior&&(prior.authorId!==copy.authorId||prior.name!==copy.name||prior.spiritRoot!==copy.spiritRoot||prior.createdTick!==copy.createdTick))
    return undefined;
  return {copy,already:!!prior};
}

function derived(world:WorldState,source:DoctrineFounding) {
  const outgoing=sectAt(world,source.independentSectId), receiving=sectAt(world,source.parentSectId);
  const atRisk=outgoing&&here(world,outgoing.headquartersId), target=receiving&&here(world,receiving.headquartersId);
  const leader=actorAt(world,outgoing?.leaderId), host=actorAt(world,receiving?.leaderId);
  if(!outgoing||!receiving||!atRisk||!target||!isSectActive(outgoing)||!titled(receiving,target)||
    atRisk.id===target.id||!alive(leader)||!alive(host)||leader.id===host.id||leader.sectId!==outgoing.id||host.sectId!==receiving.id)return undefined;
  return {outgoing,receiving,atRisk,target,leader,host};
}

function pendingStillLegal(world:WorldState,source:DoctrineFounding,proposal:DoctrineMaturityOffer) {
  const facts=derived(world,source);
  if(!facts||proposal.outgoingLeaderId!==facts.leader.id||proposal.receivingLeaderId!==facts.host.id||
    facts.target.id!==proposal.receivingSiteId||facts.atRisk.id!==proposal.support.siteId||!readySupport(world,source,facts.outgoing)||
    proposal.scriptureId!==source.scriptureId||!sameIds(proposal.memberIds,sortedMemberIds(world,facts.outgoing.id))||
    !Number.isSafeInteger(proposal.wallet)||proposal.wallet<0||facts.outgoing.spiritStones<proposal.wallet||
    facts.receiving.spiritStones+proposal.wallet>SECT_CREDIT_TREASURY_CAP||
    !copiedScripture(world,source,facts.outgoing,facts.receiving)||doctrineMaturityHasOpenDuties(world,facts.outgoing))return undefined;
  return facts;
}

function readySupport(world:WorldState,row:DoctrineFounding,sect:Sect) {
  const support=row.maturity?.support;
  if(!support||support.siteId!==sect.headquartersId||support.observedTick>world.tick||
    world.tick-support.observedTick>DOCTRINE_MATURITY_SUPPORT_WINDOW)return undefined;
  const seat=here(world,sect.headquartersId);
  if(support.kind==='title_lost')return !titled(sect,seat)?support:undefined;
  if(row.maturity?.latestHazards.length!==DOCTRINE_MATURITY_HAZARD_TICKS||
    row.maturity.latestHazards.at(-1)?.tick!==world.tick||support.observedTick!==world.tick)return undefined;
  const tile=seat&&terrainTileAt(world,seat.x,seat.y);
  const stillLost=tile&&world.mapHazards.some(row=>row.tileId===tile.id&&row.intensity>=2&&routeWarningHazardValid(world,row,world.tick));
  return stillLost?support:undefined;
}

function supportNow(world:WorldState,prior:WorldState|undefined,sect:Sect,state:DoctrineMaturity) {
  const site=here(world,sect.headquartersId);
  const previousTitle=state.lastTitle;
  const priorSect=prior?.sects.find(row=>row.id===sect.id);
  const priorSite=priorSect&&prior?.locations.find(row=>row.id===priorSect.headquartersId);
  const exactPrior=prior&&priorSect&&priorSite&&prior.tick+1===world.tick&&
    priorSite.id===sect.headquartersId&&titled(priorSect,priorSite);
  if(!titled(sect,site)){
    state.latestHazards=[];
    if(exactPrior&&(!previousTitle||previousTitle.siteId===priorSite.id&&previousTitle.tick===prior.tick)){
      state.support={kind:'title_lost',siteId:sect.headquartersId,observedTick:world.tick,previousTick:prior.tick,
        ...(site?.ownerSectId?{currentOwnerSectId:site.ownerSectId}:{})};
    }
    return;
  }
  if(!site)return;
  state.lastTitle={siteId:site.id,tick:world.tick};
  if(state.support?.kind==='title_lost')delete state.support;
  const tile=terrainTileAt(world,site.x,site.y);
  const hazard=tile&&world.mapHazards.filter(row=>row.intensity>=2&&row.tileId===tile.id&&routeWarningHazardValid(world,row,world.tick))
    .sort((a,b)=>b.intensity-a.intensity||idSort(a.id,b.id))[0];
  if(!hazard){state.latestHazards=[];return;}
  if(state.latestHazards.at(-1)?.tick===world.tick)return;
  const previous=state.latestHazards.at(-1);
  const previousValid=previous?.tick===world.tick-1&&previous.siteId===site.id;
  state.latestHazards=[...(previousValid?state.latestHazards:[]),{tick:world.tick,siteId:site.id,hazard:{...hazard}}]
    .slice(-DOCTRINE_MATURITY_HAZARD_TICKS);
  if(state.latestHazards.length===DOCTRINE_MATURITY_HAZARD_TICKS)
    state.support={kind:'sustained_hazard',siteId:site.id,observedTick:world.tick,samples:structuredClone(state.latestHazards)};
}

function note(world:WorldState,founding:DoctrineFounding,stage:string,title:string,description:string,actorIds:string[]):WorldEvent {
  return {id:`evt-${world.tick}-${founding.id}-maturity-${stage}`,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',
    title,description,actorIds:[...new Set(actorIds)],witnessScope:'participants'};
}

/** Releases only the currently titled seat and its one exact tile, leaving all physical stocks and records in place. */
function retire(world:WorldState,sect:Sect):string|undefined {
  const site=here(world,sect.headquartersId);
  const tile=site&&terrainTileAt(world,site.x,site.y);
  if(site?.ownerSectId===sect.id){
    delete site.ownerSectId;
    if(site.type==='sect_hq')site.type='spirit_vein';
  }
  const releasedTileId=tile?.ownerSectId===sect.id?tile.id:undefined;
  if(releasedTileId&&tile)delete tile.ownerSectId;
  sect.inactiveSinceTick=world.tick;
  delete sect.leaderId;
  delete sect.officeVacancy;
  return releasedTileId;
}

export function advanceDoctrineMaturity(world:WorldState,prior?:WorldState):WorldEvent[] {
  const result:WorldEvent[]=[];
  for(const row of world.doctrineFoundings.foundings){
    if(row.status!=='established')continue;
    const sect=sectAt(world,row.independentSectId);
    if(!sect||!isSectActive(sect))continue;
    const state=row.maturity??={latestHazards:[],offers:[]};
    supportNow(world,prior,sect,state);
    const pending=offered(state);
    if(pending&&(world.tick>=pending.expiresTick||!pendingStillLegal(world,row,pending))){
      pending.status=world.tick>=pending.expiresTick?'expired':'invalidated';
      pending.closedTick=world.tick;
      result.push(note(world,row,pending.status,'并宗筹议未达成','未替任何人同意，也未改动宗籍或库银。',pending.memberIds.concat(pending.receivingLeaderId)));
    }
    const support=readySupport(world,row,sect);
    if(!support||state.settlement||members(world,sect.id).length||doctrineMaturityHasOpenDuties(world,sect))continue;
    const releasedTileId=retire(world,sect);
    state.settlement={kind:'dispersed',tick:world.tick,siteId:sect.headquartersId,memberIds:[],transferredStones:0,
      retainedStones:sect.spiritStones,...(releasedTileId?{releasedTileId}:{})};
    result.push(note(world,row,'dispersed','独立宗门无在世成员而散亡','无在世同门和未结宗门职责；原名、史册、库银和传承留在旧账，并无受领人。',
      [row.founderId,...(row.settlement?.memberIds??[])]));
  }
  return result;
}

export function availableDoctrineMaturityActions(actor:Cultivator,world:WorldState,executionTick=world.tick):DoctrineMaturityOption[] {
  if(!alive(actor)||!world.cultivators.includes(actor)||(executionTick!==world.tick&&executionTick!==world.tick+1))return [];
  const result:DoctrineMaturityOption[]=[];
  for(const row of world.doctrineFoundings.foundings) {
    if(row.status!=='established'||!row.maturity||row.maturity.settlement)continue;
    const state=row.maturity, pending=offered(state);
    const facts=pending?pendingStillLegal(world,row,pending):derived(world,row);
    if(!facts)continue;
    const {outgoing,receiving,leader,host,atRisk,target}=facts;
    const add=(doctrineMaturityMove:DoctrineMaturityMove)=>result.push({action:'DOCTRINE_MATURITY',doctrineMaturityMove,targetDoctrineFoundingId:row.id});
    if(!pending){
      const support=readySupport(world,row,outgoing);
      if(actor.id===leader.id&&support&&state.offers.at(-1)?.openedTick!==executionTick&&state.offers.at(-1)?.closedTick!==executionTick&&
        at(world,actor,atRisk.id,executionTick)&&!doctrineMaturityHasOpenDuties(world,outgoing)&&
        Number.isSafeInteger(outgoing.spiritStones)&&outgoing.spiritStones>=0&&
        receiving.spiritStones+outgoing.spiritStones<=SECT_CREDIT_TREASURY_CAP&&copiedScripture(world,row,outgoing,receiving))add('offer_merge');
      continue;
    }
    if(executionTick<=pending.openedTick||executionTick>=pending.expiresTick)continue;
    if(actor.id===leader.id&&at(world,actor,atRisk.id,executionTick)){
      add('withdraw_merge');
      if(pending.acceptedTick!==undefined&&pending.acceptedTick<executionTick&&pending.memberIds.every(id=>{
        if(id===leader.id)return true;
        const participant=actorAt(world,id);
        return !!participant&&at(world,participant,atRisk.id,executionTick)&&
          pending.consents.some(consent=>consent.actorId===id&&consent.tick<executionTick);
      })&&at(world,host,target.id,executionTick))add('finalize_merge');
    }
    if(actor.id===host.id&&at(world,actor,target.id,executionTick)&&pending.acceptedTick===undefined){
      add('accept_merge');add('decline_merge');
    }
    if(actor.id!==leader.id&&pending.memberIds.includes(actor.id)&&at(world,actor,atRisk.id,executionTick)){
      if(!pending.consents.some(consent=>consent.actorId===actor.id))add('approve_member');
      add('decline_merge');
    }
  }
  return result;
}

export function resolveDoctrineMaturityAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null {
  if(payload.chosenAction!=='DOCTRINE_MATURITY'||Object.entries(payload).some(([key,value])=>value!==undefined&&
    !['chosenAction','innerMonologue','spokenLine','doctrineMaturityMove','targetDoctrineFoundingId'].includes(key)&&
    !(key==='action'&&value==='DOCTRINE_MATURITY')))return null;
  const move=availableDoctrineMaturityActions(actor,world).find(row=>row.doctrineMaturityMove===payload.doctrineMaturityMove&&
    row.targetDoctrineFoundingId===payload.targetDoctrineFoundingId);
  const source=move&&world.doctrineFoundings.foundings.find(row=>row.id===move.targetDoctrineFoundingId);
  const state=source?.maturity;
  if(!move||!source||!state)return null;
  if(move.doctrineMaturityMove==='offer_merge'){
    const facts=derived(world,source);
    const support=facts&&readySupport(world,source,facts.outgoing);
    if(!facts||!support)return null;
    const pending:DoctrineMaturityOffer={openedTick:world.tick,expiresTick:world.tick+DOCTRINE_MATURITY_OFFER_TICKS,
      outgoingLeaderId:actor.id,receivingLeaderId:facts.host.id,receivingSiteId:facts.target.id,
      memberIds:sortedMemberIds(world,facts.outgoing.id),wallet:facts.outgoing.spiritStones,scriptureId:source.scriptureId,
      support:structuredClone(support),consents:[],status:'offered'};
    state.offers.push(pending);
    return note(world,source,'offer','独立宗门提议并回原宗','旧址受真实破坏；只登记拟交割的实有库银、命名传承和成员逐一同意，没有立即转账或迁人。',
      pending.memberIds.concat(pending.receivingLeaderId));
  }
  const pending=offered(state);
  const facts=pending&&pendingStillLegal(world,source,pending);
  if(!pending||!facts)return null;
  const audience=pending.memberIds.concat(pending.receivingLeaderId);
  if(move.doctrineMaturityMove==='accept_merge'){
    pending.acceptedTick=world.tick;
    return note(world,source,'accept','原宗掌门单独同意接纳','接纳还要核对每位在世同门自己的签名，以及未清偿职责。',audience);
  }
  if(move.doctrineMaturityMove==='approve_member'){
    pending.consents.push({actorId:actor.id,tick:world.tick});
    return note(world,source,`approve-${actor.id}`,'成员单独同意改宗籍','只签本人，不代表其他同门。本人仍在原地。',[actor.id,pending.outgoingLeaderId]);
  }
  if(move.doctrineMaturityMove==='decline_merge'||move.doctrineMaturityMove==='withdraw_merge'){
    pending.status=move.doctrineMaturityMove==='decline_merge'?'declined':'withdrawn';
    pending.closedTick=world.tick;pending.closedById=actor.id;
    return note(world,source,pending.status,'并宗筹议停止','原宗门与个人的既有归属未改变。',audience);
  }
  const {outgoing,receiving}=facts;
  const scripture=copiedScripture(world,source,outgoing,receiving);
  if(!scripture)return null;
  const roster=members(world,outgoing.id);
  if(!sameIds(roster.map(member=>member.id).sort(idSort),pending.memberIds))return null;
  outgoing.spiritStones-=pending.wallet;
  receiving.spiritStones+=pending.wallet;
  if(!scripture.already)receiving.pavilion.push({...scripture.copy});
  outgoing.pavilion=outgoing.pavilion.filter(row=>row.id!==pending.scriptureId);
  for(const member of roster){
    member.sectId=receiving.id;member.sectRank='外门弟子';member.contribution=0;
    if(member.guardAssignment?.locationId===outgoing.headquartersId)delete member.guardAssignment;
  }
  const releasedTileId=retire(world,outgoing);
  pending.status='merged';pending.closedTick=world.tick;pending.closedById=actor.id;
  state.settlement={kind:'merged',tick:world.tick,siteId:outgoing.headquartersId,receivingSectId:receiving.id,
    memberIds:[...pending.memberIds],transferredStones:pending.wallet,retainedStones:outgoing.spiritStones,
    ...(releasedTileId?{releasedTileId}:{}),transferredScriptureId:pending.scriptureId,scriptureAlreadyHeld:scripture.already};
  return note(world,source,'merged','已由全体逐一同意并宗','只改变签名者的宗籍，不移动人的位置；旧名、在地设施、无关账目和旧宗门记录仍可核对。',audience);
}

export interface DoctrineMaturityView {
  status:'observing'|'support_lost'|'past_support'|'offered'|'merged'|'dispersed';
  support?:{kind:'sustained_hazard'|'title_lost';observedTick:number};
  lastObservation?:{consecutiveSevereMonths:number;observedTick:number;recoveredFromHazard?:true};
  offer?:{openedTick:number;expiresTick:number;status:DoctrineMaturityOffer['status'];memberCount:number;memberConsents:number;receivingLeaderSigned:boolean;agreedStones:number};
  settlement?:{kind:'merged'|'dispersed';tick:number;memberCount:number;transferredStones:number;retainedStones:number;scriptureAlreadyHeld?:boolean};
}

export function projectDoctrineMaturity(world:WorldState,row:DoctrineFounding,viewer:Cultivator):DoctrineMaturityView|undefined {
  if(!world.cultivators.includes(viewer)||!row.maturity)return undefined;
  const {support,offers,settlement,lastTitle,latestHazards}=row.maturity;
  const pending=offers.at(-1);
  const allowed=viewer.id===row.founderId||row.settlement?.memberIds?.includes(viewer.id)||viewer.sectId===row.independentSectId||
    pending?.receivingLeaderId===viewer.id||pending?.memberIds.includes(viewer.id);
  const sect=sectAt(world,row.independentSectId);
  const locallyObserved=!!sect&&lastTitle?.tick===world.tick&&at(world,viewer,sect.headquartersId,world.tick);
  if(!allowed||!support&&!settlement&&(!locallyObserved||!latestHazards.length))return undefined;
  return {status:settlement?.kind??(pending?.status==='offered'?'offered':
    sect&&readySupport(world,row,sect)?'support_lost':support?'past_support':'observing'),
    ...(support?{support:{kind:support.kind,observedTick:support.observedTick}}:{}),
    ...(locallyObserved&&lastTitle?{lastObservation:{consecutiveSevereMonths:latestHazards.length,observedTick:lastTitle.tick,
      ...(support?.kind==='sustained_hazard'&&latestHazards.length===0?{recoveredFromHazard:true as const}:{})}}:{}),
    ...(pending?{offer:{openedTick:pending.openedTick,expiresTick:pending.expiresTick,status:pending.status,memberCount:pending.memberIds.length,
      memberConsents:pending.consents.length+1,receivingLeaderSigned:pending.acceptedTick!==undefined,agreedStones:pending.wallet}}:{}),
    ...(settlement?{settlement:{kind:settlement.kind,tick:settlement.tick,memberCount:settlement.memberIds.length,
      transferredStones:settlement.transferredStones,retainedStones:settlement.retainedStones,
      ...(settlement.scriptureAlreadyHeld!==undefined?{scriptureAlreadyHeld:settlement.scriptureAlreadyHeld}:{})}}:{})};
}
