import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {buildConfirmedShareSave,prepareShareSavePrivacy,SHARE_SAVE_REDACTED_TEXT} from '../src/engine/shareSavePrivacy';
import {actualClanAdult,actualClanBirth,actualClanVows,clanActor,clanFirst,clanUnion} from './clanDynastyNativeFixture';
import type {WorldState} from '../src/types/world';

function exact(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}
function reject(world:WorldState,alter:(copy:WorldState)=>void,path:RegExp){
  const copy=structuredClone(world);alter(copy);
  expect(()=>encodeEraWorldSave(copy)).toThrow(path);
}

describe('native cultivation clan custody and proof',()=>{
  it('keeps earlier neutral family context and old save bytes without a generated clan',()=>{
    const world=createInitialWorld(1,'spirit-bloom'),raw=encodeWorldSave(world);
    expect(raw).not.toContain('"cultivationClans"');
    expect(encodeWorldSave(decodeWorldSave(raw))).toBe(raw);
    expect(exact(world).relationships).toEqual(world.relationships);
  });

  it('verifies later separate actor acceptance, ceremonial cost, and private plans without changing canonical relationships',()=>{
    const {trusted,proposed,accepted,bonded}=actualClanVows();
    for(const world of [proposed,accepted,bonded])expect(exact(world).cultivationClans).toEqual(world.cultivationClans);
    expect(bonded.relationships).toEqual(trusted.relationships);
    reject(accepted,w=>{clanUnion(w).acceptedTick=clanUnion(w).proposedTick;},/cultivationClans.consent/);
    reject(accepted,w=>{clanUnion(w).parents.reverse();},/cultivationClans.source/);
    reject(bonded,w=>{clanUnion(w).ceremony!.actorId=clanUnion(w).ceremonyOffer!.actorId;},/cultivationClans.ceremony/);
    reject(bonded,w=>{Object.assign(clanUnion(w).ceremony!,{qiPaidEach:0});},/ceremony.qiPaidEach/);
    reject(bonded,w=>{clanUnion(w).clanId='clan-line-890';},/cultivationClans.lineage/);
    reject(accepted,w=>{
      const source=w.events.find(row=>row.id.endsWith('-accept')&&row.id.includes('-clan-union-'))!;
      delete source.witnessScope;
    },/cultivationClans.source/);
    const review=prepareShareSavePrivacy(bonded);
    expect(review.status).toBe('ready');
    const reloaded=decodeWorldSave(buildConfirmedShareSave(bonded,review)!.json);
    expect(reloaded.cultivationClans).toEqual(bonded.cultivationClans);
    expect(reloaded.events.find(row=>row.id.endsWith('-ceremony_offer'))?.description).toBe(SHARE_SAVE_REDACTED_TEXT);
  });

  it('binds one private birth to nine distinct native months and immutable original compound roots',()=>{
    const {newborn,child}=actualClanBirth();
    expect(exact(newborn).cultivationClans?.children).toEqual([child]);
    expect(newborn.cultivators.every(actor=>actor.clanHeritage?.childId!==child.id)).toBe(true);
    const baby=(w:WorldState)=>w.cultivationClans!.children[0];
    reject(newborn,w=>{clanUnion(w).plan!.earnedTicks.pop();},/cultivationClans.family/);
    reject(newborn,w=>{clanUnion(w).plan!.earnedTicks[1]=clanUnion(w).plan!.earnedTicks[0];},/cultivationClans.family/);
    reject(newborn,w=>{baby(w).parentRoots[0]='暗';},/cultivationClans.child/);
    reject(newborn,w=>{baby(w).roots.reverse();},/cultivationClans.inborn/);
    reject(newborn,w=>{baby(w).gender=baby(w).gender==='woman'?'man':'woman';},/cultivationClans.inborn/);
    reject(newborn,w=>{baby(w).maturesAtTick--;},/cultivationClans.child/);
    reject(newborn,w=>{baby(w).maturedTick=w.tick;},/cultivationClans.maturity/);
    reject(newborn,w=>{
      const source=w.events.find(row=>row.id.endsWith('-birth')&&row.id.includes('-clan-union-'))!;
      const {witnessScope:_scope,...copied}=source;
      void _scope;
      w.chronicleArchive.anchors.push(copied);
    },/cultivationClans.privateSource/);
  });

  it('accepts only the exact independent adult body after 216 actual months and rejects copied provenance',()=>{
    const {lastMinor,adult,personId,child}=actualClanAdult();
    const verified=exact(adult);
    expect(clanActor(verified,personId)).toMatchObject({age:18,clanHeritage:{childId:child.id}});
    expect(lastMinor.cultivators.some(actor=>actor.id===personId)).toBe(false);
    reject(adult,w=>{
      const source=w.events.find(event=>event.id.endsWith('-mature')&&event.id.includes('-clan-union-'))!;
      w.chronicleArchive.anchors.push({...source,actorIds:[clanFirst]});
    },/cultivationClans.publicSource/);
    reject(lastMinor,w=>{w.cultivators.push(structuredClone(clanActor(adult,personId)));},/cultivationClans.maturity/);
    reject(adult,w=>{delete clanActor(w,personId).clanHeritage;},/cultivationClans.maturity/);
    reject(adult,w=>{clanActor(w,clanFirst).clanHeritage=structuredClone(clanActor(w,personId).clanHeritage!);},
      /cultivationClans.heritage/);
  });
});
