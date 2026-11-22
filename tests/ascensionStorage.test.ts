import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave,encodeWorldSave} from '../src/engine/storageEngine';
import {applyMapBrush} from '../src/engine/mapBrushEngine';
import {rotateGazetteHotEvidence} from './tianjiGazetteNativeFixture';
import {IMMORTAL_ASCENSION_ADDRESS,ascensionEventId} from '../src/engine/ascensionTerms';
import {actualAscensionOpen,actualAscensionWaves,ascentActor,ascentActorId,ascentMonth,ascentOrder,
  ascentSite,ascentTrial,genuineReversibleUpper,travelerId} from './ascensionNativeFixture';
import type {WorldState} from '../src/types/world';

function exact(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}
function reject(world:WorldState,alter:(copy:WorldState)=>void,field:RegExp){
  const copy=structuredClone(world);alter(copy);
  expect(()=>encodeEraWorldSave(copy)).toThrow(field);
}

describe('native immortal ascension proof',()=>{
  it('leaves earlier no-ascension saves byte-exact',()=>{
    const world=createInitialWorld(1,'spirit-bloom'),raw=encodeWorldSave(world);
    expect(raw).not.toContain('"ascension"');
    expect(raw).not.toContain('"ascensionTrial"');
    expect(encodeWorldSave(decodeWorldSave(raw))).toBe(raw);
    expect(exact(world).cultivators).toEqual(world.cultivators);
  });

  it('retains the same native warning and three individually dated paid true strikes after reopen',()=>{
    const {opening,first,second,passed}=actualAscensionWaves();
    for(const world of [opening,first,second,passed])expect(ascentTrial(exact(world))).toEqual(ascentTrial(world));
    expect(ascentActor(passed)).toMatchObject({positionPlane:'immortal',alive:true,locationId:IMMORTAL_ASCENSION_ADDRESS});
    reject(opening,w=>{ascentActor(w).realmStage=8;},/ascension.active/);
    reject(first,w=>{ascentTrial(w).waves[0].tick=ascentTrial(w).startedTick;},/ascension.wave/);
    reject(first,w=>{ascentTrial(w).waves[0].qiPaid=4;},/ascension.wave/);
    reject(first,w=>{ascentTrial(w).waves[0].afterHp++;},/ascension.wave/);
    reject(second,w=>{ascentTrial(w).waves[1].wave=1;},/ascension.wave/);
    reject(passed,w=>{ascentTrial(w).waves.pop();},/ascension.success/);
    reject(passed,w=>{ascentActor(w).qiProgress++;},/ascension.success/);
    reject(passed,w=>{ascentActor(w).locationId=ascentSite;},/ascension.success/);
  });

  it('requires the actual original lower source and cannot register the immortal sentinel as a map location',()=>{
    const {passed}=actualAscensionWaves();
    const end=(w:WorldState)=>w.events.find(event=>event.id===ascentTrial(w).terminal!.eventId)!;
    reject(passed,w=>{end(w).damage![0].amount++;},/ascension.source/);
    reject(passed,w=>{end(w).actorIds=['elder-taixu-1'];},/ascension.source/);
    reject(passed,w=>{end(w).witnessScope='participants';},/ascension.source/);
    reject(passed,w=>{end(w).locationId=IMMORTAL_ASCENSION_ADDRESS;},/ascension.address/);
    reject(passed,w=>{
      const {damage:_waveDamage,...archived}=end(w);
      void _waveDamage;
      w.chronicleArchive.anchors.push({...archived,locationId:'loc-danxia'});
    },/ascension.source/);
    reject(passed,w=>{
      w.locations.push({...w.locations.find(row=>row.id===ascentSite)!,id:IMMORTAL_ASCENSION_ADDRESS});
    },/ascension.address/);
    reject(passed,w=>{delete w.ascension;},/ascension.authority/);
  });

  it('keeps the exact immutable ending after the native hot-evidence window really rotates',()=>{
    const {passed}=actualAscensionWaves(),source=ascentTrial(passed).terminal!.eventId;
    const rotated=rotateGazetteHotEvidence(passed,source);
    expect(ascentTrial(exact(rotated))).toEqual(ascentTrial(passed));
    expect(ascentActor(rotated).locationId).toBe(IMMORTAL_ASCENSION_ADDRESS);
  });

  it('closes the actual wounded warning after a lethal meteor without forging a paid wave or second death',()=>{
    const {opening}=actualAscensionOpen(true),site=opening.locations.find(row=>row.id===ascentSite)!;
    const struck=applyMapBrush(opening,'meteor',[{x:site.x,y:site.y}]);
    expect(struck.tick).toBe(opening.tick);
    expect(ascentActor(struck)).toMatchObject({alive:false,hp:0,locationId:ascentSite});
    expect(ascentActor(opening).alive).toBe(true);
    const reopened=exact(struck),native=ascentTrial(reopened),id=ascensionEventId(ascentActorId,struck.tick,'interrupted');
    expect(native).toMatchObject({phase:'failed',waves:[],terminal:{status:'failed',reason:'interrupted',tick:struck.tick,eventId:id}});
    expect(reopened.events.find(row=>row.id===id)).toMatchObject({
      tick:struck.tick,locationId:ascentSite,category:'heavenly',witnessScope:'participants',actorIds:[ascentActorId],
    });
    expect(reopened.events.filter(row=>row.category==='death'&&row.actorIds.includes(ascentActorId))).toHaveLength(1);
    expect(reopened.chronicleArchive.anchors.some(row=>row.id===id)).toBe(false);
    expect(reopened.cultivators.some(actor=>actor.rumors.some(row=>row.originEventId===id))).toBe(false);
  });

  it('retains a genuinely failed lower body and rejects a previous reversible Upper Passage as final evidence',()=>{
    const {opening,trial}=actualAscensionOpen(true);
    const failed=ascentMonth(opening,ascentOrder('advance',trial.id));
    const terminal=ascentTrial(exact(failed)).terminal!;
    expect(terminal).toMatchObject({status:'failed',reason:'lightning',
      eventId:ascensionEventId(ascentActorId,failed.tick,'failed-1')});
    const {upper,returned}=genuineReversibleUpper();
    expect(ascentActor(exact(upper),travelerId).positionPlane).toBe('upper');
    expect(ascentActor(exact(returned),travelerId).positionPlane).toBeUndefined();
    reject(returned,w=>{
      const actor=ascentActor(w,travelerId);
      actor.positionPlane='immortal';actor.locationId=IMMORTAL_ASCENSION_ADDRESS;
    },/ascension.authority/);
  });
});
