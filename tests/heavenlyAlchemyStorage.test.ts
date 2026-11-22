import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {actualHighAlchemyMaterials,actualWardAlchemyMaterials,brewActor,brewMonth,highBrew,highTake} from './alchemyLightningNativeFixture';

const stock=(world:WorldState)=>brewActor(world).heavenlyAlchemy!;
const batch=(world:WorldState)=>stock(world).attempts[0]!;
function exact(world:WorldState){
  const raw=encodeEraWorldSave(world),reopened=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(reopened)).toBe(raw);
  return reopened;
}
function reject(world:WorldState,alter:(copy:WorldState)=>void,path:RegExp){
  const copy=structuredClone(world);alter(copy);
  expect(()=>encodeEraWorldSave(copy)).toThrow(path);
}

describe('strict heavenly pill custody',()=>{
  it('preserves exact save bytes and separate old stock if no refined attempt has happened',()=>{
    const initial=createInitialWorld(1,'spirit-bloom');
    const before=actualHighAlchemyMaterials();
    const ordinary=brewMonth(before,{chosenAction:'BREW_PILL',targetPillId:'golden',innerMonologue:'实际以旧法开炉。'});
    expect(brewActor(ordinary).pills.golden).toBe(brewActor(before).pills.golden+1);
    for(const world of [initial,before,ordinary]){
      const raw=encodeWorldSave(world);
      expect(raw).not.toContain('"heavenlyAlchemy"');
      expect(encodeWorldSave(decodeWorldSave(raw))).toBe(raw);
      expect(encodeEraWorldSave(decodeEraWorldSave(raw))).toBe(raw);
    }
  });

  it('round-trips real refined stock, then exact one native dose rather than an ordinary pill',()=>{
    const before=actualHighAlchemyMaterials();
    const earned=brewMonth(before,highBrew('nine_turn_golden','calm'),.76);
    const quality=batch(earned).quality!;
    expect(quality).toBeDefined();
    expect(stock(exact(earned))).toEqual(stock(earned));
    expect(brewActor(earned).pills).toEqual(brewActor(before).pills);
    expect(brewActor(earned).publicAlchemy).toBeUndefined();
    const used=brewMonth(earned,highTake('nine_turn_golden',quality));
    expect(batch(exact(used)).use).toMatchObject({tick:used.tick,siteId:brewActor(used).locationId});
    expect(brewActor(used).pills).toEqual(brewActor(before).pills);
    reject(earned,w=>{batch(w).quality=quality==='peerless'?'common':'peerless';},/heavenlyAlchemy.quality/);
    reject(earned,w=>{batch(w).id+='-other';},/heavenlyAlchemy.batch/);
    reject(earned,w=>{stock(w).attempts.push({...batch(w)});},/heavenlyAlchemy.batch/);
    reject(earned,w=>{w.furnaceReservations.uses=w.furnaceReservations.uses.filter(row=>row.actorId!==brewActor(w).id);},/heavenlyAlchemy.furnace/);
    reject(earned,w=>{const source=w.events.find(row=>row.id.endsWith('-heavenly-brew'))!;source.title='把未证实的一炉传为真';},/heavenlyAlchemy.source/);
    reject(earned,w=>{delete brewActor(w).heavenlyAlchemy;},/heavenlyAlchemy.source/);
    reject(earned,w=>{batch(w).siteId='loc-secret-1';},/heavenlyAlchemy.batch/);
    reject(earned,w=>{Object.assign(batch(w),{outcome:'invented'});},/outcome/);
    reject(used,w=>{batch(w).use!.tick--;},/heavenlyAlchemy.use/);
    reject(used,w=>{batch(w).use!.wardSpentTick=w.tick;},/heavenlyAlchemy.ward/);
    reject(used,w=>{const source=w.events.find(row=>row.id.endsWith('-heavenly-take'));source!.witnessScope='participants';},/heavenlyAlchemy.source/);
  });

  it('validates only a linked premium ward and rejects ward counterfeit dates and brew references',()=>{
    const before=actualWardAlchemyMaterials();
    const earned=brewMonth(before,highBrew('tribulation_divine','calm'),.85);
    const quality=batch(earned).quality!;
    expect(quality).toBeDefined();
    const used=brewMonth(earned,highTake('tribulation_divine',quality));
    const ward=stock(exact(used)).ward!;
    expect(ward).toEqual({brewId:batch(used).id,expiresTick:used.tick+8});
    reject(used,w=>{stock(w).ward!.expiresTick++;},/heavenlyAlchemy.ward/);
    reject(used,w=>{delete stock(w).ward;},/heavenlyAlchemy.ward/);
    let expired=used;
    for(let i=0;i<9;i++)expired=brewMonth(expired);
    expect(stock(exact(expired)).ward).toEqual(ward);
    reject(used,w=>{stock(w).ward!.brewId='heavenly-brew-other-1';},/heavenlyAlchemy.ward/);
    reject(used,w=>{batch(w).use!.wardSpentTick=w.tick;batch(w).use!.wardWave=1;batch(w).use!.wardTrialId='trial-other';},/heavenlyAlchemy.ward/);
  });
});
