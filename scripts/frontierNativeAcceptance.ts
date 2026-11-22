import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {prepareEraCheckpoint,verifyEraCheckpoint} from '../src/engine/eraCheckpointEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {resolveFrontierMovementAction} from '../src/engine/frontierMovementEngine';
import {advanceFrontierProduction,frontierTradeStock,resolveFrontierProductionAction} from '../src/engine/frontierProductionEngine';
import {advanceFrontierTrade,frontierTradeEscrowSlices,
  projectFrontierTrade,resolveFrontierTradeAction,verifyFrontierTradeAgreement} from '../src/engine/frontierTradeEngine';
import {FRONTIER_TRADE_TERM_MONTHS} from '../src/engine/frontierTradeTerms';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];exitCode?:number;resourceUsage():{maxRSS:number}};
const assertModule='node:assert/strict';
const {deepEqual,equal}=await import(assertModule) as {
  deepEqual(value:unknown,other:unknown,message?:string):void;
  equal(value:unknown,other:unknown,message?:string):void;
};
function contains(value:unknown,shape:unknown):boolean {
  if(shape===null||typeof shape!=='object')return Object.is(value,shape);
  return value!==null&&typeof value==='object'&&Object.entries(shape).every(([key,part])=>
    Object.hasOwn(value,key)&&contains((value as Record<string,unknown>)[key],part));
}
function expect(value:unknown,message?:string){
  return {
    toBe:(other:unknown)=>equal(value,other,message),
    toEqual:(other:unknown)=>deepEqual(value,other,message),
    toBeNull:()=>equal(value,null,message),
    toBeTruthy:()=>equal(Boolean(value),true,message),
    toBeDefined:()=>equal(value!==undefined,true,message),
    toBeGreaterThan:(other:number)=>equal(typeof value==='number'&&value>other,true,message),
    toBeGreaterThanOrEqual:(other:number)=>equal(typeof value==='number'&&value>=other,true,message),
    toMatchObject:(other:unknown)=>equal(contains(value,other),true,message),
  };
}
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const north='north-snow',south='south-marsh',northId='npc-2',southId='npc-6';
const payload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'沿原世界和实际规则验明货路。',...fields});
function person(world:WorldState,id:string){return world.cultivators.find(a=>a.id===id)!;}
function atMarket(world:WorldState,id:string,target:string){
  const actor=person(world,id),known=knownMapLocations(world,actor);
  if(actor.locationId===target)return;
  const unknown=world.locations.filter(row=>row.id!==actor.locationId&&!known.includes(row)&&
    !(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const candidates=unknown.length?unknown:world.locations.filter(row=>row.id!==actor.locationId&&
    !(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const index=candidates.findIndex(site=>site.id===target);
  expect(known.some(site=>site.id===target)||index>=0).toBe(true);
  let draws=0;
  applyCultivatorBrainDecision(world,actor,payload('EXPLORE',known.some(site=>site.id===target)?{targetLocationId:target}:{}),
    ()=>index>=0&&draws++===0?(index+.2)/candidates.length:.99);
  expect(actor.locationId).toBe(target);
}
function setup(){
  let world=createInitialWorld(1,'spirit-bloom');
  const month=()=>{
    world=advanceWorldTick(world,Object.fromEntries(world.cultivators.map(a=>[a.id,payload('REST')])),()=>.99,'utility');
    advanceFrontierProduction(world); advanceFrontierTrade(world);
  };
  const move=(id:string,frontierMove:NonNullable<LLMDecisionPayload['frontierMove']>,targetFrontierSiteId:NonNullable<LLMDecisionPayload['targetFrontierSiteId']>)=>{
    month();
    const event=resolveFrontierMovementAction(world,person(world,id),payload('FRONTIER',{frontierMove,targetFrontierSiteId}));
    expect(event,`${id}/${frontierMove}/${targetFrontierSiteId}/${world.tick}`).toBeTruthy();
  };
  const farm=(id:string,frontierProductionMove:NonNullable<LLMDecisionPayload['frontierProductionMove']>,
    targetFrontierSiteId:NonNullable<LLMDecisionPayload['targetFrontierSiteId']>)=>{
    month();
    const event=resolveFrontierProductionAction(world,person(world,id),payload('FRONTIER_PRODUCTION',{frontierProductionMove,targetFrontierSiteId}));
    expect(event,`${id}/${frontierProductionMove}/${targetFrontierSiteId}/${world.tick}`).toBeTruthy();
  };
  const trade=(id:string,frontierTradeMove:NonNullable<LLMDecisionPayload['frontierTradeMove']>,targetCultivatorId?:string)=>
    resolveFrontierTradeAction(world,person(world,id),payload('FRONTIER_TRADE',{frontierTradeMove,
      ...(targetCultivatorId?{targetCultivatorId}:{targetFrontierTradeId:'frontier-trade-1'})}));
  atMarket(world,northId,'loc-taixu');atMarket(world,southId,'loc-danxia');
  for(let i=0;i<3;i++){
    month();
    for(const id of [northId,southId])expect(applyCultivatorBrainDecision(world,person(world,id),payload('GATHER_HERBS',{targetHerbId:'earth_root'}),()=>.99)).toBeTruthy();
  }
  month();atMarket(world,northId,'loc-market');atMarket(world,southId,'loc-market');
  expect(trade(northId,'propose',southId)).toBeTruthy();
  expect(trade(southId,'accept')).toBeNull();
  month();expect(trade(southId,'accept')).toBeTruthy();
  expect(projectFrontierTrade(world,person(world,'npc-3'))).toEqual([]);
  month();atMarket(world,northId,'loc-vein-north');
  move(northId,'enter','frontier-north-gate');
  move(southId,'enter','frontier-south-gate');
  // The longer physical northern walking route also works if these early months are cold.
  move(northId,'travel','frontier-north-lee-west');move(northId,'travel','frontier-north-lee-mid');
  move(northId,'travel','frontier-north-lee-east');move(northId,'travel','frontier-north-home');
  move(northId,'settle','frontier-north-home');
  move(southId,'travel','frontier-south-crossway');move(southId,'travel','frontier-south-home');
  move(southId,'settle','frontier-south-home');
  move(northId,'travel','frontier-north-plot');move(northId,'travel','frontier-north-spring');
  farm(northId,'tend_spring','frontier-north-spring');
  move(northId,'travel','frontier-north-plot');farm(northId,'sow','frontier-north-plot');
  month();farm(northId,'harvest','frontier-north-plot');move(northId,'travel','frontier-north-home');
  move(southId,'travel','frontier-south-field-east');move(southId,'travel','frontier-south-sluice');
  while((world.month===12||world.month<3||world.month>=11)&&world.month!==2)month();
  farm(southId,'draw_tide','frontier-south-sluice');
  move(southId,'travel','frontier-south-field-east');farm(southId,'sow','frontier-south-field-east');
  farm(southId,'irrigate','frontier-south-field-east');farm(southId,'harvest','frontier-south-field-east');
  move(southId,'travel','frontier-south-home');move(southId,'travel','frontier-south-crossway');
  move(southId,'travel','frontier-south-field-west');farm(southId,'sow','frontier-south-field-west');
  farm(southId,'irrigate','frontier-south-field-west');farm(southId,'harvest','frontier-south-field-west');
  move(southId,'travel','frontier-south-crossway');move(southId,'travel','frontier-south-home');
  month();while(world.month!==11)month();
  expect(frontierTradeStock(world,north,'frost_dose')).toBe(2);
  const southStock=frontierTradeStock(world,south,'ward_reed');expect(southStock).toBeGreaterThanOrEqual(3);
  return {current:()=>world,month,trade,southStock,agreement:()=>world.frontier!.trade!.agreements[0]};
}

async function main(){
  const {join,mkdir,open,readFile,platform}=await import('./centuryNodeRuntime');
  const {campaignSHA256}=await import('../src/engine/campaignMemento');
  const [directory,...extra]=process.argv.slice(2);
  if(!directory||extra.length)throw Error('Usage: vite-node scripts/frontierNativeAcceptance.ts NEW_OUTPUT_DIRECTORY');
  await mkdir(directory,{recursive:false});
  const started=performance.now();
  const encoder=new TextEncoder();
  const write=async(name:string,bytes:string|Uint8Array)=>{
    const fd=await open(join(directory,name),'wx');
    try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
  };
  const flush=async()=>{
    if(platform()==='win32')return;
    const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}
  };
  const physicalInput=async(name:string)=>{
    const bytes=await readFile(join(directory,name));
    return {size:bytes.byteLength,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  };
  const seals:{tag:string;tick:number;year:number;month:number;sha256:string;payloadBytes:number;files:string[]}[]=[];
  async function portable(tag:string,world:WorldState){
    const packageFile=await prepareEraCheckpoint(world,{branchId:tag,label:'北岭南泽实地互换'},codec,{engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
    const files=[packageFile.manifestFile,...packageFile.parts],names=files.map(file=>`${tag}-t${world.tick}-${file.name}`);
    for(let i=0;i<files.length;i++)await write(names[i],files[i].bytes);
    await flush();
    const reopened=await verifyEraCheckpoint(await physicalInput(names[0]),await Promise.all(names.slice(1).reverse().map(physicalInput)),codec);
    const raw=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(reopened.world)).toBe(raw);
    expect(await campaignSHA256(encoder.encode(raw))).toBe(packageFile.manifest.payloadSha256);
    seals.push({tag,tick:world.tick,year:world.year,month:world.month,sha256:packageFile.manifest.payloadSha256,payloadBytes:packageFile.manifest.payloadBytes,files:names});
    return reopened.world;
  }
  const date=(world:WorldState)=>({tick:world.tick,year:world.year,month:world.month});
  const orders=(world:WorldState)=>Object.fromEntries(world.cultivators.map(actor=>[actor.id,payload('REST')]));
  const proceed=(world:WorldState)=>advanceWorldTick(world,orders(world),()=>.99,'utility');
  const baseline=setup().current(), priorRaw=encodeEraWorldSave(baseline);
  const source=await portable('frontier-source',baseline);
  const stateAt=(world:WorldState)=>world.frontier!.trade!.agreements[0];
  const loads=(world:WorldState,id:string,move:'load'|'load_winter')=>resolveFrontierTradeAction(world,person(world,id),
    payload('FRONTIER_TRADE',{frontierTradeMove:move,targetFrontierTradeId:stateAt(world).id}));
  let good=decodeEraWorldSave(encodeEraWorldSave(source)),failure=decodeEraWorldSave(encodeEraWorldSave(source));
  const atSourceProduction=source.frontier?.production;
  const stock=(w:WorldState)=>({
    northFrost:frontierTradeStock(w,north,'frost_dose'), northReed:frontierTradeStock(w,north,'ward_reed'),
    southFrost:frontierTradeStock(w,south,'frost_dose'), southReed:frontierTradeStock(w,south,'ward_reed')});
  const initialStock=stock(source);
  expect(initialStock).toMatchObject({northFrost:2,northReed:0,southFrost:0});
  expect(loads(good,northId,'load')).toBeTruthy();expect(loads(good,southId,'load_winter')).toBeTruthy();
  expect(stock(good).southReed).toBe(initialStock.southReed-3);
  const afterLoad=stock(good);
  const escrowBefore=structuredClone(frontierTradeEscrowSlices(good));
  const winterSurcharge=stateAt(good).south?.winterReeds;
  expect(winterSurcharge?.reduce((sum,row)=>sum+row.amount,0)).toBe(1);
  expect(stateAt(good).south!.checkpoints.length).toBe(stateAt(good).north!.checkpoints.length+2);
  good=proceed(good);
  expect(stateAt(good).north?.cursor).toBe(0);
  expect(stateAt(good).north?.winterWaitTicks).toEqual([good.tick]);
  const wait=await portable('frontier-winter-wait',good);
  const acrossFreeze=proceed(wait);
  expect(encodeEraWorldSave(acrossFreeze)).toBe(encodeEraWorldSave(proceed(good)));
  let firstArrived:WorldState|undefined;
  for(let i=0;i<35&&stateAt(good).status!=='exchanged';i++){
    expect(stock(good).northReed).toBe(0);expect(stock(good).southFrost).toBe(0);
    good=proceed(good);
    if(!firstArrived&&stateAt(good).south?.status==='arrived'){
      firstArrived=await portable('frontier-first-arrival-held',good);
      expect(stock(firstArrived).northReed).toBe(0);expect(stock(firstArrived).southFrost).toBe(0);
      expect(frontierTradeEscrowSlices(firstArrived).reduce((sum,row)=>sum+row.amount,0)).toBe(4);
    }
  }
  if(!firstArrived)throw Error('No real separate first-arrival hold.');
  const exchange=await portable('frontier-exchanged',good), trade=stateAt(exchange);
  expect(trade.status).toBe('exchanged');expect(verifyFrontierTradeAgreement(exchange,trade)).toBe(true);
  expect(stock(exchange)).toMatchObject({northReed:2,southFrost:2});
  expect(frontierTradeEscrowSlices(exchange)).toEqual([]);
  const practiceBase=person(exchange,northId).qiProgress;
  const afterPractice=advanceWorldTick(exchange,{...orders(exchange),[northId]:payload('FRONTIER_PRODUCTION',{
    frontierProductionMove:'cultivate',targetFrontierSiteId:'frontier-north-home',
  })},()=>.99,'utility');
  const practiced=await portable('frontier-delivered-reed-practice',afterPractice);
  const practicedQi=person(practiced,northId).qiProgress;
  expect(practicedQi).toBeGreaterThan(practiceBase);
  expect(stock(practiced).northReed).toBe(1);
  const consumption=practiced.frontier?.production?.consumptions.find(row=>row.regionId===north&&row.purpose==='practice');
  expect(consumption).toBeDefined();

  expect(loads(failure,northId,'load')).toBeTruthy();
  const originalReturnLots=structuredClone(stateAt(failure).north?.lots);
  let turned:WorldState|undefined;
  for(let i=0;i<FRONTIER_TRADE_TERM_MONTHS+40&&stateAt(failure).status!=='returned';i++){
    expect(stock(failure).southFrost).toBe(0);
    expect(stock(failure).northFrost).toBe(0);
    failure=proceed(failure);
    if(!turned&&stateAt(failure).status==='returning'){
      turned=await portable('frontier-expired-return-in-motion',failure);
      expect(stock(turned).northFrost).toBe(0);
    }
  }
  if(!turned)throw Error('No genuine physical return turn.');
  const returned=await portable('frontier-cargo-returned',failure), returnedTrade=stateAt(returned);
  expect(returnedTrade.status).toBe('returned');expect(verifyFrontierTradeAgreement(returned,returnedTrade)).toBe(true);
  expect(returnedTrade.north?.lots).toEqual(originalReturnLots);
  expect(returnedTrade.north?.walks.at(-1)?.step).toBe(0);
  expect(returnedTrade.north!.walks.at(-1)!.tick).toBeGreaterThan(returnedTrade.returnsTick!);
  expect(stock(returned)).toEqual(initialStock);
  expect(encodeEraWorldSave(source)).toBe(priorRaw);expect(encodeEraWorldSave(baseline)).toBe(priorRaw);
  const evidence={ruleVersion:__SECT_UTILITY_RULE_VERSION__,seed:1,profile:'spirit-bloom',
    scope:'Native controlled actions; no actor, clock, stock, terrain or population fields set by the fixture',
    calendarSource:date(source),initialStock,afterLoad,
    signatures:{id:trade.id,offeredTick:trade.offeredTick,acceptedTick:trade.acceptedTick,north:trade.northActorId,south:trade.southActorId},
    paidResidences:source.frontier?.residences,production:atSourceProduction,declaredWinterSurcharge:winterSurcharge,
    legLengthDelta:trade.south!.checkpoints.length-trade.north!.checkpoints.length,escrowBefore,waitingDate:date(wait),
    bothCargo:trade,north:trade.north,south:trade.south,
    firstPhysicalArrival:{date:date(firstArrived),stocks:stock(firstArrived),escrow:frontierTradeEscrowSlices(firstArrived)},
    exchangeDate:date(exchange),exchangeStocks:stock(exchange),
    practice:{date:date(practiced),restoredNorthReed:stock(practiced).northReed,qiBefore:practiceBase,qiAfter:practicedQi,consumption},
    timeout:{date:date(turned),wasUncredited:stock(turned),originalReturnLots,agreement:returnedTrade,
      finalDate:date(returned),stock:stock(returned)},
    originalSourceUnchanged:true,exactRestoredNextMonth:true,elapsedMs:Math.round(performance.now()-started),
    maxRssKiB:process.resourceUsage().maxRSS,seals};
  await write('frontier-native-evidence.json',JSON.stringify(evidence,null,2)+'\n'); await flush();
  console.log(JSON.stringify({frontierEvidence:{calendarSource:evidence.calendarSource,initialStock,firstArrival:evidence.firstPhysicalArrival.date,
    waiting:evidence.waitingDate,exchanged:evidence.exchangeDate,practice:evidence.practice.date,timeout:evidence.timeout.date,returned:evidence.timeout.finalDate,
    north:{loadedTick:trade.north?.loadedTick,arrivedTick:trade.north?.arrivedTick,length:trade.north?.checkpoints.length,wait:trade.north?.winterWaitTicks},
    south:{loadedTick:trade.south?.loadedTick,arrivedTick:trade.south?.arrivedTick,length:trade.south?.checkpoints.length,wait:trade.south?.winterWaitTicks},
    qi:[practiceBase,practicedQi],seals}}));
}
try{await main();}catch(error){console.error(String(error));process.exitCode=1;}
