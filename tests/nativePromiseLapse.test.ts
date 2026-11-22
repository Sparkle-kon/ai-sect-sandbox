import {expect,it} from 'vitest';
import {prepareNorthWellHistoricalSource} from './fixtures/northWellHistoricalNativeFixture';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {decodeEraWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {availableUpperArrayFieldTradeActions,resolveUpperArrayFieldTradeAction,upperArrayFieldTradeCustody} from '../src/engine/upperArrayFieldTradeEngine';
import {UPPER_ARRAY_TRADE_OFFER_MONTHS} from '../src/engine/upperArrayFieldTradeTerms';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const seller='elder-danxia-1',originalBuyer='npc-6',newBuyer='elder-danxia-2';
const actor=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
const decision=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'原人原约，不替签。',...fields});
const step=(world:WorldState,orders:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(world,
  Object.fromEntries(world.cultivators.filter(row=>row.alive).map(row=>[row.id,orders[row.id]??decision('REST')])),()=>.99,'utility');
const propose=(targetCultivatorId:string)=>decision('UPPER_ARRAY_FIELD_TRADE',{upperArrayFieldTradeMove:'propose',targetCultivatorId});
const accept=(targetUpperArrayFieldTradeId:string)=>decision('UPPER_ARRAY_FIELD_TRADE',{upperArrayFieldTradeMove:'accept',targetUpperArrayFieldTradeId});
const rows=(world:WorldState)=>world.upperArrayField?.trade?.agreements??[];
const flows=(world:WorldState)=>world.resourceFlow.months.flatMap(month=>month.entries.filter(row=>row.mechanism==='upper_array_field'));

it('expires an actual well signature without charging or letting the next real person take the old agreement',()=>{
  const input=prepareNorthWellHistoricalSource().world;
  const offered=step(input,{[seller]:propose(originalBuyer)}), original=rows(offered)[0];
  expect(original).toMatchObject({status:'offered',buyerId:originalBuyer,wellProjectId:'village-work-1'});
  expect(actor(offered,newBuyer)).toMatchObject({alive:true,locationId:'loc-vein-north'});
  let world=offered;
  const deadline=original.offeredTick+UPPER_ARRAY_TRADE_OFFER_MONTHS;
  while(world.tick<deadline-1)world=step(world);
  const pre=decodeEraWorldSave(encodeEraWorldSave(world));
  expect(availableUpperArrayFieldTradeActions(actor(pre,originalBuyer),pre,deadline)).toEqual([
    {action:'UPPER_ARRAY_FIELD_TRADE',upperArrayFieldTradeMove:'accept',targetUpperArrayFieldTradeId:original.id},
  ]);
  expect(availableUpperArrayFieldTradeActions(actor(pre,newBuyer),pre,deadline)).not.toContainEqual(
    expect.objectContaining({upperArrayFieldTradeMove:'accept',targetUpperArrayFieldTradeId:original.id}));
  expect(rows(step(pre,{[originalBuyer]:accept(original.id)}))[0]).toMatchObject({status:'accepted',acceptedTick:deadline});
  const unknown=step(pre,{[newBuyer]:accept(original.id)}), idle=step(pre);
  expect(unknown.upperArrayField).toEqual(idle.upperArrayField);
  const old=rows(idle)[0];
  expect(old).toMatchObject({status:'expired',closedTick:deadline});
  const before=encodeEraWorldSave(idle);
  expect(resolveUpperArrayFieldTradeAction(idle,actor(idle,originalBuyer),accept(original.id))).toBeNull();
  expect(encodeEraWorldSave(idle)).toBe(before);
  const replacement=step(idle,{[seller]:propose(newBuyer)}), replacementRow=rows(replacement)[1];
  expect(replacementRow).toMatchObject({status:'offered',buyerId:newBuyer,wellProjectId:old.wellProjectId});
  expect(replacementRow.id).not.toBe(old.id);
  const newSignature=step(replacement,{[newBuyer]:accept(replacementRow.id)});
  expect(rows(newSignature)[0]).toEqual(old);
  expect(rows(newSignature)[1]).toMatchObject({buyerId:newBuyer,status:'accepted'});
  expect(flows(newSignature)).toEqual([]);
  expect(upperArrayFieldTradeCustody(newSignature)).toEqual([]);
  const strict=decodeEraWorldSave(encodeEraWorldSave(newSignature));
  expect(encodeEraWorldSave(step(strict))).toBe(encodeEraWorldSave(step(newSignature)));
});
