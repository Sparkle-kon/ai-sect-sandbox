import { validateLastRosterSave } from '../lastRosterProof';
import { validateBanquetSeatSave } from '../banquetSeatProof';
import { validateNightDoorSave } from '../nightDoorProof';
import { validateReliefHomecomingSave } from '../reliefHomecomingProof';
import { validateBoundaryGapSave } from '../boundaryGapProof';
import { validateAbandonedQuarterSave } from '../abandonedQuarterProof';
import { validateFurnaceEmergencySave } from '../furnaceEmergencyProof';
import { validateApprenticeshipReunionSave } from '../apprenticeshipReunion';
import { validFrontierNightHuntSave } from '../frontierNightHunt';
import { validateUpperArrayFieldLocal } from '../upperArrayFieldLocalValidation';
import { upperArrayFieldTradeCustody, verifyUpperArrayFieldTradeAgreement, verifyUpperArrayFieldTradeJournal } from '../upperArrayFieldTradeEngine';
import { validateFrontierDrylandLocal } from '../frontierDrylandLocalValidation';
import { verifyFrontierDrylandTradeAgreement, verifyFrontierDrylandTradeJournal, frontierDrylandTradeCustody } from '../frontierDrylandTradeEngine';
import { verifyFrontierPortTradeAgreement, portTradeLocalCustody } from '../frontierPortTradeEngine';
import { validateFrontierPortLocal } from '../frontierPortLocalValidation';
import { validateFrontierMovement } from '../storageFrontierValidation';
import { verifyFrontierTradeAgreement, frontierTradeProductionCustody } from '../frontierTradeEngine';
import { validateFrontierProduction } from '../frontierProductionValidation';
import type { WorldState } from '../../types/world';
import { fail } from './primitives';
import { unique } from './semanticShared';

export function validateFrontier(
  w: WorldState,
): void {
  const fieldTrade=w.upperArrayField?.trade;
  if(fieldTrade){
    if(!fieldTrade.agreements.length||(fieldTrade.lastAdvancedTick??0)>w.tick||
      fieldTrade.nextId!==fieldTrade.agreements.length+1)fail('upperArrayField.trade.lifecycle');
    const lastByParty=new Map<string,number>();
    let previousOffered=0;
    for(const [index,row] of fieldTrade.agreements.entries()){
      if(row.id!==`upper-array-trade-${index+1}`||row.offeredTick<previousOffered||
        !verifyUpperArrayFieldTradeAgreement(w,row))fail('upperArrayField.trade.evidence');
      previousOffered=row.offeredTick;
      for(const actorId of [row.sellerId,row.buyerId]){
        if((lastByParty.get(actorId)??0)>=row.offeredTick)fail('upperArrayField.trade.doubleParty');
        lastByParty.set(actorId,row.closedTick??Infinity);
      }
    }
  }
  if(!verifyUpperArrayFieldTradeJournal(w))fail('upperArrayField.trade.journal');
  validateUpperArrayFieldLocal(w,upperArrayFieldTradeCustody(w),fail);
  validateFrontierMovement(w,fail);
  validFrontierNightHuntSave(w,fail);
  const frontierTrade=w.frontier?.trade;
  if(frontierTrade){
    if(!frontierTrade.agreements.length||(frontierTrade.lastAdvancedTick??0)>w.tick)fail('frontier.trade.lifecycle');
    unique(frontierTrade.agreements,row=>row.id,'frontier.trade.id');
    const openParties=new Set<string>();
    for(const agreement of frontierTrade.agreements){
      const serial=/^frontier-trade-([1-9][0-9]*)$/u.exec(agreement.id);
      if(!serial||Number(serial[1])>=frontierTrade.nextId||!verifyFrontierTradeAgreement(w,agreement))
        fail('frontier.trade.evidence');
      if(agreement.status==='offered'||agreement.status==='accepted'||agreement.status==='returning')for(const id of [agreement.northActorId,agreement.southActorId]){
        if(openParties.has(id))fail('frontier.trade.doubleParty');
        openParties.add(id);
      }
    }
  }
  validateFrontierProduction(w,frontierTradeProductionCustody(w),fail);
  const coast=w.frontier?.port?.trade;
  if(coast){
    if(!coast.agreements.length||(coast.lastAdvancedTick??0)>w.tick)fail('frontier.port.trade.lifecycle');
    unique(coast.agreements,row=>row.id,'frontier.port.trade.id');
    const openParties=new Set<string>();
    for(const agreement of coast.agreements){
      const serial=/^frontier-port-trade-([1-9][0-9]*)$/u.exec(agreement.id);
      if(!serial||Number(serial[1])>=coast.nextId||!verifyFrontierPortTradeAgreement(w,agreement))fail('frontier.port.trade.evidence');
      if(agreement.status==='offered'||agreement.status==='signed'||agreement.status==='shipping')for(const actorId of [agreement.sellerId,agreement.buyerId]){
        if(openParties.has(actorId))fail('frontier.port.trade.doubleParty');
        openParties.add(actorId);
      }
    }
  }
  validateFrontierPortLocal(w,portTradeLocalCustody(w),fail);
  const drylandTrade=w.frontier?.drylands?.trade;
  if(drylandTrade){
    if(!drylandTrade.agreements.length||(drylandTrade.lastAdvancedTick??0)>w.tick)fail('frontier.drylands.trade.lifecycle');
    unique(drylandTrade.agreements,row=>row.id,'frontier.drylands.trade.id');
    const openParties=new Set<string>();
    for(const agreement of drylandTrade.agreements){
      const serial=/^frontier-dryland-trade-([1-9][0-9]*)$/u.exec(agreement.id);
      if(!serial||Number(serial[1])>=drylandTrade.nextId||!verifyFrontierDrylandTradeAgreement(w,agreement))
        fail('frontier.drylands.trade.evidence');
      if(agreement.status==='offered'||agreement.status==='accepted'||agreement.status==='returning'){
        for(const actorId of [agreement.westActorId,agreement.ridgeActorId]){
          if(openParties.has(actorId))fail('frontier.drylands.trade.doubleParty');
          openParties.add(actorId);
        }
      }
    }
  }
  validateFrontierDrylandLocal(w,frontierDrylandTradeCustody(w),fail);
  validateLastRosterSave(w,fail);
  validateBanquetSeatSave(w,fail);
  validateNightDoorSave(w,fail);
  validateReliefHomecomingSave(w,fail);
  validateBoundaryGapSave(w,fail);
  validateAbandonedQuarterSave(w,fail);
  validateFurnaceEmergencySave(w,fail);
  validateApprenticeshipReunionSave(w,fail);
  if(!verifyFrontierDrylandTradeJournal(w))fail('frontier.drylands.trade.journal');
}
