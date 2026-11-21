import type { ResourceFlowAccount, VillageSupplyAgreement, VillageSupplyHazardProof, VillageSupplySigner, WorldState } from '../types/world';
import { flowActor, flowGranary, flowVillageSupplyLeg, sameFlowAccount } from './resourceFlowEngine';
import { supplyLegEndpoints, supplyLegOpen, supplyLegTile, VILLAGE_SUPPLY_FEE, VILLAGE_SUPPLY_OFFER_TICKS,
  VILLAGE_SUPPLY_QUANTITY, villageSupplyByVillage } from './villageSupplyAccounting';
import { VILLAGE_GRANARY_CAPACITY, VILLAGE_GRANARY_RECEIPT_LIMIT } from './villageGranaryEngine';
import { terrainTileAt } from './terrainEngine';

export function validateVillageSupplyHistory(world:WorldState, people:ReadonlySet<string>, fail:(path:string)=>never): void {
  const {agreements,nextId}=world.villageSupply;
  const villages=new Map(world.settlements.villages.map((row)=>[row.id,row]));
  const books=new Map(world.villageGranaries.granaries.map((row)=>[row.settlementId,row]));
  const locations=new Map(world.locations.map((row)=>[row.id,row]));
  const cells=new Map(world.terrain.tiles.map((row)=>[row.id,row]));
  const liveHazards=new Map(world.mapHazards.map((row)=>[row.id,row]));
  const ids=new Set<string>(), involved=new Set<string>();
  const expected=new Map<string, {
    id:string; tick:number; reason:string; kind:'consumption'|'transfer'|'loss'; good:'stone'|'earth_root';
    amount:number; participants:readonly string[]; from:ResourceFlowAccount; to?:ResourceFlowAccount;
  }>();
  type ExpectedFlow = typeof expected extends Map<string,infer Value> ? Value : never;
  const flowKey=(row:Pick<ExpectedFlow,'id'|'tick'|'reason'|'good'|'from'>) =>
    JSON.stringify([row.id,row.tick,row.reason,row.good,row.from.kind,row.from.id]);
  function signer(party:VillageSupplySigner, site:string, at:number):boolean {
    const rows=books.get(site)?.receipts;
    return Boolean(rows && people.has(party.actorId) && party.donationTick<=at &&
      (rows.some((row)=>row.tick===party.donationTick && row.actorId===party.actorId && row.kind===party.donationKind) ||
       rows.length===VILLAGE_GRANARY_RECEIPT_LIMIT && party.donationTick<=rows[0].tick));
  }
  function hazard(proof:VillageSupplyHazardProof,tile:string|undefined,tick:number):boolean {
    if(!tile || proof.tileId!==tile || proof.createdTick>=tick || proof.expiresTick<=tick) return false;
    const brush=Number(/^hazard-([1-9]\d*)-/.exec(proof.id)?.[1]);
    const lifespan=({meteor:3,beast_tide:4,cursed_miasma:6} as const)[proof.kind];
    const natural=proof.kind==='beast_tide' && proof.intensity===1 &&
      proof.id.startsWith(`natural-beast-tide-${proof.createdTick}-`) && proof.expiresTick===proof.createdTick+4;
    if(!natural && !(Number.isSafeInteger(brush) && brush<=world.interventionSequence &&
        proof.id===`hazard-${brush}-${tile}` && proof.expiresTick===proof.createdTick+lifespan)) return false;
    const exact=liveHazards.get(proof.id);
    return !exact || (['id','kind','tileId','createdTick','expiresTick','intensity'] as const).every((field)=>proof[field]===exact[field]);
  }
  function validateRoute(row:VillageSupplyAgreement,path:readonly string[]) {
    const from=villages.get(row.fromSettlementId),to=villages.get(row.toSettlementId);
    const origin=from&&locations.get(from.locationId), destination=to&&locations.get(to.locationId);
    if(!origin || !destination || path.length<2 || new Set(path).size!==path.length ||
        terrainTileAt(world,origin.x,origin.y)?.id!==path[0] || terrainTileAt(world,destination.x,destination.y)?.id!==path.at(-1))
      fail('villageSupply.agreements.path');
    for(let index=1;index<path.length;index++) {
      const a=cells.get(path[index-1]),b=cells.get(path[index]);
      if(!a || !b || Math.abs(a.col-b.col)+Math.abs(a.row-b.row)!==1) fail('villageSupply.agreements.path');
    }
  }

  for(const row of agreements) {
    const serial=Number(/^village-supply-([1-9]\d*)$/.exec(row.id)?.[1]);
    const funded=row.status==='active' || row.status==='completed';
    const open=row.status==='active' || row.status==='offered';
    const {fromSettlementId:from,toSettlementId:to,acceptedTick,closedTick}=row;
    if(ids.has(row.id) || !Number.isSafeInteger(serial) || serial>=nextId || from===to || !villages.has(from) || !villages.has(to) ||
        row.offeredTick>world.tick || row.expiresTick!==row.offeredTick+VILLAGE_SUPPLY_OFFER_TICKS || !signer(row.proposer,from,row.offeredTick) ||
        (open && (involved.has(from) || involved.has(to) || closedTick!==undefined)) ||
        (!open && (closedTick===undefined || closedTick<row.offeredTick || closedTick>world.tick)) ||
        (row.status==='offered' && world.tick>=row.expiresTick) ||
        (row.status==='expired' && (closedTick ?? 0)<row.expiresTick) ||
        (!funded && row.status!=='offered' && row.status!=='expired' && (closedTick ?? Infinity)>=row.expiresTick))
      fail('villageSupply.agreements.references');
    ids.add(row.id);
    if(open) {involved.add(from);involved.add(to);}
    if(!funded) {
      if(row.acceptor || acceptedTick!==undefined || row.path || row.legs) fail('villageSupply.agreements.unfunded');
      continue;
    }

    const {acceptor,path,legs}=row;
    if(!acceptor || acceptedTick===undefined || acceptedTick<=row.offeredTick || acceptedTick>=row.expiresTick || acceptedTick>world.tick ||
        acceptor.actorId===row.proposer.actorId || !signer(acceptor,to,acceptedTick) || !path || legs?.length!==2 ||
        legs[0].good!=='earth_root' || legs[1].good!=='stone') return fail('villageSupply.agreements.accepted');
    validateRoute(row,path);
    const participants=[row.proposer.actorId,acceptor.actorId], end=path.length-1;
    const add=(f:Omit<ExpectedFlow,'id'|'participants'>) => {
      const draft={...f,id:row.id,participants}; expected.set(flowKey(draft),draft);
    };
    for(const actorId of participants) add({tick:acceptedTick,reason:'village_supply_transport',kind:'consumption',good:'stone',
      amount:VILLAGE_SUPPLY_FEE,from:flowActor(actorId)});
    for(const leg of legs) {
      const {good,checkpoint,lastAdvancedTick,turnback,settledTick,loss}=leg;
      const unresolved=supplyLegOpen(leg);
      if(lastAdvancedTick<acceptedTick || lastAdvancedTick>world.tick || checkpoint>end || checkpoint>lastAdvancedTick-acceptedTick ||
          (unresolved ? settledTick!==undefined : settledTick!==lastAdvancedTick || lastAdvancedTick<=acceptedTick) ||
          (leg.phase==='outbound' && (checkpoint>=end || turnback)) ||
          (leg.phase==='delivered' && (checkpoint!==end || turnback)) ||
          (leg.phase==='returning' && (!turnback || checkpoint<=0)) ||
          (leg.phase==='returned' && (!turnback || checkpoint!==0)) ||
          (leg.phase==='lost' ? !loss || !hazard(loss,supplyLegTile(row,leg),lastAdvancedTick) ||
            loss.kind!=='beast_tide' || loss.intensity!==3 : loss!==undefined))
        fail('villageSupply.legs.checkpoint');
      if(turnback && (turnback.tick<=acceptedTick || turnback.tick>lastAdvancedTick || turnback.checkpoint<checkpoint ||
          turnback.checkpoint>end || turnback.checkpoint>turnback.tick-acceptedTick ||
          (turnback.cause==='destination_closed' ? (turnback.checkpoint!==end || turnback.hazard!==undefined) :
            (!turnback.hazard || !hazard(turnback.hazard,supplyLegTile(row,leg,turnback.checkpoint+1),turnback.tick) ||
             turnback.hazard.kind==='beast_tide' && turnback.hazard.intensity===3))))
        fail('villageSupply.legs.turnback');
      const {source,destination}=supplyLegEndpoints(row,good);
      const amount=VILLAGE_SUPPLY_QUANTITY[good], holding=flowVillageSupplyLeg(row.id,good);
      add({tick:acceptedTick,reason:'village_supply_dispatch',kind:'transfer',good,amount,from:flowGranary(source),to:holding});
      if(settledTick===undefined) continue;
      if(leg.phase==='lost') add({tick:settledTick,reason:'village_supply_loss',kind:'loss',good,amount,from:holding});
      else add({tick:settledTick,reason:leg.phase==='delivered'?'village_supply_arrival':'village_supply_return',kind:'transfer',
        good,amount,from:holding,to:flowGranary(leg.phase==='delivered'?destination:source)});
    }
    const pending=legs.some(supplyLegOpen);
    if(pending!==(row.status==='active') || (!pending && closedTick!==Math.max(...legs.map((leg)=>leg.settledTick ?? -1))))
      fail('villageSupply.agreements.closure');
  }

  for(const [siteId,{reserveRoots,reserveStones}] of villageSupplyByVillage(world)) {
    const book=books.get(siteId);
    if(!book || book.roots+reserveRoots>VILLAGE_GRANARY_CAPACITY.roots || book.stones+reserveStones>VILLAGE_GRANARY_CAPACITY.stones)
      fail('villageSupply.agreements.reservedCapacity');
  }
  const present=new Set<string>(), complete=new Set<number>();
  for(const month of world.resourceFlow.months) {
    if(month.totalEntries===month.entries.length) complete.add(month.tick);
    for(const entry of month.entries) {
      const from='from' in entry?entry.from:undefined, to='to' in entry?entry.to:undefined;
      if(entry.mechanism!=='village_supply' && from?.kind!=='village_supply' && to?.kind!=='village_supply') continue;
      if(entry.mechanism!=='village_supply' || !from || (entry.good!=='stone' && entry.good!=='earth_root'))
        return fail('villageSupply.journal.field');
      const key=flowKey({id:entry.refId,tick:entry.tick,reason:entry.reason,good:entry.good,from});
      const target=expected.get(key);
      if(!target || present.has(key) || target.kind!==entry.kind || target.amount!==entry.amount ||
          (target.to ? (!to || !sameFlowAccount(target.to,to)) : to!==undefined) ||
          entry.visibility.kind!=='participants' || entry.visibility.actorIds.length!==target.participants.length ||
          !target.participants.every((id)=>entry.visibility.kind==='participants' && entry.visibility.actorIds.includes(id)))
        return fail('villageSupply.journal.custody');
      present.add(key);
    }
  }
  for(const [key,row] of expected) if(complete.has(row.tick) && !present.has(key)) fail('villageSupply.journal.missing');
}
