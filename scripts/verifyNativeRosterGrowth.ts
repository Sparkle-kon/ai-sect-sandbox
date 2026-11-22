import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ActorRoster} from '../src/components/ActorRoster';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {prepareEraCheckpoint,verifyEraCheckpoint,type EraInput} from '../src/engine/eraCheckpointEngine';
import {campaignSHA256} from '../src/engine/campaignMemento';
import {projectProtagonistSuccession} from '../src/engine/protagonistSuccession';
import {buildChronicleFocusTargets,resolveChronicleFocus} from '../src/engine/chronicleFocusEngine';
import {ACTOR_PAGE_SIZE,createActorRosterIndex,getActorRosterPage,partitionActorRosterPage} from '../src/components/actorRosterIndex';
import {projectRosterFocalId,projectRosterStoryRead,resolveRosterStoryRead} from '../src/components/rosterStoryRead';
import type {WorldState} from '../src/types/world';
import {join,mkdir,open,readFile,stat} from './centuryNodeRuntime';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];exitCode?:number;version:string;platform:string;resourceUsage():{maxRSS:number}};
const [directory,...extra]=process.argv.slice(2);
const seed=0, months=500, sealEvery=100, encoder=new TextEncoder();
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const next=(world:WorldState)=>advanceWorldTick(world,undefined,undefined,'utility',undefined,
  {captureTrace:false,capturePresentation:false});
const alive=(actor:WorldState['cultivators'][number])=>actor.alive&&actor.hp>0;
function check(condition:unknown,label:string):asserts condition{if(!condition)throw Error(label);}
const started=performance.now();
const log=(kind:string,observed:unknown)=>console.log(JSON.stringify({kind,observed,elapsedMs:Math.round(performance.now()-started),
  peakRssKiB:process.resourceUsage().maxRSS,engine:__SECT_UTILITY_RULE_VERSION__}));
const digest=(text:string)=>campaignSHA256(encoder.encode(text));
async function write(path:string,value:string|Uint8Array){
  const fd=await open(path,'wx');
  try{await fd.writeFile(value);await fd.sync();}finally{await fd.close();}
}
async function input(path:string):Promise<EraInput>{
  const {size}=await stat(path);
  return {size,arrayBuffer:async()=>Uint8Array.from(await readFile(path)).buffer};
}
type Recruit={actorId:string;recruitedTick:number;recordId:string;sourceSite:string};
const nativeRecruits=new Map<string,Recruit>();
const frame=(world:WorldState)=>({tick:world.tick,year:world.year,month:world.month,registered:world.cultivators.length,
  living:world.cultivators.filter(alive).length,ordinaryResidents:world.settlements.villages.reduce((sum,row)=>sum+row.population,0)});
