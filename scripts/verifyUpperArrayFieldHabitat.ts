import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {ERA_CHECKPOINT_MANIFEST_BYTES,ERA_CHECKPOINT_NATIVE_JSON_BYTES,prepareEraCheckpoint,verifyEraCheckpoint,type EraInput} from '../src/engine/eraCheckpointEngine';
import {availableNorthGateRenewalActions} from '../src/engine/northGateRenewalEngine';
import {availableUpperPassageActions} from '../src/engine/upperPassageEngine';
import type {UpperPassageMove} from '../src/engine/upperPassageTerms';
import {availableUpperArrayFieldMovementActions} from '../src/engine/upperArrayFieldMovementEngine';
import type {UpperArrayFieldMove} from '../src/engine/upperArrayFieldTerms';
import {availableUpperArrayFieldLocalActions,projectUpperArrayFieldLocal,upperArrayLatticeStock} from '../src/engine/upperArrayFieldLocalEngine';
import type {UpperArrayFieldLocalMove} from '../src/engine/upperArrayFieldLocalTerms';
import {readFile,stat,open,join} from './centuryNodeRuntime';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const fs='node:fs/promises',node='node:process',crypto='node:crypto';
const {mkdir}=await import(fs) as {mkdir(path:string):Promise<unknown>};
const {webcrypto}=await import(crypto) as {webcrypto:Crypto};
if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto});
const proc=(await import(node) as {default:{argv:string[]}}).default;
const [stem,out,...extra]=proc.argv.slice(2);
function check(condition:unknown,reason:string):asserts condition{if(!condition)throw new Error(reason);}
check(stem&&out&&!extra.length&&!/\.(era|json)$/.test(stem),'Usage: vite-node scripts/verifyUpperArrayFieldHabitat.ts <exact native T36034 pair stem> <new output dir>');
const input=(bytes:Uint8Array):EraInput=>({size:bytes.byteLength,arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
async function bounded(name:string,max:number){
  const info=await stat(name);check(info.size>0&&info.size<=max,'Unsupported size '+name);
  const bytes=await readFile(name);check(bytes.byteLength===info.size,'Changed input '+name);return bytes;
}
const pair=()=>Promise.all([bounded(stem+'.era',ERA_CHECKPOINT_MANIFEST_BYTES),bounded(stem+'.json',ERA_CHECKPOINT_NATIVE_JSON_BYTES)]);
const sourceFiles=await pair();
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const source=await verifyEraCheckpoint(input(sourceFiles[0]),[input(sourceFiles[1])],codec);
const exactSha='ff529b63832705b957d174c1099589bb410cdb269c5356344c8075c30175d239';
check(source.manifest.payloadSha256===exactSha&&source.world.tick===36034&&!source.world.authoredEraOrigin&&!source.world.regionalSimulation,
  'Expected exact native E39 T36034 proof source');
const actorId='elder-danxia-1', observerId='recruit-village-loc-vein-north-vol-5993';
const person=(world:WorldState,id=actorId)=>{
  const actor=world.cultivators.find(row=>row.id===id);
  check(actor?.alive,'Missing live native actor '+id);
  return actor;
};
const decision=(chosenAction:LLMDecisionPayload['chosenAction'],data:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只凭眼前的真路和真材动手。',...data});
const step=(world:WorldState,order=decision('REST'))=>advanceWorldTick(world,Object.fromEntries(world.cultivators.filter(row=>row.alive)
  .map(row=>[row.id,row.id===actorId?order:decision('REST')])));
const upper=(world:WorldState,move:UpperPassageMove)=>{
  const opt=availableUpperPassageActions(person(world),world,world.tick+1).find(row=>row.upperPassageMove===move);
  check(opt,'No legal old passage '+move+' at T'+world.tick);
  return step(world,decision(opt.action,{upperPassageMove:move,targetUpperPassageNodeId:opt.targetUpperPassageNodeId}));
};
const geo=(world:WorldState,move:UpperArrayFieldMove,site:string)=>{
  const opt=availableUpperArrayFieldMovementActions(person(world),world,world.tick+1)
    .find(row=>row.upperArrayFieldMove===move&&row.targetUpperArrayFieldSiteId===site);
  check(opt,'No legal field move '+move+' '+site+' at T'+world.tick);
  return step(world,decision(opt.action,{upperArrayFieldMove:move,targetUpperArrayFieldSiteId:opt.targetUpperArrayFieldSiteId}));
};
const local=(world:WorldState,move:UpperArrayFieldLocalMove)=>{
  const opt=availableUpperArrayFieldLocalActions(person(world),world,world.tick+1).find(row=>row.upperArrayFieldLocalMove===move);
  check(opt,'No legal field work '+move+' at T'+world.tick);
  return step(world,decision(opt.action,{upperArrayFieldLocalMove:move,targetUpperArrayFieldSiteId:opt.targetUpperArrayFieldSiteId}));
};

let world=source.world;
const initialStones=person(world).spiritStones;
check(person(world).herbs.earth_root===0,'Unexpected preloaded carried roots');
for(let i=0;i<4&&person(world).herbs.earth_root<2;i++)world=step(world,decision('GATHER_HERBS',{targetHerbId:'earth_root'}));
check(person(world).herbs.earth_root>=2,'Could not natively carry actual roots before dry hearing expires');
const gatherTick=world.tick, gathered=person(world).herbs.earth_root;
const reopen=availableNorthGateRenewalActions(person(world),world,world.tick+1).find(row=>row.northGateRenewalMove==='sect');
check(reopen,'No lawful dry renewal before hearing closes');
world=step(world,decision(reopen.action,{northGateRenewalMove:'sect',targetNorthGateRenewalId:reopen.targetNorthGateRenewalId}));
const opening=world.coldWaterVein?.openings.at(-1);
check(opening?.borrowedUnits===0&&opening.renewal?.stance==='sect'&&opening.openedTick===world.tick,'Did not pay and reopen actual dry gate');
const paidGate=world.northGateRenewal?.hearing.outcome;
check(paidGate?.kind==='reopened'&&paidGate.paidStones===64,'Missing true sect debit');
for(const move of ['enter','advance','advance','advance','read','advance','petition'] as const)world=upper(world,move);
const councilTick=world.tick;
const oldPassage=JSON.stringify(world.upperPassage);
const reserve=world.upperPassage?.upperReserve;
const bodyAtCouncil=person(world);
check(bodyAtCouncil.locationId==='realm-upper-council'&&bodyAtCouncil.positionPlane==='upper','Did not arrive in literal old council');
let sameAgeOutside=world;
world=geo(world,'enter','array-field-gate');
world=geo(world,'travel','array-field-path');
world=geo(world,'travel','array-field-home');
world=geo(world,'settle','array-field-home');
const paidHome=world.upperArrayField?.residences[0];
check(paidHome?.actorId===actorId&&paidHome.paidRoots===1&&paidHome.paidStones===4,'Missing true home fees');
world=geo(world,'travel','array-field-practice');
world=geo(world,'travel','array-field-source');
const before=person(world), beforeCondense={root:before.herbs.earth_root,stones:before.spiritStones,hp:before.hp};
const condition=step(world);
world=local(world,'condense');
const after=person(world), unworked=person(condition);
check(after.herbs.earth_root===beforeCondense.root-1&&after.spiritStones===unworked.spiritStones-2&&after.hp===unworked.hp-4&&
  upperArrayLatticeStock(world,actorId)===2,'Native resource deltas do not reconcile in production');
const productionTick=world.tick;
world=geo(world,'travel','array-field-practice');
const resting=step(world);
world=local(world,'cultivate');
const practiced=person(world), unpracticed=person(resting);
check(practiced.qiProgress===Math.min(100,unpracticed.qiProgress+6)&&practiced.spiritStones===unpracticed.spiritStones-3&&
  practiced.hp===unpracticed.hp-4&&upperArrayLatticeStock(world,actorId)===1,'Native practice costs or bounded gain mismatch');
while(sameAgeOutside.tick<world.tick)sameAgeOutside=step(sameAgeOutside);
check(JSON.stringify(world.upperPassage)===oldPassage&&world.upperPassage?.upperReserve===reserve&&
  JSON.stringify(world.coldWaterVein)===JSON.stringify(sameAgeOutside.coldWaterVein),
  'Field actions edited old passage, reserve or well debt');
check(world.cultivators.filter(row=>row.id===actorId).length===1&&!projectUpperArrayFieldLocal(world,person(world,observerId))&&
  projectUpperArrayFieldLocal(world,practiced)?.stock===1,'Wrong body or scope');
encodeEraWorldSave(world);
const output=await prepareEraCheckpoint(world,{branchId:'e46-late-native-habitat'},codec,{engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
const verified=await verifyEraCheckpoint(input(output.manifestFile.bytes),output.parts.map(part=>input(part.bytes)),codec);
check(encodeEraWorldSave(verified.world)===encodeEraWorldSave(world)&&encodeEraWorldSave(step(verified.world))===encodeEraWorldSave(step(world)),
  'Completed habitat or next month does not round trip');
const afterInputs=await pair();
check(sourceFiles.every((data,i)=>data.byteLength===afterInputs[i].byteLength&&data.every((byte,j)=>byte===afterInputs[i][j])),
  'Source files changed');
await mkdir(out);
for(const file of [output.manifestFile,...output.parts]){
  const entry=await open(join(out,file.name),'wx');try{await entry.writeFile(file.bytes);}finally{await entry.close();}
}
console.log(JSON.stringify({sourceTick:source.world.tick,sourceSha:exactSha,actorId,gatherTick,gathered,initialStones,openingTick:opening.openedTick,
  gateStones:paidGate.paidStones,oldWaterDebt:opening.borrowedUnits,councilTick,home:paidHome,productionTick,
  practiceTick:world.tick,paidPractice:{stones:3,hp:4,lattice:1,qiGain:practiced.qiProgress-unpracticed.qiProgress},
  ownedLattice:1,payloadSha:output.manifest.payloadSha256,strictReadback:true,nextMonthExact:true,originalUnchanged:true,
  claim:'native late habitat only, not late freight crossing'},null,2));
