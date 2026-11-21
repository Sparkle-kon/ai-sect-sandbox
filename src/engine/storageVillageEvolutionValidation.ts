import type { MortalSettlement, VillageEvolutionSample, VillageSupplyAgreement, WorldState } from '../types/world';
import {
  VILLAGE_EVOLUTION_LOW_STRESS, VILLAGE_EVOLUTION_MAX_ADULTS_PER_MOVE, VILLAGE_EVOLUTION_MIN_TOWN_POPULATION,
  VILLAGE_EVOLUTION_SAMPLE_COUNT, VILLAGE_EVOLUTION_SAMPLE_TICKS, VILLAGE_EVOLUTION_TOWN_STOCK_RATIO,
} from './villageEvolutionTerms';
import {supplyLegEndpoints} from './villageSupplyAccounting';
import {terrainTileAt} from './terrainEngine';

const same=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((row,i)=>row===b[i]);

export function validateVillageEvolutionHistory(world:WorldState,fail:(path:string)=>never):void {
  const {villages,migrations}=world.villageEvolution;
  if(!villages.length&&!migrations.length)return;
  const actualVillages=new Map(world.settlements.villages.map(village=>[village.id,village]));
  const migrationProofs=new Map(world.settlements.records.map(row=>[row.id,row]));
  const supply=new Map(world.villageSupply.agreements.map(row=>[row.id,row]));
  const wells=new Map(world.villageWorks.projects.map(row=>[row.id,row]));
  const houses=new Map(world.households.groups.map(row=>[row.id,row]));
  const census=new Map(world.villageCensuses.periods.map(row=>[row.tick,row]));
  const sites=new Map(world.locations.map(site=>[site.id,site]));
  const tiles=new Map(world.terrain.tiles.map(tile=>[tile.id,tile]));
  const ids=new Set<string>();
  const tileAt=(village:MortalSettlement)=>{
    const site=sites.get(village.locationId);
    return site&&terrainTileAt(world,site.x,site.y);
  };
  function historicPath(agreement:VillageSupplyAgreement,from:MortalSettlement,to:MortalSettlement,tick:number):string[]|undefined{
    const route=agreement.path;
    if(!route||route.length<2||!agreement.legs||agreement.acceptedTick===undefined)return undefined;
    const leg=agreement.legs.find(leg=>{
      const endpoints=supplyLegEndpoints(agreement,leg.good);
      return endpoints.source===from.id&&endpoints.destination===to.id&&leg.phase==='delivered'&&
        leg.settledTick!==undefined&&leg.settledTick>agreement.acceptedTick!&&leg.settledTick<tick&&leg.checkpoint===route.length-1;
    });
    if(!leg)return undefined;
    const path=leg.good==='earth_root'?route:[...route].reverse();
    if(path[0]!==tileAt(from)?.id||path.at(-1)!==tileAt(to)?.id||new Set(path).size!==path.length||
      path.some((id,i)=>{
        const here=tiles.get(id),prior=i>0?tiles.get(path[i-1]):undefined;
        return !here||i>0&&(!prior||Math.abs(here.row-prior.row)+Math.abs(here.col-prior.col)!==1);
      }))return undefined;
    return path;
  }
  const peer=(agreement:VillageSupplyAgreement,villageId:string)=>agreement.fromSettlementId===villageId?
    actualVillages.get(agreement.toSettlementId):agreement.toSettlementId===villageId?actualVillages.get(agreement.fromSettlementId):undefined;
  const townReady=(sample:VillageEvolutionSample)=>sample.usableWell&&sample.passableCorridors>=1&&
    sample.stress<=VILLAGE_EVOLUTION_LOW_STRESS&&sample.population>=VILLAGE_EVOLUTION_MIN_TOWN_POPULATION&&
    sample.population>=Math.ceil(sample.capacity*VILLAGE_EVOLUTION_TOWN_STOCK_RATIO);
  const isDeparture=(source:WorldState['settlements']['records'][number]|undefined,villageId:string,tick:number)=>
    !!source&&source.settlementId===villageId&&source.tick<=tick&&source.people>0&&
      ['migration','disaster','recruitment'].includes(source.kind);
  function validateSample(settlementId:string,sample:VillageEvolutionSample){
    const well=sample.wellId&&wells.get(sample.wellId);
    const village=actualVillages.get(settlementId)!;
    const route=sample.corridorAgreementId?supply.get(sample.corridorAgreementId):undefined;
    const other=route&&peer(route,settlementId);
    if((sample.passableCorridors>0)!==!!sample.corridorAgreementId||
      sample.passableCorridors>actualVillages.size-1||
      (sample.corridorAgreementId&&(!route||!other||!historicPath(route,village,other,sample.tick)&&
        !historicPath(route,other,village,sample.tick))))fail('villageEvolution.villages.corridor');
    if(sample.tick<1||sample.tick>world.tick||sample.tick%VILLAGE_EVOLUTION_SAMPLE_TICKS!==0||
      sample.juveniles+sample.namedRemaining>sample.population||sample.population>sample.capacity||
      sample.usableWell&&!well||well&&(well.kind!=='well'||well.settlementId!==settlementId||
        well.status!=='completed'||well.settledTick===undefined||well.settledTick>sample.tick)||
      sample.wellId!==undefined&&!well)fail('villageEvolution.villages.samples');
  }
  for(const row of villages){
    const village=actualVillages.get(row.settlementId);
    if(ids.has(row.settlementId)||!village||village.locationId!==row.siteId||village.name!==row.registeredName||
      row.samples.length>VILLAGE_EVOLUTION_SAMPLE_COUNT)fail('villageEvolution.villages.references');
    ids.add(row.settlementId);
    let previousSample:number|undefined;
    for(const sample of row.samples){
      if(previousSample!==undefined&&sample.tick!==previousSample+VILLAGE_EVOLUTION_SAMPLE_TICKS)fail('villageEvolution.villages.sampleClock');
      validateSample(row.settlementId,sample);
      previousSample=sample.tick;
    }
    let since=-1;
    let stage:'village'|'town'|'ruin'='village';
    for(const change of row.changes){
      if(change.tick<=since||change.tick>world.tick||change.from!==stage||change.from===change.to||
        (change.reason==='sustained_growth'?(change.from!=='village'||change.to!=='town'||change.population<VILLAGE_EVOLUTION_MIN_TOWN_POPULATION):
          change.reason==='depopulated'?(change.to!=='ruin'||change.population!==0):
          (change.from!=='ruin'||change.to!=='village'||change.population===0)))fail('villageEvolution.villages.change');
      const source=change.sourceRecordId?migrationProofs.get(change.sourceRecordId):undefined;
      if(change.tick%VILLAGE_EVOLUTION_SAMPLE_TICKS!==0)fail('villageEvolution.villages.changeClock');
      if(change.reason==='sustained_growth'){
        const samples=change.growthSamples;
        if(source||change.sourceRecordId||!samples||samples.length!==VILLAGE_EVOLUTION_SAMPLE_COUNT||
          !samples.every((sample,i)=>sample.tick===change.tick-(samples.length-1-i)*VILLAGE_EVOLUTION_SAMPLE_TICKS&&townReady(sample))||
          !townReady({...samples.at(-1)!,population:change.population}))fail('villageEvolution.villages.growthProof');
        for(const sample of samples){
          validateSample(row.settlementId,sample);
          const stillHere=row.samples.find(item=>item.tick===sample.tick);
          if(stillHere&&(['population','juveniles','namedRemaining','stress','capacity','wellId','usableWell',
            'passableCorridors','corridorAgreementId'] as const).some(key=>sample[key]!==stillHere[key]))
            fail('villageEvolution.villages.growthConflict');
        }
      } else if(change.growthSamples||
        (change.reason==='depopulated'?!isDeparture(source,row.settlementId,change.tick):
          !source||source.kind!=='migration'||source.targetSettlementId!==row.settlementId||source.tick!==change.tick||
          source.people<1||source.people>change.population))fail('villageEvolution.villages.changeProof');
      since=change.tick;stage=change.to;
    }
    if(stage!==row.status||row.pendingDepopulationRecordId&&
       (stage==='ruin'||!isDeparture(migrationProofs.get(row.pendingDepopulationRecordId),row.settlementId,world.tick)))
       fail('villageEvolution.villages.status');
  }

  const moves=new Set<string>();
  const touched=new Set<string>();
  let previousMigration=-1;
  for(const row of migrations){
    const {id,tick,fromSettlementId,toSettlementId,path,people}=row;
    const root=migrationProofs.get(id);
    const agreement=supply.get(row.agreementId);
    const from=actualVillages.get(fromSettlementId),to=actualVillages.get(toSettlementId);
    const involvedFrom=`${tick}:${fromSettlementId}`,involvedTo=`${tick}:${toSettlementId}`;
    const nativePath=agreement&&from&&to&&historicPath(agreement,from,to,tick);
    if(moves.has(id)||touched.has(involvedFrom)||touched.has(involvedTo)||tick<previousMigration||tick>world.tick||
      tick%VILLAGE_EVOLUTION_SAMPLE_TICKS!==0||!from||!to||from===to||people<1||people>VILLAGE_EVOLUTION_MAX_ADULTS_PER_MOVE||
      !root||id!==`settlement-${tick}-migration-${fromSettlementId}-${toSettlementId}`||root.kind!=='migration'||
      root.tick!==tick||root.people!==people||root.settlementId!==fromSettlementId||root.targetSettlementId!==toSettlementId||
      root.stones!==0||root.herbs!==0||row.fromBefore-people!==row.fromAfter||row.toBefore+people!==row.toAfter||
      row.leftJuveniles+row.leftNamed>row.fromAfter||
      !nativePath||!same(path,nativePath))fail('villageEvolution.migrations.provenance');
    moves.add(id);touched.add(involvedFrom);touched.add(involvedTo);previousMigration=tick;
    const households=new Set<string>();
    let tracked=0;
    for(const move of row.households){
      const household=houses.get(move.householdId);
      const out=household?.presences.find(presence=>presence.settlementId===fromSettlementId)?.migratedOut??0;
      const into=household?.presences.find(presence=>presence.settlementId===toSettlementId)?.migratedIn??0;
      if(!household||household.createdTick>tick||households.has(move.householdId)||move.adults<1||move.adults>out||move.adults>into)
        fail('villageEvolution.migrations.households');
      households.add(move.householdId);tracked+=move.adults;
    }
    if(tracked!==people)fail('villageEvolution.migrations.adults');
    const time=census.get(tick);
    if(time&&!time.movements.some(movement=>movement.id===id&&movement.kind==='migration'&&movement.people===people&&
      movement.villageId===fromSettlementId&&movement.targetVillageId===toSettlementId))
      fail('villageEvolution.migrations.census');
  }
}
