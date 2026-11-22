import {availableEncounters} from '../../src/engine/encounterEngine';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {WorldState} from '../../src/types/world';
import {earnedProtagonistStory,giveEarnedStoryScenes,storyPayload,storyPerson,storyTurn} from './protagonistSuccessionFixture';

/** Initial qi and relationship are mechanical fixture inputs; all three cited scenes and the exit are native turns. */
export function nativeHandoffCompetition(){
  const f=earnedProtagonistStory(),{leadId,successorId,witnessId:ordinaryContenderId,otherWitnessId}=f;
  let world=f.world;
  storyPerson(world,leadId).qiProgress=55;
  storyPerson(world,successorId).qiProgress=55;
  world.relationships=world.relationships.filter(({fromId,toId})=>
    !(fromId===leadId&&toId===successorId||fromId===successorId&&toId===leadId));
  world.relationships.push({fromId:leadId,toId:successorId,type:'挚友',affinity:70,note:'夹具初始同修许可'});
  world=storyTurn(world,{[leadId]:storyPayload('SOCIALIZE',{targetCultivatorId:successorId})},.1);
  if(!availableEncounters(storyPerson(world,leadId),world).some(row=>row.action==='DUAL_CULTIVATE'&&row.targetId===successorId))
    throw Error('Missing actual permission to practice at the same public market');
  world=storyTurn(world,{[leadId]:storyPayload('DUAL_CULTIVATE',{targetCultivatorId:successorId})},.1);
  world=storyTurn(world,{[leadId]:storyPayload('DUEL',{targetCultivatorId:successorId})},.45);
  const ties=world.dramaticBonds?.facts.filter(row=>row.actorIds.includes(leadId)&&row.actorIds.includes(successorId))??[];
  if(ties.length!==3||ties.map(row=>row.kind).join(',')!=='encounter,practice,duel')throw Error('Need the real narrative triple');
  storyPerson(world,successorId).qiProgress=96;
  world=giveEarnedStoryScenes(world,successorId,otherWitnessId);
  world=giveEarnedStoryScenes(world,ordinaryContenderId,otherWitnessId);
  const beforeDeparture=structuredClone(world);
  world.month=12;
  const incumbent=storyPerson(world,leadId);
  incumbent.age=incumbent.lifespan-1;
  world=storyTurn(world,{},.99);
  const exit=world.events.find(row=>row.tick===world.tick&&row.category==='death'&&row.actorIds.includes(leadId));
  if(!exit)throw Error('Expected actual native passage at incumbent lifespan');
  return {world,beforeDeparture,leadId,successorId,ordinaryContenderId,ties,exitId:exit.id};
}

export function electNativeHandoff(world:WorldState,mode:'utility'|'deferred'='utility'):WorldState{
  return advanceWorldTick(world,Object.fromEntries(world.cultivators.map(({id})=>[id,storyPayload('REST')])),()=>.99,mode);
}
