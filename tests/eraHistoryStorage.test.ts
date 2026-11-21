import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectEraHistory} from '../src/engine/eraHistoryIndex';
import {decodeWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {advanceWorldTick,applyCultivatorBrainDecision} from '../src/engine/worldEngine';
import {availableWorkshopActions} from '../src/engine/workshopEngine';
import type {ChronicleAnchor,LLMDecisionPayload,WorldEvent,WorldState} from '../src/types/world';

const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'收录真实事实。'};
const step=(base:WorldState,choices:Record<string,LLMDecisionPayload>={})=>advanceWorldTick(base,
  {...Object.fromEntries(base.cultivators.map(actor=>[actor.id,idle])),...choices},()=>.99);
const json=(world:WorldState)=>JSON.stringify({format:'ai-sect-sandbox',version:1,world});
const decode=(world:WorldState)=>decodeWorldSave(json(world));
const anchor=({id,tick,year,month,title,description,category,actorIds,locationId}:WorldEvent):ChronicleAnchor=>
  ({id,tick,year,month,title,description,category,actorIds:[...actorIds],...(locationId?{locationId}:{})});

function deaths(){
  let before=createInitialWorld(2031);
  while(before.month<12)before=step(before);
  const person=before.cultivators.find(row=>row.alive&&row.hp>0)!;
  const double=before.cultivators.find(row=>row.id!==person.id&&row.alive&&row.hp>0)!;
  person.age=person.lifespan-1;double.name=person.name;
  expect(double.age+1).toBeLessThan(double.lifespan);
  const after=step(before);
  const death=after.eraHistory.receipts.find(row=>row.kind==='death'&&row.actorId===person.id);
  expect(death).toBeDefined();
  const original=after.events.find(row=>row.id===death?.eventId)!;
  return {before,after,person,double,death:death!,original};
}
function migration(){
  let before=createInitialWorld(2031);
  before=step(before);
  before.settlements.villages[0].stress=99;
  for(const village of before.settlements.villages.slice(1))village.stress=0;
  const after=step(before);
  const native=after.settlements.records.find(record=>record.tick===after.tick&&record.kind==='migration')!;
  expect(native).toBeDefined();
  const original=after.events.find(row=>row.id===`evt-${native.id}`)!;
  const migration=after.eraHistory.receipts.find(row=>row.kind==='migration'&&row.recordId===native.id);
  expect(migration).toBeDefined();
  return {after,native,original,migration:migration!};
}
function paidWorkshop(){
  const base=createInitialWorld(11311);
  const patron=base.cultivators[0],maker=base.cultivators.find(actor=>actor.sectId===patron.sectId&&actor.id!==patron.id)!;
  const site=base.locations.find(node=>node.id==='loc-market')!;
  for(const actor of [patron,maker]){actor.locationId=site.id;actor.hp=actor.maxHp;}
  site.furnaceGrade=3;maker.spiritRoot=site.spiritRoot;maker.techniqueMastery=100;
  patron.spiritStones=500;patron.herbs.earth_root=20;
  const offer=availableWorkshopActions(patron,base).find(row=>row.workshopMove==='offer'&&row.targetCultivatorId===maker.id&&
    row.workshopTier==='法器'&&row.workshopQuantity===1&&row.workshopQualityFloor==='fine');
  expect(offer).toBeDefined();
  expect(applyCultivatorBrainDecision(base,patron,{...idle,...offer!,chosenAction:'WORKSHOP'},()=>.99)).not.toBeNull();
  const id=base.workshops.orders[0].id;
  expect(applyCultivatorBrainDecision(base,maker,{...idle,chosenAction:'WORKSHOP',workshopMove:'accept',targetWorkshopId:id},()=>.99)).not.toBeNull();
  const working={...idle,chosenAction:'WORKSHOP',workshopMove:'work',targetWorkshopId:id} satisfies LLMDecisionPayload;
  const after=step(step(base,{[maker.id]:working}),{[maker.id]:working});
  const order=after.workshops.orders.find(row=>row.id===id)!;
  expect(order).toMatchObject({status:'completed',escrowStones:0,escrowHerbs:0});
  const original=after.events.find(row=>row.id===`evt-workshop-${id}-${after.tick}-finish-1`)!;
  expect(original.witnessScope).toBe('participants');
  expect(after.eraHistory.receipts.find(row=>row.kind==='workshop'&&row.orderId===id)).toBeDefined();
  return {after,patron,maker,order,original};
}
describe('native era history and storage validation',()=>{
  it('preserves the native receipt date when a valid snapshot seeks forward by tick without a calendar advance',()=>{
    const {after}=deaths();
    const preserved=structuredClone(after.eraHistory.receipts);
    const sought=structuredClone(after);sought.tick+=15;
    expect(decodeWorldSave(encodeWorldSave(sought)).eraHistory.receipts).toEqual(preserved);
  });

  it('keeps actual public office evidence while not archiving a deliberately hidden assembly site',()=>{
    let current=createInitialWorld(0xffffffff);
    current.locations[0].spiritQi=150;
    for(let n=0;n<75;n++){
      current=advanceWorldTick(current);
      const row=current.eraHistory.receipts.find(receipt=>receipt.kind==='succession'&&receipt.tick===current.tick&&
        current.events.some(event=>event.id===receipt.eventId&&current.locations.some(site=>site.id===event.locationId&&
          (site.type==='abyss'||site.type==='secret_realm'))));
      if(!row)continue;
      expect(row.locationId).toBeUndefined();
      expect(decodeWorldSave(encodeWorldSave(current)).eraHistory.receipts).toContainEqual(row);
      const actual=current.events.find(({id})=>id===row.eventId)!;
      row.locationId=actual.locationId;
      expect(()=>decodeWorldSave(json(current))).toThrow('eraHistory.receipts.sitePrivacy');
      return;
    }
    throw Error('the seeded native fixture did not exercise a public succession at a hidden site');
  });

  it('initializes old saves empty and keeps same-name identities, branch slices and genuinely lost origins distinct',()=>{
    const {before,after,person,double,original}=deaths();
    const {eraHistory:_eraHistory,...legacy}=after;
    expect(decodeWorldSave(JSON.stringify({format:'ai-sect-sandbox',version:1,world:legacy})).eraHistory.receipts).toEqual([]);
    const actual=decodeWorldSave(encodeWorldSave(after));
    const selected={kind:'actor' as const,id:person.id};
    const other={kind:'actor' as const,id:double.id};
    const deathOnly=(world:WorldState,query:typeof selected)=>projectEraHistory(world,query).filter(row=>row.receipt.kind==='death');
    expect(deathOnly(actual,selected)).toMatchObject([{source:'live_event',receipt:{actorId:person.id,eventId:original.id}}]);
    expect(deathOnly(actual,other)).toEqual([]);
    expect(deathOnly(before,selected)).toEqual([]);
    expect(projectEraHistory(actual,selected,undefined,before.tick)).toEqual([]);
    const shelf=structuredClone(actual);shelf.events=shelf.events.filter(row=>row.id!==original.id);
    shelf.chronicleArchive.anchors=shelf.chronicleArchive.anchors.filter(row=>row.id!==original.id);
    for(const file of [...shelf.chronicleArchive.chapters,...shelf.coldHistory.chapters])
      file.anchors=file.anchors.filter(row=>row.id!==original.id);
    expect(deathOnly(decode(shelf),selected)).toMatchObject([{source:'source_lost'}]);
    shelf.chronicleArchive.anchors.push(anchor(original));
    expect(deathOnly(decode(shelf),selected)).toMatchObject([{source:'public_archive'}]);

    const conflicting=structuredClone(actual);
    conflicting.events.find(row=>row.id===original.id)!.witnessScope='participants';
    expect(deathOnly(conflicting,selected)).toEqual([]);
    expect(()=>decode(conflicting)).toThrow('eraHistory.receipts.original');
    const future=structuredClone(actual);
    future.eraHistory.receipts[0].year++;
    expect(()=>decode(future)).toThrow('eraHistory.receipts.date');
    const extra=structuredClone(actual);
    Object.assign(extra.eraHistory.receipts[0],{description:'禁止原文混入'});
    expect(()=>decode(extra)).toThrow('eraHistory.receipts');
  });

  it('cross-validates an actual moved headcount and safely retires the old current source',()=>{
    const {after,native,original}=migration();
    const query={kind:'settlement' as const,id:native.settlementId};
    expect(projectEraHistory(decode(after),query)).toMatchObject([{source:'live_event',receipt:{people:native.people,toSettlementId:native.targetSettlementId}}]);
    const archived=structuredClone(after);archived.events=archived.events.filter(row=>row.id!==original.id);
    expect(projectEraHistory(decode(archived),query)).toMatchObject([{source:'public_archive'}]);
    archived.chronicleArchive.anchors=archived.chronicleArchive.anchors.filter(row=>row.id!==original.id);
    expect(projectEraHistory(decode(archived),query)).toMatchObject([{source:'native_receipt'}]);
    const forged=structuredClone(after);
    const proof=forged.eraHistory.receipts.find(row=>row.kind==='migration')!;
    proof.people=proof.people===4?3:4;
    expect(projectEraHistory(forged,query)).toEqual([]);
    expect(()=>decode(forged)).toThrow('eraHistory.receipts.migration');
  });

  it('only shows privately paid and settled workshop proof to its exact parties across reads',()=>{
    const {after,patron,maker,order,original}=paidWorkshop();
    const query={kind:'workshop' as const,id:order.id};
    const loaded=decodeWorldSave(encodeWorldSave(after));
    expect(projectEraHistory(loaded,query,patron.id)).toMatchObject([{source:'live_event',receipt:{orderId:order.id,delivered:1}}]);
    expect(projectEraHistory(loaded,query,maker.id)).toHaveLength(1);
    expect(projectEraHistory(loaded,query)).toEqual([]);
    expect(projectEraHistory(loaded,query,after.cultivators.find(row=>row.id!==patron.id&&row.id!==maker.id)!.id)).toEqual([]);
    expect(JSON.stringify(projectEraHistory(loaded,query,patron.id))).not.toContain(original.description);
    const corrupt=structuredClone(loaded);
    corrupt.events.find(row=>row.id===original.id)!.actorIds.reverse();
    expect(projectEraHistory(corrupt,query,patron.id)).toEqual([]);
    expect(()=>decode(corrupt)).toThrow('eraHistory.receipts.original');
    const wrong=structuredClone(loaded);
    const proof=wrong.eraHistory.receipts.find(row=>row.kind==='workshop')!;
    proof.delivered=2;
    expect(()=>decode(wrong)).toThrow('eraHistory.receipts.workshop');
  });
});
