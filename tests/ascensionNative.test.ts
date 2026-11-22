import { describe,expect,it } from 'vitest';
import { buildAscensionMapVfx } from '../src/components/ascensionSceneVfx';
import { createTerrainMapView } from '../src/components/terrainMapView';
import { projectHallOfImmortals } from '../src/engine/hallOfImmortalsEngine';
import { IMMORTAL_ASCENSION_ADDRESS,ascensionDamage,ascensionEventId } from '../src/engine/ascensionTerms';
import { decodeEraWorldSave,encodeEraWorldSave } from '../src/engine/storageEngine';
import type { WorldState } from '../src/types/world';
import {
  actualAscensionOpen,actualAscensionWaves,actualAscentThreshold,ascentActor,ascentActorId,ascentMonth,ascentOrder,
  ascentSite,ascentStart,ascentTrial,command,genuineReversibleUpper,northSite,travelerId,
} from './ascensionNativeFixture';

function strict(world:WorldState){
  const raw=encodeEraWorldSave(world),restored=decodeEraWorldSave(raw);
  expect(encodeEraWorldSave(restored)).toBe(raw);
  return restored;
}
const hall=(world:WorldState,site=ascentSite,viewerId='elder-taixu-1',throughTick=world.tick)=>
  projectHallOfImmortals(world,{viewerId,throughTick,currentVisibleSiteIds:new Set([site]),
    currentVisibleActorIds:new Set(world.cultivators.filter(row=>row.alive&&row.locationId===site).map(row=>row.id))});

const mapMarks=(world:WorldState,viewerId='elder-taixu-1',historical=false)=>
  buildAscensionMapVfx(world,createTerrainMapView(world,ascentActor(world,viewerId),true).isCurrentLocation,historical);

