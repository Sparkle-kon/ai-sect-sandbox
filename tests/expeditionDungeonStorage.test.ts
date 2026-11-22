import {describe,expect,it} from 'vitest';
import {buildConfirmedShareSave,prepareShareSavePrivacy} from '../src/engine/shareSavePrivacy';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import type {WorldState} from '../src/types/world';
import {
  actualNativeDungeonGate,dungeonActor,dungeonCompanion,dungeonExplorer,dungeonMonth,dungeonMove,
  dungeonOccasionIn,dungeonOutsider,enterNativeDungeon,
} from './expeditionDungeonNativeFixture';

const run=(world:WorldState)=>dungeonOccasionIn(world).dungeon!;
const reopen=(world:WorldState)=>{
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
};
const reject=(world:WorldState,patch:(copy:WorldState)=>void,path:RegExp)=>{
  const copy=structuredClone(world);patch(copy);
  expect(()=>encodeWorldSave(copy)).toThrow(path);
};
const hall=(world:WorldState)=>dungeonMove(world,'gather','garden');
const sanctum=(world:WorldState)=>dungeonMove(hall(world),'break_array','hall');
function defeated(world:WorldState){
  let current=sanctum(world);
  for(let i=0;i<4&&run(current).bossHp>0;i++)current=dungeonMove(current,'strike','sanctum');
  expect(run(current).bossHp).toBe(0);
  return current;
}

describe('three native private dungeon rooms with exact portable authority',()=>{
  it('keeps legacy unchanged and permits verified strongbox output before any escape is written',()=>{
    const {entered,world:garden}=enterNativeDungeon();
    const old=encodeWorldSave(entered);
    expect(old).not.toContain('"dungeon"');
    expect(encodeWorldSave(decodeWorldSave(old))).toBe(old);
    const earned=dungeonMove(defeated(reopen(garden)),'claim','sanctum');
    expect(run(reopen(earned))).toMatchObject({room:'sanctum',bossHp:0});
    expect(run(earned).outcome).toBeUndefined();
    const exited=dungeonMove(reopen(earned),'retreat','sanctum');
    expect(run(reopen(exited))).toMatchObject({outcome:'claimed',closedTick:exited.tick,
      members:[{actorId:dungeonExplorer,exit:'escaped'}]});
    expect(encodeEraWorldSave(dungeonMonth(reopen(exited)))).toBe(encodeEraWorldSave(dungeonMonth(exited)));
  });

  it('rejects forged room transitions, wrong bodies, wrong age and fabricated private source links',()=>{
    const {world:garden}=enterNativeDungeon(),opened=run(garden).steps[0];
    const enteredTwo=actualNativeDungeonGate(true).entered;
    const one=dungeonMove(enteredTwo,'enter','garden');
    const two=dungeonMove(one,'enter','garden',dungeonCompanion);
    expect(run(reopen(two)).members.map(row=>row.actorId)).toEqual([dungeonExplorer,dungeonCompanion]);
    reject(two,w=>{run(w).members.reverse();},/occasions.dungeon.member/);
    reject(garden,w=>{run(w).members[0].actorId=dungeonOutsider;},/occasions.dungeon.member/);
    reject(garden,w=>{run(w).openedTick=dungeonOccasionIn(w).registrationClosesTick;},/occasions.dungeon.opening/);
    reject(garden,w=>{run(w).room='sanctum';},/occasions.dungeon.room/);
    reject(garden,w=>{run(w).steps[0].eventId='unsupported-other-room-event';},/occasions.dungeon.step/);
    reject(garden,w=>{w.events.find(event=>event.id===opened.eventId)!.actorIds=[dungeonOutsider];},/occasions.dungeon.event/);
    reject(garden,w=>{w.events=w.events.filter(event=>event.id!==opened.eventId);},/occasions.dungeon.event/);
    reject(garden,w=>{
      const native=w.events.find(event=>event.id===opened.eventId)!;
      const {id,tick,year,month,title,description,category,actorIds,locationId}=native;
      w.chronicleArchive.anchors.push({id,tick,year,month,title,description,category,actorIds,locationId});
      delete dungeonOccasionIn(w).dungeon;
    },/publicArchive/);
  });

  it('rejects false payment, health changes or loot before actual end of boss HP and preserves shared proof with redacted private prose',()=>{
    const {world:garden}=enterNativeDungeon();
    const paid=sanctum(garden),hit=dungeonMove(paid,'strike','sanctum');
    expect(run(paid).steps.at(-1)).toMatchObject({move:'break_array',qiPaid:18});
    reject(paid,w=>{Object.assign(run(w).steps.at(-1)!,{qiPaid:17});},/qiPaid/);
    reject(hit,w=>{const strike=run(w).steps.at(-1)!;if(strike.move==='strike')strike.bossBefore--;},/occasions.dungeon.boss/);
    reject(hit,w=>{const strike=run(w).steps.at(-1)!;if(strike.move==='strike')strike.hpLost++;},/occasions.dungeon.boss/);
    const earned=dungeonMove(defeated(garden),'claim','sanctum');
    reject(earned,w=>{const claim=run(w).steps.at(-1)!;if(claim.move==='claim')claim.artifactId='older-false-cargo';},/occasions.dungeon.claim/);
    reject(earned,w=>{run(w).members[0].leftTick=w.tick;run(w).members[0].exit='escaped';},/occasions.dungeon.member/);
    expect(dungeonActor(reopen(earned)).artifacts.some(row=>row.id===`dungeon-loot-${dungeonOccasionIn(earned).id}`)).toBe(true);
    const review=prepareShareSavePrivacy(hit);
    expect(review.status).toBe('ready');
    const exported=buildConfirmedShareSave(hit,review)!;
    expect(run(decodeWorldSave(exported.json))).toEqual(run(hit));
  });

  it('reopens a genuine collapse after the gate is gone and cannot counterfeit it as a deliberate rescue/retreat',()=>{
    const {world:garden}=enterNativeDungeon();
    let collapsed=garden;
    while(collapsed.tick<dungeonOccasionIn(collapsed).expiresTick)collapsed=dungeonMonth(collapsed);
    expect(run(reopen(collapsed))).toMatchObject({outcome:'collapsed',members:[{exit:'collapse',leftTick:collapsed.tick}]});
    expect(collapsed.locations.some(row=>row.id===dungeonOccasionIn(collapsed).locationId)).toBe(false);
    const native=collapsed.events.find(event=>event.id.endsWith('-dungeon-collapse'))!;
    expect(native).toMatchObject({actorIds:[dungeonExplorer],witnessScope:'participants'});
    reject(collapsed,w=>{run(w).outcome='retreated';},/occasions.dungeon.closing/);
    reject(collapsed,w=>{const member=run(w).members[0];member.exit='rescued';delete member.hpLost;},/occasions.dungeon.member/);
    reject(collapsed,w=>{w.events.find(event=>event.id===native.id)!.actorIds=[dungeonOutsider];},/occasions.dungeon.event/);
  });
});
