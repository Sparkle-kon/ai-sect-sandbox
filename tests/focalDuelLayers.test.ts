import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {chapterFocalSources} from '../src/engine/focalLayerEvidence';
import {writeFocalDuelLayers} from '../src/engine/focalDuelLayers';
import {queueGuidedForbiddenArt} from '../src/engine/forbiddenArtEngine';
import {actualForbiddenContact,artActor,artTurn,strongRivalId} from './forbiddenArtNativeFixture';
import type {WorldState} from '../src/types/world';
import {actualAwakenedSwordIntent,intentActor,intentTurn,nativeSwordDuel,swordOwner} from './swordIntentNativeFixture';

const earlierId='evt-17-elder-danxia-2-duel',lethalId='evt-21-elder-danxia-2-kill';
function context(world:WorldState,focalId:string,ids:readonly string[]=[focalId]){
  const get=(id:string)=>world.chronicleArchive.anchors.find(row=>row.id===id)!;
  const anchors=ids.map(get);
  if(anchors.some(anchor=>!anchor))throw Error('Native focal scene was never archived in fixture');
  return {world,focal:get(focalId),throughTick:world.tick,anchors,publicOriginal:chapterFocalSources(world,
    {startTick:Math.min(...anchors.map(row=>row.tick)),endTick:world.tick,anchors})};
}

describe('layered public native duel scene',()=>{
  it('uses actual seed-one earlier duel for approach and death outcome only after the committing scene',()=>{
    let world=createInitialWorld(1);
    while(world.tick<21)world=advanceWorldTick(world);
    const raw=world.events.find(row=>row.id===lethalId)!;
    expect(raw.duelWinnerId).toBe('elder-danxia-2');
    const before=JSON.stringify(world);
    const layers=writeFocalDuelLayers(context(world,lethalId,[earlierId,lethalId]));
    expect(layers.map(row=>row.role)).toEqual(['approach','exchange','aftermath']);
    expect(layers[0].eventIds).toEqual([earlierId,lethalId]);
    expect(layers[0].text).not.toMatch(/斩杀|陨|胜/);
    expect(layers[2].text).toContain('叶连翘');
    expect(layers[2].text).toContain('幽姬');
    expect(layers.flatMap(row=>row.eventIds).every(id=>id===earlierId||id===lethalId)).toBe(true);
    expect(layers.map(row=>row.text).join('')).not.toMatch(/风起|雨|万剑归宗|寿元|灵石/);
    expect(JSON.stringify(world)).toBe(before);
  });

  it('names an actual paid sword intent only when exact durable activation and native settled fight agree',()=>{
    const {learned,ready}=actualAwakenedSwordIntent(true);
    const without=intentTurn(learned);
    const plain=intentTurn(without,{[swordOwner]:nativeSwordDuel()});
    const paid=intentTurn(ready,{[swordOwner]:nativeSwordDuel()});
    const id=`evt-${paid.tick}-${swordOwner}-duel`;
    expect(writeFocalDuelLayers(context(paid,id)).find(row=>row.role==='exchange')?.text).toContain('万剑归宗');
    const plainLayers=writeFocalDuelLayers(context(plain,id));
    expect(plainLayers.at(-1)?.text).toContain(intentActor(plain,'elder-taixu-1').name);
    expect(plainLayers.find(row=>row.role==='exchange')?.text).not.toContain('万剑归宗');
    const durable=intentActor(paid).daoPath!;
    durable.activations=durable.activations.map(row=>({...row,readySiteId:'wrong-historic-ready-site'}));
    expect(writeFocalDuelLayers(context(paid,id)).find(row=>row.role==='exchange')?.text).not.toContain('万剑归宗');
  });

  it('names a real paid survival art without making its owner the victor, and rejects a mismatched cost receipt',()=>{
    const {offered,contact}=actualForbiddenContact();
    const settled=artTurn(queueGuidedForbiddenArt(offered,contact.ownerId,contact.id,'verdant-last-breath'));
    const event=settled.events.find(row=>row.tick===settled.tick&&row.duelWinnerId===strongRivalId&&row.forbiddenArt)!;
    const layers=writeFocalDuelLayers(context(settled,event.id));
    expect(layers.find(row=>row.role==='exchange')?.text).toContain('青木续息');
    expect(layers.at(-1)?.text).toContain(`占上风的是${artActor(settled,strongRivalId).name}`);
    expect(layers.at(-1)?.text).not.toContain('陨落');
    const owner=artActor(settled,contact.ownerId);
    owner.forbiddenScars=owner.forbiddenScars?.map(scar=>({...scar,paid:{...scar.paid,lifespan:2}}));
    expect(writeFocalDuelLayers(context(settled,event.id)).find(row=>row.role==='exchange')?.text).not.toContain('青木续息');
  });

  it('omits mismatched/private sources without faking an encounter or assigning a winner',()=>{
    const paid=intentTurn(actualAwakenedSwordIntent().ready,{[swordOwner]:nativeSwordDuel()});
    const id=`evt-${paid.tick}-${swordOwner}-duel`,row=paid.events.find(event=>event.id===id)!;
    const authority=context(paid,id);
    expect(writeFocalDuelLayers({...authority,throughTick:paid.tick+1})).toEqual([]);
    expect(writeFocalDuelLayers({...authority,publicOriginal:()=>({...row,duelWinnerId:'stranger'})})).toEqual([]);
    expect(writeFocalDuelLayers({...authority,publicOriginal:()=>({...row,witnessScope:'participants'})})).toEqual([]);
    expect(writeFocalDuelLayers({...authority,publicOriginal:()=>undefined})).toEqual([]);
  });
});
