import {describe,expect,it} from 'vitest';
import {createInitialWorld} from '../src/data/initialWorld';
import {compareBranchFate} from '../src/engine/branchFateComparison';
import {computeHeuristicDecision} from '../src/engine/llmBrain';
import {availableLeadershipActions} from '../src/engine/sectPoliticsEngine';
import {createTimeline,forkTimeline,recordTimelineWorld,readTimelineHead,selectTimelineBranch} from '../src/engine/timelineEngine';
import {advanceWorldTick} from '../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../src/types/world';

const rest:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'本月安静过关。'};
function pair(source:WorldState,actorId:string,decision:LLMDecisionPayload,rng=.99){
  const initial=createTimeline(source);
  let timeline=forkTimeline(initial,source.tick,{type:'SPAWN_TREASURE',targetLocationId:'loc-tianji'});
  const right=timeline.activeBranchId;
  const quiet=Object.fromEntries(source.cultivators.map(actor=>[actor.id,rest]));
  const opened=readTimelineHead(timeline)!;
  const after=advanceWorldTick(opened,{...quiet,[actorId]:decision},()=>rng);
  timeline=recordTimelineWorld(timeline,after);
  timeline=selectTimelineBranch(timeline,'main');
  const unchanged=advanceWorldTick(source,quiet,()=>rng);
  timeline=recordTimelineWorld(timeline,unchanged);
  return {timeline,right,after,unchanged};
}

describe('exact native settlement and sect two-fate comparisons',()=>{
  it('cites actual local recruitment of a consenting resident, without assigning a cause to the distant grant',()=>{
    const source=createInitialWorld(9);
    source.tick=8;source.month=8;
    const recruiter=source.cultivators[0];
    const village=source.settlements.villages.find(({locationId})=>locationId==='loc-market')!;
    recruiter.qiProgress=20;
    recruiter.locationId=village.locationId;
    const action=computeHeuristicDecision(recruiter,source,()=>.99);
    expect(action).toMatchObject({chosenAction:'RECRUIT_SETTLER',targetSettlementId:village.id});
    const {timeline,right,after,unchanged}=pair(source,recruiter.id,action);
    const proof=after.settlements.records.find(row=>row.tick===after.tick&&row.kind==='recruitment'&&row.settlementId===village.id)!;
    expect(proof).toMatchObject({actorId:recruiter.id,cultivatorId:`recruit-${action.targetVolunteerId}`,people:1});
    expect(after.events.find(row=>row.id===`evt-${proof.id}`)).toMatchObject({category:'diplomacy',locationId:village.locationId});
    expect(after.settlements.villages.find(row=>row.id===village.id)?.population).toBe(village.population-1);
    expect(unchanged.settlements.villages.find(row=>row.id===village.id)?.population).toBe(village.population);
    expect(compareBranchFate(timeline,'main',right,after.tick,{kind:'settlement',id:village.id},recruiter.id)).toMatchObject({
      ok:true,originTick:source.tick,remoteCause:'unknown',firstDifference:{kind:'population',tick:after.tick,
        right:{kind:'population',eventId:`evt-${proof.id}`,before:village.population,after:village.population-1}},
    });
    const foreign=compareBranchFate(timeline,'main',right,after.tick,{kind:'settlement',id:village.id},'npc-8');
    expect(JSON.stringify(foreign)).not.toContain(`evt-${proof.id}`);
  });

  it('cites exact native accession, not a same-month rumour or the distant grant',()=>{
    const source=createInitialWorld(2031);
    const sect=source.sects[0];
    const incumbent=source.cultivators.find(({id})=>id===sect.leaderId)!;
    const actor=source.cultivators.find(row=>row.id==='npc-2')!;
    const supporter=source.cultivators.find(row=>row.id==='elder-taixu-1')!;
    for(const member of [incumbent,actor,supporter]){
      member.locationId=sect.headquartersId;member.artifacts=[];member.hp=member.maxHp=500;
    }
    actor.realm='元婴';actor.contribution=160;actor.combatPower=1000;actor.personality='阴险';
    incumbent.combatPower=100;
    source.relationships=[{fromId:actor.id,toId:supporter.id,type:'挚友',affinity:70,note:'真实支持者'}];
    const action:LLMDecisionPayload={chosenAction:'CHALLENGE_LEADERSHIP',targetCultivatorId:incumbent.id,innerMonologue:'正式挑战。'};
    expect(availableLeadershipActions(actor,source)).toContainEqual({action:'CHALLENGE_LEADERSHIP',targetCultivatorId:incumbent.id});
    const {timeline,right,after,unchanged}=pair(source,actor.id,action,.5);
    expect(after.sects[0].succession).toMatchObject({previousLeaderId:incumbent.id,leaderId:actor.id,tick:after.tick,method:'challenge'});
    const proof=after.events.find(row=>row.id.startsWith(`evt-${after.tick}-${sect.id}-leadership-${actor.id}-`))!;
    expect(proof).toMatchObject({actorIds:[actor.id,incumbent.id,supporter.id],locationId:sect.headquartersId,category:'intrigue'});
    expect(unchanged.sects[0].leaderId).toBe(incumbent.id);
    expect(compareBranchFate(timeline,'main',right,after.tick,{kind:'sect',id:sect.id},actor.id)).toMatchObject({
      ok:true,originTick:source.tick,remoteCause:'unknown',firstDifference:{kind:'leader',tick:after.tick,
        right:{kind:'leader',eventId:proof.id,previousLeaderId:incumbent.id,leaderId:actor.id}},
    });
    const foreign=compareBranchFate(timeline,'main',right,after.tick,{kind:'sect',id:sect.id},'npc-8');
    expect(JSON.stringify(foreign)).not.toContain(proof.id);
  });
});
