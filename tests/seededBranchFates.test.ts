import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {compareBranchFate} from '../src/engine/branchFateComparison';
import {createTimeline,forkTimeline,readTimelineHead,recordTimelineWorld,selectTimelineBranch} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import {currentVisibleTileIds,terrainTileAt} from '../src/engine/terrainEngine';

const person={kind:'actor' as const,id:'npc-2'};
const bestow='evt-god-treasure-1-1',actualBreak='evt-2-npc-2-break';
const present = <T>(value:T|undefined):T=>{expect(value).toBeDefined();return value!;};
function nativeSeededFates(){
  const source=createInitialWorld(2031);
  const original=source.cultivators.find(actor=>actor.id===person.id)!;
  const ordinary=createTimeline(source);
  let timeline=forkTimeline(ordinary,source.tick,{type:'SPAWN_TREASURE',targetLocationId:original.locationId},'一份赐宝');
  const right=timeline.activeBranchId;
  const gifted=readTimelineHead(timeline)!;
  timeline=recordTimelineWorld(timeline,advanceWorldTick(gifted,undefined,undefined,'utility'));
  const rightHead=readTimelineHead(timeline)!;
  timeline=selectTimelineBranch(timeline,'main');
  timeline=recordTimelineWorld(timeline,advanceWorldTick(source,undefined,undefined,'utility'));
  const leftHead=readTimelineHead(timeline)!;
  return {source,original,gifted,timeline,right,leftHead,rightHead};
}

