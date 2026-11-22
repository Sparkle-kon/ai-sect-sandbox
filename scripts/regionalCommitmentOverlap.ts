import {createInitialWorld} from '../src/data/initialWorld';
import {detachedArchiveSha256} from '../src/engine/detachedCampaignArchive';
import {OBSERVATORY_COST} from '../src/engine/fieldObservatoryEngine';
import {configureRegionalSimulation,currentActorRegion,projectRegionalSimulation} from '../src/engine/regionalSimulationEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator,WorldEvent,WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[]};
const profile='spirit-bloom',seed=70,focus='loc-taixu';
const operatorId='npc-2',site='loc-vein-north',openedTick=6,dueTick=8,throughTick=18;
const referenceId=`field-observatory-${operatorId}-${openedTick}`;
const dueEventId=`evt-${referenceId}-measure`;
const encoder=new TextEncoder();
const quiet={captureTrace:false,capturePresentation:false};
function requireProof(condition:unknown,message:string):asserts condition{
  if(!condition)throw Error(message);
}
const findActor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);
const runRecord=(world:WorldState)=>world.fieldObservatories.byActor[operatorId]?.runs.find(row=>
  row.locationId===site&&row.openedTick===openedTick&&row.targetTick===dueTick);
const go=(world:WorldState)=>advanceWorldTick(world,undefined,undefined,'utility',undefined,quiet);
const date=(world:WorldState)=>({tick:world.tick,year:world.year,month:world.month});
const live=(actor:Cultivator)=>actor.alive&&actor.hp>0;
const salient=(world:WorldState,actor:Cultivator)=>({id:actor.id,regionId:currentActorRegion(world,actor)??null,
  locationId:actor.locationId,alive:live(actor),age:actor.age,hp:actor.hp,qi:actor.qiProgress,realm:actor.realm});
let baseline=createInitialWorld(seed,profile);
while(baseline.tick<openedTick)baseline=go(baseline);
requireProof(runRecord(baseline)?.status==='pending'&&!baseline.regionalSimulation&&!baseline.authoredEraOrigin,
  'The common immutable native source is missing its already-paid distant observation');
const source=encodeEraWorldSave(baseline);
const sourceBytes=encoder.encode(source),sourceSha256=await detachedArchiveSha256(sourceBytes);
const a=decodeEraWorldSave(source),b=decodeEraWorldSave(source);
requireProof(encodeEraWorldSave(a)===source&&encodeEraWorldSave(b)===source,'The source copies are not exact native bytes');
requireProof(configureRegionalSimulation(b,focus),'Could not opt in to the real regional lane');
const operator=findActor(b,operatorId);
requireProof(operator,'The original observer is missing');
const distant=currentActorRegion(b,operator),focused=projectRegionalSimulation(b)?.focus;
requireProof(distant&&focused&&distant!==focused,'The paid obligation is not genuinely away from the watched region');
const fund=baseline.resourceFlow.months.flatMap(row=>row.entries).filter(row=>row.refId===referenceId&&
  row.kind==='consumption'&&row.from.kind==='actor'&&row.from.id===operatorId&&row.mechanism==='observatory'&&
  row.reason==='observatory_instrument'&&row.good==='stone'&&row.amount===OBSERVATORY_COST&&row.tick===openedTick);
requireProof(fund.length===1,'The exact previously paid instrument receipt is missing or duplicated');

