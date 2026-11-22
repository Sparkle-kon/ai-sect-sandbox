import type { WorldState } from '../types/world';
import { northRouteFor,NORTH_MINING_SETTLEMENT,NORTH_MINING_SITE } from './northMiningCharterTerms';
import { NORTH_WELL_REVISIT_MONTHS } from './northWellRevisitTerms';

const same=(left:readonly string[],right:readonly string[])=>left.length===right.length&&left.every((id,i)=>id===right[i]);

/** Historical eligibility depends on a real old well AND a proved physically completed E35 passage. */
export function findNorthWellRevisitEvidence(world:WorldState,sourceCharterId?:string,executionTick=world.tick){
  const site=world.locations.find(row=>row.id===NORTH_MINING_SITE&&(row.type==='spirit_vein'||row.type==='sect_hq')&&row.spiritRoot==='水');
  const village=world.settlements.villages.find(row=>row.id===NORTH_MINING_SETTLEMENT&&row.locationId===site?.id);
  if(!site||!village)return undefined;
  const charters=world.northMiningCharters?.charters??[];
  for(let i=charters.length-1;i>=0;i--){
    const charter=charters[i], walked=charter.firstPassage;
    if(charter.status!=='ratified'||charter.stance!=='detour'||charter.signatures.length!==3||
      charter.siteId!==site.id||charter.settlementId!==village.id||!walked||
      (sourceCharterId!==undefined&&charter.id!==sourceCharterId))continue;
    const well=world.villageWorks.projects.find(row=>row.id===charter.wellProjectId&&row.settlementId===village.id&&row.kind==='well'&&
      row.status==='completed'&&row.settledTick!==undefined&&row.settledTick<=charter.proposedTick&&row.laborTotal===4);
    const opening=world.coldWaterVein?.openings.find(row=>row.id===charter.openingId&&row.wellProjectId===charter.wellProjectId&&
      row.openedTick<charter.proposedTick);
    const agreement=world.villageSupply.agreements.find(row=>row.id===walked.agreementId);
    const path=charter.route&&northRouteFor(charter,charter.route.fromSettlementId,charter.route.toSettlementId);
    const pathBack=charter.route&&northRouteFor(charter,charter.route.toSettlementId,charter.route.fromSettlementId);
    if(!well||!opening||!path||!pathBack||!walked.checkpoint||walked.checkpoint>=path.length||
      (charter.route?.originalTiles.includes(walked.tileId)??true))continue;
    const walkedTile=(route:readonly string[])=>route[walked.good==='earth_root'?walked.checkpoint:route.length-1-walked.checkpoint];
    let freightClosedTick:number|undefined;
    if(agreement){
      const acceptedPath=northRouteFor(charter,agreement.fromSettlementId,agreement.toSettlementId);
      if(agreement.northMiningCharterId!==charter.id||agreement.status!=='completed'||agreement.acceptedTick===undefined||
        agreement.closedTick===undefined||!agreement.path||!acceptedPath||!same(acceptedPath,agreement.path)||
        agreement.legs?.length!==2||agreement.legs.some(leg=>leg.phase!=='delivered')||
        walked.tick!==agreement.acceptedTick+walked.checkpoint||walked.tick>agreement.closedTick||walkedTile(acceptedPath)!==walked.tileId)continue;
      freightClosedTick=agreement.closedTick;
    }else{
      // A retained declaration/review already sealed a former native terminal source; never infer such a source anew.
      const law=world.northWellRevisitLaw;
      freightClosedTick=law?.sourceCharterId===charter.id?law.freightClosedTick:
        world.northWellRevisitReviews?.decisions.find(row=>row.sourceCharterId===charter.id)?.freightClosedTick;
      if(freightClosedTick===undefined||freightClosedTick<walked.tick||[path,pathBack].every(row=>walkedTile(row)!==walked.tileId))continue;
    }
    if(executionTick<freightClosedTick+NORTH_WELL_REVISIT_MONTHS)continue;
    const settlementHistory=world.villageEvolution.villages.find(row=>row.settlementId===village.id&&row.siteId===site.id);
    const town=settlementHistory?.changes.find(row=>row.to==='town'&&row.reason==='sustained_growth'&&
      row.tick>=freightClosedTick&&row.tick<=executionTick);
    return {site,village,charter,well,opening,agreement,walked,freightClosedTick,settlementHistory,town};
  }
  return undefined;
}
