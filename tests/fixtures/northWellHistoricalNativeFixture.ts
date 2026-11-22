import {createInitialWorld} from '../../src/data/initialWorld';
import {knownMapLocations} from '../../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../../src/engine/worldEngine';
import {availableSettlementActions} from '../../src/engine/settlementEngine';
import {availableNorthMiningCharterActions} from '../../src/engine/northMiningCharterEngine';
import {availableVillageSupplyActions} from '../../src/engine/villageSupplyEngine';
import {granaryAt} from '../../src/engine/villageGranaryEngine';
import {NORTH_MINING_MARKET,NORTH_MINING_SETTLEMENT,NORTH_MINING_SITE} from '../../src/engine/northMiningCharterTerms';
import type {LLMDecisionPayload,NorthMiningStance,WorldState} from '../../src/types/world';

function requireFixture(condition:unknown,message:string):asserts condition {
  if(!condition)throw new Error(`北井原生夹具不成立：${message}`);
}
const elder='elder-danxia-1', miner='npc-6';
const actor=(world:WorldState,id=elder)=>world.cultivators.find(item=>item.id===id)!;
const a=(chosenAction:LLMDecisionPayload['chosenAction'],extra:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'按在册原件实做。',...extra});
const water=(waterVeinMove:NonNullable<LLMDecisionPayload['waterVeinMove']>)=>a('WATER_VEIN',{waterVeinMove,targetLocationId:NORTH_MINING_SITE});
const charter=(northMiningMove:'propose'|'sign',value:string)=>
  a('NORTH_MINING_CHARTER',northMiningMove==='propose'?{northMiningMove,northMiningStance:value as NorthMiningStance}:
    {northMiningMove,targetNorthMiningCharterId:value});
