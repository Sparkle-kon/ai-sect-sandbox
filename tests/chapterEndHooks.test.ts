import {describe,expect,it} from 'vitest';
import {deriveChapterEndHook} from '../src/engine/chapterEndHooks';
import type {ChronicleAnchor,WorldState} from '../src/types/world';
import {actualGrandSiege,siegeTurn} from './grandSiegeNativeFixture';
import {freightMonth,freightShipment,nativeFreightShipment} from './marketFreightNativeFixture';

function sample(world:WorldState,id:string):ChronicleAnchor{
  const row=world.chronicleArchive.anchors.find(anchor=>anchor.id===id)??world.events.find(event=>event.id===id);
  if(!row)throw Error(`Missing real public source ${id}`);
  return structuredClone(row);
}
const cut=(anchor:ChronicleAnchor,endTick=anchor.tick)=>({startTick:anchor.tick,endTick,anchors:[anchor]});

describe('chapter-end hooks from exact public native outstanding activity',()=>{
  it('closes on a genuinely dispatched intermarket shipment, and makes no future settlement claim in the previous cutoff',()=>{
    const {world,shipment}=nativeFreightShipment();
    const anchor=sample(world,`evt-${shipment.departedTick}-market-${shipment.id}`);
    const chapter=cut(anchor);
    const issued=deriveChapterEndHook(world,chapter);
    expect(issued).toEqual({eventId:anchor.id,text:'这卷停笔时，商队已经启程，货还没有到埠。'});
    let later=world;
    for(let i=0;i<12&&freightShipment(later).status==='in_transit';i++)later=freightMonth(later);
    expect(freightShipment(later).settledTick).toBeGreaterThan(chapter.endTick);
    expect(deriveChapterEndHook(later,chapter)).toEqual(issued);
    expect(deriveChapterEndHook(later,cut(anchor,later.tick))).toBeUndefined();
    expect(issued?.text).not.toMatch(/运达|败|损|赔|几日|后便/);
  });

  it('finds the true siege launch then arrival at exact historical cutoffs, never claims a fight before it happens',()=>{
    const {launched,arrived,siege}=actualGrandSiege();
    const launch=sample(launched,siege.theatre!.sourceLaunchId);
    const arrival=sample(arrived,`evt-${arrived.tick}-dip-${siege.id}`);
    const old=cut(launch);
    expect(deriveChapterEndHook(launched,old)).toMatchObject({eventId:launch.id,text:expect.stringContaining('还没到山门')});
    expect(deriveChapterEndHook(arrived,old)).toEqual(deriveChapterEndHook(launched,old));
    const atGate={startTick:launch.tick,endTick:arrival.tick,anchors:[launch,arrival]};
    const waiting=deriveChapterEndHook(arrived,atGate);
    expect(waiting).toMatchObject({eventId:arrival.id,text:expect.stringContaining('没写到开阵')});
    const fought=siegeTurn(arrived);
    expect(deriveChapterEndHook(fought,atGate)).toEqual(waiting);
    expect(deriveChapterEndHook(fought,{...atGate,endTick:fought.tick})).toBeUndefined();
  });

  it('rejects conflicting raw private copies, chapter-only or time-shifted citations, duplicate anchors and duplicate typed status',()=>{
    const {world,shipment}=nativeFreightShipment();
    const anchor=sample(world,`evt-${shipment.departedTick}-market-${shipment.id}`);
    const chapter=cut(anchor);
    expect(deriveChapterEndHook(world,{...chapter,anchors:[anchor,anchor]})).toBeUndefined();
    expect(deriveChapterEndHook(world,{...chapter,endTick:world.tick+1})).toBeUndefined();
    expect(deriveChapterEndHook(world,cut({...anchor,title:'秘闻说舟尚未过江'}))).toBeUndefined();
    const hidden=structuredClone(world),original=hidden.events.find(row=>row.id===anchor.id)!;
    hidden.events.unshift({...original,witnessScope:'participants'});
    expect(deriveChapterEndHook(hidden,chapter)).toBeUndefined();
    const missing=structuredClone(world);
    missing.events=missing.events.filter(row=>row.id!==anchor.id);
    missing.chronicleArchive.anchors=missing.chronicleArchive.anchors.filter(row=>row.id!==anchor.id);
    expect(deriveChapterEndHook(missing,chapter)).toBeUndefined();
    const ambiguous=structuredClone(world);
    ambiguous.markets.shipments.push({...shipment});
    expect(deriveChapterEndHook(ambiguous,chapter)).toBeUndefined();
  });
});
