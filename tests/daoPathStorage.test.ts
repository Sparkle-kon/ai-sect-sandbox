import {describe,expect,it} from 'vitest';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {buildConfirmedShareSave,prepareShareSavePrivacy,SHARE_SAVE_REDACTED_TEXT} from '../src/engine/shareSavePrivacy';
import type {WorldState} from '../src/types/world';
import {actualAwakenedSwordIntent,authenticSwordStart,bindOtherArtifact,intentActor,intentTurn,nativeSwordDuel,swordOwner}
  from './swordIntentNativeFixture';

const dao=(world:WorldState)=>intentActor(world).daoPath!;
const proof=(world:WorldState)=>world.events.find(e=>e.daoIntents?.some(row=>row.actorId===swordOwner))!;
function reopen(world:WorldState){
  const raw=encodeEraWorldSave(world),reopened=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(reopened)).toBe(raw);
  return reopened;
}
function reject(world:WorldState,edit:(copy:WorldState)=>void,path:RegExp){
  const copy=structuredClone(world);edit(copy);
  expect(()=>encodeEraWorldSave(copy)).toThrow(path);
}

describe('strict native dao path and intent proof',()=>{
  it('does not add path, practice, or stance fields to an untrained old save',()=>{
    const world=authenticSwordStart();
    const raw=encodeWorldSave(world);
    expect(raw).not.toContain('"daoPath"');
    expect(raw).not.toContain('"daoIntents"');
    expect(encodeWorldSave(decodeWorldSave(raw))).toBe(raw);
    expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
  });

  it('preserves only actually dated paid sword practices, their exact weapon, and later readiness',()=>{
    const {choice,first,learned,ready}=actualAwakenedSwordIntent();
    for(const world of [choice,first,learned,ready])expect(dao(reopen(world))).toEqual(dao(world));
    const review=prepareShareSavePrivacy(ready);
    expect(review.status).toBe('ready');
    const shared=decodeWorldSave(buildConfirmedShareSave(ready,review)!.json);
    expect(dao(shared)).toEqual(dao(ready));
    expect(shared.events.find(event=>event.id.endsWith('-dao-ready')))
      .toMatchObject({title:SHARE_SAVE_REDACTED_TEXT,description:SHARE_SAVE_REDACTED_TEXT});
    reject(ready,w=>{
      const source=w.events.find(event=>event.id.endsWith('-dao-ready'))!;
      source.title=SHARE_SAVE_REDACTED_TEXT;
    },/daoPath.source/);
    reject(learned,w=>{dao(w).practices[1].tick=dao(w).practices[0].tick;},/daoPath.practice/);
    reject(learned,w=>{dao(w).practices[0].qiPaid=0;},/daoPath.practice/);
    reject(learned,w=>{dao(w).practices[0].herbPaid='jade_leaf';},/daoPath.practice/);
    reject(learned,w=>{dao(w).practices[0].artifactId='artifact-npc-1-2';},/daoPath.practice/);
    reject(ready,w=>{dao(w).ready!.siteId='not-a-real-local-site';},/daoPath.ready/);
    reject(ready,w=>{const source=w.events.find(event=>event.id.endsWith('-dao-ready'))!;delete source.witnessScope;},/daoPath.source/);
    reject(ready,w=>{
      const source=w.events.find(event=>event.id.endsWith('-dao-ready'))!;
      const {witnessScope:_scope,...leaked}=source;
      void _scope;
      w.chronicleArchive.anchors.push(leaked);
    },/daoPath.privateSource/);
  });

  it('requires one equivalent typed receipt in the actual paid duel, not a ready pose or a false color',()=>{
    const {ready}=actualAwakenedSwordIntent();
    const fought=intentTurn(ready,{[swordOwner]:nativeSwordDuel()});
    const action=dao(reopen(fought)).activations[0];
    expect(action).toMatchObject({actorId:swordOwner,tick:fought.tick,readyTick:ready.tick,rank:1,qiPaid:12});
    expect(proof(fought).daoIntents).toEqual([action]);
    expect(dao(fought).ready).toBeUndefined();
    reject(fought,w=>{dao(w).activations[0].readyTick=w.tick;},/daoPath.activation/);
    reject(fought,w=>{dao(w).activations[0].rank=3;},/daoPath.activation/);
    reject(fought,w=>{delete proof(w).daoIntents;},/daoPath.duelSource/);
    reject(fought,w=>{proof(w).daoIntents!.push({...proof(w).daoIntents![0]});},/events.daoIntents.receipt/);
    reject(fought,w=>{Object.assign(proof(w).daoIntents![0],{color:'#f0f'});},/color/);
    const rebinding=intentTurn(fought,{[swordOwner]:bindOtherArtifact});
    expect(intentActor(rebinding).artifacts.find(item=>item.id==='artifact-npc-1-2')?.boundTo).toBe(swordOwner);
    expect(dao(reopen(rebinding)).activations).toEqual([action]);
  });
});