const step=(world:WorldState,overrides:Record<string,LLMDecisionPayload>={})=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(row=>[row.id,overrides[row.id]??a('REST')])),()=>.99,'utility');
function nativeVisit(world:WorldState,id:string,target:string){
  const person=actor(world,id), known=knownMapLocations(world,person);
  if(person.locationId===target)return;
  const has=known.some(row=>row.id===target);
  const unknown=world.locations.filter(row=>row.id!==person.locationId&&!known.includes(row)&&
    !(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const candidates=unknown.length?unknown:world.locations.filter(row=>row.id!==person.locationId&&
    !(row.type==='secret_realm'&&row.expeditionOmenId!==undefined));
  const index=candidates.findIndex(row=>row.id===target);
  requireFixture(has||index>=0,'行程无可选目的地');
  let draw=0;
  applyCultivatorBrainDecision(world,person,a('EXPLORE',has?{targetLocationId:target}:{}),
    ()=>!has&&draw++===0?(index+.2)/candidates.length:.99);
  requireFixture(person.locationId===target,'原生游历未到目标');
}
function source(seed=1){
  let world=createInitialWorld(seed,'spirit-bloom');
  nativeVisit(world,elder,NORTH_MINING_SITE);
  world=step(world,{[elder]:a('GATHER_HERBS',{targetHerbId:'earth_root'})});
  world=step(world,{[elder]:a('VILLAGE_WORKS',{targetSettlementId:NORTH_MINING_SETTLEMENT,villageWorkKind:'well'})});
  world=step(world,{[elder]:a('GATHER_HERBS',{targetHerbId:'jade_leaf'})});
  world=step(world,{[elder]:a('SEED_CULTURE',{seedMove:'reserve',targetLocationId:NORTH_MINING_SITE})});
  const lot=world.seedCulture.lots[0];
  world=step(world,{[elder]:a('SEED_CULTURE',{seedMove:'test',targetSeedLotId:lot.id})});
  world=step(world,{[elder]:a('SEED_CULTURE',{seedMove:'plant',targetSeedLotId:lot.id})});
  const well=world.villageWorks.projects[0];
  requireFixture(well?.status==='completed'&&well.settledTick===5&&well.laborTotal===4,'实井未按期完成');
  world=step(world,{[elder]:water('open')});world=step(world);world=step(world);
  const sample=world.seedCulture.plots[0]?.weather[2];
  requireFixture(sample?.tick===10&&sample.waterDeficit===3,'缺水田尺未记录');
  nativeVisit(world,miner,NORTH_MINING_SITE);
  const recruit=availableSettlementActions(actor(world),world).find(row=>row.action==='RECRUIT_SETTLER');
  requireFixture(recruit,'原户未提供真实招募选项');
  world=step(world,{[elder]:a('RECRUIT_SETTLER',recruit),[miner]:water('mine')});
  const house=`recruit-${recruit.targetVolunteerId}`;
  requireFixture(actor(world,house)?.alive,'原户招募未形成在世身份');
  const mining=world.coldWaterVein?.mining[0];
  requireFixture(mining?.id==='water-mine-11-npc-6'&&mining.actorId===miner&&mining.units===1,'实采收据不符');
  return {world,house};
}
function bargain(baseline:ReturnType<typeof source>,stance:NorthMiningStance,delay=false){
  const {house}=baseline;
  let world=structuredClone(baseline.world);
  if(delay)world=step(world);
  world=step(world,{[house]:charter('propose',stance)});
  const id=world.northMiningCharters!.charters[0].id;
  const proposal=world.northMiningCharters?.charters[0];
  requireFixture(proposal?.stance===stance&&proposal.status==='proposed'&&!proposal.signatures.length&&proposal.fieldDeficit===3&&
    proposal.plotId==='seed-plot-1'&&proposal.openingId==='water-gate-8'&&proposal.wellProjectId==='village-work-1','原提案凭据不符');
  requireFixture(!availableNorthMiningCharterActions(actor(world,miner),world,world.tick+1).length,'矿席越序');
  world=step(world,{[house]:charter('sign',id)});
  world=step(world,{[miner]:charter('sign',id)});
  return {world,id,house};
}


function prepareFreight(start:WorldState){
  const left='elder-taixu-1',right='elder-danxia-2';
  nativeVisit(start,left,'loc-secret-1');nativeVisit(start,right,'loc-secret-1');
  let world=step(start);
  nativeVisit(world,left,NORTH_MINING_SITE);nativeVisit(world,right,'loc-market');
  world=step(world,{[left]:a('GATHER_HERBS',{targetHerbId:'earth_root'})});
  nativeVisit(world,right,NORTH_MINING_SITE);
  world=step(world,{[left]:a('GATHER_HERBS',{targetHerbId:'earth_root'}),
    [right]:a('VILLAGE_GRANARY',{granaryMove:'donate_stones',targetSettlementId:NORTH_MINING_SETTLEMENT})});
  requireFixture(actor(world,left).herbs.earth_root>=4,'实采玄土根不足');
  nativeVisit(world,left,'loc-market');
  world=step(world,{[left]:a('VILLAGE_GRANARY',{granaryMove:'donate_roots',targetSettlementId:NORTH_MINING_MARKET}),
    [right]:a('VILLAGE_GRANARY',{granaryMove:'donate_stones',targetSettlementId:NORTH_MINING_SETTLEMENT})});
  world=step(world,{[left]:a('VILLAGE_GRANARY',{granaryMove:'donate_roots',targetSettlementId:NORTH_MINING_MARKET})});
  requireFixture(granaryAt(world,NORTH_MINING_MARKET)?.roots===4,'原仓入根数量不符');
  requireFixture(granaryAt(world,NORTH_MINING_SETTLEMENT)?.stones===16,'北仓入石数量不符');
  world=step(world,{[left]:a('VILLAGE_SUPPLY',{villageSupplyMove:'offer',targetSettlementId:NORTH_MINING_SETTLEMENT})});
  const offered=world.villageSupply.agreements[0];
  requireFixture(offered?.status==='offered','未提出真实互运');
  requireFixture(availableVillageSupplyActions(actor(world,right),world,world.tick+1).some(row=>row.villageSupplyMove==='accept'),'真实商货未可签收');
  world=step(world,{[right]:a('VILLAGE_SUPPLY',{villageSupplyMove:'accept',targetVillageSupplyId:offered.id})});
  return {world,offered,left};
}


export function prepareNorthWellHistoricalSource(){
 const baseline=source();
 const draft=bargain(baseline,'detour');
 const ratified=step(draft.world,{[elder]:charter('sign',draft.id)});
 let {world}=prepareFreight(ratified);
 while(world.villageSupply.agreements[0].status!=='completed'&&world.tick<36)world=step(world);
 const row=world.northMiningCharters!.charters[0];
 requireFixture(world.tick===34,'验收源线未抵真实 T34');
 requireFixture(row.id==='north-mining-charter-12','原采契 ID 不符');
 requireFixture(row.firstPassage?.tick===23&&row.firstPassage.tileId==='tile-13-2','未实际走过独有绕道');
 const legs=world.villageSupply.agreements[0].legs;
 requireFixture(legs?.length===2&&legs.every(leg=>leg.phase==='delivered'),'双向真实货物尚未送达');
 return {world,actorId:elder,charterId:row.id};
}
