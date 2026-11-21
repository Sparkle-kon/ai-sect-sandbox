import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick,executeGodIntervention} from '../src/engine/worldEngine';
import {campaignSHA256} from '../src/engine/campaignMemento';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import type {ActionType,WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const seeds=[0,1,2031,2032],profile='fractured-frontier',months=48;
const intervention={type:'SPAWN_TREASURE',targetLocationId:'loc-vein-north'} as const;
const ruleVersion=__SECT_UTILITY_RULE_VERSION__;
const encode=(text:string)=>new TextEncoder().encode(text);
type Battle={readonly tick:number;readonly id:string;readonly title:string;readonly actors:readonly string[]};
type War={readonly tick:number;readonly sects:readonly [string,string]};
type Measure={readonly combat:Map<string,Battle>;readonly wars:Map<string,War>;readonly actions:Map<ActionType,number>};

function observe(world:WorldState,measure:Measure){
  for(const relation of world.diplomacy){
    if(relation.pact!=='war')continue;
    const key=JSON.stringify([relation.sectAId,relation.sectBId]);
    if(!measure.wars.has(key))measure.wars.set(key,{tick:world.tick,sects:[relation.sectAId,relation.sectBId]});
  }
  for(const event of world.events)if(event.tick===world.tick&&event.category==='combat'&&!measure.combat.has(event.id)){
    measure.combat.set(event.id,{tick:event.tick,id:event.id,title:event.title,actors:event.actorIds});
  }
  for(const actor of world.cultivators)if(actor.alive&&actor.hp>0&&actor.currentAction){
    const key=actor.currentAction;
    measure.actions.set(key,(measure.actions.get(key)??0)+1);
  }
}
const freshMeasure=():Measure=>({combat:new Map(),wars:new Map(),actions:new Map()});
function simulate(start:WorldState,measure:Measure,reload:boolean){
  let world=start;
  for(let i=1;i<=months;i++){
    world=advanceWorldTick(world,undefined,undefined,'utility');
    observe(world,measure);
    if(reload&&i===months/2)world=decodeEraWorldSave(encodeEraWorldSave(world));
  }
  return world;
}
function stats(measure:Measure){
  return {combat:[...measure.combat.values()],wars:[...measure.wars.values()],actions:[...measure.actions.entries()].sort()};
}
if(!/^[0-9a-f]{64}$/.test(ruleVersion))throw Error('规则指纹不可用。');

for(const seed of seeds){
  const before=createInitialWorld(seed,profile);
  const repeat=createInitialWorld(seed,profile);
  const untreated=encodeEraWorldSave(before);
  if(encodeEraWorldSave(repeat)!==untreated)throw Error('相同种子创世不一致。');
  const applied=executeGodIntervention(before,intervention),regenerated=executeGodIntervention(repeat,intervention);
  const verified=applied.events.find(row=>row.id==='evt-god-treasure-1-1'&&row.locationId===intervention.targetLocationId);
  if(applied.interventionSequence!==1||!verified||encodeEraWorldSave(before)!==untreated)throw Error('正式赐宝未按指定只执行一次。');
  const first=freshMeasure(),second=freshMeasure(),started=performance.now();
  const full=simulate(applied,first,false),restored=simulate(regenerated,second,true);
  const canonical=encodeEraWorldSave(full),record=stats(first);
  if(encodeEraWorldSave(restored)!==canonical||JSON.stringify(stats(second))!==JSON.stringify(record))
    throw Error(`种子 ${seed} 未能从同谱系和干预逐月重复。`);
  const initialNames=before.cultivators.filter(actor=>actor.id.startsWith('founder-')).map(({name})=>name);
  const bornRecruit=full.cultivators.find(actor=>!before.cultivators.some(old=>old.id===actor.id));
  console.log(JSON.stringify({seed,profile,ruleVersion,from:{tick:before.tick,year:before.year,month:before.month},
    to:{tick:full.tick,year:full.year,month:full.month},months,intervention:{...intervention,event:verified.id},
    initialNames,firstLaterRecruit:bornRecruit?.name??null,warFirst:record.wars,combatFirst:record.combat[0]??null,
    combatCount:record.combat.length,actions:Object.fromEntries(record.actions),nativeSaveBytes:encode(canonical).length,
    nativeSha256:await campaignSHA256(encode(canonical)),restoredReplayBytesExact:true,elapsedMs:Math.round(performance.now()-started)}));
}
