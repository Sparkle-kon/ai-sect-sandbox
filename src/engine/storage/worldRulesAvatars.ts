import type { Rule } from './primitives';
import { FRONTIER_ANCHOR_IDS, FRONTIER_SITE_IDS } from '../frontierTerms';
import { FRONTIER_PRODUCTION_MOVES } from '../frontierProductionTerms';
import { FRONTIER_DRYLAND_MOVES } from '../frontierDrylandTerms';
import { FRONTIER_PORT_LOCAL_MOVES } from '../frontierPortTerms';
import { NORTH_GATE_RENEWAL_MOVES } from '../northGateRenewalTerms';
import { UPPER_ARRAY_FIELD_COUNCIL, UPPER_ARRAY_FIELD_MOVES, UPPER_ARRAY_FIELD_SITE_IDS } from '../upperArrayFieldTerms';
import { UPPER_ARRAY_FIELD_LOCAL_MOVES } from '../upperArrayFieldLocalTerms';
import { UPPER_PASSAGE_PATH } from '../upperPassageTerms';
import { structure, oid, otick, tick, percentage, optional, id, one, arr, text } from './primitives';
import { ringAudience, doctrineMaturityMove, mode, intent, source } from './schemaFields';

export const worldRulesAvatars: Record<string, Rule> = {
  playerAvatar:structure({possessedId:oid,possessionUntilTick:otick,switchAvailableTick:tick,essence:percentage,lastRefreshTick:tick,
    audience:optional(ringAudience),
    pendingOrder:optional((value,path) => {
      const order = value as {action?:unknown;danxiaMedicineMove?:unknown;danxiaReviewMove?:unknown;doctrineFoundingMove?:unknown;workshopReleaseMove?:unknown} | null;
      const fixed = {actorId:id,queuedTick:tick};
      if(order?.action==='SALVAGE_ARTIFACT')
        return structure({...fixed,action:one('SALVAGE_ARTIFACT'),targetArtifactId:id,targetLocationId:id})(value,path);
      if(order?.action==='FRONTIER'){
        const clause={...fixed,action:one('FRONTIER')};
        if('frontierMove' in order&&order.frontierMove==='exit')
          return structure({...clause,frontierMove:one('exit'),targetFrontierSiteId:one(...FRONTIER_ANCHOR_IDS)})(value,path);
        return structure({...clause,frontierMove:one('enter','travel','settle'),targetFrontierSiteId:one(...FRONTIER_SITE_IDS)})(value,path);
      }
      if(order?.action==='FRONTIER_PRODUCTION')return structure({...fixed,action:one('FRONTIER_PRODUCTION'),
        frontierProductionMove:one(...FRONTIER_PRODUCTION_MOVES),targetFrontierSiteId:one(...FRONTIER_SITE_IDS)})(value,path);
      if(order?.action==='FRONTIER_DRYLAND'){
        const clause={...fixed,action:one('FRONTIER_DRYLAND'),targetFrontierSiteId:one(...FRONTIER_SITE_IDS)};
        return 'frontierDrylandMove' in order&&order.frontierDrylandMove==='feed_herd'?
          structure({...clause,frontierDrylandMove:one('feed_herd'),frontierDrylandFeed:one('root','salt')})(value,path):
          structure({...clause,frontierDrylandMove:one(...FRONTIER_DRYLAND_MOVES.filter(row=>row!=='feed_herd'))})(value,path);
      }
      if(order?.action==='FRONTIER_DRYLAND_TRADE'){
        const clause={...fixed,action:one('FRONTIER_DRYLAND_TRADE')};
        return 'frontierDrylandTradeMove' in order&&order.frontierDrylandTradeMove==='propose'?
          structure({...clause,frontierDrylandTradeMove:one('propose'),targetCultivatorId:id})(value,path):
          structure({...clause,frontierDrylandTradeMove:one('accept','load'),targetFrontierDrylandTradeId:id})(value,path);
      }
      if(order?.action==='FRONTIER_PORT')return structure({...fixed,action:one('FRONTIER_PORT'),
        frontierPortMove:one(...FRONTIER_PORT_LOCAL_MOVES),targetFrontierSiteId:one(...FRONTIER_SITE_IDS)})(value,path);
      if(order?.action==='FRONTIER_PORT_TRADE'){
        const clause={...fixed,action:one('FRONTIER_PORT_TRADE')};
        if('frontierPortTradeMove' in order&&order.frontierPortTradeMove==='propose')
          return structure({...clause,frontierPortTradeMove:one('propose'),targetCultivatorId:id})(value,path);
        return structure({...clause,frontierPortTradeMove:one('accept','load','receive','recover_roots','collect_roots'),
          targetFrontierPortTradeId:id})(value,path);
      }
      if(order?.action==='FRONTIER_TRADE'){
        const clause={...fixed,action:one('FRONTIER_TRADE')};
        if('frontierTradeMove' in order&&order.frontierTradeMove==='propose')
          return structure({...clause,frontierTradeMove:one('propose'),targetCultivatorId:id})(value,path);
        return structure({...clause,frontierTradeMove:one('accept','load','load_winter'),targetFrontierTradeId:id})(value,path);
      }
      if(order?.action==='NORTH_GATE_RENEWAL')return structure({...fixed,action:one('NORTH_GATE_RENEWAL'),
        northGateRenewalMove:one(...NORTH_GATE_RENEWAL_MOVES),targetNorthGateRenewalId:id})(value,path);
      if(order?.action==='SCRIBE_COMMISSION'){
        const fields={...fixed,action:one('SCRIBE_COMMISSION')};
        return 'scribeCommissionMove' in order&&order.scribeCommissionMove==='offer'
          ?structure({...fields,scribeCommissionMove:one('offer'),targetCultivatorId:id,targetChronicleSourceId:id})(value,path)
          :structure({...fields,scribeCommissionMove:one('accept','decline','withdraw','verify','deliver'),targetScribeCommissionId:id})(value,path);
      }
      if(order?.action==='CRAFT_TRAINING'){
        const fields={...fixed,action:one('CRAFT_TRAINING')};
        return 'craftTrainingMove' in order&&order.craftTrainingMove==='offer'
          ?structure({...fields,craftTrainingMove:one('offer'),targetCultivatorId:id,targetCraftTraineeId:id})(value,path)
          :structure({...fields,craftTrainingMove:one('join','decline','blank','finish','withdraw'),targetCraftTrainingId:id})(value,path);
      }
      if(order?.action==='CIVIC_MEMORIAL')return structure({...fixed,action:one('CIVIC_MEMORIAL'),
        civicMemorialMove:one('append_relief'),targetCivicMemorialId:id,targetCivicDeedId:id})(value,path);
      if(order?.action==='MARKET_FREIGHT'){
        const fields={...fixed,action:one('MARKET_FREIGHT')};
        return 'marketFreightMove' in order&&order.marketFreightMove==='offer'
          ?structure({...fields,marketFreightMove:one('offer'),targetShipmentId:id,targetCultivatorId:id})(value,path)
          :structure({...fields,marketFreightMove:one('accept','decline','withdraw'),targetEscortId:id})(value,path);
      }
      if(order?.action==='DISASTER_SHELTER'){
        const fields={...fixed,action:one('DISASTER_SHELTER')};
        return 'disasterShelterMove' in order&&order.disasterShelterMove==='offer'
          ?structure({...fields,disasterShelterMove:one('offer'),targetCultivatorId:id})(value,path)
          :structure({...fields,disasterShelterMove:one('accept','decline','withdraw','return'),targetDisasterShelterId:id})(value,path);
      }
      if(order?.action==='WAYPOST_MEAL'){
        const fields={...fixed,action:one('WAYPOST_MEAL')};
        return 'waypostMealMove' in order&&order.waypostMealMove==='offer'
          ?structure({...fields,waypostMealMove:one('offer'),targetCultivatorId:id})(value,path)
          :structure({...fields,waypostMealMove:one('accept','decline','withdraw'),targetWaypostMealId:id})(value,path);
      }
      if(order?.action==='WORKSHOP_ESTATE')return structure({...fixed,action:one('WORKSHOP_ESTATE'),
        workshopEstateMove:one('offer','accept','decline'),targetWorkshopId:id})(value,path);
      if(order?.action==='WORKSHOP_RELEASE'){
        const fields={...fixed,action:one('WORKSHOP_RELEASE'),targetWorkshopId:id};
        return order.workshopReleaseMove==='propose'?
          structure({...fields,workshopReleaseMove:one('propose')})(value,path):
          structure({...fields,workshopReleaseMove:one('accept','decline'),targetWorkshopReleaseId:id})(value,path);
      }
      if(order?.action==='UPPER_ARRAY_FIELD'){
        const fields={...fixed,action:one('UPPER_ARRAY_FIELD')};
        return 'upperArrayFieldMove' in order&&order.upperArrayFieldMove==='exit'?
          structure({...fields,upperArrayFieldMove:one('exit'),targetUpperArrayFieldSiteId:one(UPPER_ARRAY_FIELD_COUNCIL)})(value,path):
          structure({...fields,upperArrayFieldMove:one(...UPPER_ARRAY_FIELD_MOVES.filter(move=>move!=='exit')),
            targetUpperArrayFieldSiteId:one(...UPPER_ARRAY_FIELD_SITE_IDS)})(value,path);
      }
      if(order?.action==='UPPER_ARRAY_FIELD_LOCAL')return structure({...fixed,action:one('UPPER_ARRAY_FIELD_LOCAL'),
        upperArrayFieldLocalMove:one(...UPPER_ARRAY_FIELD_LOCAL_MOVES),targetUpperArrayFieldSiteId:one('array-field-source','array-field-practice')})(value,path);
      if(order?.action==='UPPER_ARRAY_FIELD_TRADE'){
        const fields={...fixed,action:one('UPPER_ARRAY_FIELD_TRADE')};
        return 'upperArrayFieldTradeMove' in order&&order.upperArrayFieldTradeMove==='propose'?
          structure({...fields,upperArrayFieldTradeMove:one('propose'),targetCultivatorId:id})(value,path):
          structure({...fields,upperArrayFieldTradeMove:one('accept','load','settle','unload'),targetUpperArrayFieldTradeId:id})(value,path);
      }
      if(order?.action==='UPPER_PASSAGE')return structure({...fixed,action:one('UPPER_PASSAGE'),
        upperPassageMove:one('enter','advance','turnback','read','petition'),targetUpperPassageNodeId:one(...UPPER_PASSAGE_PATH)})(value,path);
      if(order?.action==='NORTH_WELL_REVIEW')return structure({...fixed,action:one('NORTH_WELL_REVIEW'),
        northWellReviewMove:one('keep','permit'),targetNorthMiningCharterId:id})(value,path);
      if(order?.action==='NORTH_MINING_CHARTER'){
        const clause={...fixed,action:one('NORTH_MINING_CHARTER')};
        if('northMiningMove' in order&&order.northMiningMove==='propose')
          return structure({...clause,northMiningMove:one('propose'),northMiningStance:one('seal','continue','detour')})(value,path);
        return structure({...clause,northMiningMove:one('sign'),targetNorthMiningCharterId:id})(value,path);
      }
      if(order?.action==='WATER_VEIN')return structure({...fixed,action:one('WATER_VEIN'),
        waterVeinMove:one('observe','open','mine'),targetLocationId:one('loc-vein-north')})(value,path);
      if(order?.action==='DOCTRINE_MATURITY')return structure({...fixed,action:one('DOCTRINE_MATURITY'),
        doctrineMaturityMove,targetDoctrineFoundingId:id})(value,path);
      if(order?.action==='DOCTRINE_FOUNDING'){
        const base={...fixed,action:one('DOCTRINE_FOUNDING')};
        if(order.doctrineFoundingMove==='propose')return structure({...base,doctrineFoundingMove:one('propose'),
          targetDoctrineSchoolId:id,targetRelocationId:id})(value,path);
        return structure({...base,doctrineFoundingMove:one('join','authorize','decline','withdraw','establish'),
          targetDoctrineFoundingId:id})(value,path);
      }
      if(order?.action==='DANXIA_REVIEW'){
        const base={...fixed,action:one('DANXIA_REVIEW'),targetDanxiaReviewId:id};
        if(order.danxiaReviewMove==='propose_switch')return structure({...base,danxiaReviewMove:one('propose_switch'),
          targetSettlementRecordId:id})(value,path);
        return structure({...base,danxiaReviewMove:one('propose_renew','refuse','accept','decline')})(value,path);
      }
      if(order?.action==='DANXIA_MEDICINE'){
        const action=one('DANXIA_MEDICINE'), move=order.danxiaMedicineMove;
        if(move==='retain')return structure({...fixed,action,danxiaMedicineMove:one('retain'),targetDanxiaShortageId:id})(value,path);
        if(move==='offer_ship')return structure({...fixed,action,danxiaMedicineMove:one('offer_ship'),targetDanxiaShortageId:id,
          targetCultivatorId:id})(value,path);
        return structure({...fixed,action,danxiaMedicineMove:one('brew','accept','decline','receive','recover'),targetDanxiaMedicineId:id})(value,path);
      }
      return structure({...fixed,action:one('REST','CULTIVATE')})(value,path);
    }),
    transcript:arr(72,structure({id,tick,mode,intent,targetCultivatorId:id,message:text,actorId:oid,reply:text,
      outcome:one('agreed','resisted','revealed','recruited'),source,effect:text}))}),
};
