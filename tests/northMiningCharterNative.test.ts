import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {knownMapLocations} from '../src/engine/terrainEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {availableSettlementActions} from '../src/engine/settlementEngine';
import {availableWaterVeinActions} from '../src/engine/waterVeinEngine';
import {availableNorthMiningCharterActions,projectNorthMiningCharters,resolveNorthMiningCharterAction} from '../src/engine/northMiningCharterEngine';
import {availableVillageSupplyActions} from '../src/engine/villageSupplyEngine';
import {granaryAt} from '../src/engine/villageGranaryEngine';
import {waterVeinOpeningAt,waterVeinPhase} from '../src/engine/waterVeinTerms';
import {NORTH_MINING_MARKET,NORTH_MINING_SETTLEMENT,NORTH_MINING_SITE} from '../src/engine/northMiningCharterTerms';
import type {LLMDecisionPayload,NorthMiningStance,WorldState} from '../src/types/world';

const elder='elder-danxia-1', miner='npc-6';
const actor=(world:WorldState,id=elder)=>world.cultivators.find(item=>item.id===id)!;
const section=(world:WorldState)=>world.sects.find(row=>row.id===actor(world).sectId)!;
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
  expect(has||index>=0).toBe(true);
  let draw=0;
  applyCultivatorBrainDecision(world,person,a('EXPLORE',has?{targetLocationId:target}:{}),
    ()=>!has&&draw++===0?(index+.2)/candidates.length:.99);
  expect(person.locationId).toBe(target);
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
  expect(world.villageWorks.projects[0]).toMatchObject({status:'completed',settledTick:5,laborTotal:4});
  world=step(world,{[elder]:water('open')});world=step(world);world=step(world);
  expect(world.seedCulture.plots[0].weather[2]).toMatchObject({tick:10,waterDeficit:3});
  nativeVisit(world,miner,NORTH_MINING_SITE);
  const recruit=availableSettlementActions(actor(world),world).find(row=>row.action==='RECRUIT_SETTLER')!;
  expect(recruit).toBeDefined();
  world=step(world,{[elder]:a('RECRUIT_SETTLER',recruit),[miner]:water('mine')});
  const house=`recruit-${recruit.targetVolunteerId}`;
  expect(actor(world,house).alive).toBe(true);
  expect(world.coldWaterVein?.mining[0]).toMatchObject({id:'water-mine-11-npc-6',actorId:miner,units:1});
  return {world,house};
}
function bargain(baseline:ReturnType<typeof source>,stance:NorthMiningStance,delay=false){
  const {house}=baseline;
  let world=structuredClone(baseline.world);
  if(delay)world=step(world);
  world=step(world,{[house]:charter('propose',stance)});
  const id=world.northMiningCharters!.charters[0].id;
  expect(world.northMiningCharters?.charters[0]).toMatchObject({stance,status:'proposed',signatures:[],fieldDeficit:3,
    plotId:'seed-plot-1',openingId:'water-gate-8',wellProjectId:'village-work-1'});
  expect(availableNorthMiningCharterActions(actor(world,miner),world,world.tick+1)).toEqual([]);
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
  expect(actor(world,left).herbs.earth_root).toBeGreaterThanOrEqual(4);
  nativeVisit(world,left,'loc-market');
  world=step(world,{[left]:a('VILLAGE_GRANARY',{granaryMove:'donate_roots',targetSettlementId:NORTH_MINING_MARKET}),
    [right]:a('VILLAGE_GRANARY',{granaryMove:'donate_stones',targetSettlementId:NORTH_MINING_SETTLEMENT})});
  world=step(world,{[left]:a('VILLAGE_GRANARY',{granaryMove:'donate_roots',targetSettlementId:NORTH_MINING_MARKET})});
  expect(granaryAt(world,NORTH_MINING_MARKET)?.roots).toBe(4);
  expect(granaryAt(world,NORTH_MINING_SETTLEMENT)?.stones).toBe(16);
  world=step(world,{[left]:a('VILLAGE_SUPPLY',{villageSupplyMove:'offer',targetSettlementId:NORTH_MINING_SETTLEMENT})});
  const offered=world.villageSupply.agreements[0];
  expect(offered).toMatchObject({status:'offered'});
  expect(availableVillageSupplyActions(actor(world,right),world,world.tick+1)).toContainEqual(expect.objectContaining({villageSupplyMove:'accept'}));
  world=step(world,{[right]:a('VILLAGE_SUPPLY',{villageSupplyMove:'accept',targetVillageSupplyId:offered.id})});
  return {world,offered,left};
}

