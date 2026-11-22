/** Read-only proof audit. Supply exact .era/.json stems in argument order; emits machine-readable scopes, never writes. */
import {readFile,stat} from './centuryNodeRuntime';
import {campaignSHA256} from '../src/engine/campaignMemento';
import {verifyEraCheckpoint} from '../src/engine/eraCheckpointEngine';
import {inspectPhysicalAtlas} from '../src/engine/physicalAtlasEngine';
import {regionForColumn} from '../src/engine/simulationRegionGeometry';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {verifyFrontierTradeAgreement} from '../src/engine/frontierTradeEngine';
import {verifyFrontierPortTradeAgreement} from '../src/engine/frontierPortTradeEngine';
import {verifyFrontierDrylandTradeAgreement} from '../src/engine/frontierDrylandTradeEngine';
import {verifyUpperArrayFieldTradeAgreement} from '../src/engine/upperArrayFieldTradeEngine';
import type {WorldState} from '../src/types/world';
declare const __SECT_UTILITY_RULE_VERSION__:string;
declare const process:{argv:string[];version:string;platform:string};

function requireExact(ok:unknown,msg:string):asserts ok{if(!ok)throw new Error(msg);}
const input=(raw:Uint8Array)=>({size:raw.length,arrayBuffer:async()=>Uint8Array.from(raw).buffer});
const encoder=new TextEncoder(),codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const spec=[
  ['same-lineage-t36034',36034,691834,'ff529b63832705b957d174c1099589bb410cdb269c5356344c8075c30175d239'],
  ['E4-1-paid-west-center',17,210865,'e62118ca1ab29f7c37eeeeeafa8b2755338ffcb0f5931311d4605f6858e46ecf'],
  ['E4-3-farms',57,261927,'01c1a41be20209e1b4d2f2652d2bb9c1d844bd627b3f2e2d61de191c23279fa7'],
  ['E4-4-port-native-payload-reproduction',52,260688,'c0b0a9652db2165f0cc8848b9c7e6d573863dc99f6b508ac5a3e6573cf7d9304'],
  ['E4-5-drylands-native-payload-reproduction',58,259480,'7caaf15ff52f97ddb47e038654e91ff3b15b283659d7d4a101a85622bd1a4e33'],
  ['E4-6-early-array-exchange',71,301581,'8fb80abce9fa5f02314046adf74177116e9d7eee355992b19e0b63c4625c2770'],
  ['E4-6-late-array-residence',36052,692154,'a5ca7c9a9eec911964f5668289061acf04f0ff667ba80c56ea746cadb6c74fb7'],
] as const;
const stems=process.argv.slice(2);
requireExact(stems.length===spec.length&&new Set(stems).size===spec.length,
  '用法：auditNinePhysicalDomains.ts <T36034> <E41-t17> <E43-t57> <E44-t52> <E45-t58> <E46-t71> <E46-t36052> （完整原生包前缀，按序）');
const verified=await Promise.all(spec.map(async([scope,tick,declaredBytes,sha],i)=>{
  const stem=stems[i], [raw,manifest]=await Promise.all([stem+'.json',stem+'.era'].map(async path=>{
    const row=await stat(path);
    requireExact(row.size>=1&&row.size<2_000_000,'本次已知审核样本文件体积不符。');
    return readFile(path);
  }));
  requireExact(raw.byteLength===declaredBytes&&await campaignSHA256(raw)===sha,'原始精确负载不符 '+scope);
  const result=await verifyEraCheckpoint(input(manifest),[input(raw)],codec);
  requireExact(result.world.tick===tick&&result.manifest.payloadSha256===sha&&
    await campaignSHA256(encoder.encode(codec.encode(result.world)))===sha,'严格新内核读回并重新编码不相等：'+scope);
  return {scope,tick,year:result.world.year,month:result.world.month,nativeBytes:raw.byteLength,
    packageBytes:raw.byteLength+manifest.byteLength,sha,packager:result.manifest.engineRuleVersion,manifestId:result.manifest.id,
    strictSameNativeBytes:true,world:result.world};
}));
const [root,paid,farm,port,dryland,upper,late]=verified;
const alive=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id&&row.alive&&row.hp>0);
function liveHouse(world:WorldState,region:string){
  const row=world.frontier?.residences.find(r=>r.regionId===region);
  requireExact(row&&row.paidStones===4&&row.paidRoots===1&&alive(world,row.actorId),region+'无具名实际驻住或支付。');
  const visit=world.frontier?.visits.find(v=>v.id===row.visitId&&v.actorId===row.actorId&&v.regionId===region&&
    v.steps.some(s=>s.siteId===row.homeSiteId&&s.tick<row.settledTick));
  requireExact(visit&&visit.steps.length>=3,region+'无真实旅行到住址。');
  return {actorId:row.actorId,home:row.homeSiteId,homePaidTick:row.settledTick,entryTick:visit.enteredTick,
    visitId:visit.id,chartPositions:visit.steps.map(v=>v.siteId)};
}
const populated=inspectPhysicalAtlas(root.world).regions;
requireExact(populated.map(row=>[row.id,row.tileCount].join(':')).join(',')==='west:135,center:120,east:120'&&
  !root.world.frontier&&!root.world.upperPassage&&!root.world.upperArrayField,'将独立地域误算进了长时线源。');
