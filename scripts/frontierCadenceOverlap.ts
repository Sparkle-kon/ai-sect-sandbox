import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {campaignSHA256} from '../src/engine/campaignMemento';
import {verifyEraCheckpoint,type EraInput} from '../src/engine/eraCheckpointEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {configureRegionalSimulation} from '../src/engine/regionalSimulationEngine';
import {availableFrontierProductionActions,frontierTradeStock} from '../src/engine/frontierProductionEngine';
import {resolveFrontierTradeAction,verifyFrontierTradeAgreement} from '../src/engine/frontierTradeEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {readFile,stat} from './centuryNodeRuntime';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const processModule='node:process';
const process=(await import(processModule) as {default:{argv:string[]}}).default;
const [stem,...extra]=process.argv.slice(2);
if(!stem||extra.length||/\.(era|json)$/u.test(stem))throw Error('Usage: frontierCadenceOverlap.ts <original E43 T47 pair stem>');
function expect(condition:unknown,detail:string):asserts condition{if(!condition)throw Error(detail);}
async function load(path:string){
  const file=await stat(path);
  expect(file.size>=1&&file.size<=1_048_576,'Unsupported documented input size: '+path);
  const bytes=await readFile(path);
  expect(file.size===bytes.byteLength,'Input changed while being read: '+path);
  return bytes;
}
const rawFiles=()=>Promise.all([load(stem+'.era'),load(stem+'.json')]);
const sourceFiles=await rawFiles(),texts=new TextEncoder();
const input=(bytes:Uint8Array):EraInput=>({size:bytes.byteLength,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const imported=await verifyEraCheckpoint(input(sourceFiles[0]),[input(sourceFiles[1])],codec);
const source=imported.world;
expect(source.tick===47&&imported.manifest.payloadSha256==='7159ea3efbcc3168b0f7855098017914594c000f1ff3c630798425bba61d69fc'&&
  !source.authoredEraOrigin&&!source.regionalSimulation,'Expected the original sealed native E43 T47 frame');
const start=codec.encode(source), loaded=codec.decode(start);
const deals=(world:WorldState)=>world.frontier?.trade?.agreements[0];
const contract=deals(loaded);
expect(contract?.status==='accepted'&&!contract.north&&!contract.south,'Expected the original acknowledged offer before loading');
for(const [actorId,frontierTradeMove] of [[contract.northActorId,'load'],[contract.southActorId,'load_winter']] as const){
  const person=loaded.cultivators.find(row=>row.id===actorId);
  expect(person&&resolveFrontierTradeAction(loaded,person,{chosenAction:'FRONTIER_TRADE',frontierTradeMove,
    targetFrontierTradeId:contract.id,innerMonologue:'本人到场，以原批实装。'}),'Could not load the actual original batch');
}
const loadedRaw=codec.encode(loaded),regional=codec.decode(loadedRaw);
expect(configureRegionalSimulation(regional,'loc-taixu'),'Could not enable original three-region annual option');
expect(codec.encode(source)===start,'Branch construction altered the original archive');
const loadSha=await campaignSHA256(texts.encode(loadedRaw));
const north='north-snow', south='south-marsh';
const reader=(world:WorldState)=>world.cultivators.find(actor=>actor.id===deals(world)?.northActorId);
const receipts=(world:WorldState)=>world.frontier?.production?.consumptions;
const held=(world:WorldState)=>({
  northReed:frontierTradeStock(world,north,'ward_reed'),southFrost:frontierTradeStock(world,south,'frost_dose'),
});
async function run(world:WorldState){
  const t0=performance.now();
  const months:object[]=[], byRegion=new Map<string,number>(), deferredActors=new Set<string>();
  let physical:unknown, firstHold:unknown, use:unknown, decisionCount=0;
  while(world.tick<62){
    const owner=reader(world),beforeQi=owner?.qiProgress;
    const wanted=!use&&deals(world)?.status==='exchanged'&&owner?availableFrontierProductionActions(owner,world,world.tick+1)
      .find(row=>row.frontierProductionMove==='cultivate'&&row.targetFrontierSiteId==='frontier-north-home'):undefined;
    const choices:Record<string,LLMDecisionPayload>|undefined=wanted&&owner?{
      [owner.id]:{chosenAction:wanted.action,frontierProductionMove:wanted.frontierProductionMove,targetFrontierSiteId:wanted.targetFrontierSiteId,
        innerMonologue:'南来的暖芦已实到，方可借它行功。'},
    }:undefined;
    world=advanceWorldTick(world,choices,undefined,'utility',undefined,{captureTrace:false,capturePresentation:false,onActor:()=>decisionCount++});
    const deal=deals(world),stock=held(world);
    expect(deal&&verifyFrontierTradeAgreement(world,deal),'Archive cargo no longer passes strict proof');
    if(deal.status==='accepted'&&(deal.south?.status==='arrived')!==(deal.north?.status==='arrived')&&!firstHold){
      expect(stock.northReed===0&&stock.southFrost===0,'One-sided arrival exposed unaccepted goods');
      firstHold={tick:world.tick,stock,provedWaitingLot:deal.south?.status==='arrived'?deal.south.lots:deal.north?.lots};
    }
    if(deal.status==='exchanged'&&!physical){
      expect(firstHold&&stock.northReed===2&&stock.southFrost===2,'Exchange not backed by both physical arrivals');
      physical={id:deal.id,closedTick:deal.closedTick,north:deal.north,south:deal.south,stock};
    }
    if(wanted&&owner){
      const after=reader(world),spent=receipts(world)?.find(row=>row.actorId===owner.id&&row.tick===world.tick&&row.purpose==='practice');
      const batch=deal.south?.lots;
      expect(after&&spent&&after.qiProgress===Math.min(100,(beforeQi??0)+6)&&spent.slices.every(piece=>batch?.some(lot=>lot.batchId===piece.batchId)),
        'Provider-independent actor did not spend the original imported batch');
      use={tick:world.tick,actorId:owner.id,beforeQi,afterQi:after.qiProgress,slices:spent.slices,stock};
    }
    const deferred=world.regionalSimulation?.actors.filter(row=>row.lastDeferredTick===world.tick)??[];
    for(const row of deferred){byRegion.set(row.regionId,(byRegion.get(row.regionId)??0)+1);deferredActors.add(row.actorId);}
    months.push({tick:world.tick,year:world.year,month:world.month,deferrals:deferred.map(row=>({actorId:row.actorId,regionId:row.regionId})),
      cargoStatus:deal.status,northStep:deal.north?.cursor,southStep:deal.south?.cursor,northWaiting:deal.north?.winterWaitTicks.at(-1)===world.tick,
      southWaiting:deal.south?.winterWaitTicks.at(-1)===world.tick});
  }
  expect(use&&physical&&firstHold,'Missing an actual hold, exchange, or native next choice');
  const text=codec.encode(world),raw=texts.encode(text);
  const next=(value:WorldState)=>advanceWorldTick(value,undefined,undefined,'utility',undefined,{captureTrace:false,capturePresentation:false});
  const direct=codec.encode(next(world)),restored=codec.encode(next(codec.decode(text)));
  expect(direct===restored,'Restored lane diverged on its own next month');
  return {firstHold,physical,use,months,deferredByRegion:Object.fromEntries(byRegion),deferredActors:[...deferredActors].sort(),
    annual:world.regionalSimulation?.annual??[],decisionCount,alive:world.cultivators.filter(row=>row.alive&&row.hp>0).length,
    rng:world.random.state,rawBytes:raw.byteLength,rawSha:await campaignSHA256(raw),
    nextSha:await campaignSHA256(texts.encode(direct)),nextParity:true,wallMs:Math.round(performance.now()-t0)};
}
const monthly=await run(loaded),mixed=await run(regional);
for(const key of ['firstHold','physical','use'] as const)expect(JSON.stringify(monthly[key])===JSON.stringify(mixed[key]),
  'Same original frontier shipment behaved differently: '+key);
expect(mixed.deferredActors.length>0&&mixed.annual.some(row=>row.actorMonths>0),'Did not actually exercise annual approximation');
const after=await rawFiles();
expect(sourceFiles.every((bytes,i)=>bytes.byteLength===after[i].byteLength&&bytes.every((byte,j)=>byte===after[i][j])),
  'Proof touched original input files');
console.log(JSON.stringify({kind:'frontier-monthly-and-original-region-annual-overlap',rule:__SECT_UTILITY_RULE_VERSION__,
  originalRule:imported.manifest.engineRuleVersion,sourceSha:imported.manifest.payloadSha256,sourceTick:47,nativeLoadedSha:loadSha,throughTick:62,
  regionalFocus:'loc-taixu',sourceUnchanged:true,authoredOverrides:0,sameCargoAndPractice:true,monthly,mixed}));
