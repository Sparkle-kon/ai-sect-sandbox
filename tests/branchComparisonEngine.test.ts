import { describe, expect, it } from 'vitest';
import { createInitialWorld } from '../src/data/initialWorld';
import { compareAlignedBranches, listAlignedBranchTicks } from '../src/engine/branchComparisonEngine';
import { advanceMarkets, resolveMarketAction } from '../src/engine/marketEngine';
import { createTimeline, forkTimeline, readTimelineHead, recordTimelineWorld } from '../src/engine/timelineEngine';
import type { WorldTimeline } from '../src/engine/timelineEngine';
import { applyCultivatorBrainDecision } from '../src/engine/worldEngine';
import type { Cultivator } from '../src/types/world';

function forked() {
  const world = createInitialWorld(642);
  const [actor,,attacker] = world.cultivators;
  actor.hp = 1;
  actor.combatPower = 1;
  attacker.locationId = actor.locationId;
  const fork = forkTimeline(createTimeline(world), world.tick, { type:'TRIBULATION_STRIKE', targetCultivatorId:actor.id });
  const branch = readTimelineHead(fork)!;
  const peer = branch.cultivators.find(({ id }) => id === attacker.id)!;
  const event = applyCultivatorBrainDecision(branch, peer, {chosenAction:'DUEL',targetCultivatorId:actor.id,innerMonologue:''},() => .99)!;
  expect(event.category).toBe('death');
  branch.events.unshift(event);
  const timeline = recordTimelineWorld(fork,branch);
  return { world, timeline, right:timeline.activeBranchId };
}

describe('exact aligned branch comparison', () => {
  it('shows signed roster and alive deltas from only actual same-genesis frames without claiming a cause', () => {
    const {world,timeline,right} = forked();
    expect(listAlignedBranchTicks(timeline,'main',right)).toEqual([world.tick]);
    const prior = JSON.stringify(timeline);
    const result = compareAlignedBranches(timeline,'main',right,world.tick,world.cultivators[1].id);
    expect(result).toMatchObject({ok:true,tick:world.tick,metrics:expect.arrayContaining([
      {id:'roster',left:world.cultivators.length,right:world.cultivators.length,delta:0},
      {id:'living',left:world.cultivators.length,right:world.cultivators.length-1,delta:-1},
      {id:'fallen',left:0,right:1,delta:1},
    ]),left:{receipts:[]},right:{receipts:[]}});
    expect(JSON.stringify(result)).not.toContain(world.cultivators[0].name);
    expect(JSON.stringify(timeline)).toBe(prior);
  });

  it('records internal holes and never fills them with a closest frame or ambiguous duplicate', () => {
    const {world,timeline,right} = forked();
    const advance = readTimelineHead(timeline)!;
    advance.tick += 4;
    const sparse = recordTimelineWorld(timeline,advance);
    expect(compareAlignedBranches(sparse,'main',right,world.tick+1)).toMatchObject({
      ok:false,reason:'both_unretained',rightCoverage:{retainedTicks:[world.tick,world.tick+4],
        gaps:[{fromTick:world.tick+1,toTick:world.tick+3}]},
    });
    expect(compareAlignedBranches(sparse,'main',right,advance.tick)).toMatchObject({ok:false,reason:'left_unretained'});
    expect(compareAlignedBranches(sparse,right,'main',advance.tick)).toMatchObject({ok:false,reason:'right_unretained'});
    expect(compareAlignedBranches(sparse,right,right,world.tick)).toEqual({ok:false,reason:'same_branch'});
    expect(compareAlignedBranches(sparse,'absent',right,world.tick)).toEqual({ok:false,reason:'missing_branch'});
    expect(compareAlignedBranches(sparse,'main',right,1.5)).toMatchObject({ok:false,reason:'invalid_tick'});
    const branch=sparse.branches.find(({id})=>id===right)!;
    const duplicate: WorldTimeline={...sparse,branches:sparse.branches.map(entry=>entry.id===right ?
      {...branch,snapshots:[...branch.snapshots,branch.snapshots[0]]}:entry)};
    expect(listAlignedBranchTicks(duplicate,'main',right)).toEqual([]);
    expect(compareAlignedBranches(duplicate,'main',right,world.tick)).toMatchObject({ok:false,reason:'right_unretained'});
  });

  it('rejects an equal tick with another seed or mismatched declared birth tick', () => {
    const {world,timeline,right} = forked();
    const fork = timeline.branches.find(({id})=>id===right)!;
    const snapshot = fork.snapshots[0];
    const counterfeit = (value:typeof world): WorldTimeline => ({...timeline,branches:timeline.branches.map(row=>row.id===right ?
      {...fork,snapshots:[{...snapshot,world:value}]}:row)});
    const foreign=createInitialWorld(999);
    expect(compareAlignedBranches(counterfeit(foreign),'main',right,world.tick)).toMatchObject({ok:false,reason:'genesis_mismatch'});
    const birth = structuredClone(snapshot.world);
    birth.worldgen!.birthTick++;
    expect(listAlignedBranchTicks(counterfeit(birth),'main',right)).toEqual([]);
    expect(compareAlignedBranches(counterfeit(birth),'main',right,world.tick)).toMatchObject({ok:false,reason:'genesis_mismatch'});
  });

  it('cites real matched market proofs independently and hides the same raw record outside actual observer scope', () => {
    const world = createInitialWorld(642);
    const [buyer,seller,observer,remote] = world.cultivators;
    const market = world.locations.find(({type})=>type==='market')!;
    buyer.locationId=seller.locationId=observer.locationId=market.id;
    remote.locationId='loc-taixu';
    buyer.spiritStones=100;
    seller.herbs.jade_leaf=5;
    const order=(actor:Cultivator,chosenAction:'PLACE_MARKET_BUY'|'PLACE_MARKET_SELL')=>
      resolveMarketAction(world,actor,{chosenAction,marketGood:'jade_leaf',marketQuantity:1,marketLimitPrice:20,innerMonologue:''})!;
    const sale=order(seller,'PLACE_MARKET_SELL'), purchase=order(buyer,'PLACE_MARKET_BUY');
    const [transaction]=advanceMarkets(world);
    world.events=[sale,purchase,transaction,...world.events];
    const timeline=forkTimeline(createTimeline(world),world.tick,{type:'SPAWN_TREASURE',targetLocationId:market.id});
    const right=timeline.activeBranchId;
    const visible=compareAlignedBranches(timeline,'main',right,world.tick,observer.id);
    expect(visible.ok).toBe(true);
    if(!visible.ok)throw new Error(visible.reason);
    expect(visible.left.receipts[0]).toMatchObject({entry:{eventId:transaction.id,kind:'market_settlement',outcome:'local_fill'},
      previous:expect.arrayContaining([{relation:'matched_sell_order',node:expect.objectContaining({entry:expect.objectContaining({eventId:sale.id})})}])});
    expect(visible.right.receipts[0]).toMatchObject({entry:{eventId:transaction.id}});
    expect(visible.left.receipts).not.toBe(visible.right.receipts);
    const hidden=compareAlignedBranches(timeline,'main',right,world.tick,remote.id);
    expect(hidden).toMatchObject({ok:true,left:{receipts:[]},right:{receipts:[]}});
    expect(compareAlignedBranches(timeline,'main',right,world.tick,'not-this-world')).toMatchObject({ok:true,left:{receipts:[]},right:{receipts:[]}});
  });
});