const rural=root.world.settlements.villages.reduce((sum,row)=>sum+row.population,0);
requireExact(root.world.cultivators.length===22&&root.world.cultivators.filter(row=>row.alive&&row.hp>0).length===2&&rural===268,
  '长时线源两类人口不等于既证原始口径。');
const road=inspectPhysicalAtlas(paid.world).routes.flatMap(r=>r.traversals).find(row=>row.kind==='road_crossing'&&row.observedTick===17);
const roadBorder=road?.borders.find(border=>border.from.regionId==='west'&&border.to.regionId==='center');
requireExact(roadBorder?.from.address.tileId==='tile-8-12'&&roadBorder.to.address.tileId==='tile-9-12'&&road,
  '未在原路档实际找到已付并走的西中界。');

const farmDeal=farm.world.frontier?.trade?.agreements.find(row=>row.status==='exchanged');
const farmLocal=farm.world.frontier?.production;
requireExact(farmDeal&&verifyFrontierTradeAgreement(farm.world,farmDeal)&&farmLocal,'旧农区原生交割不真实。');
const northHouse=liveHouse(farm.world,'north-snow'),southHouse=liveHouse(farm.world,'south-marsh');
const northPractice=farmLocal.receipts.find(row=>row.actorId===northHouse.actorId&&row.kind==='cultivate'&&row.tick===57&&row.qiGained>0);
const northHarvest=farmLocal.batches.find(row=>row.regionId==='north-snow'&&row.harvesterId===northHouse.actorId&&row.good==='frost_dose');
const southHarvest=farmLocal.batches.find(row=>row.regionId==='south-marsh'&&row.harvesterId===southHouse.actorId&&row.good==='ward_reed');
requireExact(northPractice&&northHarvest&&southHarvest&&farmDeal.north?.lots.some(list=>list.batchId===northHarvest.id)&&
  farmDeal.south?.lots.some(list=>list.batchId===southHarvest.id),'农区无实际本地生产及原批交换。');

const portHouse=liveHouse(port.world,'east-offshore');
const portDeal=port.world.frontier?.port?.trade?.agreements.find(row=>row.sellerId===portHouse.actorId&&row.status==='fulfilled');
const voyage=portDeal?.voyage;
const actualRepair=port.world.frontier?.port?.receipts.find(row=>row.actorId===portHouse.actorId&&row.move==='repair'&&row.tick===52);
const portHarvest=port.world.frontier?.port?.receipts.find(row=>row.actorId===portHouse.actorId&&row.move==='gather'&&row.tick===21);
requireExact(portDeal&&verifyFrontierPortTradeAgreement(port.world,portDeal)&&voyage?.inlandArrivedTick===40&&voyage.receivedTick===41&&
  voyage.returnedTick===49&&actualRepair?.rootsSpent===2&&actualRepair.hullDelta===2&&
  voyage.lots.some(row=>row.batchId===portHarvest?.batchId)&&voyage.walks.some(row=>voyage.checkpoints[row.step]?.tileId==='frontier-east-outer'),
  '东海外港没有真实生活、海程原批或返根维修。');

const westHouse=liveHouse(dryland.world,'western-saltwell'),ridgeHouse=liveHouse(dryland.world,'plateau-thunderridge');
const local=dryland.world.frontier?.drylands;
const route=local?.trade?.agreements.find(r=>r.status==='exchanged');
const westCargo=route?.west,ridgeCargo=route?.ridge;
requireExact(local&&route&&verifyFrontierDrylandTradeAgreement(dryland.world,route)&&westCargo&&ridgeCargo&&route.closedTick===58,
  '西漠至雷脊没有已完成的原生互换。');
