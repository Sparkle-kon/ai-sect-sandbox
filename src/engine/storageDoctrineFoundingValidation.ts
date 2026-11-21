import {availableDoctrineFoundingActions} from './doctrineFoundingEngine';
import type {DoctrineFounding,WorldState} from '../types/world';
import {DOCTRINE_FOUNDING_MIN_MEMBERS,DOCTRINE_FOUNDING_MIN_WALLET,DOCTRINE_FOUNDING_TERM_TICKS,
  doctrineFoundingId,independentDoctrineSectId} from './doctrineFoundingTerms';
import {DOCTRINE_LABELS} from './doctrineEngine';

export function validateDoctrineFoundingHistory(world:WorldState,actors:ReadonlySet<string>,fail:(path:string)=>never):void{
  const order=world.playerAvatar.pendingOrder;
  if(order?.action==='DOCTRINE_FOUNDING'){
    const state=world.playerAvatar;
    const host=world.cultivators.find(row=>row.id===order.actorId&&row.alive&&row.hp>0);
    if(!host||order.actorId!==state.possessedId||order.queuedTick!==world.tick||(state.possessionUntilTick??0)<=world.tick+1||
      !availableDoctrineFoundingActions(host,world,world.tick+1).some(option=>option.doctrineFoundingMove===order.doctrineFoundingMove&&
        option.targetDoctrineFoundingId===order.targetDoctrineFoundingId&&option.targetDoctrineSchoolId===order.targetDoctrineSchoolId&&
        option.targetRelocationId===order.targetRelocationId))fail('playerAvatar.pendingOrder.doctrineFounding');
  }

  const rows=world.doctrineFoundings.foundings;
  const schools=new Map(world.doctrines.schools.map(row=>[row.id,row]));
  const sects=new Map(world.sects.map(row=>[row.id,row]));
  const people=new Map(world.cultivators.map(row=>[row.id,row]));
  const relocations=new Map(world.relocations.plans.map(row=>[row.id,row]));
  const abandonments=new Map(world.relocations.abandonedSites.map(row=>[row.id,row]));
  const proposals=new Map(world.doctrines.proposals.map(row=>[row.id,row]));
  const originals=new Map(world.scriptures.originals.map(row=>[row.id,row]));
  const foundingIds=new Set<string>(),succeeded=new Map<string,DoctrineFounding>();
  const openSchools=new Set<string>(),openSites=new Set<string>();
  if(rows.length){
    const locations=new Set(world.locations.map(site=>site.id));
    for(const row of rows){
      const {id,schoolId,parentSectId,independentSectId,oldSiteId,relocationPlanId,abandonedSiteId,autonomyProposalId,
        scriptureId,founderId,independentName,schoolTreasury,proposedTick,expiresTick,status,authorization,consents,settlement,continuity}=row;
      const parent=sects.get(parentSectId),school=schools.get(schoolId),plan=relocations.get(relocationPlanId),
        abandoned=abandonments.get(abandonedSiteId),autonomy=proposals.get(autonomyProposalId),scripture=originals.get(scriptureId),
        personal=people.get(founderId)?.authoredTechnique,child=sects.get(independentSectId);
      if(foundingIds.has(id)||id!==doctrineFoundingId(schoolId,proposedTick)||independentSectId!==independentDoctrineSectId(schoolId)||
        !parent||!school||school.parentSectId!==parentSectId||!plan||!abandoned||!autonomy||!scripture||!personal||!actors.has(founderId)||
        independentName!==`${parent.name.slice(0,40)}·${DOCTRINE_LABELS[school.theme]}别宗`||
        !locations.has(oldSiteId)||plan.sectId!==parentSectId||plan.originId!==oldSiteId||plan.status!=='settled'||!plan.spent||
        plan.settledTick===undefined||plan.settledTick>=proposedTick||plan.pathIndex!==plan.path.length-1||
        plan.custody.stones!==0||plan.custody.pavilion.length||abandoned.id!==`abandoned-${plan.id}`||
        abandoned.planId!==plan.id||abandoned.sectId!==parentSectId||abandoned.originId!==oldSiteId||
        abandoned.destinationId!==plan.destinationId||abandoned.tick!==plan.settledTick||abandoned.originalType!=='sect_hq'||
        autonomy.schoolId!==schoolId||autonomy.kind!=='separation'||autonomy.status!=='accepted'||
        autonomy.settledTick===undefined||autonomy.settledTick>abandoned.tick||
        autonomy.stewardId===autonomy.leaderId||!autonomy.votes.some(v=>v.actorId===autonomy.stewardId&&v.verdict==='accept')||
        !autonomy.votes.some(v=>v.actorId===autonomy.leaderId&&v.verdict==='accept')||
        scripture.source!=='authored'||scripture.sourceSectId!==parentSectId||scripture.technique.authorId!==founderId||
        scripture.firstSeenTick!==scripture.technique.createdTick||scripture.firstSeenTick>=proposedTick||
        personal.id!==scriptureId||personal.authorId!==founderId||personal.createdTick!==scripture.firstSeenTick||
        personal.name!==scripture.technique.name||personal.spiritRoot!==scripture.technique.spiritRoot||
        proposedTick>world.tick||expiresTick!==proposedTick+DOCTRINE_FOUNDING_TERM_TICKS||schoolTreasury<DOCTRINE_FOUNDING_MIN_WALLET||
        schoolTreasury>autonomy.amount)fail('doctrineFoundings.foundings.source');
      foundingIds.add(id);
      const dates=(date:number)=>date>proposedTick&&date<expiresTick&&date<=world.tick;
      if(authorization&&(!actors.has(authorization.actorId)||authorization.actorId===founderId||authorization.siteId!==plan.destinationId||
        !dates(authorization.tick)||authorization.tick>(settlement?.tick??world.tick)))fail('doctrineFoundings.foundings.authorization');
      const signed=new Map<string,DoctrineFounding['consents'][number]>();
      for(const consent of consents){
        if(!actors.has(consent.actorId)||signed.has(consent.actorId)||
          consent.actorId===founderId||consent.actorId===authorization?.actorId||!dates(consent.tick)||
          consent.tick+1>=expiresTick||consent.tick>(settlement?.tick??world.tick)||
          consent.withdrawnTick!==undefined&&(!dates(consent.withdrawnTick)||consent.withdrawnTick<=consent.tick||
            consent.withdrawnTick>(settlement?.tick??world.tick)))fail('doctrineFoundings.foundings.consent');
        signed.set(consent.actorId,consent);
      }
      if(status==='proposed'){
        if(settlement||continuity||world.tick>=expiresTick||child||school.foundedSectId||
          openSchools.has(schoolId)||openSites.has(oldSiteId))fail('doctrineFoundings.foundings.open');
        openSchools.add(schoolId);openSites.add(oldSiteId);
      }else if(status==='established'){
        if(succeeded.has(independentSectId)||!settlement||settlement.actorId!==founderId||!dates(settlement.tick)||
          !authorization||authorization.tick>=settlement.tick||!settlement.memberIds||settlement.memberIds[0]!==founderId||
          settlement.memberIds.length<DOCTRINE_FOUNDING_MIN_MEMBERS||new Set(settlement.memberIds).size!==settlement.memberIds.length||
          settlement.memberIds.includes(authorization.actorId)||
          settlement.memberIds.slice(1).some(member=>{
            const signature=signed.get(member);
            return !signature||signature.tick>=settlement.tick||signature.withdrawnTick!==undefined;
          })||settlement.transferredStones!==schoolTreasury||!child||child.name!==independentName||
          school.treasury!==0||school.foundedSectId!==child.id||school.memberIds.length||school.stewardId!==undefined)
          fail('doctrineFoundings.foundings.established');
        succeeded.set(independentSectId,row);
        // On the establishment turn only, no later legitimate trading/succession/relocation has occurred.
        if(settlement.tick===world.tick&&(!child.pavilion.some(copy=>copy.id===scriptureId&&copy.authorId===founderId&&
          copy.createdTick===scripture.firstSeenTick&&copy.name===personal.name&&copy.spiritRoot===personal.spiritRoot)||
          child.headquartersId!==oldSiteId||world.locations.find(site=>site.id===oldSiteId)?.ownerSectId!==child.id||
          child.leaderId!==founderId||settlement.memberIds.some(member=>people.get(member)?.sectId!==child.id)))
          fail('doctrineFoundings.foundings.creation');
        if(continuity){
          const native=child.succession;
          if(continuity.tick<=settlement.tick||continuity.tick>world.tick||continuity.previousLeaderId!==founderId||
            continuity.successorId===founderId||!actors.has(continuity.successorId)||
            continuity.eventId!==`evt-${continuity.tick}-${child.id}-leadership-vacancy-${continuity.successorId}`||
            !(native?.tick===continuity.tick&&native.method==='election'&&native.previousLeaderId===founderId&&native.leaderId===continuity.successorId||
              world.eraHistory.receipts.some(receipt=>receipt.kind==='succession'&&receipt.sectId===child.id&&
                receipt.eventId===continuity.eventId&&receipt.tick===continuity.tick&&receipt.method==='election'&&receipt.previousLeaderId===founderId&&
                receipt.leaderId===continuity.successorId)))fail('doctrineFoundings.foundings.succession');
        }
      }else if(continuity||!settlement||settlement.tick<proposedTick||settlement.tick>world.tick||
        settlement.memberIds!==undefined||settlement.transferredStones!==undefined||
        (status==='expired'?settlement.tick<expiresTick||settlement.actorId!==undefined:
          status==='invalidated'?settlement.tick>=expiresTick||settlement.actorId!==undefined:
          !dates(settlement.tick)||!settlement.actorId||!actors.has(settlement.actorId)||
          (status==='withdrawn'?settlement.actorId!==founderId:settlement.actorId===founderId||!!authorization)))
        fail('doctrineFoundings.foundings.terminal');
    }
  }
  for(const school of schools.values()){
    if(school.foundedSectId&&succeeded.get(school.foundedSectId)?.schoolId!==school.id)fail('doctrineFoundings.schools.marker');
  }
  for(const [id] of sects)if(id.startsWith('sect-independent-')&&!succeeded.has(id))fail('doctrineFoundings.sects.origin');

  if(!foundingIds.size)return;
  const nativeId=/^evt-(\d+)-(doctrine-founding-school-.+-\d+)-(proposal|authorized|join-.+|withdraw-.+|declined|withdrawn|established|expired|invalidated)$/;
  const related=(id:string)=>{const match=nativeId.exec(id);return match&&foundingIds.has(match[2])?match:undefined;};
  const byId=new Map(rows.map(row=>[row.id,row]));
  const seen=new Set<string>();
  for(const event of world.events){
    const match=related(event.id);
    if(!match)continue;
    const row=byId.get(match[2])!,step=match[3];
    if(seen.has(event.id)||event.tick!==Number(match[1])||event.tick>world.tick||event.category!=='diplomacy'||
      event.witnessScope!=='participants'||event.locationId!==undefined||!event.actorIds.includes(row.founderId)||
      new Set(event.actorIds).size!==event.actorIds.length||event.actorIds.some(actor=>!actors.has(actor)))
      fail('doctrineFoundings.events.private');
    switch(step){
      case 'proposal':
        // Only the proposal's mutually known origin role exists here; assignment at the later authorization can legitimately change.
        if(event.tick!==row.proposedTick||event.actorIds.length!==2||event.actorIds[0]!==row.founderId)
          fail('doctrineFoundings.events.proposal');
        break;
      case 'authorized':
        if(!row.authorization||event.tick!==row.authorization.tick||event.actorIds.length!==2||event.actorIds[0]!==row.authorization.actorId)
          fail('doctrineFoundings.events.authorization');
        break;
      case 'established': {
        const allowed=new Set([row.founderId,row.authorization?.actorId,...(row.settlement?.memberIds??[])]);
        if(row.status!=='established'||event.tick!==row.settlement?.tick||event.actorIds.length!==allowed.size||
          event.actorIds.some(actor=>!allowed.has(actor)))fail('doctrineFoundings.events.settlement');
        break;
      }
      case 'expired': case 'invalidated': {
        const allowed=new Set([row.founderId,...(row.authorization?[row.authorization.actorId]:[]),...row.consents.map(consent=>consent.actorId)]);
        if(row.status!==step||event.tick!==row.settlement?.tick||event.actorIds.length!==allowed.size||
          event.actorIds.some(actor=>!allowed.has(actor)))fail('doctrineFoundings.events.closure');
        break;
      }
      case 'declined': case 'withdrawn':
        if(row.status!==step||event.tick!==row.settlement?.tick||!row.settlement?.actorId||
          !event.actorIds.includes(row.settlement.actorId)||event.actorIds.length>3)
          fail('doctrineFoundings.events.voluntaryClosure');
        break;
      default: {
        const withdrawal=step.startsWith('withdraw-');
        const signer=step.slice(withdrawal?'withdraw-'.length:'join-'.length);
        const receipt=row.consents.find(consent=>consent.actorId===signer);
        if(!receipt||event.tick!==(withdrawal?receipt.withdrawnTick:receipt.tick)||event.actorIds.length!==2||event.actorIds[0]!==signer)
          fail('doctrineFoundings.events.consent');
      }
    }
    seen.add(event.id);
  }
  const publicAnchor=({id}:{id:string})=>!!related(id);
  if(world.chronicleArchive.anchors.some(publicAnchor)||
    world.chronicleArchive.chapters.some(chapter=>chapter.anchors.some(publicAnchor))||
    world.coldHistory.chapters.some(chapter=>chapter.anchors.some(publicAnchor)))fail('doctrineFoundings.publicArchive');
}
