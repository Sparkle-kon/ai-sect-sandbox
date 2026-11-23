import {describe,expect,it} from 'vitest';
import {possessAvatar} from '../src/engine/avatarEngine';
import {projectCampaignAssembly} from '../src/engine/campaignAssembly';
import {directorTravelPreference,seedPublicCampaignTravel,utilityDirectorTravel} from '../src/engine/director/nudgeIntegrations';
import {sequelHighlightSource} from '../src/engine/director/secondaryHighlights';
import {configureStoryteller} from '../src/engine/storytellerDirector';
import {actualGrandSiege,commander,disciple,patriarch,siegeActor,siegeTurn} from './grandSiegeNativeFixture';

const market={chosenAction:'EXPLORE',targetLocationId:'loc-market',innerMonologue:'进城置备日用。'} as const;
const publicWar='evt-2-dip-sect-qingyun-sect-bloodmoon-declare_war';
const awayFromHome=()=>{
  const {declared}=actualGrandSiege();
  return siegeTurn(declared,{[commander]:market,[patriarch]:market,[disciple]:market});
};

describe('a real public war creates future lawful preparations, never a fabricated assembly',()=>{
  it('stages a leader toward his own known headquarters, not the opposing abyss',()=>{
    let world=awayFromHome();
    expect(configureStoryteller(world,'wandering_jianghu')).toBe(true);
    const before=structuredClone(world);
    const muster=sequelHighlightSource.seed?.(world,siegeActor(world,commander));
    const defend=sequelHighlightSource.seed?.(world,siegeActor(world,patriarch));
    expect(muster).toMatchObject({kind:'travel_bias',actorId:commander,targetSiteId:'loc-taixu',expiresTick:8});
    expect(defend).toBeUndefined(); // The current destination policy excludes actual abyss terrain.
    expect(world).toEqual(before);
    expect(seedPublicCampaignTravel(world,siegeActor(world,disciple))).toBeUndefined();
    expect(world.sieges).toEqual([]);
    expect(projectCampaignAssembly(world,siegeActor(world,commander))).toBeUndefined();
    if(!muster)throw new Error('missing admitted preparation');
    world.storyteller!.nudges=[muster];
    expect(directorTravelPreference(world,siegeActor(world,commander))?.site.id).toBe('loc-taixu');
    // Wait only while the actor's deterministic Utility preference can legitimately favor not leaving.
    for(let tries=0;tries<4&&!utilityDirectorTravel(world,siegeActor(world,commander));tries++)world=siegeTurn(world);
    const travel=utilityDirectorTravel(world,siegeActor(world,commander));
    expect(travel).toMatchObject({chosenAction:'EXPLORE',targetLocationId:'loc-taixu'});
    if(!travel)throw new Error('expected the existing Utility travel preference to admit one normal move');
    const returned=siegeTurn(world,{[commander]:travel});
    expect(siegeActor(returned,commander).locationId).toBe('loc-taixu');
    expect(siegeActor(returned,patriarch).locationId).toBe('loc-market');
    expect(returned.sieges).toEqual([]);
    expect(projectCampaignAssembly(returned,siegeActor(returned,patriarch))).toBeUndefined();
  });

  it('rejects an absent or nonpublic declaration, a protected player, danger and an expired or revoked preference',()=>{
    const world=awayFromHome();
    expect(configureStoryteller(world,'wandering_jianghu')).toBe(true);
    const own=siegeActor(world,commander),ticket=seedPublicCampaignTravel(world,own);
    if(!ticket)throw new Error('fixture must earn a real preference');
    const mutated=(change:(copy:typeof world)=>void)=>{
      const copy=structuredClone(world);
      copy.storyteller!.nudges=[ticket];
      change(copy);
      const actor=siegeActor(copy,commander);
      expect(seedPublicCampaignTravel(copy,actor)).toBeUndefined();
      expect(directorTravelPreference(copy,actor)).toBeUndefined();
    };
    mutated(copy=>{copy.events=copy.events.filter(event=>event.id!==publicWar);});
    mutated(copy=>{copy.events.find(event=>event.id===publicWar)!.witnessScope='participants';});
    mutated(copy=>{copy.diplomacy.find(relation=>relation.pact==='war')!.pact='neutral';});
    mutated(copy=>{expect(possessAvatar(copy,commander)).toBe(true);});
    mutated(copy=>{copy.storyteller!.focusActorId=commander;});
    mutated(copy=>{copy.locations.find(site=>site.id==='loc-taixu')!.expeditionOmenId='false-remote-gate';});
    world.storyteller!.nudges=[ticket];
    expect(directorTravelPreference(world,own,9)).toBeUndefined();
  });
});
