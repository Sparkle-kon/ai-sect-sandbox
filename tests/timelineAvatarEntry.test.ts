import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {activeAvatar,AVATAR_POSSESSION_COST,queueAvatarOrder} from '../src/engine/avatarEngine';
import {adjustSectAffinity,resolveDiplomacyAction} from '../src/engine/diplomacyEngine';
import {advanceOccasions,joinOccasion} from '../src/engine/occasionEngine';
import {encodeWorldSave} from '../src/engine/storageEngine';
import {createTimeline,forkTimeline,forkTimelineAvatarEntry,readTimelineHead,recordTimelineWorld,
  selectTimelineBranch} from '../src/engine/timelineEngine';
import type {TimelineSnapshot,WorldTimeline} from '../src/engine/timelineEngine';
import {triggerTribulation} from '../src/engine/tribulationEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';

const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'此刻静候。'};
const advance=(world:WorldState)=>advanceWorldTick(world,Object.fromEntries(world.cultivators.map(actor=>[actor.id,idle])),()=>.99);
const snap=(timeline:WorldTimeline,tick:number)=>timeline.branches.find(branch=>branch.id===timeline.activeBranchId)!
  .snapshots.find(row=>row.tick===tick)!;
const scope=(actor:Cultivator,viewer:Cultivator=actor)=>({actorId:actor.id,viewerId:viewer.id,siteId:actor.locationId});
const nativeBytes=(timeline:WorldTimeline)=>timeline.branches.map(branch=>branch.snapshots.map(({world})=>encodeWorldSave(world)));
const forkOne=(timeline:WorldTimeline,historical:TimelineSnapshot,actor:Cultivator,viewer:Cultivator=actor)=>
  forkTimelineAvatarEntry(timeline,timeline.activeBranchId,historical.tick,historical,scope(actor,viewer));