function scanRecruitments(world:WorldState){
  for(const receipt of world.settlements.records){
    if(receipt.kind!=='recruitment'||receipt.tick!==world.tick||receipt.people!==1||!receipt.cultivatorId||
      !receipt.volunteerId||receipt.cultivatorId!==`recruit-${receipt.volunteerId}`)continue;
    const actor=world.cultivators.find(row=>row.id===receipt.cultivatorId);
    if(!actor)continue;
    const village=world.settlements.villages.find(row=>row.id===receipt.settlementId);
    if(village)nativeRecruits.set(receipt.cultivatorId,{actorId:receipt.cultivatorId,recruitedTick:receipt.tick,
      recordId:receipt.id,sourceSite:village.locationId});
  }
}
function rosterPath(world:WorldState,id:string){
  const actor=world.cultivators.find(row=>row.id===id);
  if(!actor)return undefined;
  const indexByIdentity=createActorRosterIndex(world);
  check(indexByIdentity.byId.get(id)===actor,'Index chose a different stored actor');
  const total=getActorRosterPage(world,'','all',0);
  const index=world.cultivators.findIndex(row=>row.id===id);
  const requested=Math.floor(index/ACTOR_PAGE_SIZE);
  const page=getActorRosterPage(world,'','all',requested);
  const searched=getActorRosterPage(world,actor.name,actor.alive?'living':'fallen',0);
  const exactNameIndex=Array.from({length:searched.pages},(_,i)=>getActorRosterPage(world,actor.name,actor.alive?'living':'fallen',i))
    .find(row=>row.actors.some(row=>row.id===actor.id));
  check(page.total===total.total&&page.total===world.cultivators.length&&page.actors.some(row=>row.id===actor.id)&&exactNameIndex,
    'The actual roster cannot resolve a selected stable actor');
  return {id:actor.id,name:actor.name,alive:alive(actor),index,page:page.page+1,pages:page.pages,nameHits:searched.total,
    exactSearchPage:exactNameIndex.page+1,sameNameContext:indexByIdentity.sameName.get(actor)??null,origin:nativeRecruits.get(id)??null};
}
function selectScene(world:WorldState){
  const ids=[...new Set(world.witnessedPersonalStory.scenes.flatMap(row=>row.witnessIds))];
  let best:ReturnType<typeof candidate>;
  function candidate(id:string){
    const person=world.cultivators.find(row=>row.id===id);
    if(!person||!alive(person))return undefined;
    const scope=`strict-native-roster:${world.tick}`, stamp=projectRosterStoryRead(world,scope,id);
    if(!stamp)return undefined;
    const view=resolveRosterStoryRead(world,scope,stamp);
    if(!view?.scenes.length)return undefined;
    check(!resolveRosterStoryRead(world,`sibling:${world.tick}`,stamp),'A historical roster read escaped branch scope');
    for(const scene of view.scenes){
      const exact=world.witnessedPersonalStory.scenes.find(row=>row.eventId===scene.eventId&&row.witnessIds.includes(id));
      if(!exact)continue;
      const focus=buildChronicleFocusTargets(world,scene.eventId,id).links.find(link=>link.kind==='site'&&link.targetId===exact.siteId);
      if(!focus||!resolveChronicleFocus(world,focus,id).ok)continue;
      const original=world.events.find(row=>row.id===scene.eventId);
      if(!original||original.tick!==scene.tick||original.locationId!==exact.siteId)continue;
      const path=rosterPath(world,id);
      if(!path)continue;
      return {viewerId:id,scene,focus,roster:path,sampleTick:world.tick,scope,wrongScopeRejected:true,
        score:Number(!!path.origin)*4+Number(path.page>1)*2+Number(exact.actorIds.includes(id))};
    }
    return undefined;
  }
  for(const id of ids){
    const row=candidate(id);
    if(row&&(!best||row.score>best.score||row.score===best.score&&row.sampleTick>best.sampleTick))best=row;
  }
  return best;
}
async function seal(world:WorldState,tag:string){
  check(directory,'Missing evidence path');
  const raw=encodeEraWorldSave(world),before=await digest(raw);
  const pack=await prepareEraCheckpoint(world,{branchId:'p1610-native-roster',label:tag},codec,
    {engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
  const paths=[pack.manifestFile,...pack.parts].map(file=>join(directory,`${tag}-${file.name}`));
  for(const [index,file] of [pack.manifestFile,...pack.parts].entries())await write(paths[index],file.bytes);
  const physical=await Promise.all(paths.map(input));
  const read=await verifyEraCheckpoint(physical[0],physical.slice(1),codec);
  check(encodeEraWorldSave(read.world)===raw&&read.manifest.payloadSha256===before,'Strict checkpoint did not restore exact native bytes');
  const direct=encodeEraWorldSave(next(world)),replayed=encodeEraWorldSave(next(read.world));
  check(replayed===direct,'Strict readback changes the following actual monthly Utility result');
  return {world:read.world,proof:{...frame(world),paths,rawBytes:pack.manifest.payloadBytes,rawSha256:before,nextSha256:await digest(direct)}};
}
async function main(){
  check(directory&&extra.length===0,'Usage: vite-node scripts/verifyNativeRosterGrowth.ts NEW_OUTPUT_DIRECTORY');
  await mkdir(directory,{recursive:false});
  let world=createInitialWorld(seed),bestFrame:WorldState|undefined,best:ReturnType<typeof selectScene>;
  const initial=frame(world),seals=[];
  log('initial',initial);
  let lastVerified=0;
  try{
    for(let step=0;step<=months;step++){
      if(step){
        const old=world;
        world=next(world);
        check(world.tick===old.tick+1&&world.interventionSequence===old.interventionSequence,'A real native month was skipped/edited');
        scanRecruitments(world);
      }
      if(step%sealEvery===0){
        const actual=await seal(world,`t${world.tick}`);
        lastVerified=world.tick;seals.push(actual.proof);world=actual.world;log('strict_step',actual.proof);
      }
      const row=selectScene(world);
      if(row&&(!best||row.score>best.score||row.score===best.score&&row.sampleTick>best.sampleTick)){
        best=row;bestFrame=world;
      }
    }
    check(best&&bestFrame,'No authorized actual exact actor/event scene returned');
    const proofWindow=best.sampleTick===world.tick?undefined:await seal(bestFrame,'actual-story-window');
    const reopened=proofWindow?.world??world;
    check(JSON.stringify(selectScene(reopened))===JSON.stringify(best),'Actual story path did not reopen under the same actor and scope');
    const lastRead=projectRosterStoryRead(reopened,best.scope,best.viewerId);
    const sameBytesNewFrame=decodeEraWorldSave(encodeEraWorldSave(reopened));
    check(lastRead&&!resolveRosterStoryRead(sameBytesNewFrame,best.scope,lastRead),
      'A read receipt was reused after strict restoration without being reissued');
    const hero=projectProtagonistSuccession(world).active;
    const heroProof=hero?rosterPath(world,hero.actorId):undefined;
    const heroId=projectRosterFocalId(world),indexed=createActorRosterIndex(world);
    const emptySearch=getActorRosterPage(world,'no-native-name-matches-this','fallen',0);
    const pinned=partitionActorRosterPage(indexed,emptySearch.actors,undefined,heroId);
    if(heroId)check(heroId===hero?.actorId&&emptySearch.total===0&&pinned.pinned.length===1&&pinned.pinned[0].actor.id===heroId,
      'Earned focal actor disappeared behind a filtered page');
    const lateRecruit=world.cultivators.find(row=>alive(row)&&nativeRecruits.has(row.id));
    const terminalRecruit=lateRecruit?rosterPath(world,lateRecruit.id):undefined;
    check(nativeRecruits.size===world.cultivators.length-initial.registered,'Roster growth included unproven or duplicate actors');
    const selected=createActorRosterIndex(reopened).byId.get(best.viewerId),sceneFocal=projectRosterFocalId(reopened);
    check(selected,'The saved scene reader has no exact indexed native actor');
    const markup=renderToStaticMarkup(createElement(ActorRoster,{world:reopened,selected,scopeKey:best.scope,
      focalId:sceneFocal,scene:lastRead.scene,onSelect:()=>undefined,onReadScene:()=>undefined}));
    const actorRows=markup.match(/aria-pressed=/gu)?.length??0;
    const focalPerson=sceneFocal?createActorRosterIndex(reopened).byId.get(sceneFocal):undefined;
    check(actorRows<=ACTOR_PAGE_SIZE+2&&actorRows>0&&markup.includes('已选人物')&&markup.includes(selected.name)&&
      markup.includes(best.scene.title)&&/读(?:主角的|此人的)这一幕/u.test(markup)&&
      (!focalPerson||markup.includes('主角')&&markup.includes(focalPerson.name))&&
      !markup.includes(best.scene.eventId)&&!markup.includes(best.viewerId)&&(!sceneFocal||!markup.includes(sceneFocal)),
      'Canonical SSR omitted the real selected actor/scene or leaked an internal identity');
    const markupPath=join(directory,'actual-roster.ssr.html');
    await write(markupPath,markup);
    const report={seed,months,defaults:{utility:true,overrides:0,regional:0,author:0},environment:{node:process.version,platform:process.platform},
      source:initial,terminal:frame(world),verifiedNativeRecruits:nativeRecruits.size,seals,
      reachablePersonalScene:best,sceneFrame:proofWindow?.proof,terminalRecruit,earnedCurrentHero:heroProof??null,
      pinnedThroughEmptyFallenFilter:heroId??null,sameDateDifferentFrameStampRejected:true,
      serverMarkup:{path:markupPath,actorRows,maximumRows:ACTOR_PAGE_SIZE+2,actualSelectedName:selected.name,actualFocalName:focalPerson?.name??null,
        actualSceneTitle:best.scene.title,noRawIds:true,notBrowserOrDevice:true}};
    await write(join(directory,'summary.json'),JSON.stringify(report,null,2)+'\n');
    log('complete',report);
  }catch(error){
    log('first_blocker',{attempted:frame(world),lastVerified,error:String(error)});
    throw error;
  }
}
try{await main();}catch(error){console.error(error);process.exitCode=1;}