const tiles=new Map(dryland.world.terrain.tiles.map(row=>[row.id,row]));
const walked=westCargo.walks.map(stamp=>({tick:stamp.tick,point:westCargo.checkpoints[stamp.step]})).filter(row=>row.point.chartId==='lower-base');
const oldBorders=walked.slice(1).flatMap((next,i)=>{
  const previous=walked[i],a=tiles.get(previous.point.tileId),b=tiles.get(next.point.tileId);
  const from=a&&regionForColumn(a.col,dryland.world.terrain.columns),to=b&&regionForColumn(b.col,dryland.world.terrain.columns);
  return from&&to&&from!==to?[{from,to,edge:[previous.point.tileId,next.point.tileId],tick:next.tick}]:[];
});
requireExact(oldBorders.map(row=>row.from+'>'+row.to).join(',')==='west>center,center>east','旧三域边界只写在路径计划中，没有实际两次走过。');
const salt=local.batches.find(batch=>batch.actorId===westHouse.actorId&&batch.good==='rift_salt');
const ore=local.batches.find(batch=>batch.actorId===ridgeHouse.actorId&&batch.good==='stormstone');
requireExact(salt&&ore&&westCargo.lots.some(piece=>piece.batchId===salt.id)&&ridgeCargo.lots.some(piece=>piece.batchId===ore.id),
  '西漠或雷脊无实际产出批。');
const upperTrade=upper.world.upperArrayField?.trade?.agreements.find(row=>row.status==='settled');
const lateState=late.world.upperArrayField;
const lateHome=lateState?.residences.find(row=>row.paidStones===4&&row.paidRoots===1&&row.settledTick===36047);
const lateVisit=lateState?.visits.find(row=>row.id===lateHome?.visitId&&row.actorId===lateHome.actorId);
const resident=lateHome&&alive(late.world,lateHome.actorId);
const practice=lateState?.production?.receipts.find(row=>row.move==='cultivate'&&row.actorId===resident?.id&&row.tick===36052);
requireExact(upperTrade&&verifyUpperArrayFieldTradeAgreement(upper.world,upperTrade)&&upperTrade.wellProjectId==='village-work-1'&&
  upperTrade.settlement?.crossingOpeningId==='water-gate-68'&&lateHome&&lateVisit?.exitedTick===undefined&&
  resident?.positionPlane==='upper'&&resident.locationId==='array-field-practice'&&practice?.move==='cultivate'&&
  practice.afterQi-practice.beforeQi===6&&!lateState?.trade,'上界阵原欠真驻住、真修行或独立早年原井交割。');

const src=(p:typeof root)=>p.scope;
const domains=[
  {id:'west',chart:'lower-base',source:src(paid),witness:'paid_real_road',at:17,edge:[roadBorder.from.address.tileId,roadBorder.to.address.tileId]},
  {id:'center',chart:'lower-base',source:src(paid),witness:'paid_real_road',at:17,edge:[roadBorder.from.address.tileId,roadBorder.to.address.tileId]},
  {id:'east',chart:'lower-base',source:src(dryland),witness:'delivered_cargo_crossed_base_border',border:oldBorders[1]},
  {id:'north-snow',chart:'chart-north-snow',source:src(farm),residency:northHouse,producedTick:northHarvest.harvestedTick,actualExchange:farmDeal.closedTick,nativePractice:northPractice.tick},
  {id:'south-marsh',chart:'chart-south-marsh',source:src(farm),residency:southHouse,producedTick:southHarvest.harvestedTick,actualExchange:farmDeal.closedTick},
  {id:'east-offshore',chart:'chart-east-offshore',source:src(port),residency:portHouse,producedTick:portHarvest!.tick,actualTrade:voyage.receivedTick,nativeRepair:actualRepair.tick},
  {id:'western-saltwell',chart:'chart-western-saltwell',source:src(dryland),residency:westHouse,producedTick:salt.tick,actualExchange:route.closedTick},
  {id:'plateau-thunderridge',chart:'chart-plateau-thunderridge',source:src(dryland),residency:ridgeHouse,producedTick:ore.tick,actualExchange:route.closedTick},
  {id:'upper-array-field',chart:'chart-upper-array-field',source:src(late),homePaidTick:lateHome.settledTick,actorId:resident.id,visitId:lateVisit!.id,
    practiceTick:practice.tick,earlyTradeSource:src(upper),earlyActualWellExchange:upperTrade.settlement.tick,lateTradeNotClaimed:true},
];
requireExact(new Set(domains.map(row=>row.id)).size===9,'地域重复。');
console.log(JSON.stringify({kind:'scope',executionBuild:__SECT_UTILITY_RULE_VERSION__,node:process.version,platform:process.platform,
  independentlyVerifiedDistinctDomains:domains.length,inOneWorld:false,longitudinalSourceActiveCharts:populated.map(r=>r.id),
  longitudinalSourcePopulation:{registeredCultivators:root.world.cultivators.length,livingCultivators:2,ruralPopulation:rural}}));
for(const {world:_world,...source} of verified)console.log(JSON.stringify({kind:'source',...source}));
for(const row of domains)console.log(JSON.stringify({kind:'domain',...row}));
