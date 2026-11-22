import type {SeedWeather,WorldEvent,WorldState} from '../types/world';
import {terrainTileAt} from './terrainEngine';
import {WATER_VEIN_BORROW_UNITS,WATER_VEIN_COOLDOWN_TICKS,WATER_VEIN_ID,WATER_VEIN_OPEN_STONES,
  WATER_VEIN_ORE_CAPACITY,WATER_VEIN_RECOVERY_TICKS,WATER_VEIN_RENEWAL_FUNDING,WATER_VEIN_SITE,WATER_VEIN_SURVEY_STONES,WATER_VEIN_TILES,
  waterVeinOpeningAt,waterVeinPhase} from './waterVeinTerms';

type FlowWitness={tick:number;actors:readonly string[];amount:number;fromSect?:string;fromGranary?:string};
export function validateColdWaterVein(world:WorldState,fail:(path:string)=>never):void{
  const water=world.coldWaterVein;
  const checkWeather=(siteId:string,weather:SeedWeather)=>{
    const expected=siteId===WATER_VEIN_SITE&&water?
      waterVeinPhase(waterVeinOpeningAt(water,weather.tick),weather.tick).fieldDeficit:undefined;
    if(weather.waterDeficit!==expected)fail('coldWaterVein.field.weather');
  };
  for(const lot of world.seedCulture.lots)for(const trial of lot.tests)checkWeather(lot.siteId,trial.weather);
  for(const plot of world.seedCulture.plots)for(const weather of plot.weather)checkWeather(plot.siteId,weather);
  if(!water){
    if(world.resourceFlow.months.some(month=>month.entries.some(entry=>entry.mechanism==='water_vein')))
      fail('coldWaterVein.flow.missing');
    return;
  }

  const ids=new Set(world.cultivators.map(row=>row.id)),sects=new Set(world.sects.map(row=>row.id));
  const native=world.locations.find(site=>site.id===WATER_VEIN_SITE);
  const tiles=new Map(world.terrain.tiles.map(tile=>[tile.id,tile]));
  const allWells=new Map(world.villageWorks.projects.map(project=>[project.id,project]));
  const village=world.settlements.villages.find(row=>row.id===water.settlementId);
  const wellEvidence=(well:WorldState['villageWorks']['projects'][number]|undefined,tick:number)=>
    !!well&&well.settlementId===water.settlementId&&well.kind==='well'&&well.status==='completed'&&
    well.settledTick!==undefined&&well.settledTick<=tick&&well.stonesSpent===32&&well.rootsSpent===2&&well.laborTotal===4;
  if(water.veinId!==WATER_VEIN_ID||water.siteId!==WATER_VEIN_SITE||!native||(native.type!=='spirit_vein'&&native.type!=='sect_hq')||native.spiritRoot!=='水'||village?.locationId!==native.id||
    terrainTileAt(world,native.x,native.y)?.id!==WATER_VEIN_TILES[0]||water.tileIds.length!==WATER_VEIN_TILES.length||
    WATER_VEIN_TILES.some((id,index)=>{
      const tile=tiles.get(id);
      return id!==water.tileIds[index]||tile?.col!==12||tile?.row!==2+index;
    })||water.lastAdvancedTick!==undefined&&(water.lastAdvancedTick<1||water.lastAdvancedTick>world.tick))
    fail('coldWaterVein.address');

  const safeTick=(tick:number)=>tick>=1&&tick<=world.tick;
  const events=new Map(world.events.map(row=>[row.id,row]));
  const newsMatches=(event:WorldEvent|undefined,actorId:string,tick:number,year?:number,month?:number)=>
    !event||event.tick===tick&&event.locationId===WATER_VEIN_SITE&&event.category==='diplomacy'&&
    event.witnessScope==='participants'&&event.actorIds.length===1&&event.actorIds[0]===actorId&&
    (year===undefined||event.year===year&&event.month===month);
  const date=(year:number,month:number,tick:number)=>year>0&&(year<world.year||year===world.year&&month<=world.month)&&
    (tick!==world.tick||year===world.year&&month===world.month);
  const exactActors=new Set<string>();
  const reference=(tick:number,actorId:string)=>`${tick}:${actorId}`;
  const money=new Map<string,FlowWitness>();
  const flowKey=(id:string,reason:string)=>JSON.stringify([id,reason]);
  let priorTick=-WATER_VEIN_COOLDOWN_TICKS;
  for(const row of water.openings){
    const well=allWells.get(row.wellProjectId);
    const due=row.openedTick+WATER_VEIN_RECOVERY_TICKS;
    const key=reference(row.openedTick,row.openerId);
    const renewal=row.renewal;
    const variant=renewal&&WATER_VEIN_RENEWAL_FUNDING[renewal.stance];
    const openedId=`water-gate-${row.openedTick}`;
    if(!safeTick(row.openedTick)||!date(row.year,row.month,row.openedTick)||row.id!==openedId||
      exactActors.has(key)||!ids.has(row.openerId)||!sects.has(row.sectId)||row.openedTick-priorTick<WATER_VEIN_COOLDOWN_TICKS||
      row.paidStones!==WATER_VEIN_OPEN_STONES||row.borrowedUnits!==(variant?.borrowedUnits??WATER_VEIN_BORROW_UNITS)||
      row.completedTick!==undefined&&(row.completedTick!==due||row.completedTick>world.tick||
        (water.lastAdvancedTick??0)<row.completedTick)||
      row.completedTick===undefined&&(water.lastAdvancedTick??0)>=due||
      !wellEvidence(well,row.openedTick)||
      !newsMatches(events.get(`evt-${openedId}-opened`),row.openerId,row.openedTick,row.year,row.month))fail('coldWaterVein.opening');
    exactActors.add(key);priorTick=row.openedTick;
    const standard={tick:row.openedTick,actors:[row.openerId],amount:WATER_VEIN_OPEN_STONES,fromSect:row.sectId};
    money.set(flowKey(row.id,'cold_gate_opened'),standard);
    if(renewal&&variant){
      const hearing=world.northGateRenewal?.hearing;
      if(!hearing||hearing.id!==renewal.id)fail('coldWaterVein.renewal');
      const endorser=renewal.stance==='accord'?hearing.endorsement?.actorId:undefined;
      if(renewal.stance==='accord'&&!endorser)fail('coldWaterVein.renewal.endorsement');
      const actors=endorser?[row.openerId,endorser]:[row.openerId];
      if(variant.extraStones)money.set(flowKey(row.id,'cold_gate_renewal_sect'),
        {...standard,actors,amount:variant.extraStones});
      if(variant.roots)money.set(flowKey(row.id,'cold_gate_renewal_granary'),
        {tick:row.openedTick,actors,amount:variant.roots,fromGranary:water.settlementId});
    }
  }
  let observedTick=0;
  for(const row of water.observations){
    const key=reference(row.tick,row.actorId),phase=waterVeinPhase(waterVeinOpeningAt(water,row.tick),row.tick);
    if(!safeTick(row.tick)||row.tick<observedTick||!date(row.year,row.month,row.tick)||!ids.has(row.actorId)||exactActors.has(key)||
      row.id!==`water-observation-${row.tick}-${row.actorId}`||row.paidStones!==WATER_VEIN_SURVEY_STONES||
      !world.villageWorks.projects.some(well=>wellEvidence(well,row.tick))||
      row.wellDepth!==phase.wellDepth||row.fieldDeficit!==phase.fieldDeficit||row.mineYield!==phase.mineYield||row.symptom!==phase.symptom||
      !newsMatches(events.get(`evt-${row.id}`),row.actorId,row.tick,row.year,row.month))fail('coldWaterVein.observation');
    exactActors.add(key);observedTick=row.tick;
    money.set(flowKey(row.id,'north_well_measured'),{tick:row.tick,actors:[row.actorId],amount:WATER_VEIN_SURVEY_STONES});
  }
  let stock=WATER_VEIN_ORE_CAPACITY,miningTick=0;
  for(const row of water.mining){
    const key=reference(row.tick,row.actorId),phase=waterVeinPhase(waterVeinOpeningAt(water,row.tick),row.tick);
    if(!safeTick(row.tick)||row.tick<miningTick||!ids.has(row.actorId)||exactActors.has(key)||stock<1||
      row.id!==`water-mine-${row.tick}-${row.actorId}`||row.units!==Math.min(stock,phase.mineYield)||
      !newsMatches(events.get(`evt-${row.id}`),row.actorId,row.tick))fail('coldWaterVein.mining');
    exactActors.add(key);stock-=row.units;miningTick=row.tick;
    money.set(flowKey(row.id,'cold_ore_recovered'),{tick:row.tick,actors:[row.actorId],amount:row.units});
  }
  if(water.oreRemaining!==stock)fail('coldWaterVein.ore');
  const audited=new Set<string>();
  for(const month of world.resourceFlow.months)for(const entry of month.entries){
    if(entry.mechanism!=='water_vein')continue;
    const key=flowKey(entry.refId,entry.reason);
    const row=money.get(key);
    if(!row||audited.has(key)||entry.tick!==row.tick||entry.amount!==row.amount||
      entry.good!==(row.fromGranary?'earth_root':'stone')||entry.visibility.kind!=='participants'||
      entry.visibility.actorIds.length!==row.actors.length||!row.actors.every(actor=>entry.visibility.kind==='participants'&&entry.visibility.actorIds.includes(actor)))
      fail('coldWaterVein.flow');
    if(entry.reason==='cold_ore_recovered'){
      if(entry.kind!=='production'||entry.to.kind!=='actor'||entry.to.id!==row.actors[0])fail('coldWaterVein.flow.mining');
    }else if(entry.kind!=='consumption'||entry.from.kind!==(row.fromGranary?'granary':row.fromSect?'sect':'actor')||
      entry.from.id!==(row.fromGranary??row.fromSect??row.actors[0]))fail('coldWaterVein.flow.payment');
    audited.add(key);
  }
  const completeMonths=new Set(world.resourceFlow.months.filter(month=>month.totalEntries===month.entries.length).map(month=>month.tick));
  for(const [id,row] of money)if(completeMonths.has(row.tick)&&!audited.has(id))fail('coldWaterVein.flow.missing');
}