async function observe(sourceWorld:WorldState,mode:'native_monthly'|'opt_in_mixed'){
  const startTime=performance.now(),months=[],categories=new Map<WorldEvent['category'],number>(),everDeferred=new Set<string>();
  let world=sourceWorld, measured:WorldEvent|undefined, actorMonthExecutions=0, deferredActorMonths=0;
  while(world.tick<throughTick){
    const executed=new Set<string>(),emitted:WorldEvent[]=[];
    world=advanceWorldTick(world,undefined,undefined,'utility',undefined,
      {...quiet,onActor:id=>executed.add(id),onCompletedEvents:(events:readonly WorldEvent[])=>emitted.push(...events)});
    for(const event of emitted)categories.set(event.category,(categories.get(event.category)??0)+1);
    const deferred=world.regionalSimulation?.actors.filter(row=>row.lastDeferredTick===world.tick)??[];
    const entries=world.resourceFlow.months.find(row=>row.tick===world.tick)?.entries??[];
    requireProof(!entries.some(row=>row.refId===referenceId),'The original dated observatory instrument was charged again');
    requireProof(deferred.every(row=>!executed.has(row.actorId)),'Same body both deferred and executed in a single month');
    for(const row of deferred)everDeferred.add(row.actorId);
    deferredActorMonths+=deferred.length;actorMonthExecutions+=executed.size;
    if(world.tick===dueTick){
      const exact=emitted.filter(row=>row.id===dueEventId&&row.locationId===site&&row.actorIds.length===1&&row.actorIds[0]===operatorId);
      requireProof(exact.length===1&&runRecord(world)?.status==='measured'&&!deferred.some(row=>row.actorId===operatorId),
        'The actual paid obligation was delayed, duplicated, or approximated');
      measured=exact[0];
    }
    months.push({...date(world),nativeActorTurns:executed.size,deferred:deferred.map(({actorId,regionId})=>({actorId,regionId})),
      ...(world.month===12&&world.regionalSimulation?{annual:world.regionalSimulation.annual.filter(row=>row.tick===world.tick)}:{})});
  }
  requireProof(measured&&!world.authoredEraOrigin,'Missing the due native event or an authored input leaked into the sample');
  const endRaw=encodeEraWorldSave(world),endBytes=encoder.encode(endRaw),loop=decodeEraWorldSave(endRaw);
  const next=encodeEraWorldSave(go(world)),restoredNext=encodeEraWorldSave(go(loop));
  requireProof(encodeEraWorldSave(loop)===endRaw&&next===restoredNext,'Same lane strict native read/replay diverged');
  const elapsedMs=Math.round(performance.now()-startTime);
  return {mode,months,elapsedMs,end:date(world),nativeActorMonthExecutions:actorMonthExecutions,actualDeferredActorMonths:deferredActorMonths,
    everDeferred:[...everDeferred].sort(),annual:world.regionalSimulation?.annual??[],
    due:{tick:measured.tick,year:measured.year,month:measured.month,
      id:measured.id,actorId:operatorId,locationId:site},
    stock:{living:world.cultivators.filter(live).length,mortals:world.settlements.villages.reduce((n,row)=>n+row.population,0),
      sectStones:world.sects.reduce((n,row)=>n+row.spiritStones,0),siteJade:world.locations.reduce((n,row)=>n+row.herbs.jade_leaf,0)},
    deaths:categories.get('death')??0,breakthroughs:categories.get('breakthrough')??0,
    rngState:world.random.state,endBytes:endBytes.length,endSha256:await detachedArchiveSha256(endBytes),
    nextBytes:encoder.encode(next).length,nextSha256:await detachedArchiveSha256(encoder.encode(next)),sameLaneRestoreParity:true,
    actors:world.cultivators.map(row=>salient(world,row))};
}
const native=await observe(a,'native_monthly'),mixed=await observe(b,'opt_in_mixed');
requireProof(native.actualDeferredActorMonths===0&&mixed.actualDeferredActorMonths>0&&
  mixed.annual.some(row=>row.actorMonths>0&&row.qiAdded>0)&&native.end.tick===mixed.end.tick&&
  native.end.year===mixed.end.year&&native.end.month===mixed.end.month&&encodeEraWorldSave(baseline)===source,
  'Did not actually compare overlapping intact native/mixed world months with a real December compensation');
const compareActorIds=new Set([operatorId,...mixed.everDeferred]);
const comparableActors=[...compareActorIds].sort().map(id=>({id,
  atSource:baseline.cultivators.filter(row=>row.id===id).map(row=>salient(baseline,row))[0]??null,
  native:native.actors.find(row=>row.id===id)??null,mixed:mixed.actors.find(row=>row.id===id)??null}));
const report={engineRuleVersion:__SECT_UTILITY_RULE_VERSION__,seed,profile,focus,focused,distant,
  authored:{includedInThisComparison:false,mutations:0,independentHarness:'scripts/authoredEraBenchmark.ts'},
  controls:{defaultUtilityForAll:true,explicitActorOverrides:0,sharedSourceUnchanged:true,
    distinction:'Both worlds advance the same real months; the opted-in far optional actor lane batches December Qi/HP only. Shared normal RNG may diverge.'},
  source:{...date(baseline),bytes:sourceBytes.length,sha256:sourceSha256,paidInstruments:fund},
  native:{...native,actors:undefined},mixed:{...mixed,actors:undefined},comparableActors,
  mixedMinusNative:{living:mixed.stock.living-native.stock.living,mortals:mixed.stock.mortals-native.stock.mortals,
    sectStones:mixed.stock.sectStones-native.stock.sectStones,siteJade:mixed.stock.siteJade-native.stock.siteJade,
    deaths:mixed.deaths-native.deaths,breakthroughs:mixed.breakthroughs-native.breakthroughs}};
const [output,...extra]=process.argv.slice(2);
if(extra.length)throw Error('Usage: vite-node scripts/regionalCommitmentOverlap.ts [NEW_OUTPUT_DIRECTORY]');
if(output){
  const {join,mkdir,open,readFile}=await import('./centuryNodeRuntime');
  await mkdir(output,{recursive:false});
  for(const [name,value] of [['common-native.json',source],['comparison.json',JSON.stringify(report,null,2)+'\n']] as const){
    const dest=join(output,name),file=await open(dest,'wx');
    try{await file.writeFile(value);await file.sync();}finally{await file.close();}
    requireProof(await readFile(dest,'utf8')===value,`Could not verify output ${name}`);
  }
}
console.log(JSON.stringify(report,null,2));
