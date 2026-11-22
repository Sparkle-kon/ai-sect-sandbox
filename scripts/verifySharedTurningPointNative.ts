import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {prepareEraCheckpoint,verifyEraCheckpoint,type EraInput} from '../src/engine/eraCheckpointEngine';
import {campaignSHA256} from '../src/engine/campaignMemento';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {availableChronicleChapter,resolveChronicleChapter} from '../src/engine/novelGenerator';
import {projectSharedTurningPoints} from '../src/components/sharedTurningPointsModel';
import {marketClosureReason} from '../src/engine/marketEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {join,mkdir,open,readFile,stat} from './centuryNodeRuntime';

declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];exitCode?:number};
const su='npc-2',du='recruit-village-loc-market-east-vol-3',sameNamed='recruit-village-loc-market-vol-8';
const east='loc-market-east',middle='loc-market';
const oldRaw='b59ea2a7fc5ebbc46e04a6b162b422956606f9667309e331ba0dc4b68bce0b7b';
const oldManifest='2d4742b2d9c31d77733f1c02a7f991ad3f3f37e6ff4a49811b4da64a138bdf0d';
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const encoder=new TextEncoder();
const hash=(raw:string)=>campaignSHA256(encoder.encode(raw));
const person=(w:WorldState,id:string)=>w.cultivators.find(row=>row.id===id)!;
const live=(p:WorldState['cultivators'][number])=>p.alive&&p.hp>0;
function check(ok:unknown,why:string):asserts ok{if(!ok)throw Error(why);}
const order=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'亲到坊市，照原委托和本人所见行事。',...fields});
const month=(w:WorldState,choices:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(w,
  Object.fromEntries(w.cultivators.filter(live).map(a=>[a.id,choices[a.id]??order('REST')])),undefined,'utility',undefined,
  {captureTrace:false,capturePresentation:false});
const pickup=(w:WorldState,id:string)=>({stones:person(w,id).spiritStones,jade:person(w,id).herbs.jade_leaf});
function visit(w:WorldState,id:string,site:string,other:Record<string,LLMDecisionPayload>={}){
  check(knownMapLocations(w,person(w,id)).some(row=>row.id===site),id+' already knows the actual site');
  const advanced=month(w,{...other,[id]:order('EXPLORE',{targetLocationId:site})});
  check(person(advanced,id).locationId===site,id+' did not physically reach '+site);
  return advanced;
}
async function input(path:string):Promise<EraInput>{
  const {size}=await stat(path);
  return {size,arrayBuffer:async()=>Uint8Array.from(await readFile(path)).buffer};
}
async function write(path:string,value:string|Uint8Array){
  const fd=await open(path,'wx');
  try{await fd.writeFile(value);await fd.sync();}finally{await fd.close();}
}
function exactFill(w:WorldState,site:string,buyerId:string,sellerId:string){
  check(person(w,buyerId).locationId===site&&person(w,sellerId).locationId===site,'Named originals are not co-located');
  const cost=11,beforeBuyer=pickup(w,buyerId),beforeSeller=pickup(w,sellerId);
  check(beforeBuyer.stones>=cost&&beforeSeller.jade>=1&&!marketClosureReason(w,site),'No real stock or quote');
  const terms={marketGood:'jade_leaf' as const,marketQuantity:1,marketLimitPrice:cost};
  const advanced=month(w,{[buyerId]:order('PLACE_MARKET_BUY',terms),[sellerId]:order('PLACE_MARKET_SELL',terms)});
  const receipts=advanced.markets.receipts.filter(row=>row.tick===advanced.tick&&row.status==='local_fill'&&
    row.buyerId===buyerId&&row.sellerId===sellerId&&row.originId===site&&row.destinationId===site);
  check(receipts.length===1,'No exact paired local native settlement');
  const row=receipts[0],eventId=`evt-${advanced.tick}-market-fill-${row.sequence}`;
  const event=advanced.events.find(fact=>fact.id===eventId),node=advanced.chronicleCausality.nodes.find(fact=>fact.eventId===eventId);
  check(row.good==='jade_leaf'&&row.quantity===1&&row.unitPrice===cost&&event&&event.witnessScope===undefined&&
    event.locationId===site&&JSON.stringify(event.actorIds)===JSON.stringify([buyerId,sellerId])&&
    node?.kind==='market_settlement'&&node.outcome==='local_fill'&&node.entityId===row.id,'Native source proof mismatch');
  const matchingOrders=node.predecessors.map(link=>advanced.chronicleCausality.nodes.find(row=>row.eventId===link.eventId));
  check(matchingOrders.length===2&&matchingOrders.some(row=>row?.kind==='market_buy_order'&&advanced.events.some(event=>event.id===row.eventId&&event.actorIds[0]===buyerId))&&
    matchingOrders.some(row=>row?.kind==='market_sell_order'&&advanced.events.some(event=>event.id===row.eventId&&event.actorIds[0]===sellerId)),'No two exact matching order sources');
  const afterBuyer=pickup(advanced,buyerId),afterSeller=pickup(advanced,sellerId);
  const actualFlows=advanced.resourceFlow.months.flatMap(month=>month.entries)
    .filter(flow=>flow.tick===advanced.tick&&flow.mechanism==='market'&&flow.refId===row.id&&flow.reason==='local_fill');
  check(actualFlows.length===2&&actualFlows.some(flow=>flow.kind==='transfer'&&flow.good==='stone'&&flow.amount===cost&&
    flow.from.kind==='order'&&flow.to.kind==='actor'&&flow.to.id===sellerId&&
    matchingOrders.some(order=>order?.kind==='market_buy_order'&&order.entityId===flow.from.id))&&
    actualFlows.some(flow=>flow.kind==='transfer'&&flow.good==='jade_leaf'&&flow.amount===1&&
      flow.from.kind==='order'&&flow.to.kind==='actor'&&flow.to.id===buyerId&&
      matchingOrders.some(order=>order?.kind==='market_sell_order'&&order.entityId===flow.from.id)),
      'Exact per-receipt inventory movement missing');
  return {advanced,witness:{eventId,receipt:row,site,beforeBuyer,beforeSeller,afterBuyer,afterSeller,actualFlows,
    matchedOrderEventIds:node.predecessors.map(edge=>edge.eventId)}};
}
function distinctSocial(w:WorldState,id:string,partnerId:string){
  const eventId=`evt-${w.tick}-${id}-social`,event=w.events.find(row=>row.id===eventId);
  check(event&&event.witnessScope===undefined&&event.actorIds[0]===id&&event.actorIds[1]===partnerId&&
    !event.actorIds.includes(id===su?du:su),'Separate native scene missing or blended');
  return {eventId,tick:event.tick,actorId:id,partnerId,site:event.locationId};
}
function canonicalChapter(world:WorldState,exactFacts:readonly string[]){
  const plan=availableChronicleChapter(world,true);
  check(plan&&exactFacts.every(eventId=>plan.anchors.some(anchor=>anchor.id===eventId)),
    'Native public chapter did not pick every relevant actual anchor: '+exactFacts.join(','));
  const chapter=resolveChronicleChapter(world,plan);
  check(chapter?.source==='utility','Native public chapter failed');
  return chapter;
}
async function seal(w:WorldState,dir:string,tag:string){
  const raw=encodeEraWorldSave(w),pack=await prepareEraCheckpoint(w,{branchId:'p171-native-'+tag,label:tag},codec,
    {engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
  const files=[pack.manifestFile,...pack.parts],paths=files.map(file=>join(dir,tag+'-'+file.name));
  for(const [i,file] of files.entries())await write(paths[i],file.bytes);
  const encoded=await Promise.all(paths.map(input)),restored=await verifyEraCheckpoint(encoded[0],encoded.slice(1),codec);
  check(encodeEraWorldSave(restored.world)===raw,'Physical raw after reopen did not match');
  const expected=encodeEraWorldSave(month(w)),resumed=encodeEraWorldSave(month(restored.world));
  check(expected===resumed,'Next original native month after reload differs');
  return {world:restored.world,proof:{tag,tick:w.tick,paths,rawBytes:pack.manifest.payloadBytes,
    rawSha256:pack.manifest.payloadSha256,nextSha256:await hash(expected)}};
}
async function main(){
  const [dir,manifestPath,partPath,...extra]=process.argv.slice(2);
  check(dir&&manifestPath&&partPath&&!extra.length,'Usage: vite-node scripts/verifySharedTurningPointNative.ts NEW_OUTPUT T401.era T401.json');
  const original=async()=>await Promise.all([manifestPath,partPath].map(async path=>campaignSHA256(await readFile(path))));
  check(JSON.stringify(await original())===JSON.stringify([oldManifest,oldRaw]),'Incorrect physical T401 source');
  const old=await verifyEraCheckpoint(await input(manifestPath),[await input(partPath)],codec);
  const source=old.world,raw=encodeEraWorldSave(source);
  check(source.tick===401&&await hash(raw)===oldRaw,'Not the unchanged true P16-10 root');
  const arcs=source.protagonistSuccession.arcs.filter(row=>row.actorId===su||row.actorId===du);
  check(arcs.some(row=>row.actorId===su&&row.openedTick===125&&row.endedTick===391&&row.closeReason==='receded')&&
    arcs.some(row=>row.actorId===du&&row.openedTick===391&&row.endedTick===undefined),'Not two genuinely independently earned lines');
  check(du!==String(sameNamed)&&person(source,du).name===person(source,sameNamed).name&&live(person(source,sameNamed)),
    'No existing same-name counterparty, never rename a person');
  await mkdir(dir,{recursive:false});
  const controlled=decodeEraWorldSave(raw);
  canonicalChapter(controlled,[]);
  const prior=month(visit(controlled,du,east));
  canonicalChapter(prior,[]);
  const first=exactFill(prior,east,su,du);
  const sibling=exactFill(prior,east,su,sameNamed);
  check(first.witness.eventId===sibling.witness.eventId&&sibling.advanced.tick===first.advanced.tick&&
      sibling.witness.receipt.sellerId!==first.witness.receipt.sellerId,'Not a genuine conflicting same-tick branch pair');
  const [firstPass,siblingPass]=await Promise.all([seal(first.advanced,dir,'first-meeting'),seal(sibling.advanced,dir,'separate-same-tick')]);
  const alternateOnExactDate=month(month(siblingPass.world));
  const alternateChapter=canonicalChapter(alternateOnExactDate,[sibling.witness.eventId]);
  const alternateView=projectSharedTurningPoints(alternateOnExactDate,alternateChapter.id,su);
  check(!alternateView.some(row=>row.eventId===sibling.witness.eventId&&row.people.some(person=>person.actorId===du)),
    'Original focal person incorrectly substituted for same-name counterparty');
  const distinct1=visit(firstPass.world,du,middle,{[su]:order('SOCIALIZE',{targetCultivatorId:'npc-5'})});
  const traceA=distinctSocial(distinct1,su,'npc-5');
  const distinct2=month(distinct1,{[du]:order('SOCIALIZE',{targetCultivatorId:'npc-6'})});
  const traceB=distinctSocial(distinct2,du,'npc-6');
  check(traceA.site===east&&traceB.site===middle,'No genuine separation in two actual places');
  const firstChapter=canonicalChapter(distinct2,[first.witness.eventId]);
  check(firstChapter.id===alternateChapter.id,'The native same-tick competing chapter identity differs');
  const together=month(month(visit(distinct2,su,middle))),reunion=exactFill(together,middle,du,su);
  const reunionChapter=canonicalChapter(reunion.advanced,[reunion.witness.eventId]);
  const opened=(world:WorldState)=>[...projectSharedTurningPoints(world,firstChapter.id,su),
    ...projectSharedTurningPoints(world,reunionChapter.id,su)];
  const shared=opened(reunion.advanced);
  const pairFirst=shared.find(row=>row.eventId===first.witness.eventId),pairReunion=shared.find(row=>row.eventId===reunion.witness.eventId);
  check(pairFirst&&!pairFirst.reunion&&pairFirst.people[0].actorId===su&&pairFirst.people[1].actorId===du&&
    pairFirst.people[0].aftermath?.eventId===traceA.eventId&&pairFirst.people[1].aftermath?.eventId===traceB.eventId,
    'Production meeting view missing exact independent aftermath: '+JSON.stringify(shared));
  check(pairReunion?.reunion&&pairReunion.people[0].actorId===du&&pairReunion.people[1].actorId===su,
    'Production reunion did not preserve reversed original roles');
  const terminal=await seal(reunion.advanced,dir,'reunion'),split=await seal(distinct2,dir,'split-outcomes');
  check(JSON.stringify(opened(terminal.world))===JSON.stringify(shared),
    'Production personal and shared proof changes across physical restore');
  // A detached missing-proof resolver check, not a mutation of either genuine saved branch.
  const noReceipt=structuredClone(terminal.world);
  noReceipt.markets.receipts=noReceipt.markets.receipts.filter(row=>row.id!==first.witness.receipt.id);
  check(!projectSharedTurningPoints(noReceipt,firstChapter.id,su).some(row=>row.eventId===first.witness.eventId),
    'A chapter alone reconstructed the missing exact receipt');
  check(encodeEraWorldSave(source)===raw&&JSON.stringify(await original())===JSON.stringify([oldManifest,oldRaw]),
    'The root moved during the branch trial');
  const story={kind:'actual_shared_turning_point_native',engineRule:__SECT_UTILITY_RULE_VERSION__,source:{tick:401,sha256:oldRaw,
    manifest:old.manifest.id,fileUnchanged:true},arcIdentities:arcs.map(row=>({id:row.id,actorId:row.actorId,openedTick:row.openedTick,
      endedTick:row.endedTick,closeReason:row.closeReason})),
    controller:'Controlled legal orders and native travel/social actions, other actors REST; stored world RNG, no clock/state edits.',
    first:first.witness,sibling:{...sibling.witness,sameName:person(source,sameNamed).name},split:[traceA,traceB],reunion:reunion.witness,
    shared,alternateView,chapterIds:[firstChapter.id,reunionChapter.id],
    missingEvidenceProbe:{detachedOnly:true,missingExactReceipt:first.witness.receipt.id,projectionRefused:true},
    seals:[firstPass.proof,siblingPass.proof,split.proof,terminal.proof]};
  await write(join(dir,'summary.json'),JSON.stringify(story,null,2)+'\n');
  console.log(JSON.stringify(story));
}
try{await main();}catch(error){console.error(error);process.exitCode=1;}
