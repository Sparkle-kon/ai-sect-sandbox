import type {ResourceFlowAccount,ResourceFlowEntry,WorldState} from '../types/world';
import {FRONTIER_REGIONS,FRONTIER_SITE_IDS,frontierSite,frontierWinter,type FrontierRegionId,type FrontierSiteId,type FrontierVisit} from './frontierTerms';
import {FRONTIER_CROP_EXPIRES,FRONTIER_GOODS,FRONTIER_GROW_TICKS,FRONTIER_PRACTICE_QI,FRONTIER_PRODUCTION_MOVES,
  FRONTIER_SOIL_CAPACITY,FRONTIER_SOUTH_PRACTICE_WATER,FRONTIER_STOCK_CAPACITY,FRONTIER_TIDE_WATER,FRONTIER_WATER_CAPACITY,
  frontierBatchId,frontierCropGood,frontierCropId,frontierPeakTide,frontierProductionReceiptId,frontierSpringInflow,frontierTide,
  type FrontierBatchSlice,type FrontierCrop,type FrontierHarvestBatch,type FrontierProductionCustody,type FrontierProductionSpend,
  type FrontierSoil} from './frontierProductionTerms';

type Fail=(path:string)=>never;
type Row=Record<string,unknown>;
const north='north-snow',south='south-marsh';
const object=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
const int=(value:unknown,min=0,max=100_000_000):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max;
const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=240&&!/[\u0000-\u001f\u007f]/u.test(value);
const one=(value:unknown,values:readonly string[])=>typeof value==='string'&&values.includes(value);
const exact=(value:Row,fields:readonly string[],optional:readonly string[]=[])=>
  fields.every(key=>Object.hasOwn(value,key))&&Object.keys(value).every(key=>fields.includes(key)||optional.includes(key));
const rowList=(value:unknown,shape:(row:unknown)=>boolean,max=128_000)=>
  Array.isArray(value)&&value.length<=max&&value.every((row:unknown)=>shape(row));
const site=(value:unknown)=>one(value,FRONTIER_SITE_IDS);
const region=(value:unknown)=>one(value,FRONTIER_REGIONS);
const optionalTick=(row:Row,key:string)=>!Object.hasOwn(row,key)||int(row[key],1);
const slices=(value:unknown)=>rowList(value,row=>object(row)&&exact(row,['batchId','amount'])&&id(row.batchId)&&int(row.amount,1,3),
  FRONTIER_STOCK_CAPACITY)&&Array.isArray(value)&&value.length>0;
const resolved=(value:unknown)=>object(value)&&
  (value.kind==='failed'&&exact(value,['kind','tick'])||
    value.kind==='harvested'&&exact(value,['kind','tick','batchId'])&&id(value.batchId))&&int(value.tick,1);
