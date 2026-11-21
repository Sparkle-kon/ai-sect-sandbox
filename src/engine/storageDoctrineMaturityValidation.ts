import {availableDoctrineMaturityActions} from './doctrineMaturityEngine';
import type {DoctrineFounding, DoctrineMaturityHazardSample, DoctrineMaturitySupport, WorldState} from '../types/world';
import {DOCTRINE_MATURITY_HAZARD_TICKS,DOCTRINE_MATURITY_OFFER_TICKS,DOCTRINE_MATURITY_SUPPORT_WINDOW} from './doctrineMaturityTerms';
import {routeWarningHazardValid} from './routeWarningProof';
import {terrainTileAt} from './terrainEngine';

const sameIds=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);

/** Check historic signatures and provenance against the exact lineage; never replay or synthesize old handovers. */
export function validateDoctrineMaturityHistory(world:WorldState,fail:(path:string)=>never):void{
  const pending=world.playerAvatar.pendingOrder;
  if(pending?.action==='DOCTRINE_MATURITY'){
    const state=world.playerAvatar;
    const host=world.cultivators.find(row=>row.id===pending.actorId&&row.alive&&row.hp>0);
    if(!host||state.possessedId!==pending.actorId||pending.queuedTick!==world.tick||(state.possessionUntilTick??0)<=world.tick+1||
      !availableDoctrineMaturityActions(host,world,world.tick+1).some(option=>option.doctrineMaturityMove===pending.doctrineMaturityMove&&
        option.targetDoctrineFoundingId===pending.targetDoctrineFoundingId))fail('playerAvatar.pendingOrder.doctrineMaturity');
  }

  const rows=world.doctrineFoundings.foundings;
  if(!rows.some(row=>row.maturity)&&!world.sects.some(row=>row.inactiveSinceTick!==undefined))return;
  const people=new Map(world.cultivators.map(row=>[row.id,row]));
  const sects=new Map(world.sects.map(row=>[row.id,row]));
  const sites=new Map(world.locations.map(site=>[site.id,site]));
  const retired=new Set<string>();
  const byPrivateEvent=new Map<string,{tick:number;ids:string[]}>();
  const bind=(row:DoctrineFounding,tick:number,stage:string,ids:string[])=>{
    const key=`evt-${tick}-${row.id}-maturity-${stage}`;
    if(byPrivateEvent.has(key))fail('doctrineFoundings.maturity.eventKeys');
    byPrivateEvent.set(key,{tick,ids:[...new Set(ids)]});
  };
  for(const row of rows){
    if(!row.maturity)continue;
    const {latestHazards,lastTitle,support,offers,settlement}=row.maturity;
    const made=row.settlement?.tick;
    const outgoing=sects.get(row.independentSectId), parent=sects.get(row.parentSectId);
    if(made===undefined||row.status!=='established'||!outgoing||!parent||outgoing===parent)
      fail('doctrineFoundings.maturity.origin');
    const historic=(t:number)=>t>=made&&t<=world.tick;
    const sample=(sample:DoctrineMaturityHazardSample,siteId:string)=>{
      const site=sites.get(siteId);
      return !!site&&sample.siteId===siteId&&historic(sample.tick)&&sample.hazard.intensity>=2&&
        terrainTileAt(world,site.x,site.y)?.id===sample.hazard.tileId&&routeWarningHazardValid(world,sample.hazard,sample.tick);
    };
    const sequence=(samples:readonly DoctrineMaturityHazardSample[],siteId:string)=>samples.every((item,index)=>
      sample(item,siteId)&&(!index||samples[index-1].tick+1===item.tick));
    const proof=(s:DoctrineMaturitySupport)=>
      !!sites.get(s.siteId)&&historic(s.observedTick)&&(s.kind==='sustained_hazard'?
        s.samples.length===DOCTRINE_MATURITY_HAZARD_TICKS&&sequence(s.samples,s.siteId)&&s.samples.at(-1)?.tick===s.observedTick:
        historic(s.previousTick)&&s.previousTick+1===s.observedTick&&s.currentOwnerSectId!==outgoing.id&&
          (!s.currentOwnerSectId||sects.has(s.currentOwnerSectId)));
    if(latestHazards.length&&!sequence(latestHazards,latestHazards[0].siteId)||
      lastTitle&&(!sites.has(lastTitle.siteId)||!historic(lastTitle.tick))||
      support&&!proof(support))fail('doctrineFoundings.maturity.support');

    let previousClosed:number|undefined,active=0,merged=0;
    for(const offer of offers){
      const {openedTick,expiresTick,consents,status,closedTick,closedById,acceptedTick,memberIds,outgoingLeaderId,
        receivingLeaderId}=offer;
      const members=new Set(memberIds);
      const signs=new Set<string>();
      const audience=[...memberIds,receivingLeaderId];
      const between=(t:number)=>t>openedTick&&t<expiresTick&&t<=world.tick;
      if(!historic(openedTick)||expiresTick!==openedTick+DOCTRINE_MATURITY_OFFER_TICKS||
        previousClosed!==undefined&&openedTick<=previousClosed||!proof(offer.support)||
        openedTick<offer.support.observedTick||openedTick-offer.support.observedTick>DOCTRINE_MATURITY_SUPPORT_WINDOW||
        !sites.has(offer.receivingSiteId)||offer.receivingSiteId===offer.support.siteId||
        !Number.isSafeInteger(offer.wallet)||offer.scriptureId!==row.scriptureId||
        !memberIds.length||memberIds.some((id,index)=>!people.has(id)||index>0&&id<=memberIds[index-1])||
        !members.has(outgoingLeaderId)||members.has(receivingLeaderId)||!people.has(receivingLeaderId))
        fail('doctrineFoundings.maturity.offer');
      bind(row,openedTick,'offer',audience);
      for(const consent of consents){
        if(!between(consent.tick)||consent.tick>(closedTick??world.tick)||signs.has(consent.actorId)||
          !members.has(consent.actorId)||consent.actorId===outgoingLeaderId)fail('doctrineFoundings.maturity.consents');
        signs.add(consent.actorId);
        bind(row,consent.tick,`approve-${consent.actorId}`,[consent.actorId,outgoingLeaderId]);
      }
      if(acceptedTick!==undefined){
        if(!between(acceptedTick)||acceptedTick>(closedTick??world.tick))fail('doctrineFoundings.maturity.acceptance');
        bind(row,acceptedTick,'accept',audience);
      }
      if(status==='offered'){
        if(++active>1||offer!==offers.at(-1)||closedTick!==undefined||closedById!==undefined||
          world.tick>=expiresTick||settlement)fail('doctrineFoundings.maturity.open');
        continue;
      }
      if(closedTick===undefined||closedTick<openedTick||closedTick>world.tick)fail('doctrineFoundings.maturity.closed');
      previousClosed=closedTick;
      if(status==='merged'){
        if(++merged>1||offer!==offers.at(-1)||!between(closedTick)||closedById!==outgoingLeaderId||
          acceptedTick===undefined||acceptedTick>=closedTick||signs.size!==memberIds.length-1||
          consents.some(signature=>signature.tick>=closedTick)||!settlement||settlement.kind!=='merged'||
          settlement.tick!==closedTick||settlement.siteId!==offer.support.siteId||
          settlement.receivingSectId!==parent.id||settlement.transferredStones!==offer.wallet||
          settlement.transferredScriptureId!==offer.scriptureId||typeof settlement.scriptureAlreadyHeld!=='boolean'||
          !sameIds(settlement.memberIds,memberIds))fail('doctrineFoundings.maturity.merged');
      }else if(status==='withdrawn'){
        if(!between(closedTick)||closedById!==outgoingLeaderId)fail('doctrineFoundings.maturity.withdrawal');
      }else if(status==='declined'){
        if(!between(closedTick)||!closedById||closedById===outgoingLeaderId||
          closedById!==receivingLeaderId&&!members.has(closedById)||
          closedById===receivingLeaderId&&acceptedTick!==undefined)fail('doctrineFoundings.maturity.refusal');
      }else if(closedById!==undefined||(status==='expired'?closedTick<expiresTick:closedTick>=expiresTick)){
        fail('doctrineFoundings.maturity.lapse');
      }
      bind(row,closedTick,status,audience);
    }
    if(settlement){
      const site=sites.get(settlement.siteId), tile=site&&terrainTileAt(world,site.x,site.y);
      if(!historic(settlement.tick)||settlement.tick<=made||!site||
        outgoing.headquartersId!==site.id||outgoing.inactiveSinceTick!==settlement.tick||
        outgoing.leaderId!==undefined||outgoing.officeVacancy!==undefined||retired.has(outgoing.id)||
        world.cultivators.some(actor=>actor.alive&&actor.sectId===outgoing.id)||
        site.ownerSectId===outgoing.id||tile?.ownerSectId===outgoing.id||
        settlement.releasedTileId!==undefined&&settlement.releasedTileId!==tile?.id||
        settlement.retainedStones!==outgoing.spiritStones||
        settlement.kind==='merged'&&(merged!==1||outgoing.pavilion.some(copy=>copy.id===row.scriptureId)||
          settlement.tick===world.tick&&!parent.pavilion.some(copy=>copy.id===row.scriptureId&&copy.authorId===row.founderId)))fail('doctrineFoundings.maturity.settlement');
      if(settlement.kind==='dispersed'){
        if(!support||settlement.siteId!==support.siteId||settlement.tick<support.observedTick||
          settlement.tick-support.observedTick>DOCTRINE_MATURITY_SUPPORT_WINDOW||settlement.memberIds.length||
          settlement.transferredStones!==0||settlement.receivingSectId!==undefined||
          settlement.transferredScriptureId!==undefined||settlement.scriptureAlreadyHeld!==undefined||
          active||merged)fail('doctrineFoundings.maturity.dispersal');
        bind(row,settlement.tick,'dispersed',[row.founderId,...(row.settlement?.memberIds??[])]);
      }
      retired.add(outgoing.id);
    }
  }
  if(world.sects.some(sect=>sect.inactiveSinceTick!==undefined&&!retired.has(sect.id)))
    fail('doctrineFoundings.maturity.inactive');
  const prefix=/^evt-\d+-(doctrine-founding-school-.+-\d+)-maturity-/;
  const targetIncidents=new Set(rows.filter(row=>row.maturity).map(row=>row.id));
  const isPrivate=(item:{id:string})=>{const id=prefix.exec(item.id)?.[1];return !!id&&targetIncidents.has(id);};
  const seen=new Set<string>();
  for(const event of world.events){
    if(!isPrivate(event))continue;
    const proof=byPrivateEvent.get(event.id);
    if(!proof||seen.has(event.id)||event.tick!==proof.tick||event.category!=='diplomacy'||
      event.witnessScope!=='participants'||event.locationId!==undefined||!sameIds(event.actorIds,proof.ids))
      fail('doctrineFoundings.maturity.events');
    seen.add(event.id);
  }
  if(world.chronicleArchive.anchors.some(isPrivate)||world.chronicleArchive.chapters.some(ch=>ch.anchors.some(isPrivate))||
    world.coldHistory.chapters.some(ch=>ch.anchors.some(isPrivate)))fail('doctrineFoundings.maturity.publicArchive');
}
