import { createInitialWorld } from '../data/initialWorld';
import type { WorldState } from '../types/world';

export const REPLAY_RECEIPT_FIXTURE_SEED=17091;
export const REPLAY_RECEIPT_FIXTURE_COUNTS={short48:48,long526:526} as const;
export type ReplayReceiptFixtureId=keyof typeof REPLAY_RECEIPT_FIXTURE_COUNTS;

export function createReplayReceiptFixture(id:ReplayReceiptFixtureId):WorldState {
  if(!Object.hasOwn(REPLAY_RECEIPT_FIXTURE_COUNTS,id)) throw new Error('Unknown replay fixture');
  const world=createInitialWorld(REPLAY_RECEIPT_FIXTURE_SEED);
  const founders=[...world.cultivators];
  const publicSites=world.locations.filter(({type})=>type==='market' || type==='sect_hq');
  const actors=REPLAY_RECEIPT_FIXTURE_COUNTS[id];
  for(let i=founders.length;i<actors;i++){
    const source=structuredClone(founders[i%founders.length]);
    world.cultivators.push({...source,id:`fastforward-bench-${i}`,name:`快进演练修士${i}`,title:'长局压力夹具',
      realm:'练气',realmStage:1,qiProgress:0,age:18+i%24,lifespan:120,artifacts:[],reflections:[],
      memories:[],coreMemories:[],rumors:[],memorySequence:0,exploredTileIds:[],
      locationId:publicSites[i%publicSites.length].id});
  }
  if(world.cultivators.length!==actors) throw new Error('Changed replay fixture coverage');
  return world;
}