describe('north well mining charter binds actual people and actual transit',()=>{
  it('preserves an already loaded original route and does not turn its real common passage into detour evidence',()=>{
    const baseline=source();
    const {world:departed}=prepareFreight(baseline.world);
    const before=departed.villageSupply.agreements[0];
    expect(before).toMatchObject({status:'active'});
    expect(before.northMiningCharterId).toBeUndefined();
    expect(before.path).toContain('tile-12-3');
    const trial=bargain({world:departed,house:baseline.house},'detour');
    let later=step(trial.world,{[elder]:charter('sign',trial.id)});
    const active=later.northMiningCharters!.charters[0];
    expect(active).toMatchObject({status:'ratified',paidStones:24});
    expect(later.villageSupply.agreements[0].path).toEqual(before.path);
    expect(later.villageSupply.agreements[0].northMiningCharterId).toBeUndefined();
    for(let i=0;i<15&&later.villageSupply.agreements[0].status!=='completed';i++)later=step(later);
    expect(later.villageSupply.agreements[0].legs?.map(row=>row.phase)).toEqual(['delivered','delivered']);
    expect(later.northMiningCharters!.charters[0].firstPassage).toBeUndefined();
  });

  it('seals a new action without canceling an older real gate liability; continuing actually mines against inventory',()=>{
    const baseline=source();
    const proposed=bargain(baseline,'seal',true);
    let sealed=step(proposed.world); // T16
    sealed=step(sealed,{[elder]:water('open')}); // actual second debt T17
    expect(sealed.coldWaterVein?.openings[1]).toMatchObject({openedTick:17,paidStones:40});
    sealed=step(sealed,{[elder]:charter('sign',proposed.id)});
    expect(sealed.northMiningCharters?.charters[0]).toMatchObject({status:'ratified',ratifiedTick:18,paidStones:0,
      signatures:[{role:'household',actorId:proposed.house},{role:'miner',actorId:miner},{role:'sect',actorId:elder}]});
    expect(waterVeinPhase(waterVeinOpeningAt(sealed.coldWaterVein,18),18)).toMatchObject({wellDepth:21,remainingUnits:9});
    expect(availableWaterVeinActions(actor(sealed,miner),sealed).some(row=>row.waterVeinMove==='mine')).toBe(false);
    const ore=sealed.coldWaterVein!.oreRemaining, stones=actor(sealed,miner).spiritStones;
    sealed=step(sealed,{[miner]:water('mine')});
    expect(sealed.coldWaterVein!.oreRemaining).toBe(ore);
    expect(actor(sealed,miner).spiritStones).toBe(stones);
    while(sealed.tick<23)sealed=step(sealed);
    expect(waterVeinPhase(waterVeinOpeningAt(sealed.coldWaterVein,23),23).remainingUnits).toBe(0);
    expect(sealed.coldWaterVein?.openings.at(-1)?.completedTick).toBe(23);
    expect(availableWaterVeinActions(actor(sealed),sealed).some(row=>row.waterVeinMove==='open')).toBe(false);
    const continuation=bargain(baseline,'continue');
    const unlocked=step(continuation.world,{[elder]:charter('sign',continuation.id)});
    const mined=step(unlocked,{[miner]:water('mine')});
    expect(mined.coldWaterVein?.mining.at(-1)).toMatchObject({actorId:miner,units:2});
    expect(mined.coldWaterVein?.oreRemaining).toBe(15);
    expect(baseline.world.northMiningCharters).toBeUndefined();
  });

  it('pays one actual 24-stone detour, then loads only a fresh native freight and verifies travel and arrival',()=>{
    const baseline=source(),draft=bargain(baseline,'detour');
    const noFunds=structuredClone(draft.world);
    section(noFunds).spiritStones=0;
    expect(availableNorthMiningCharterActions(actor(noFunds),noFunds,noFunds.tick+1)).toEqual([]);
    const unpaid=step(draft.world), opened=step(draft.world,{[elder]:charter('sign',draft.id)});
    const proposal=opened.northMiningCharters!.charters[0];
    expect(proposal).toMatchObject({status:'ratified',paidStones:24,ratifiedTick:15});
    expect(section(unpaid).spiritStones-section(opened).spiritStones).toBe(24);
    expect(proposal.firstPassage).toBeUndefined();
    const signed=encodeEraWorldSave(opened);
    expect(encodeEraWorldSave(decodeEraWorldSave(signed))).toBe(signed);
    const fakeSigner=decodeEraWorldSave(signed);
    fakeSigner.northMiningCharters!.charters[0].signatures[1].actorId=draft.house;
    expect(()=>encodeEraWorldSave(fakeSigner)).toThrow(expect.objectContaining({code:'invalid_world'}));
    expect(resolveNorthMiningCharterAction(opened,actor(opened),charter('sign',draft.id))).toBeNull();
    let {world,offered,left}=prepareFreight(opened);
    const accepted=world.villageSupply.agreements[0];
    expect(accepted).toMatchObject({status:'active',northMiningCharterId:draft.id,path:proposal.route!.detourTiles});
    expect(accepted.path).not.toContain('tile-12-3');
    expect(accepted.path).not.toContain('tile-12-4');
    expect(world.northMiningCharters?.charters[0].firstPassage).toBeUndefined();
    world=step(world);
    const walked=world.northMiningCharters!.charters[0].firstPassage!;
    const sealedPassage=encodeEraWorldSave(world);
    const resumed=decodeEraWorldSave(sealedPassage);
    expect(encodeEraWorldSave(step(resumed))).toBe(encodeEraWorldSave(step(world)));
    const forged=decodeEraWorldSave(sealedPassage);
    forged.northMiningCharters!.charters[0].firstPassage!.checkpoint+=1;
    expect(()=>encodeEraWorldSave(forged)).toThrow(expect.objectContaining({code:'invalid_world'}));
    expect(walked).toMatchObject({agreementId:offered.id,tick:world.tick,good:'stone',checkpoint:1});
    expect(proposal.route!.originalTiles).not.toContain(walked.tileId);
    expect(projectNorthMiningCharters(world,actor(world,elder))?.rows[0]).toMatchObject({hasVerifiedPassage:true,fieldWasReduced:true});
    expect(projectNorthMiningCharters(world,actor(world,left))).toBeUndefined();
    for(let i=0;i<15&&world.villageSupply.agreements[0].status!=='completed';i++)world=step(world);
    expect(world.villageSupply.agreements[0].legs?.map(row=>row.phase)).toEqual(['delivered','delivered']);
    expect(world.northMiningCharters!.charters[0].firstPassage).toEqual(walked);
    expect(granaryAt(world,NORTH_MINING_MARKET)?.stones).toBeGreaterThan(0);
    expect(granaryAt(world,NORTH_MINING_SETTLEMENT)?.roots).toBeGreaterThan(0);
  });

  it('retains the real household signature after that same actor later dies of native old age',()=>{
    const origin=source(),draft=bargain(origin,'continue');
    let world=step(draft.world,{[elder]:charter('sign',draft.id)});
    const stamp=world.northMiningCharters!.charters[0].signatures[0];
    expect(stamp).toMatchObject({role:'household',actorId:draft.house,tick:13,recruitedTick:11});
    const originalActor=actor(world,draft.house);
    const stop=world.tick+12*(originalActor.lifespan-originalActor.age+1);
    while(actor(world,draft.house).alive&&world.tick<stop)world=step(world);
    const archived=actor(world,draft.house);
    expect(archived).toMatchObject({alive:false,hp:0,id:draft.house});
    const member=world.households.members.find(row=>row.recruitedId===draft.house);
    expect(member).toMatchObject({status:'deceased',settledTick:world.tick});
    expect(world.tick).toBeGreaterThan(stamp.tick);
    expect(availableNorthMiningCharterActions(archived,world)).toEqual([]);
    const packed=encodeEraWorldSave(world),loaded=decodeEraWorldSave(packed);
    expect(loaded.northMiningCharters!.charters[0].signatures[0]).toEqual(stamp);
    expect(encodeEraWorldSave(loaded)).toBe(packed);
    const falsified=loaded.northMiningCharters!.charters[0].signatures[0];
    if(falsified.role!=='household')throw Error('native household evidence lost its role');
    falsified.recruitedTick=world.tick;
    expect(()=>encodeEraWorldSave(loaded)).toThrow(expect.objectContaining({code:'invalid_world'}));
  },20000);

  it('does not accept forged extra fields, remote lookup by a same-name actor, repeated signatures, or stale consent',()=>{
    const baseline=source(), approved=bargain(baseline,'detour');
    const clone=structuredClone(approved.world);
    const outsider=actor(clone,'npc-3');
    outsider.name=actor(clone,approved.house).name;
    expect(projectNorthMiningCharters(clone,outsider)).toBeUndefined();
    expect(resolveNorthMiningCharterAction(clone,actor(clone,elder),{
      ...charter('sign',approved.id),targetLocationId:NORTH_MINING_SITE,
    })).toBeNull();
    expect(resolveNorthMiningCharterAction(clone,actor(clone,miner),charter('sign',approved.id))).toBeNull();
    let passed=clone;
    while(passed.tick<18)passed=step(passed);
    expect(passed.northMiningCharters?.charters[0]).toMatchObject({status:'expired'});
    expect(resolveNorthMiningCharterAction(passed,actor(passed,elder),charter('sign',approved.id))).toBeNull();
  });
});