export function validateFrontierProductionShape(value:unknown,path:string,fail:Fail):void{
  if(!object(value)||!exact(value,['version','water','soil','crops','batches','stock','consumptions','receipts'],['lastAdvancedTick'])||
    value.version!==1||!optionalTick(value,'lastAdvancedTick')||
    !object(value.water)||!exact(value.water,[north,south])||!int(value.water[north],0,FRONTIER_WATER_CAPACITY[north])||
    !int(value.water[south],0,FRONTIER_WATER_CAPACITY[south])||
    !rowList(value.soil,row=>object(row)&&exact(row,['siteId','units'],['lastSowTick'])&&site(row.siteId)&&
      int(row.units,0,FRONTIER_SOIL_CAPACITY)&&optionalTick(row,'lastSowTick'),2)||
    !rowList(value.crops,row=>object(row)&&exact(row,['id','siteId','regionId','sowerId','sownTick','readyTick'],
      ['irrigatedTick','stressedTick','protectedTick','resolved'])&&id(row.id)&&site(row.siteId)&&region(row.regionId)&&
      id(row.sowerId)&&int(row.sownTick,1)&&int(row.readyTick,1)&&
      ['irrigatedTick','stressedTick','protectedTick'].every(key=>optionalTick(row,key))&&
      (!Object.hasOwn(row,'resolved')||resolved(row.resolved)))||
    !rowList(value.batches,row=>object(row)&&exact(row,['id','plotId','siteId','regionId','good','units','harvestedTick','harvesterId'])&&
      id(row.id)&&id(row.plotId)&&site(row.siteId)&&region(row.regionId)&&one(row.good,FRONTIER_GOODS)&&int(row.units,1,3)&&
      int(row.harvestedTick,1)&&id(row.harvesterId))||
    !rowList(value.stock,row=>object(row)&&exact(row,['batchId','regionId','amount'])&&id(row.batchId)&&region(row.regionId)&&int(row.amount,1,3),24)||
    !rowList(value.consumptions,row=>object(row)&&exact(row,['regionId','actorId','tick','refId','purpose','good','slices'])&&
      region(row.regionId)&&id(row.actorId)&&int(row.tick,1)&&id(row.refId)&&one(row.purpose,['practice','protect_crop','winter_detour'])&&
      one(row.good,FRONTIER_GOODS)&&slices(row.slices))||
    !rowList(value.receipts,row=>object(row)&&exact(row,['id','kind','tick','year','month','actorId','siteId','regionId','waterDelta',
      'rootsSpent','soilDelta','qiGained'],['plotId'])&&id(row.id)&&
      one(row.kind,[...FRONTIER_PRODUCTION_MOVES,'spring_inflow','crop_stress','crop_failed'])&&int(row.tick,1)&&int(row.year,1)&&
      int(row.month,1,12)&&id(row.actorId)&&site(row.siteId)&&region(row.regionId)&&int(row.waterDelta,-2,FRONTIER_TIDE_WATER)&&
      int(row.rootsSpent,0,1)&&int(row.soilDelta,-2,2)&&typeof row.qiGained==='number'&&Number.isFinite(row.qiGained)&&
      row.qiGained>=0&&row.qiGained<=FRONTIER_PRACTICE_QI&&(!Object.hasOwn(row,'plotId')||id(row.plotId))))
    return fail(path);
}
type ExpectedFlow={
  tick:number;reason:string;refId:string;good:ResourceFlowEntry['good'];amount:number;
  kind:'production'|'consumption';account:ResourceFlowAccount;actorId:string;
};
const flowKey=(row:Pick<ExpectedFlow,'refId'|'reason'|'good'>)=>JSON.stringify([row.refId,row.reason,row.good]);
const account=(kind:'actor'|'frontier_store',id:string):ResourceFlowAccount=>({kind,id});
function same(a:Readonly<object>,b:Readonly<object>):boolean {
  const x=Object.keys(a),y=Object.keys(b),left=a as Row,right=b as Row;
  return x.length===y.length&&x.every(key=>{
    if(!Object.hasOwn(right,key))return false;
    const value=left[key],next=right[key];
    return typeof value==='object'&&value!==null&&typeof next==='object'&&next!==null?same(value,next):value===next;
  });
}
const harvest=(plot:FrontierCrop)=>plot.regionId===north?2:plot.stressedTick!==undefined&&plot.protectedTick===undefined?2:3;
const needsWater=(plot:FrontierCrop)=>plot.irrigatedTick===undefined&&(plot.regionId===south||plot.stressedTick!==undefined);
const heldKey=(regionId:FrontierRegionId,batchId:string)=>JSON.stringify([regionId,batchId]);
function placeAt(visits:readonly FrontierVisit[],id:string,tick:number){
  for(let i=visits.length-1;i>=0;i--){
    const row=visits[i];
    if(row.actorId!==id||row.enteredTick>=tick||(row.exitedTick??Infinity)<=tick||(row.deceasedTick??Infinity)<=tick)continue;
    for(let j=row.steps.length-1;j>=0;j--){
      const step=row.steps[j];
      if(step.tick===tick)return undefined;
      if(step.tick<tick)return step.siteId;
    }
  }
  return undefined;
}

