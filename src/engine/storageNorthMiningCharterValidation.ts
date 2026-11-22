import type {NorthMiningCharter,VillageSupplyAgreement,WorldState} from '../types/world';
import {supplyLegTile} from './villageSupplyAccounting';
import {terrainTileAt} from './terrainEngine';
import {WATER_VEIN_SITE,WATER_VEIN_TILES,waterVeinPhase} from './waterVeinTerms';

const CHARTER_TERM=6, DETOUR_COST=24;
const MARKET='village-loc-market', NORTH='village-loc-vein-north';
const REROUTED=new Set<string>(WATER_VEIN_TILES.slice(1));
const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((item,i)=>item===b[i]);
const validSerial=(id:string,prefix:string,next:number)=>{
  const serial=id.startsWith(prefix)?id.slice(prefix.length):'';
  return /^[1-9][0-9]*$/u.test(serial)&&Number.isSafeInteger(Number(serial))&&Number(serial)<next;
};

export function validateNorthMiningCharters(world:WorldState,fail:(path:string)=>never):void{
  const current=world.northMiningCharters;
  const tagged=world.villageSupply.agreements.filter(row=>row.northMiningCharterId!==undefined);
  const flow=world.resourceFlow.months.flatMap(month=>month.entries.filter(row=>row.mechanism==='north_mining_charter'));
  if(!current){
    if(tagged.length||flow.length)fail('northMiningCharters.missing');
    return;
  }
  const ledger=world.coldWaterVein;
  const tiles=new Map(world.terrain.tiles.map(row=>[row.id,row]));
  const villages=new Map(world.settlements.villages.map(row=>[row.id,row]));
  const locations=new Map(world.locations.map(row=>[row.id,row]));
  const people=new Map(world.cultivators.map(row=>[row.id,row]));
  const sects=new Set(world.sects.map(row=>row.id));
  const plots=new Map(world.seedCulture.plots.map(row=>[row.id,row]));
  const openings=new Map(ledger?.openings.map(row=>[row.id,row]));
  const wells=new Map(world.villageWorks.projects.map(row=>[row.id,row]));
  const digs=new Map(ledger?.mining.map(row=>[row.id,row]));
  const households=new Map(world.households.groups.map(row=>[row.id,row]));
  const roster=new Map(world.households.members.map(row=>[row.volunteerId,row]));
  const charterById=new Map<string,NorthMiningCharter>();
  const mutualSupply=new Map(world.villageSupply.agreements.map(row=>[row.id,row]));
  const safeTick=(tick:number)=>tick>=1&&tick<=world.tick;
  const villageTile=(id:string)=>{
    const address=villages.get(id)?.locationId;
    const place=address&&locations.get(address);
    return place?terrainTileAt(world,place.x,place.y)?.id:undefined;
  };
  const goesBetween=(path:string[],from:string,to:string)=>{
    if(path.length<2||new Set(path).size!==path.length||path[0]!==villageTile(from)||path.at(-1)!==villageTile(to))return false;
    return path.every((id,i)=>{
      const here=tiles.get(id),prior=i>0?tiles.get(path[i-1]):undefined;
      return !!here&&(i===0||!!prior&&Math.abs(here.col-prior.col)+Math.abs(here.row-prior.row)===1);
    });
  };
  let previous=0,pending=false;
  for(const row of current.charters){
    const opening=openings.get(row.openingId),well=wells.get(row.wellProjectId),plot=plots.get(row.plotId),mine=digs.get(row.miningReceiptId);
    if(!ledger||!safeTick(row.proposedTick)||row.proposedTick<=previous||row.id!==`north-mining-charter-${row.proposedTick}`||
      row.expiresTick!==row.proposedTick+CHARTER_TERM||row.siteId!==WATER_VEIN_SITE||row.settlementId!==ledger.settlementId||
      !people.has(row.proposerId)||!sects.has(row.sponsorSectId)||!opening||opening.wellProjectId!==row.wellProjectId||
      opening.sectId!==row.sponsorSectId||!well||well.kind!=='well'||well.status!=='completed'||well.settlementId!==row.settlementId||
      row.year<1||row.year>world.year||row.year===world.year&&row.month>world.month||
      !safeTick(row.fieldObservedTick)||row.fieldObservedTick>row.proposedTick||
      row.fieldDeficit!==waterVeinPhase(opening,row.fieldObservedTick).fieldDeficit||
      !validSerial(row.plotId,'seed-plot-',world.seedCulture.nextPlotId)||
      plot&&(plot.siteId!==row.siteId||!plot.weather.some(sample=>sample.tick===row.fieldObservedTick&&sample.waterDeficit===row.fieldDeficit))||
      !mine||mine.tick<row.fieldObservedTick||mine.tick>row.proposedTick||waterVeinPhase(opening,mine.tick).mineYield!==1||
      row.status==='proposed'&&(pending||world.tick>=row.expiresTick)||
      row.status==='expired'&&world.tick<row.expiresTick)fail('northMiningCharters.origin');
    pending||=row.status==='proposed';
    previous=row.proposedTick;charterById.set(row.id,row);
    const signatureIds=new Set<string>();let previousSignature=row.proposedTick;
    for(const [index,sig] of row.signatures.entries()){
      if(sig.role!==(['household','miner','sect'] as const)[index]||signatureIds.has(sig.actorId)||!people.has(sig.actorId)||
        !safeTick(sig.tick)||sig.tick<=previousSignature||sig.tick>=row.expiresTick)fail('northMiningCharters.signatures');
      if(sig.role==='household'){
        const member=roster.get(sig.volunteerId);
        const person=people.get(sig.actorId);
        const enrollment=world.settlements.records.find(record=>record.kind==='recruitment'&&record.volunteerId===sig.volunteerId&&
          record.cultivatorId===sig.actorId&&record.settlementId===row.settlementId);
        // Native death updates the roster's settledTick. It does not erase an actual earlier signature.
        const validCurrent=member?.status==='recruited'&&member.settledTick===sig.recruitedTick;
        const validHistorical=member?.status==='deceased'&&person&&(!person.alive||person.hp<=0)&&
          member.settledTick!==undefined&&member.settledTick>=sig.tick&&member.settledTick<=world.tick;
        if(!member||(!validCurrent&&!validHistorical)||member.recruitedId!==sig.actorId||
          member.householdId!==sig.householdId||member.settlementId!==row.settlementId||
          sig.recruitedTick<member.registeredTick||sig.recruitedTick>sig.tick||
          enrollment&&enrollment.tick!==sig.recruitedTick||
          !households.get(sig.householdId)?.presences.some(site=>site.settlementId===row.settlementId))
          fail('northMiningCharters.signatures.household');
      }else if(sig.role==='miner'){
        if(sig.miningReceiptId!==row.miningReceiptId||digs.get(sig.miningReceiptId)?.actorId!==sig.actorId)
          fail('northMiningCharters.signatures.miner');
      }else if(sig.sectId!==row.sponsorSectId)fail('northMiningCharters.signatures.sponsor');
      signatureIds.add(sig.actorId);previousSignature=sig.tick;
    }
    if(row.stance==='detour'){
      const route=row.route;
      if(!route||route.fromSettlementId!==MARKET||route.toSettlementId!==NORTH||
        !goesBetween(route.originalTiles,MARKET,NORTH)||!goesBetween(route.detourTiles,MARKET,NORTH)||
        !route.originalTiles.some(id=>REROUTED.has(id))||route.detourTiles.some(id=>REROUTED.has(id))||
        !route.detourTiles.some(id=>!route.originalTiles.includes(id)))fail('northMiningCharters.route');
    }else if(row.route||row.firstPassage)fail('northMiningCharters.route.extra');
    if(row.status==='ratified'){
      if(row.signatures.length!==3||row.ratifiedTick!==previousSignature||row.paidStones!==(row.stance==='detour'?DETOUR_COST:0))
        fail('northMiningCharters.ratification');
    }else if(row.signatures.length>2||row.ratifiedTick!==undefined||row.paidStones!==undefined||row.firstPassage)
      fail('northMiningCharters.pending');
  }
  const matching=(agreement:VillageSupplyAgreement,charter:NorthMiningCharter)=>{
    const route=charter.route;
    if(!route||agreement.acceptedTick===undefined||charter.ratifiedTick===undefined||agreement.acceptedTick<charter.ratifiedTick||
      !agreement.path||!agreement.legs||!agreement.acceptor)return false;
    const direct=route.fromSettlementId===agreement.fromSettlementId&&route.toSettlementId===agreement.toSettlementId;
    const reverse=route.fromSettlementId===agreement.toSettlementId&&route.toSettlementId===agreement.fromSettlementId;
    return (direct||reverse)&&same(agreement.path,direct?route.detourTiles:[...route.detourTiles].reverse())&&
      !current.charters.some(row=>row.status==='ratified'&&(row.ratifiedTick??Infinity)>charter.ratifiedTick!&&
        (row.ratifiedTick??Infinity)<agreement.acceptedTick!); // Same-month signatures can occur after acceptance.
  };
  for(const agreement of tagged){
    const charter=charterById.get(agreement.northMiningCharterId!);
    if(!charter||charter.status!=='ratified'||charter.stance!=='detour'||!matching(agreement,charter))fail('northMiningCharters.boundRoute');
  }
  for(const charter of current.charters){
    const pass=charter.firstPassage,route=charter.route;
    if(!pass)continue;
    const agreement=mutualSupply.get(pass.agreementId);
    const leg=agreement?.legs?.find(row=>row.good===pass.good);
    if(!route||!safeTick(pass.tick)||pass.tick<=(charter.ratifiedTick??Infinity)||
      !validSerial(pass.agreementId,'village-supply-',world.villageSupply.nextId)||
      pass.checkpoint>=route.detourTiles.length||!route.detourTiles.includes(pass.tileId)||
      route.originalTiles.includes(pass.tileId)||
      agreement&&(agreement.northMiningCharterId!==charter.id||!matching(agreement,charter)||!leg||
        pass.tick!==(agreement.acceptedTick??Infinity)+pass.checkpoint||
        supplyLegTile(agreement,leg,pass.checkpoint)!==pass.tileId||leg.lastAdvancedTick<pass.tick||
        leg.turnback!==undefined&&leg.turnback.tick<=pass.tick||
        leg.phase==='lost'&&(leg.settledTick??Infinity)<=pass.tick))fail('northMiningCharters.firstPassage');
  }
  const paid=new Set<string>();
  for(const entry of flow){
    const charter=charterById.get(entry.refId),last=charter?.signatures.at(-1);
    if(!charter||charter.stance!=='detour'||charter.status!=='ratified'||last?.role!=='sect'||paid.has(entry.refId)||
      entry.tick!==charter.ratifiedTick||entry.kind!=='consumption'||entry.from.kind!=='sect'||entry.from.id!==charter.sponsorSectId||
      entry.amount!==DETOUR_COST||entry.good!=='stone'||entry.reason!=='north_detour_paid'||entry.visibility.kind!=='participants'||
      !entry.visibility.actorIds.includes(last.actorId)||
      entry.visibility.actorIds.some(id=>!charter.signatures.some(sig=>sig.actorId===id)))fail('northMiningCharters.payment');
    paid.add(entry.refId);
  }
  const fullBooks=new Set(world.resourceFlow.months.filter(month=>month.totalEntries===month.entries.length).map(row=>row.tick));
  if(current.charters.some(row=>row.ratifiedTick!==undefined&&row.stance==='detour'&&fullBooks.has(row.ratifiedTick)&&!paid.has(row.id)))
    fail('northMiningCharters.payment.missing');
}