describe('historical era entry uses one genuine native possession',()=>{
  it('enters the exact old living actor despite a same-name alternative and a real later demise; keeps all existing branches',()=>{
    let past=createInitialWorld(2031);
    while(past.month!==12)past=advance(past);
    const first=past.cultivators[0],other=past.cultivators[1];
    other.name=first.name;
    other.locationId=first.locationId;
    first.age=first.lifespan-1;
    let timeline=createTimeline(past);
    timeline=forkTimeline(timeline,past.tick,{type:'SPAWN_TREASURE',targetLocationId:past.locations[0].id},'独立兄线');
    timeline=selectTimelineBranch(timeline,'main');
    const historical=snap(timeline,past.tick);
    const present=advance(past);
    expect(present.cultivators.find(({id})=>id===first.id)?.alive).toBe(false);
    expect(present.cultivators.find(({id})=>id===other.id)?.alive).toBe(true);
    timeline=recordTimelineWorld(timeline,present);
    const untouched=nativeBytes(timeline);
    const current=timeline.branches;
    const entered=forkOne(timeline,historical,first,other);
    expect(entered.branches).toHaveLength(3);
    expect(entered.activeBranchId).toBe('branch-2');
    expect(entered.branches[0]).toBe(current[0]);
    expect(entered.branches[1]).toBe(current[1]);
    expect(nativeBytes(entered).slice(0,2)).toEqual(untouched);
    const play=readTimelineHead(entered)!;
    expect(play.tick).toBe(past.tick);
    expect(play.year).toBe(past.year);
    expect(play.month).toBe(past.month);
    expect(play.random).toEqual(historical.world.random);
    expect(play.interventionSequence).toBe(historical.world.interventionSequence);
    expect(play.events).toEqual(historical.world.events);
    expect(activeAvatar(play)?.id).toBe(first.id);
    expect(play.playerAvatar.essence).toBe(historical.world.playerAvatar.essence-AVATAR_POSSESSION_COST);
    expect(play.playerAvatar.pendingOrder).toBeUndefined();
    expect(queueAvatarOrder(play,'REST')).toBe(true);
    expect(activeAvatar(readTimelineHead(selectTimelineBranch(entered,'main'))!)).toBeUndefined();
    expect(nativeBytes(timeline)).toEqual(untouched);
  });

  it('settles one separately queued native order under both decision engines, never on the preserved source',()=>{
    const world=createInitialWorld(2031),host=world.cultivators[0];
    host.hp-=100;
    const original=createTimeline(world), frame=snap(original,world.tick);
    const entry=forkOne(original,frame,host);
    const embodied=readTimelineHead(entry)!;
    expect(embodied.tick).toBe(world.tick);
    expect(embodied.playerAvatar.pendingOrder).toBeUndefined();
    expect(queueAvatarOrder(embodied,'REST')).toBe(true);
    expect(queueAvatarOrder(embodied,'CULTIVATE')).toBe(false);
    for (const mode of ['utility','deferred'] as const) {
      const model={ [host.id]:{...idle,chosenAction:'CULTIVATE' as const} };
      const next=advanceWorldTick(embodied,mode==='deferred'?model:undefined,()=>.95,mode);
      const actor=next.cultivators.find(row=>row.id===host.id)!;
      expect(next.tick).toBe(world.tick+1);
      expect(actor.currentAction).toBe('REST');
      expect(actor.hp).toBeGreaterThan(host.hp);
      expect(next.playerAvatar.pendingOrder).toBeUndefined();
    }
    expect(nativeBytes(original)).toEqual(nativeBytes(selectTimelineBranch(entry,'main')).slice(0,1));
  });

  it('rejects a same-date foreign clone, a stale replaced head, wrong local entry and a truly missing old tick',()=>{
    const world=createInitialWorld(2031),actor=world.cultivators[0];
    const original=createTimeline(world),before=snap(original,world.tick);
    expect(()=>forkOne(original,structuredClone(before),actor)).toThrow(expect.objectContaining({code:'missing_snapshot'}));
    const elsewhere=world.locations.find(site=>site.id!==actor.locationId)!;
    expect(()=>forkTimelineAvatarEntry(original,'main',world.tick,before,{...scope(actor),siteId:elsewhere.id}))
      .toThrow(expect.objectContaining({code:'invalid_avatar_entry'}));
    expect(()=>forkTimelineAvatarEntry(original,'foreign',world.tick,before,scope(actor))).toThrow(expect.objectContaining({code:'missing_snapshot'}));
    expect(()=>forkTimelineAvatarEntry(original,'main',world.tick+1,before,scope(actor))).toThrow(expect.objectContaining({code:'missing_snapshot'}));
    const changed=structuredClone(world);changed.cultivators[0].spiritStones++;
    const updated=recordTimelineWorld(original,changed);
    expect(()=>forkOne(updated,before,actor)).toThrow(expect.objectContaining({code:'missing_snapshot'}));

    let full=original;
    for(let i=0;i<3;i++)full=forkTimeline(full,world.tick,{type:'SPAWN_TREASURE',targetLocationId:world.locations[0].id});
    expect(()=>forkOne(full,snap(full,world.tick),actor)).toThrow(expect.objectContaining({code:'branch_limit'}));
    expect(original.branches).toHaveLength(1);
    expect(full.branches).toHaveLength(4);
  });

  it('refuses a native in-progress tournament, tribulation and marching coalition without touching essence',()=>{
    const tournament=createInitialWorld(2031),entrant=tournament.cultivators[0],second=tournament.cultivators[1];
    tournament.tick=60;tournament.year=1005;tournament.month=12;
    expect(advanceOccasions(tournament,()=>.1)).not.toHaveLength(0);
    const contest=tournament.occasions[0];
    expect(contest.kind).toBe('tournament');
    for(const actor of [entrant,second])expect(joinOccasion(tournament,actor,{...idle,chosenAction:'JOIN_OCCASION',targetOccasionId:contest.id})).not.toBeNull();
    tournament.tick=contest.registrationClosesTick;tournament.year=1006;tournament.month=3;
    advanceOccasions(tournament,()=>.1);
    expect(contest.status).toBe('running');
    const contestLine=createTimeline(tournament);
    expect(()=>forkOne(contestLine,snap(contestLine,tournament.tick),entrant,second))
      .toThrow(expect.objectContaining({code:'invalid_avatar_entry'}));

    const trial=createInitialWorld(2031),trier=trial.cultivators[0];
    trier.realm='筑基';trier.realmStage=9;trier.qiProgress=100;
    expect(triggerTribulation(trial,trier)).not.toBeNull();
    const trialLine=createTimeline(trial);
    expect(()=>forkOne(trialLine,snap(trialLine,trial.tick),trier)).toThrow(expect.objectContaining({code:'invalid_avatar_entry'}));

    const siege=createInitialWorld(2031);
    siege.diplomacy=[];
    const [own,target,ally,other]=siege.sects;
    const leader=siege.cultivators.find(actor=>actor.id===own.leaderId)!;
    for(const person of siege.cultivators){
      person.locationId=siege.sects.find(sect=>sect.id===person.sectId)!.headquartersId;
      person.hp=person.maxHp=500;person.combatPower=person.sectId===target.id?200:1500;
    }
    for(const neighbor of [ally,other]){
      adjustSectAffinity(siege,own.id,neighbor.id,60);
      expect(resolveDiplomacyAction(siege,leader,{...idle,chosenAction:'OFFER_ALLIANCE',targetSectId:neighbor.id})).not.toBeNull();
    }
    adjustSectAffinity(siege,own.id,target.id,-60);
    expect(resolveDiplomacyAction(siege,leader,{...idle,chosenAction:'DECLARE_WAR',targetSectId:target.id})).not.toBeNull();
    siege.tick+=3;siege.month+=3;
    expect(resolveDiplomacyAction(siege,leader,{...idle,chosenAction:'LAUNCH_SIEGE',targetSectId:target.id})).not.toBeNull();
    expect(siege.sieges[0]?.participantIds).toContain(leader.id);
    const siegeLine=createTimeline(siege);
    expect(()=>forkOne(siegeLine,snap(siegeLine,siege.tick),leader)).toThrow(expect.objectContaining({code:'invalid_avatar_entry'}));
    for(const world of [tournament,trial,siege])expect(world.playerAvatar.essence).toBe(100);
  });
});
