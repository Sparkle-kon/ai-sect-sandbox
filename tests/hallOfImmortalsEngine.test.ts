import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {projectHallOfImmortals} from '../src/engine/hallOfImmortalsEngine';
import {actualCommonBond,actualDefenderWinsLethally,bondSite,firstId,nearId} from './dramaticBondNativeFixture';

describe('hall scope and evidence-only presentation',()=>{
  it('uses actual present authorization for rank, exact numeric karma, and no legacy guessed alchemy',()=>{
    const world=createInitialWorld(1,'spirit-bloom');
    const [visible,hidden]=world.cultivators;
    visible.karma=-15;hidden.karma=-98;
    const read=projectHallOfImmortals(world,{currentVisibleActorIds:new Set([visible.id]),
      currentVisibleSiteIds:new Set([visible.locationId]),viewerId:visible.id});
    expect(read.rankings.power.map(row=>row.actorId)).toEqual([visible.id]);
    expect(read.rankings.karma).toContainEqual(expect.objectContaining({actorId:visible.id,score:-15}));
    expect(read.rankings.alchemy).toEqual([]);
    expect(read.ascended).toEqual([]);
    const forged=projectHallOfImmortals(world,{currentVisibleActorIds:new Set([visible.id]),
      currentVisibleSiteIds:new Set([visible.locationId]),viewerId:'forged-scope'});
    expect(forged.rankings.power).toEqual([]);
  });
  it('only publishes a death after exact native identity, and a contradictory retained source cannot shadow it',()=>{
    const {world,death}=actualDefenderWinsLethally(actualCommonBond().clash);
    const currentVisibleSiteIds=new Set([bondSite]),currentVisibleActorIds=new Set<string>();
    const project=()=>projectHallOfImmortals(world,{currentVisibleSiteIds,currentVisibleActorIds});
    const earlier=project().memorials.find(row=>row.actorId===firstId);
    expect(earlier?.scenes.at(-1)).toMatchObject({kind:'ending',tick:death.tick});
    expect(project().memorials.some(row=>row.actorId===nearId)).toBe(false);
    world.events.unshift({...death,witnessScope:'participants'});
    expect(project().memorials.some(row=>row.actorId===firstId)).toBe(false);
  });
});
