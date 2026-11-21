import {createInitialWorld} from '../src/data/initialWorld';
import {configureRegionalSimulation,currentActorRegion,projectRegionalSimulation} from '../src/engine/regionalSimulationEngine';
import {projectFieldObservatory} from '../src/engine/fieldObservatoryEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {WorldEvent,WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const focus='loc-taixu', profile='spirit-bloom', seed=70;
const obsId='npc-2',north='loc-vein-north';
const genuineObs=(world:WorldState)=>{
  const actor=world.cultivators.find(row=>row.id===obsId);
  return actor&&projectFieldObservatory(world,actor).runs.find(row=>row.locationId===north&&row.openedTick===6&&row.targetTick===8);
};
const go=(world:WorldState)=>advanceWorldTick(world,undefined,undefined,'utility',undefined,
  {captureTrace:false,capturePresentation:false});
let baseline=createInitialWorld(seed,profile);
for(let i=1;i<6;i++)baseline=go(baseline);
if(genuineObs(baseline)?.status!=='pending')throw Error('Seed 70 baseline did not fund the actual north observatory appointment');
const original=encodeEraWorldSave(baseline);
const background=decodeEraWorldSave(original);
if(!configureRegionalSimulation(background,focus))throw Error('Native regional mode denied');
if(encodeEraWorldSave(baseline)!==original)throw Error('Regional opt-in mutated the native reference');
const monthlyFocus=projectRegionalSimulation(background)?.focus;
const operator=background.cultivators.find(row=>row.id===obsId)!;
const observerRegion=currentActorRegion(background,operator);
if(monthlyFocus===observerRegion)throw Error('Expected paid observatory in real distant region');
const run=(world:WorldState)=>{
  const begin=performance.now(), categories=new Map<string,number>(), approxs=new Set<string>(), executed=new Set<string>();
  let due:'observed'|'missed'='missed';
  while(world.tick<18){
    world=advanceWorldTick(world,undefined,undefined,'utility',undefined,
      {captureTrace:false,capturePresentation:false,onCompletedEvents:(events:readonly WorldEvent[])=>{
        for(const event of events)categories.set(event.category,(categories.get(event.category)??0)+1);
      },onActor:id=>executed.add(id)});
    for(const row of world.regionalSimulation?.actors??[])if(row.lastDeferredTick===world.tick)approxs.add(row.actorId);
    if(world.tick===8&&genuineObs(world)?.status==='measured')due='observed';
  }
  const text=encodeEraWorldSave(world),reopened=decodeEraWorldSave(text);
  const resumed=go(reopened),next=go(world);
  const roundTrip=encodeEraWorldSave(resumed)===encodeEraWorldSave(next);
  return {end:{tick:world.tick,year:world.year,month:world.month},roster:world.cultivators.length,
    alive:world.cultivators.filter(actor=>actor.alive&&actor.hp>0).length,
    mortals:world.settlements.villages.reduce((sum,village)=>sum+village.population,0),
    sectStones:world.sects.reduce((sum,sect)=>sum+sect.spiritStones,0),
    siteJade:world.locations.reduce((sum,site)=>sum+site.herbs.jade_leaf,0),deaths:categories.get('death')??0,
    breakthroughs:categories.get('breakthrough')??0,rngState:world.random.state,approxActors:[...approxs],workedActors:executed.size,
    observerNativeDue:due,annual:world.regionalSimulation?.annual,totalBytes:new TextEncoder().encode(text).byteLength,
    roundTrip,elapsedMs:Math.round(performance.now()-begin)};
};
const native=run(baseline), regional=run(background);
if(!native.roundTrip||!regional.roundTrip||native.observerNativeDue!=='observed'||regional.observerNativeDue!=='observed'||
  native.end.tick!==regional.end.tick||!regional.approxActors.length||!regional.annual?.some(row=>row.actorMonths>0))
  throw Error('Regional validation did not exercise the real native promises and approximate lane');
console.log(JSON.stringify({
  seed,profile,rule:__SECT_UTILITY_RULE_VERSION__,focus,monthlyFocus,observerRegion,calendarStart:{tick:6,year:1001,month:6},
  compared:'native monthly activity vs versioned mixed fidelity; shared ordinary RNG consumption can diverge',
  parity:'native clock, scheduled observatory delivery, both file replays; no whole-world parity claim',
  native,regional,
  approximateMinusNative:{mortals:regional.mortals-native.mortals,alive:regional.alive-native.alive,
    sectStones:regional.sectStones-native.sectStones,siteJade:regional.siteJade-native.siteJade,
    deaths:regional.deaths-native.deaths,breakthroughs:regional.breakthroughs-native.breakthroughs}
},null,2));
