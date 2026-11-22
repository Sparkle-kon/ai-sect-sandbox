import {describe,expect,it} from 'vitest';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {prepareEraCheckpoint,verifyEraCheckpoint,type EraOutputFile} from '../src/engine/eraCheckpointEngine';
import {activeUpperPassage,availableUpperPassageActions} from '../src/engine/upperPassageEngine';
import {upperArrayLatticeStock} from '../src/engine/upperArrayFieldLocalEngine';
import {availableUpperArrayFieldTradeActions,projectUpperArrayFieldTrade,resolveUpperArrayFieldTradeAction,
  upperArrayFieldTradeReceivedLattice,verifyUpperArrayFieldTradeAgreement,verifyUpperArrayFieldTradeJournal} from '../src/engine/upperArrayFieldTradeEngine';
import type {UpperPassageNodeId} from '../src/engine/upperPassageTerms';
import type {LLMDecisionPayload,WorldEvent,WorldState} from '../src/types/world';

declare const __SECT_UTILITY_RULE_VERSION__:string;
const codec={encode:encodeEraWorldSave,decode:decodeEraWorldSave};
const asInput=(file:EraOutputFile)=>({size:file.bytes.length,arrayBuffer:async()=>Uint8Array.from(file.bytes).buffer});
const seller='elder-danxia-1',buyer='npc-6',opener='npc-2',well='loc-vein-north',tradeId='upper-array-trade-1';
const body=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const cmd=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'沿旧时线验证该月实际承认的收据。',...fields});
const quiet=(world:WorldState)=>Object.fromEntries(world.cultivators.map(a=>[a.id,cmd('REST')]));
const trade=(upperArrayFieldTradeMove:NonNullable<LLMDecisionPayload['upperArrayFieldTradeMove']>)=>
  cmd('UPPER_ARRAY_FIELD_TRADE',upperArrayFieldTradeMove==='propose'?
    {upperArrayFieldTradeMove,targetCultivatorId:buyer}:{upperArrayFieldTradeMove,targetUpperArrayFieldTradeId:tradeId});
const passage=(upperPassageMove:NonNullable<LLMDecisionPayload['upperPassageMove']>,targetUpperPassageNodeId:UpperPassageNodeId)=>
  cmd('UPPER_PASSAGE',{upperPassageMove,targetUpperPassageNodeId});
const movement=(upperArrayFieldMove:NonNullable<LLMDecisionPayload['upperArrayFieldMove']>,
  targetUpperArrayFieldSiteId:NonNullable<LLMDecisionPayload['targetUpperArrayFieldSiteId']>)=>
  cmd('UPPER_ARRAY_FIELD',{upperArrayFieldMove,targetUpperArrayFieldSiteId});
const local=(upperArrayFieldLocalMove:NonNullable<LLMDecisionPayload['upperArrayFieldLocalMove']>,
  targetUpperArrayFieldSiteId:NonNullable<LLMDecisionPayload['targetUpperArrayFieldSiteId']>)=>
  cmd('UPPER_ARRAY_FIELD_LOCAL',{upperArrayFieldLocalMove,targetUpperArrayFieldSiteId});