describe('native final ascension rather than reversible gate travel',()=>{
  it('only starts at an actual peak and produces three real, individually paid wave receipts before an irreversible public ending',()=>{
    const below=ascentMonth(actualAscentThreshold(false,8),ascentStart);
    expect(below.ascension).toBeUndefined();
    const {initial,opening,first,second,passed,trial}=actualAscensionWaves();
    const warning=opening.events.find(row=>row.id===ascensionEventId(ascentActorId,opening.tick,'warning'));
    expect(warning).toMatchObject({tick:opening.tick,locationId:ascentSite,actorIds:[ascentActorId]});
    expect(warning?.damage).toBeUndefined();
    expect(ascentActor(opening).hp).toBe(ascentActor(initial).hp);
    expect(ascentActor(opening).qiProgress).toBe(85);
    const site=passed.locations.find(row=>row.id===ascentSite)!;
    const mark={actorId:ascentActorId,siteId:ascentSite,x:site.x,y:site.y};
    expect(mapMarks(opening)).toEqual([{...mark,kind:'warning'}]);
    expect(mapMarks(first)).toEqual([{...mark,kind:'wave',wave:1}]);
    expect(mapMarks(second)).toEqual([{...mark,kind:'wave',wave:2}]);
    expect(mapMarks(passed)).toEqual([{...mark,kind:'gate'}]);
    expect(mapMarks(passed,'npc-5')).toEqual([]);
    expect(mapMarks(passed,'elder-taixu-1',true)).toEqual([]);
    expect(hall(opening).ascended).toEqual([]);
    expect(hall(second).ascended).toEqual([]);
    const phase=ascentTrial(passed);
    for(const [before,after,index,stance,cost] of [[opening,first,1,'guard',8],[first,second,2,'advance',4],
      [second,passed,3,'guard',8]] as const){
      const row=phase.waves[index-1];
      const applied=ascensionDamage(ascentActor(before).maxHp,index,stance);
      expect(row).toMatchObject({wave:index,tick:after.tick,stance,qiPaid:cost,qiBefore:ascentActor(before).qiProgress,
        beforeHp:ascentActor(before).hp,afterHp:ascentActor(before).hp-applied});
      expect(after.events.find(event=>event.id===row.eventId)).toMatchObject({tick:after.tick,locationId:ascentSite,
        damage:[{cultivatorId:ascentActorId,amount:applied}]});
    }
    expect(ascentActor(passed)).toMatchObject({id:ascentActorId,alive:true,positionPlane:'immortal',locationId:IMMORTAL_ASCENSION_ADDRESS,
      realm:'渡劫',realmStage:9,qiProgress:65});
    expect(passed.locations.some(site=>site.id===IMMORTAL_ASCENSION_ADDRESS)).toBe(false);
    expect(phase.terminal).toMatchObject({status:'succeeded',eventId:ascensionEventId(ascentActorId,passed.tick,'succeeded')});
    expect(passed.events.find(event=>event.id===phase.terminal?.eventId)).toMatchObject({tick:passed.tick,locationId:ascentSite,
      actorIds:[ascentActorId]});
    expect(hall(strict(passed)).ascended).toContainEqual(expect.objectContaining({actorId:ascentActorId,ascensionTick:passed.tick}));
    expect(hall(passed,ascentSite,'elder-taixu-1',passed.tick-1).ascended).toEqual([]);
    expect(hall(passed,'loc-danxia','npc-5').ascended).toEqual([]);
    expect(hall(passed).memorials.map(row=>row.actorId)).not.toContain(ascentActorId);
    expect(encodeEraWorldSave(ascentMonth(strict(second),ascentOrder('guard',trial.id)))).toBe(encodeEraWorldSave(passed));
  });

  it('keeps the original surviving immortal out of subsequent aging, lower presence and later mutable actions',()=>{
    const {passed,trial}=actualAscensionWaves(),body=ascentActor(passed);
    let later=ascentMonth(strict(passed),command('EXPLORE',{targetLocationId:ascentSite}));
    later=ascentMonth(later,ascentOrder('guard',trial.id));
    while(later.year===passed.year)later=ascentMonth(later,ascentStart);
    expect(ascentActor(later)).toMatchObject({id:body.id,positionPlane:body.positionPlane,locationId:body.locationId,
      alive:body.alive,age:body.age,realm:body.realm,realmStage:body.realmStage,hp:body.hp,qiProgress:body.qiProgress,
      artifacts:body.artifacts,spiritStones:body.spiritStones,currentAction:body.currentAction});
    expect(later.cultivators.filter(row=>row.id===body.id)).toHaveLength(1);
    expect(createTerrainMapView(later,ascentActor(later,'elder-taixu-1'),false).liveActors.map(row=>row.id)).not.toContain(body.id);
    expect(ascentTrial(strict(later))).toEqual(ascentTrial(passed));
    expect(mapMarks(later)).toEqual([]);
    expect(hall(later).ascended.find(row=>row.actorId===ascentActorId)?.ascensionTick).toBe(passed.tick);
    const ending=ascentTrial(passed).terminal?.eventId;
    for(let month=0;month<126&&later.events.some(row=>row.id===ending);month++){
      expect(ascentActor(later,'elder-taixu-1').locationId).toBe(ascentSite);
      expect(ascentActor(later,'elder-taixu-2').locationId).toBe(ascentSite);
      later=ascentMonth(later,command('SOCIALIZE',{targetCultivatorId:'elder-taixu-2'}),.2,'elder-taixu-1');
    }
    expect(later.events.some(row=>row.id===ending)).toBe(false);
    expect(ascentActor(later)).toMatchObject({id:body.id,positionPlane:body.positionPlane,locationId:body.locationId,
      alive:body.alive,age:body.age,realm:body.realm,realmStage:body.realmStage,hp:body.hp,qiProgress:body.qiProgress,
      artifacts:body.artifacts,spiritStones:body.spiritStones,currentAction:body.currentAction});
    expect(hall(strict(later)).ascended.find(row=>row.actorId===ascentActorId)?.scenes.at(-1)).toMatchObject({
      kind:'ending',tick:passed.tick,title:'仙门接引',
    });
  },20_000);

  it('settles a genuinely wounded failure as zero HP and supports a separate real retreat without fabricating ascension',()=>{
    const wounded=actualAscensionOpen(true),trial=wounded.trial.id;
    const failed=ascentMonth(wounded.opening,ascentOrder('advance',trial));
    const loss=ascentTrial(failed);
    expect(loss.terminal).toMatchObject({status:'failed',reason:'lightning',tick:failed.tick});
    expect(ascentActor(failed)).toMatchObject({alive:false,hp:0,locationId:ascentSite});
    expect(ascentActor(failed).positionPlane).toBeUndefined();
    expect(loss.waves).toHaveLength(1);
    expect(loss.waves[0]).toMatchObject({afterHp:0,beforeHp:ascentActor(wounded.opening).hp,qiPaid:4});
    expect(hall(strict(failed)).ascended).toEqual([]);
    expect(mapMarks(failed).map(mark=>mark.kind)).toEqual(['wave']);
    const rested=ascentMonth(wounded.opening,ascentOrder('retreat',trial));
    expect(ascentTrial(rested).terminal).toMatchObject({status:'retreated',tick:rested.tick});
    expect(ascentActor(rested)).toMatchObject({alive:true,locationId:ascentSite,hp:ascentActor(wounded.opening).hp,qiProgress:85});
    expect(ascentActor(rested).positionPlane).toBeUndefined();
    expect(ascentTrial(rested).waves).toEqual([]);
    expect(hall(strict(rested)).ascended).toEqual([]);
    expect(mapMarks(rested)).toEqual([]);
  });

  it('rejects a real paid historic upper crossing even while that same living traveler is there and when they return',()=>{
    const {upper,returned}=genuineReversibleUpper();
    expect(upper.ascension).toBeUndefined();
    expect(returned.ascension).toBeUndefined();
    expect(hall(upper,northSite,'npc-2').ascended).toEqual([]);
    expect(hall(strict(returned),northSite,travelerId).ascended).toEqual([]);
    expect(returned.upperPassage?.journeys[0]?.returnedTick).toBe(returned.tick);
  });
});
