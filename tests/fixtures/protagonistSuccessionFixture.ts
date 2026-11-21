import {createInitialWorld} from '../../src/data/initialWorld';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../../src/types/world';

export const storyPerson=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export const storyPayload=(chosenAction:LLMDecisionPayload['chosenAction'],fields:Partial<LLMDecisionPayload>={}):LLMDecisionPayload=>
  ({chosenAction,innerMonologue:'只依真正发生的见证，不另写天命。',...fields});
export const storyTurn=(world:WorldState,actions:Record<string,LLMDecisionPayload>={},random=.05)=>
  advanceWorldTick(world,Object.fromEntries(world.cultivators.map(({id})=>[id,actions[id]??storyPayload('REST')])),()=>random);

export function protagonistStoryWorld(){
  const world=createInitialWorld(49011);
  world.tick=20;world.month=4;
  const [leader,successor,other,secondary]=world.cultivators.filter(row=>!world.sects.some(sect=>sect.leaderId===row.id));
  for(const actor of [leader,successor,other,secondary]){
    actor.locationId='loc-market';actor.age=33;actor.lifespan=120;actor.realm='练气';actor.realmStage=1;
    actor.hp=actor.maxHp;actor.qiProgress=96;actor.tribulation=undefined;actor.guardAssignment=undefined;
  }
  // Two real persons share a display name intentionally; no authored scene ever uses the wrong ID.
  successor.name=leader.name;
  return {world,leadId:leader.id,successorId:successor.id,witnessId:other.id,otherWitnessId:secondary.id};
}
export function giveEarnedStoryScenes(world:WorldState,actorId:string,witnessId:string){
  world=storyTurn(world,{[actorId]:storyPayload('BREAKTHROUGH')});
  world=storyTurn(world,{[actorId]:storyPayload('SOCIALIZE',{targetCultivatorId:witnessId})});
  world=storyTurn(world,{[actorId]:storyPayload('BREAKTHROUGH')});
  return world;
}
export function earnedProtagonistStory(){
  const f=protagonistStoryWorld();
  const scenes=giveEarnedStoryScenes(f.world,f.leadId,f.witnessId);
  const world=storyTurn(scenes,{},.99);
  if(world.protagonistSuccession.arcs[0]?.actorId!==f.leadId)throw Error('fixture earned predecessor');
  return {...f,world};
}
export function readyProtagonistSuccessor(){
  const f=earnedProtagonistStory();
  const world=giveEarnedStoryScenes(f.world,f.successorId,f.otherWitnessId);
  return {...f,world};
}
export function fallenProtagonistStory(){
  const f=readyProtagonistSuccessor();
  f.world.month=12;
  const active=storyPerson(f.world,f.leadId);
  active.age=active.lifespan-1;
  let world=storyTurn(f.world,{},.99);
  const observedDeath=world.events.find(row=>row.tick===world.tick&&row.category==='death'&&row.actorIds[0]===f.leadId);
  if(!observedDeath)throw Error('fixture genuine public mortality');
  const beforeArchive=world;
  world=storyTurn(world,{},.99);
  if(world.protagonistSuccession.arcs.at(-1)?.actorId!==f.successorId)throw Error('fixture earned independent successor');
  return {...f,world,deathId:observedDeath.id,deathTick:observedDeath.tick,beforeArchive};
}