describe('seeded actual two-fate intervention and native evidence',()=>{
  it('links one once-bestow to one verified next-month rank advance, not the identically categorized exploration',()=>{
    const {source,original,gifted,timeline,right,leftHead,rightHead}=nativeSeededFates();
    expect(original).toMatchObject({id:'npc-2',name:'苏清寒',locationId:'loc-vein-north',qiProgress:82,realm:'金丹',realmStage:7});
    const admitted=present(gifted.events.find(row=>row.id===bestow));
    expect(admitted).toMatchObject({tick:1,year:1001,month:1,locationId:original.locationId,actorIds:[original.id]});
    const receiver=present(gifted.cultivators.find(row=>row.id===person.id));
    expect(receiver.qiProgress).toBe(100);
    expect(receiver.spiritStones-original.spiritStones).toBe(500);
    expect(gifted.interventionSequence).toBe(source.interventionSequence+1);
    expect(gifted.random).toEqual(source.random);
    expect(gifted.cultivators.filter(row=>row.qiProgress!==source.cultivators.find(prior=>prior.id===row.id)?.qiProgress).map(row=>row.id))
      .toEqual([person.id]);
    expect(leftHead.cultivators.find(row=>row.id===person.id)).toMatchObject({realmStage:7,currentAction:'EXPLORE'});
    expect(rightHead.cultivators.find(row=>row.id===person.id)).toMatchObject({realmStage:8,currentAction:'BREAKTHROUGH'});
    expect(leftHead.events.find(row=>row.id==='evt-2-npc-2-explore')).toMatchObject({category:'breakthrough'});
    expect(rightHead.events.find(row=>row.id===actualBreak)).toMatchObject({category:'breakthrough',actorIds:[person.id],locationId:original.locationId});
    expect(leftHead.events.some(row=>row.id===actualBreak)).toBe(false);

    const originalTimeline=JSON.stringify(timeline);
    const result=compareBranchFate(timeline,'main',right,2,person,person.id);
    expect(result).toMatchObject({ok:true,originTick:1,throughTick:2,subject:{kind:'actor',name:'苏清寒'},remoteCause:'unknown',
      firstDifference:{kind:'bestow',tick:1,right:{kind:'bestow',side:'right',eventId:bestow}},
      consequence:{kind:'realm',side:'right',eventId:actualBreak,tick:2,fromRealm:'金丹',fromStage:7,toRealm:'金丹',toStage:8}});
    expect(JSON.stringify(result)).not.toContain('evt-2-npc-2-explore');
    expect(JSON.stringify(timeline)).toBe(originalTimeline);
  });

  it('does not lend the local fact to a genuinely remote viewer or an unrelated entity',()=>{
    const {timeline,right}=nativeSeededFates();
    const remote=compareBranchFate(timeline,'main',right,2,person,'npc-1');
    for(const fact of [bestow,actualBreak])expect(JSON.stringify(remote)).not.toContain(fact);
    if(remote.ok){
      expect(remote.firstDifference).toBeUndefined();
      expect(remote.consequence).toBeUndefined();
      expect(remote.remoteCause).toBe('unknown');
    }
    const differentSubject=compareBranchFate(timeline,'main',right,2,{kind:'actor',id:'npc-1'},'npc-1');
    for(const fact of [bestow,actualBreak])expect(JSON.stringify(differentSubject)).not.toContain(fact);
  });

  it('does not attach a later real breakthrough after the immediate month had another chosen action',()=>{
    const source=createInitialWorld(2031);
    let timeline=forkTimeline(createTimeline(source),source.tick,{type:'SPAWN_TREASURE',targetLocationId:'loc-vein-north'});
    const right=timeline.activeBranchId, gifted=readTimelineHead(timeline)!;
    const waiting=advanceWorldTick(gifted,{[person.id]:{chosenAction:'REST',innerMonologue:'本月暂不冲关。'}},undefined,'utility');
    expect(waiting.cultivators.find(row=>row.id===person.id)).toMatchObject({realmStage:7,currentAction:'REST'});
    timeline=recordTimelineWorld(timeline,waiting);
    const actual=advanceWorldTick(waiting,undefined,undefined,'utility');
    const laterActual=actual.events.find(row=>row.id==='evt-3-npc-2-break');
    expect(laterActual).toMatchObject({tick:3,category:'breakthrough'});
    timeline=recordTimelineWorld(timeline,actual);
    timeline=selectTimelineBranch(timeline,'main');
    const leftNext=advanceWorldTick(source,undefined,undefined,'utility');
    timeline=recordTimelineWorld(timeline,leftNext);
    timeline=recordTimelineWorld(timeline,advanceWorldTick(leftNext,undefined,undefined,'utility'));
    const result=compareBranchFate(timeline,'main',right,3,person,person.id);
    expect(result).toMatchObject({ok:true,firstDifference:{kind:'bestow'},remoteCause:'unknown'});
    if(!result.ok)throw Error('actual common live origin');
    expect(result.consequence).toBeUndefined();
  });

  it('cannot use initial witness position to disclose later events after the viewer actually left',()=>{
    const source=createInitialWorld(2031), observer=source.cultivators.find(row=>row.id==='npc-1')!;
    // Local fixture establishes origin knowledge only. The departure and selected actor's
    // breakthrough then both happen by actual completed game actions.
    observer.locationId='loc-vein-north';
    const site=source.locations.find(row=>row.id===observer.locationId)!;
    const tile=terrainTileAt(source,site.x,site.y)!;
    expect(currentVisibleTileIds(source,observer).has(tile.id)).toBe(true);
    let timeline=forkTimeline(createTimeline(source),source.tick,{type:'SPAWN_TREASURE',targetLocationId:site.id});
    const right=timeline.activeBranchId;
    const head=readTimelineHead(timeline)!;
    const departure={chosenAction:'EXPLORE' as const,targetLocationId:'loc-taixu',innerMonologue:'返回自家山门。'};
    const rightNext=advanceWorldTick(head,{[observer.id]:departure},undefined,'utility');
    const rightObserver=rightNext.cultivators.find(row=>row.id===observer.id)!;
    expect(rightObserver.locationId).toBe('loc-taixu');
    expect(currentVisibleTileIds(rightNext,rightObserver).has(tile.id)).toBe(false);
    expect(rightNext.events.find(row=>row.id===actualBreak)).toMatchObject({locationId:site.id});
    expect(rightNext.witnessedPersonalStory.scenes.find(row=>row.eventId===actualBreak)?.witnessIds??[]).not.toContain(observer.id);
    timeline=recordTimelineWorld(timeline,rightNext);
    timeline=selectTimelineBranch(timeline,'main');
    timeline=recordTimelineWorld(timeline,advanceWorldTick(source,{[observer.id]:departure},undefined,'utility'));
    const remote=compareBranchFate(timeline,'main',right,2,person,observer.id);
    expect(remote).toMatchObject({ok:true,firstDifference:{kind:'bestow'},remoteCause:'unknown'});
    if(!remote.ok)throw Error('actual earlier local fact still readable');
    expect(remote.consequence).toBeUndefined();
    expect(JSON.stringify(remote)).not.toContain(actualBreak);
  });

  it('does not backdate a future consequence or reclassify a private/rolled original as proved',()=>{
    const {timeline,right,rightHead}=nativeSeededFates();
    const before=compareBranchFate(timeline,'main',right,1,person,person.id);
    expect(before).toMatchObject({ok:true,firstDifference:{kind:'bestow'},remoteCause:'unknown'});
    if(!before.ok)throw Error('actual retained both-side dates should be readable');
    expect(before.consequence).toBeUndefined();

    for(const conflict of ['lost','private','duplicate'] as const){
      let compare=selectTimelineBranch(timeline,right);
      const tampered=structuredClone(rightHead);
      if(conflict==='private')tampered.events.find(row=>row.id===actualBreak)!.witnessScope='participants';
      else if(conflict==='duplicate')tampered.events.push({...tampered.events.find(row=>row.id===actualBreak)!,witnessScope:'participants'});
      else tampered.events=tampered.events.filter(row=>row.id!==actualBreak);
      // A stale public archive of a now-private duplicate is not authority either.
      if(conflict==='lost'){
        tampered.chronicleArchive.anchors=tampered.chronicleArchive.anchors.filter(row=>row.id!==actualBreak);
        for(const chapter of [...tampered.chronicleArchive.chapters,...tampered.coldHistory.chapters])
          chapter.anchors=chapter.anchors.filter(row=>row.id!==actualBreak);
      }
      compare=recordTimelineWorld(compare,tampered);
      const fact=compareBranchFate(compare,'main',right,2,person,person.id);
      expect(fact).toMatchObject({ok:true,firstDifference:{kind:'bestow'},remoteCause:'unknown'});
      if(!fact.ok)throw Error('earlier authorized difference still retained');
      expect(fact.consequence).toBeUndefined();
      expect(JSON.stringify(fact)).not.toContain(actualBreak);
    }
  });
});