export function validateFrontierProduction(world:WorldState,custody:readonly FrontierProductionCustody[],fail:Fail):void{
  const state=world.frontier?.production;
  if(!state){
    if(custody.length)fail('frontier.production.missing');
    return;
  }
  if(!state.receipts.length||state.lastAdvancedTick!==undefined&&state.lastAdvancedTick>world.tick)fail('frontier.production.calendar');
  const water:Record<FrontierRegionId,number>={[north]:0,[south]:0}, soil=new Map<FrontierSiteId,FrontierSoil>();
  const crops=new Map<string,FrontierCrop>(),active=new Map<FrontierSiteId,FrontierCrop>(),batches=new Map<string,FrontierHarvestBatch>();
  const labor=new Set<string>(),perSite=new Set<string>(),receipts=new Set<string>(),maintenance=new Map<number,string>(),spring=new Set<number>();
  const actors=new Set(world.cultivators.map(row=>row.id));
  const residences=new Map(world.frontier?.residences.map(row=>[row.actorId,row]));
  const visits=world.frontier?.visits??[];
  const flows=new Map<string,ExpectedFlow>();
  const expectFlow=(row:ExpectedFlow)=>{const key=flowKey(row);if(flows.has(key))fail('frontier.production.flow.id');flows.set(key,row);};
  const spendLinks=new Map<string,{actorId:string;tick:number;regionId:FrontierRegionId;purpose:FrontierProductionSpend['purpose']}>();
  const absolute=(year:number,month:number)=>year*12+month-1;
  const nativeMonth=absolute(world.year,world.month);
  let previous=0,laborTick=0;
  const storageTimeline:Array<{tick:number;before:number;after:number}>=[];
  for(const row of state.receipts){
    const {regionId,siteId,tick,actorId,kind}=row;
    const actualSite=frontierSite(siteId),home=residences.get(actorId),siteRole=actualSite?.role;
    if(!actualSite||actualSite.regionId!==regionId||!actors.has(actorId)||tick>world.tick||tick<previous||
      nativeMonth-absolute(row.year,row.month)!==world.tick-tick||row.id!==frontierProductionReceiptId(tick,kind,siteId,actorId)||
      receipts.has(row.id))return fail('frontier.production.receipt');
    const isLabor=FRONTIER_PRODUCTION_MOVES.some(move=>move===kind);
    if(tick!==previous)storageTimeline.push({tick,before:water[north],after:water[north]});
    previous=tick;receipts.add(row.id);
    if(!isLabor&&laborTick===tick)return fail('frontier.production.auto_order');
    if(isLabor){
      laborTick=tick;
      const effort=JSON.stringify([actorId,tick]),slot=JSON.stringify([siteId,tick,kind]);
      if(labor.has(effort)||!home||home.regionId!==regionId||home.settledTick>=tick||placeAt(visits,actorId,tick)!==siteId||
        (kind==='tend_spring'||kind==='draw_tide'||kind==='rest_field')&&perSite.has(slot))return fail('frontier.production.resident');
      labor.add(effort);perSite.add(slot);
    }
    const plot=active.get(siteId);
    let waterDelta=0,roots:0|1=0,soilDelta=0,plotId:string|undefined;
    switch(kind){
      case 'tend_spring':
        if(siteRole!=='spring'||water[regionId]>=FRONTIER_WATER_CAPACITY[regionId]||maintenance.has(tick))return fail('frontier.production.spring');
        roots=1;maintenance.set(tick,actorId);break;
      case 'spring_inflow':
        if(siteRole!=='spring'||maintenance.get(tick-1)!==actorId||spring.has(tick))return fail('frontier.production.spring');
        waterDelta=Math.min(frontierSpringInflow(row.month),FRONTIER_WATER_CAPACITY[regionId]-water[regionId]);
        if(waterDelta<=0)return fail('frontier.production.spring');
        spring.add(tick);break;
      case 'draw_tide':
        if(siteRole!=='sluice'||!frontierTide(row.month)||water[regionId]>=FRONTIER_WATER_CAPACITY[regionId])return fail('frontier.production.tide');
        waterDelta=Math.min(FRONTIER_TIDE_WATER,FRONTIER_WATER_CAPACITY[regionId]-water[regionId]);break;
      case 'sow':{
        if(plot||(siteRole!=='field'&&siteRole!=='winter-plot')||
          perSite.has(JSON.stringify([siteId,tick,'harvest'])))return fail('frontier.production.sow');
        plotId=frontierCropId(tick,siteId);roots=1;waterDelta=-1;
        if(crops.has(plotId))return fail('frontier.production.crop');
        if(regionId===south){
          const field=soil.get(siteId)??{siteId,units:FRONTIER_SOIL_CAPACITY};
          const expense=tick-(field.lastSowTick??-10)<FRONTIER_CROP_EXPIRES?2:1;
          if(field.units<expense)return fail('frontier.production.soil');
          soilDelta=-expense;field.units+=soilDelta;field.lastSowTick=tick;soil.set(siteId,field);
        }
        const newPlot={id:plotId,siteId,regionId,sowerId:actorId,sownTick:tick,readyTick:tick+FRONTIER_GROW_TICKS};
        crops.set(plotId,newPlot);active.set(siteId,newPlot);break;
      }
      case 'irrigate':
      case 'protect_crop':
      case 'harvest':
      case 'crop_stress':
      case 'crop_failed':{
        if(!plot||tick<=plot.sownTick)return fail('frontier.production.crop');
        plotId=plot.id;
        if(kind==='crop_failed'){
          if(tick!==plot.sownTick+FRONTIER_CROP_EXPIRES||actorId!==plot.sowerId)return fail('frontier.production.crop_expiry');
          plot.resolved={kind:'failed',tick};active.delete(siteId);break;
        }
        if(tick>=plot.sownTick+FRONTIER_CROP_EXPIRES)return fail('frontier.production.crop_expiry');
        if(kind==='crop_stress'){
          if(plot.stressedTick!==undefined||actorId!==plot.sowerId||!(regionId===north
            ?frontierWinter(row.month)&&water[north]===0&&plot.irrigatedTick===undefined
            :frontierPeakTide(row.month)&&plot.protectedTick===undefined))return fail('frontier.production.stress');
          plot.stressedTick=tick;break;
        }
        if(kind==='irrigate'){
          if(plot.irrigatedTick!==undefined)return fail('frontier.production.irrigate');
          waterDelta=-1;plot.irrigatedTick=tick;break;
        }
        if(kind==='protect_crop'){
          if(regionId!==south||plot.protectedTick!==undefined)return fail('frontier.production.protect');
          spendLinks.set(row.id,{actorId,tick,regionId,purpose:'protect_crop'});plot.protectedTick=tick;break;
        }
        if(tick<plot.readyTick||needsWater(plot))return fail('frontier.production.harvest');
        const id=frontierBatchId(plot.id),units=harvest(plot),good=frontierCropGood(regionId);
        batches.set(id,{id,plotId:plot.id,siteId,regionId,good,units,harvestedTick:tick,harvesterId:actorId});
        expectFlow({tick,reason:'frontier_crop_harvested',refId:id,good,amount:units,kind:'production',account:account('frontier_store',regionId),actorId});
        plot.resolved={kind:'harvested',tick,batchId:id};active.delete(siteId);break;
      }
      case 'rest_field':{
        const field=soil.get(siteId);
        if(plot||siteRole!=='field'||!field||field.units>=FRONTIER_SOIL_CAPACITY)return fail('frontier.production.soil');
        soilDelta=Math.min(2,FRONTIER_SOIL_CAPACITY-field.units);field.units+=soilDelta;break;
      }
      case 'cultivate':
        if(row.qiGained<=0||row.qiGained>FRONTIER_PRACTICE_QI||(regionId===north?siteRole!=='home':siteRole!=='field'))
          return fail('frontier.production.practice');
        if(regionId===north)spendLinks.set(row.id,{actorId,tick,regionId,purpose:'practice'});
        else waterDelta=-FRONTIER_SOUTH_PRACTICE_WATER;
        break;
    }
    water[regionId]+=waterDelta;
    const remaining=storageTimeline.at(-1)!;
    if(kind==='spring_inflow')remaining.before=water[north];
    remaining.after=water[north];
    if(row.waterDelta!==waterDelta||row.rootsSpent!==roots||row.soilDelta!==soilDelta||row.plotId!==plotId||
      kind!=='cultivate'&&row.qiGained!==0||water[regionId]<0||water[regionId]>FRONTIER_WATER_CAPACITY[regionId])
      return fail('frontier.production.balances');
    if(waterDelta)expectFlow({tick,refId:row.id,reason:`frontier_${kind}_water`,good:'frontier_water',amount:Math.abs(waterDelta),
      kind:waterDelta>0?'production':'consumption',account:account('frontier_store',regionId),actorId});
    if(roots)expectFlow({tick,refId:row.id,reason:`frontier_${kind}_root`,good:'earth_root',amount:1,
      kind:'consumption',account:account('actor',actorId),actorId});
  }
  function northWaterAtStart(tick:number){
    let lo=0,hi=storageTimeline.length-1;
    while(lo<=hi){const mid=(lo+hi)>>>1;if(storageTimeline[mid].tick<tick)lo=mid+1;else hi=mid-1;}
    return storageTimeline[lo]?.tick===tick?storageTimeline[lo].before:storageTimeline[lo-1]?.after??0;
  }
  for(const crop of crops.values()){
    let expected:number|undefined;
    const until=Math.min(crop.sownTick+FRONTIER_CROP_EXPIRES-1,crop.resolved?.tick??Infinity,state.lastAdvancedTick??0);
    for(let tick=crop.sownTick+1;tick<=until;tick++){
      const month=((nativeMonth-(world.tick-tick))%12+12)%12+1;
      const stressed=crop.regionId===north?frontierWinter(month)&&northWaterAtStart(tick)===0&&(crop.irrigatedTick??Infinity)>=tick:
        frontierPeakTide(month)&&(crop.protectedTick??Infinity)>=tick;
      if(stressed){expected=tick;break;}
    }
    if(crop.stressedTick!==expected)return fail('frontier.production.stress.missing');
  }
  for(const date of maintenance.keys())if(date+1<=(state.lastAdvancedTick??0)&&!spring.has(date+1))return fail('frontier.production.spring.missing');
  for(const plot of active.values())if(plot.sownTick+FRONTIER_CROP_EXPIRES<=(state.lastAdvancedTick??0))return fail('frontier.production.crop.missing');
  if(!same(water,state.water)||!same([...soil.values()],state.soil)||!same([...crops.values()],state.crops)||
    !same([...batches.values()],state.batches))return fail('frontier.production.replay');

  const moves=new Map<number,Map<string,number>>();
  function asset(tick:number,regionId:FrontierRegionId,batchId:string,delta:number){
    const at=moves.get(tick)??new Map<string,number>();
    const key=heldKey(regionId,batchId);
    at.set(key,(at.get(key)??0)+delta);moves.set(tick,at);
  }
  for(const batch of batches.values())asset(batch.harvestedTick,batch.regionId,batch.id,batch.units);
  function eachSlice(items:readonly FrontierBatchSlice[],tick:number,found:(slice:FrontierBatchSlice,batch:FrontierHarvestBatch)=>void){
    const seen=new Set<string>();
    if(!items.length||items.length>FRONTIER_STOCK_CAPACITY)return fail('frontier.production.slices');
    for(const slice of items){
      const batch=batches.get(slice.batchId);
      if(!batch||batch.harvestedTick>tick||seen.has(slice.batchId)||!int(slice.amount,1,batch.units))return fail('frontier.production.slice');
      seen.add(slice.batchId);found(slice,batch);
    }
  }
  for(const lane of custody){
    const {from,to,loadedTick,deliveredTick}=lane;
    if(!region(from)||!int(loadedTick,1,world.tick)||((to===undefined)!==(deliveredTick===undefined))||
      to!==undefined&&(!region(to)||!int(deliveredTick,loadedTick+1,world.tick)))return fail('frontier.production.custody');
    eachSlice(lane.slices,loadedTick,({batchId,amount})=>{
      asset(loadedTick,from,batchId,-amount);
      if(to&&deliveredTick)asset(deliveredTick,to,batchId,amount);
    });
  }
  const consumed=new Set<string>();
  let previousSpend=0;
  for(const row of state.consumptions){
    const {regionId,actorId,tick,refId,purpose,good}=row;
    const key=JSON.stringify([refId,purpose]),source=spendLinks.get(refId);
    if(!actors.has(actorId)||tick<previousSpend||tick>world.tick||consumed.has(key)||
      good!==(purpose==='protect_crop'?'frost_dose':'ward_reed')||
      row.slices.reduce((total,slice)=>total+slice.amount,0)!==1||
      (purpose==='winter_detour'?!refId.endsWith(`-${regionId}`):
        source?.actorId!==actorId||source.tick!==tick||source.regionId!==regionId||source.purpose!==purpose))
      return fail('frontier.production.spend');
    previousSpend=tick;consumed.add(key);
    if(source)spendLinks.delete(refId);
    eachSlice(row.slices,tick,(slice,batch)=>{
      if(batch.good!==good)return fail('frontier.production.goods');
      asset(tick,regionId,slice.batchId,-slice.amount);
    });
    expectFlow({tick,refId,reason:`frontier_${purpose}`,good,amount:1,kind:'consumption',account:account('frontier_store',regionId),actorId});
  }
  if(spendLinks.size)return fail('frontier.production.spend.missing');
  const stock=new Map<string,number>();
  for(const [,delta] of [...moves].sort(([a],[b])=>a-b)){
    for(const [key,value] of delta){
      const amount=(stock.get(key)??0)+value;
      if(amount<0)return fail('frontier.production.stock.negative');
      if(amount===0)stock.delete(key);else stock.set(key,amount);
    }
  }
  if(state.stock.length!==stock.size||new Set(state.stock.map(row=>heldKey(row.regionId,row.batchId))).size!==state.stock.length||
    state.stock.some(row=>stock.get(heldKey(row.regionId,row.batchId))!==row.amount)||
    FRONTIER_REGIONS.some(id=>state.stock.filter(row=>row.regionId===id).reduce((sum,row)=>sum+row.amount,0)>FRONTIER_STOCK_CAPACITY))
    return fail('frontier.production.stock');
  const complete=new Set(world.resourceFlow.months.filter(month=>month.totalEntries===month.entries.length).map(month=>month.tick));
  const recent=new Set<string>();
  const localReasons=/^frontier_(?:(?:tend_spring|sow)_root|(?:draw_tide|spring_inflow|sow|irrigate|cultivate)_water|crop_harvested|practice|protect_crop|winter_detour)$/u;
  for(const month of world.resourceFlow.months)for(const row of month.entries){
    if(row.mechanism!=='frontier'||!localReasons.test(row.reason))continue;
    const key=flowKey(row),proof=flows.get(key);
    const account=row.kind==='production'?row.to:row.kind==='consumption'?row.from:undefined;
    if(!proof||recent.has(key)||row.tick!==proof.tick||row.kind!==proof.kind||!account||
      account.kind!==proof.account.kind||account.id!==proof.account.id||row.amount!==proof.amount||
      row.visibility.kind!=='participants'||row.visibility.actorIds.length!==1||row.visibility.actorIds[0]!==proof.actorId)
      return fail('frontier.production.flow');
    recent.add(key);
  }
  for(const [key,proof] of flows)if(complete.has(proof.tick)&&!recent.has(key))return fail('frontier.production.flow.missing');
}
