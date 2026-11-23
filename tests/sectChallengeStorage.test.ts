import {describe,expect,it} from 'vitest';
import {requestSectChallenge} from '../src/engine/sectChallenges';
import {buildConfirmedShareSave,prepareShareSavePrivacy} from '../src/engine/shareSavePrivacy';
import {createManagedSectWorld} from '../src/engine/starterSectWorld';
import {decodeEraWorldSave,decodeWorldSave,encodeEraWorldSave} from '../src/engine/storageEngine';
import {terrainTileAt} from '../src/engine/terrainEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {SectChallengeResult} from '../src/types/sectChallenge';
import {starterSectIdentity} from '../src/types/sectManagement';
import {sectRecurringIdentity} from '../src/types/sectRecurring';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'在山门静候。'};
const start=()=>createManagedSectWorld(13071,'classic','drunken-sword-hermitage',0)!;
function month(world:WorldState){
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,rest])),()=>.2,'utility',
    undefined,{captureTrace:false,capturePresentation:false});
}
function ticket(){
  const world=month(start()),management=world.sectManagement!;
  const {rivalSectId,rivalSiteId}=sectRecurringIdentity(management.sectId,
    starterSectIdentity(world.random.seed,management.starterId,management.draw).creditorId);
  const venue=world.locations.find(site=>site.id===rivalSiteId)!;
  const tile=terrainTileAt(world,venue.x,venue.y)!;
  const disciple=world.cultivators.find(actor=>actor.id===management.foundingDiscipleIds[1])!;
  if(!disciple.exploredTileIds.includes(tile.id))disciple.exploredTileIds.push(tile.id);
  expect(requestSectChallenge(world,disciple.id,rivalSectId)).toBe(true);
  const state=management.challenges;
  if(!state?.pending)throw new Error('Expected a genuine pending challenge');
  return {world,management,state,offer:state.pending};
}

describe('portable challenge letters and real bouts',()=>{
  it('keeps legacy byte identity and preserves a pending journey across a deliberate share copy',()=>{
    const legacy=encodeEraWorldSave(start());
    expect(decodeEraWorldSave(legacy).sectManagement?.challenges).toBeUndefined();
    expect(encodeEraWorldSave(decodeEraWorldSave(legacy))).toBe(legacy);
    const {world,state}=ticket(),bytes=encodeEraWorldSave(world);
    expect(encodeEraWorldSave(decodeEraWorldSave(bytes))).toBe(bytes);
    const review=prepareShareSavePrivacy(world);
    expect(review).toMatchObject({status:'ready',protectedStateVerified:true});
    const shared=buildConfirmedShareSave(world,review);
    expect(decodeWorldSave(shared!.json).sectManagement?.challenges).toEqual(state);
    expect(encodeEraWorldSave(world)).toBe(bytes);
  });

  it('rejects forged authority, altered route venue and fake outcomes',()=>{
    const {world,management,state,offer}=ticket();
    for(const pending of [
      {...offer,expiresTick:offer.expiresTick+1},
      {...offer,challengerId:management.leaderId},
      {...offer,defenderSectId:management.sectId},
      {...offer,siteId:management.homeSiteId},
      {...offer,id:'forged'},
      {...offer,createdTick:world.tick+1},
    ]){
      management.challenges={...state,pending};
      expect(()=>encodeEraWorldSave(world)).toThrow(/sectManagement.challenges/u);
    }
    management.challenges=state;
    const actual=month(month(world));
    const actualManagement=actual.sectManagement!;
    const resolved=actualManagement.challenges?.history.find(row=>row.outcome==='completed');
    if(resolved?.outcome!=='completed')throw new Error('Expected real completed exchange');
    const bytes=encodeEraWorldSave(actual);
    expect(encodeEraWorldSave(decodeEraWorldSave(bytes))).toBe(bytes);
    for(const history of [
      [{...resolved,winnerId:resolved.loserId}],
      [{...resolved,injury:resolved.injury===12?11:resolved.injury+1}],
      [{...resolved,eventId:'forged'}],
      [{...resolved,reputationMoved:2} as unknown as SectChallengeResult],
      [resolved,resolved],
    ]){
      actualManagement.challenges={...actualManagement.challenges,history};
      expect(()=>encodeEraWorldSave(actual)).toThrow(/sectManagement.challenges/u);
    }
  });
});