const gather=cmd('GATHER_HERBS',{targetHerbId:'earth_root'}),open=cmd('WATER_VEIN',{waterVeinMove:'open',targetLocationId:well});
const originalWellProof=(w:WorldState)=>JSON.stringify({
  old:w.coldWaterVein?.openings.find(row=>row.id==='water-gate-8'),
  charter:w.northMiningCharters?.charters.find(row=>row.id==='north-mining-charter-12'),
  cargo:w.villageSupply.agreements.find(agreement=>agreement.status==='completed'),
  well:w.villageWorks.projects.find(row=>row.id==='village-work-1'),
});
export function prepareUpperArrayTradeSource(source=prepareNorthWellHistoricalSource().world){
  let world=source,events:readonly WorldEvent[]=[];
  const step=(orders:Record<string,LLMDecisionPayload>={})=>{
    world=advanceWorldTick(world,{...quiet(world),...orders},()=>.99,'utility',undefined,{onCompletedEvents:rows=>{events=rows;}});
    return world;
  };
  const act=(id:string,choice:LLMDecisionPayload,expectedPrefix:string)=>{
    step({[id]:choice});
    expect(events.some(row=>row.id.startsWith(expectedPrefix)&&row.actorIds.includes(id)),
      `T${world.tick} ${id} ${choice.chosenAction} ${JSON.stringify(choice)}`).toBe(true);
  };
  const trip=(move:NonNullable<LLMDecisionPayload['upperPassageMove']>,node:UpperPassageNodeId)=>
    act(seller,passage(move,node),'evt-upper-passage-');
  const field=(move:NonNullable<LLMDecisionPayload['upperArrayFieldMove']>,
    site:NonNullable<LLMDecisionPayload['targetUpperArrayFieldSiteId']>)=>act(seller,movement(move,site),'evt-upper-array-field-move-');
  const work=(move:NonNullable<LLMDecisionPayload['upperArrayFieldLocalMove']>,
    site:NonNullable<LLMDecisionPayload['targetUpperArrayFieldSiteId']>)=>act(seller,local(move,site),'evt-array-field-local-');
  expect(source.tick).toBe(34);
  expect([seller,buyer,opener].every(id=>body(source,id).locationId===well)).toBe(true);
  for(let i=0;i<9&&(body(world,seller).herbs.earth_root<3||body(world,buyer).herbs.earth_root<2);i++){
    const orders:Record<string,LLMDecisionPayload>={};
    if(body(world,seller).herbs.earth_root<3)orders[seller]=gather;
    if(body(world,buyer).herbs.earth_root<2)orders[buyer]=gather;
    step(orders);
  }
  expect(body(world,seller).herbs.earth_root).toBeGreaterThanOrEqual(3);
  expect(body(world,buyer).herbs.earth_root).toBeGreaterThanOrEqual(2);
  const nativeRoots=body(world,buyer).herbs.earth_root;
  act(seller,trade('propose'),'evt-upper-array-field-trade-');
  expect(resolveUpperArrayFieldTradeAction(world,body(world,buyer),trade('accept'))).toBeNull();
  act(buyer,trade('accept'),'evt-upper-array-field-trade-');
  expect(body(world,buyer).herbs.earth_root).toBe(nativeRoots);
  act(opener,open,'evt-water-gate-');
  trip('enter','realm-passage-lower-step');trip('advance','realm-passage-upper-step');
  trip('advance','realm-upper-gate');trip('advance','realm-upper-array');trip('read','realm-upper-array');
  trip('advance','realm-upper-council');trip('petition','realm-upper-council');
  field('enter','array-field-gate');field('travel','array-field-path');field('travel','array-field-home');
  field('settle','array-field-home');field('travel','array-field-path');field('travel','array-field-source');
  work('condense','array-field-source');work('condense','array-field-source');
  field('travel','array-field-practice');
  const qi=body(world,seller).qiProgress,stones=body(world,seller).spiritStones,hp=body(world,seller).hp;
  work('cultivate','array-field-practice');
  expect(body(world,seller).qiProgress).toBe(Math.min(100,qi+6));
  expect(body(world,seller).spiritStones).toBe(stones-3);
  // Native monthly effects may happen separately; the stamped own finite local cost is checked by storage.
  expect(body(world,seller).hp).toBeLessThanOrEqual(hp);
  expect(upperArrayLatticeStock(world,seller)).toBe(3);
  field('travel','array-field-source');field('travel','array-field-path');field('travel','array-field-exchange');
  act(seller,trade('load'),'evt-upper-array-field-trade-');
  expect(upperArrayLatticeStock(world,seller)).toBe(1);
  expect(body(world,buyer).herbs.earth_root).toBe(nativeRoots);
  const agreement=()=>world.upperArrayField!.trade!.agreements[0];
  const toThroat=()=>{
    field('travel','array-field-path');field('travel','array-field-gate');field('exit','realm-upper-council');
    trip('turnback','realm-upper-array');trip('advance','realm-upper-gate');trip('advance','realm-passage-upper-step');
  };
  return {world:()=>world,events:()=>events,step,act,trip,field,agreement,toThroat,nativeRoots,old:originalWellProof(source)};
}
describe('array field cargo never crosses ahead of its one real carrier',()=>{
  it('holds in a shut throat, survives a portable next-month replay, and settles only when two originals stand at the real old well',async()=>{
    const f=prepareUpperArrayTradeSource();
    const load=f.agreement().load!;
    f.toThroat();
    const waiting=f.world(),priceBefore=body(waiting,buyer).herbs.earth_root;
    expect(body(waiting,seller).positionPlane).toBe('threshold');
    expect(body(waiting,seller).locationId).toBe('realm-passage-upper-step');
    expect(projectUpperArrayFieldTrade(waiting,body(waiting,seller))[0].cargo?.atClosedThroat).toBe(true);
    expect(projectUpperArrayFieldTrade(waiting,body(waiting,buyer))[0].cargo).toEqual({quantity:2,phase:'in_transit'});
    expect(projectUpperArrayFieldTrade(waiting,body(waiting,opener))).toEqual([]);
    expect(availableUpperPassageActions(body(waiting,seller),waiting)).toEqual([]);
    expect(availableUpperArrayFieldTradeActions(body(waiting,buyer),waiting)).toEqual([]);
    expect(upperArrayFieldTradeReceivedLattice(waiting,buyer)).toEqual([]);
    const packed=await prepareEraCheckpoint(waiting,{branchId:'upper-trade-closed-throat'},codec,
      {engineRuleVersion:__SECT_UTILITY_RULE_VERSION__});
    const restored=await verifyEraCheckpoint(asInput(packed.manifestFile),packed.parts.map(asInput),codec);
    expect(codec.encode(restored.world)).toBe(codec.encode(waiting));
    const rejected=passage('advance','realm-passage-lower-step');
    expect(codec.encode(advanceWorldTick(waiting,{...quiet(waiting),[seller]:rejected},()=>.99,'utility')))
      .toBe(codec.encode(advanceWorldTick(restored.world,{...quiet(restored.world),[seller]:rejected},()=>.99,'utility')));
    f.step({[seller]:rejected,[buyer]:trade('settle')});
    expect(body(f.world(),seller).locationId).toBe('realm-passage-upper-step');
    expect(body(f.world(),buyer).herbs.earth_root).toBe(priceBefore);
    f.step({[opener]:open,[seller]:rejected});
    expect(body(f.world(),seller).locationId).toBe('realm-passage-upper-step');
    expect(f.events().some(row=>row.id.startsWith('evt-water-gate-'))).toBe(true);
    const actualOpening=f.world().coldWaterVein!.openings.at(-1)!;
    f.trip('advance','realm-passage-lower-step');f.trip('advance','loc-vein-north');
    expect(body(f.world(),seller).positionPlane).toBeUndefined();
    expect(upperArrayFieldTradeReceivedLattice(f.world(),buyer)).toEqual([]);
    expect(resolveUpperArrayFieldTradeAction(f.world(),body(f.world(),buyer),trade('settle'))).toBeNull();
    const sellerRoots=body(f.world(),seller).herbs.earth_root;
    // Compare to the very same native month with no contract action; ordinary water symptoms/time still progress.
    const noExchange=advanceWorldTick(f.world(),quiet(f.world()),()=>.99,'utility');
    const oldWater=JSON.stringify(noExchange.coldWaterVein);
    f.act(buyer,trade('settle'),'evt-upper-array-field-trade-');
    expect(f.agreement().status).toBe('settled');
    expect(f.agreement().settlement?.crossingOpeningId).toBe(actualOpening.id);
    expect(body(f.world(),seller).herbs.earth_root).toBe(sellerRoots+2);
    expect(body(f.world(),buyer).herbs.earth_root).toBe(priceBefore-2);
    expect(upperArrayFieldTradeReceivedLattice(f.world(),buyer)[0].slices).toEqual(load.slices);
    expect(upperArrayFieldTradeReceivedLattice(f.world(),opener)).toEqual([]);
    expect(resolveUpperArrayFieldTradeAction(f.world(),body(f.world(),buyer),trade('settle'))).toBeNull();
    expect(verifyUpperArrayFieldTradeAgreement(f.world(),f.agreement())).toBe(true);
    expect(verifyUpperArrayFieldTradeJournal(f.world())).toBe(true);
    expect(verifyUpperArrayFieldTradeAgreement(f.world(),{...f.agreement(),settlement:{...f.agreement().settlement!,crossingOpeningId:'water-gate-8'}})).toBe(false);
    expect(JSON.stringify(f.world().coldWaterVein)).toBe(oldWater);
    expect(originalWellProof(f.world())).toBe(f.old);
    expect(codec.encode(codec.decode(codec.encode(f.world())))).toBe(codec.encode(f.world()));
  });
  it('only restocks the original lots once, from the same named body actually at the field store',()=>{
    const f=prepareUpperArrayTradeSource(),hold=f.agreement().load!;
    expect(resolveUpperArrayFieldTradeAction(f.world(),body(f.world(),buyer),trade('unload'))).toBeNull();
    f.field('travel','array-field-path');
    expect(activeUpperPassage(f.world(),seller)?.id).toBe(hold.journeyId);
    expect(availableUpperArrayFieldTradeActions(body(f.world(),seller),f.world())).toEqual([]);
    f.field('travel','array-field-exchange');
    f.act(seller,trade('unload'),'evt-upper-array-field-trade-');
    expect(f.agreement().status).toBe('restocked');
    expect(upperArrayLatticeStock(f.world(),seller)).toBe(3);
    expect(body(f.world(),buyer).herbs.earth_root).toBe(f.nativeRoots);
    expect(upperArrayFieldTradeReceivedLattice(f.world(),buyer)).toEqual([]);
    expect(resolveUpperArrayFieldTradeAction(f.world(),body(f.world(),seller),trade('unload'))).toBeNull();
    expect(verifyUpperArrayFieldTradeAgreement(f.world(),f.agreement())).toBe(true);
    expect(verifyUpperArrayFieldTradeJournal(f.world())).toBe(true);
  });
});
