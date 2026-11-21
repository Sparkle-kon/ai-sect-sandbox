import type { ResourceFlowAccount,SeedLot,WorldState } from '../types/world';
import { SEED_GROW_TICKS,SEED_LOT_UNITS,SEED_PLOT_UNITS,SEED_READY_TICKS,SEED_SAMPLE_UNITS,SEED_SOURCE_HERBS,
  measureSeedPlot,measureSeedTrial } from './seedCultureTerms';
import { flowActor,flowSeedLot,flowSeedPlot,sameFlowAccount } from './resourceFlowEngine';
import { routeWarningHazardValid } from './routeWarningProof';
import { terrainTileAt } from './terrainEngine';

const reasons=new Set(['seed_source_used','seed_lot_sealed','seed_trial_consumed','seed_planted','seed_crop_rooted',
  'seed_germination_loss','seed_crop_matured','seed_harvest_delivered','seed_plot_loss','seed_lot_loss']);
type Expected={refId:string;tick:number;reason:string;ownerId:string;kind:'production'|'transfer'|'consumption'|'loss';
  good:'jade_seed'|'jade_leaf';units:number;from?:ResourceFlowAccount;to?:ResourceFlowAccount};
export function validateSeedCultureHistory(world:WorldState,people:ReadonlySet<string>,fail:(path:string)=>never):void{
  const {lots,plots,nextLotId,nextPlotId}=world.seedCulture;
  if(!lots.length&&!plots.length){
    if(world.resourceFlow.months.some(month=>month.entries.some(row=>row.mechanism==='seed_culture'||row.good==='jade_seed'||reasons.has(row.reason)||
      ('from'in row&&(row.from.kind==='seed_lot'||row.from.kind==='seed_plot'))||
      ('to'in row&&(row.to.kind==='seed_lot'||row.to.kind==='seed_plot')))))fail('seedCulture.journal.source');
    return;
  }
  const expected=new Map<string,Expected>(), sites=new Map(world.locations.map(row=>[row.id,row]));
  const owners=new Map(world.cultivators.map(row=>[row.id,row]));
  const byLot=new Map<string,SeedLot>(), plantedByLot=new Map<string,number>();
  const activeBySite=new Set<string>(),activeLotOwners=new Set<string>(),lotOwnerActions=new Set<string>(),plotIds=new Set<string>();
  const occupancy=new Map<string,Array<{start:number;end:number}>>();
  const key=(refId:string,tick:number,reason:string)=>JSON.stringify([refId,tick,reason]);
  const step=(ownerId:string,tick:number)=>{
    const id=JSON.stringify([ownerId,tick]);
    if(lotOwnerActions.has(id))fail('seedCulture.actions.duplicate');
    lotOwnerActions.add(id);
  };
  const add=(entry:Expected)=>{expected.set(key(entry.refId,entry.tick,entry.reason),entry);};
  const knownSerial=(id:string,pattern:RegExp,next:number)=>{
    const serial=Number(pattern.exec(id)?.[1]);return Number.isSafeInteger(serial)&&serial<next;
  };
  for(const lot of lots){
    const {id,ownerId,siteId,createdTick,remaining,loss}=lot;
    const ownerAtSite=JSON.stringify([ownerId,siteId]);
    if(byLot.has(id)||(remaining>0&&activeLotOwners.has(ownerAtSite))||!knownSerial(id,/^seed-lot-([1-9]\d*)$/,nextLotId)||!people.has(ownerId)||
        (!sites.has(siteId)&&loss?.reason!=='site_lost')||createdTick>world.tick||
        (loss&&(remaining!==0||loss.tick<=createdTick||loss.tick>world.tick||
          (loss.reason==='owner_died'&&owners.get(ownerId)?.alive))))
      fail('seedCulture.lots.source');
    byLot.set(id,lot);step(ownerId,createdTick);
    if(remaining>0)activeLotOwners.add(ownerAtSite);
    const account=flowSeedLot(id);
    add({refId:id,tick:createdTick,ownerId,reason:'seed_source_used',kind:'consumption',good:'jade_leaf',units:SEED_SOURCE_HERBS,from:flowActor(ownerId)});
    add({refId:id,tick:createdTick,ownerId,reason:'seed_lot_sealed',kind:'production',good:'jade_seed',units:SEED_LOT_UNITS,to:account});
    let before=createdTick;
    for(const trial of lot.tests){
      if(trial.tick<=before||trial.tick>world.tick||trial.tick>=(loss?.tick??Infinity)||trial.weather.tick!==trial.tick||
          trial.sample!==SEED_SAMPLE_UNITS||trial.sprouted!==measureSeedTrial(world.terrain.seed,id,trial.weather))
        fail('seedCulture.lots.sample');
      step(ownerId,trial.tick);before=trial.tick;
      add({refId:id,tick:trial.tick,ownerId,reason:'seed_trial_consumed',kind:'consumption',good:'jade_seed',units:SEED_SAMPLE_UNITS,from:account});
    }
    if(loss)add({refId:id,tick:loss.tick,ownerId,reason:'seed_lot_loss',kind:'loss',good:'jade_seed',units:loss.units,from:account});
  }

  for(const plot of plots){
    const {id,lotId,ownerId,siteId,plantedTick,maturesTick,maturedTick,status,settledTick,loss}=plot;
    const lot=byLot.get(lotId),site=sites.get(siteId);
    const active=status==='growing'||status==='ready';
    if(!knownSerial(id,/^seed-plot-([1-9]\d*)$/,nextPlotId)||plotIds.has(id)||!lot||
        lot.ownerId!==ownerId||lot.siteId!==siteId||!lot.tests.some(trial=>trial.tick<plantedTick)||
        plantedTick>world.tick||plantedTick>=(lot.loss?.tick??Infinity)||maturesTick!==plantedTick+SEED_GROW_TICKS||
        (active?(settledTick!==undefined||activeBySite.has(siteId)||!site):(settledTick===undefined||settledTick<=plantedTick||settledTick>world.tick))||
        (status==='lost')!==Boolean(loss)||(maturedTick===undefined)!==(plot.yield===undefined)||
        (maturedTick!==undefined&&(maturedTick!==maturesTick||maturedTick>world.tick||
          plot.weather.length!==SEED_GROW_TICKS||plot.yield!==measureSeedPlot(world.terrain.seed,lotId,id,plot.weather)))||
        (status==='growing'&&(maturedTick!==undefined||world.tick>=maturesTick))||
        (status==='ready'&&(!plot.yield||maturedTick===undefined||world.tick>=maturesTick+SEED_READY_TICKS))||
        (status==='harvested'&&(!plot.yield||maturedTick===undefined||(settledTick??0)<maturedTick||
          (settledTick??Infinity)>=maturesTick+SEED_READY_TICKS)))
      fail('seedCulture.plots.source');
    plotIds.add(id);step(ownerId,plantedTick);
    if(active)activeBySite.add(siteId);
    const uses=occupancy.get(siteId)??[];uses.push({start:plantedTick,end:settledTick??Infinity});occupancy.set(siteId,uses);
    plantedByLot.set(lotId,(plantedByLot.get(lotId)??0)+SEED_PLOT_UNITS);
    const observations=maturedTick!==undefined?SEED_GROW_TICKS:
      status==='growing'?world.tick-plantedTick:(settledTick??0)-plantedTick-1;
    if(plot.weather.length!==observations||plot.weather.some((record,i)=>record.tick!==plantedTick+i+1))
      fail('seedCulture.plots.weather');
    const account=flowSeedPlot(id);
    add({refId:id,tick:plantedTick,ownerId,reason:'seed_planted',kind:'transfer',good:'jade_seed',units:SEED_PLOT_UNITS,
      from:flowSeedLot(lotId),to:account});
    if(maturedTick!==undefined&&plot.yield){
      const rooted=plot.yield;
      add({refId:id,tick:maturedTick,ownerId,reason:'seed_crop_rooted',kind:'consumption',good:'jade_seed',units:rooted,from:account});
      if(rooted<SEED_PLOT_UNITS)add({refId:id,tick:maturedTick,ownerId,reason:'seed_germination_loss',kind:'loss',good:'jade_seed',units:SEED_PLOT_UNITS-rooted,from:account});
      add({refId:id,tick:maturedTick,ownerId,reason:'seed_crop_matured',kind:'production',good:'jade_leaf',units:rooted,to:account});
      if(status==='harvested'&&settledTick!==undefined){
        step(ownerId,settledTick);
        add({refId:id,tick:settledTick,ownerId,reason:'seed_harvest_delivered',kind:'transfer',good:'jade_leaf',units:rooted,
          from:account,to:flowActor(ownerId)});
      }
    }
    if(loss&&settledTick!==undefined){
      if(loss.units!==(plot.yield||SEED_PLOT_UNITS)||loss.good!==(plot.yield?'jade_leaf':'jade_seed')||
          (loss.reason==='failed_germination')!==(maturedTick!==undefined&&plot.yield===0)||
          (loss.reason==='failed_germination'&&settledTick!==maturedTick)||
          (loss.reason==='spoiled'&&(!plot.yield||settledTick!==maturesTick+SEED_READY_TICKS))||
          (loss.reason==='owner_died'&&owners.get(ownerId)?.alive)||
          (loss.reason==='site_hazard')!==Boolean(loss.hazard)||
          (loss.hazard&&(!site||terrainTileAt(world,site.x,site.y)?.id!==loss.hazard.tileId||
            loss.hazard.intensity<2||!routeWarningHazardValid(world,loss.hazard,settledTick))))
        fail('seedCulture.plots.loss');
      add({refId:id,tick:settledTick,ownerId,reason:'seed_plot_loss',kind:'loss',good:loss.good,units:loss.units,from:account});
    }
  }
  for(const uses of occupancy.values()){
    uses.sort((a,b)=>a.start-b.start||a.end-b.end);
    if(uses.some((row,index)=>index>0&&row.start<uses[index-1].end))fail('seedCulture.plots.overlap');
  }
  for(const lot of lots){
    if(lot.remaining+lot.tests.length*SEED_SAMPLE_UNITS+(plantedByLot.get(lot.id)??0)+(lot.loss?.units??0)!==SEED_LOT_UNITS)
      fail('seedCulture.lots.custody');
  }

  const found=new Set<string>(), fullyRecorded=new Set<number>();
  for(const month of world.resourceFlow.months){
    if(month.entries.length===month.totalEntries)fullyRecorded.add(month.tick);
    for(const row of month.entries){
      const from='from'in row?row.from:undefined,to='to'in row?row.to:undefined;
      if(row.mechanism!=='seed_culture'&&!reasons.has(row.reason)&&row.good!=='jade_seed'&&
         from?.kind!=='seed_lot'&&from?.kind!=='seed_plot'&&to?.kind!=='seed_lot'&&to?.kind!=='seed_plot')continue;
      const id=key(row.refId,row.tick,row.reason),target=expected.get(id);
      if(!target||row.mechanism!=='seed_culture'||found.has(id)||row.kind!==target.kind||row.good!==target.good||row.amount!==target.units||
          (target.from?(!from||!sameFlowAccount(target.from,from)):from!==undefined)||
          (target.to?(!to||!sameFlowAccount(target.to,to)):to!==undefined)||
          row.visibility.kind!=='participants'||row.visibility.actorIds.length!==1||row.visibility.actorIds[0]!==target.ownerId)
        fail('seedCulture.journal.source');
      found.add(id);
    }
  }
  for(const [id,entry] of expected)if(fullyRecorded.has(entry.tick)&&!found.has(id))fail('seedCulture.journal.missing');
}
