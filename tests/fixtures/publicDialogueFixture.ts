import {createInitialWorld} from '../../src/data/initialWorld';
import {availableChronicleChapter,resolveChronicleChapter} from '../../src/engine/novelGenerator';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../../src/types/world';

export const dialoguePerson=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id)!;
export function dialogueProofBase(longNames=false){
  const world=createInitialWorld(7331);
  world.tick=20;world.month=5;
  const [actor,first,second]=world.cultivators;
  for(const person of [actor,first,second]){
    person.age=34;person.lifespan=120;person.locationId='loc-market';person.hp=200;person.maxHp=200;
    person.combatPower=person===actor?800:80;person.tribulation=undefined;person.guardAssignment=undefined;person.artifacts=[];
  }
  actor.name=longNames?'云'.repeat(78)+'林岚':'林岚';
  first.name=longNames?'云'.repeat(78)+'林岚生':'林岚生';
  second.name='林岚青';
  return {world,actorId:actor.id,firstId:first.id,secondId:second.id};
}
export function playPublicDialogueProof(world:WorldState,actorId:string,targetCultivatorId:string){
  const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'等待实际录下的说话。'};
  const options=Object.fromEntries(world.cultivators.map(({id})=>[id,id===actorId?
    {chosenAction:'DUEL',targetCultivatorId,innerMonologue:'未公开想法不可进入对白。',spokenLine:'只听在场留下的这句。'} satisfies LLMDecisionPayload:idle]));
  const next=advanceWorldTick(world,options,()=>.50);
  const event=next.events.find(row=>row.tick===next.tick&&row.actorIds[0]===actorId&&row.actorIds[1]===targetCultivatorId);
  if(!event?.dialogue)throw Error('fixture native public structured dialogue');
  const plan=availableChronicleChapter(next,true);
  if(!plan)throw Error('fixture native canonical retained chapter plan');
  const chapter=resolveChronicleChapter(next,plan);
  if(!chapter||!chapter.anchors.some(row=>row.id===event.id&&row.dialogue))throw Error('fixture exact archived public dialogue');
  return {world:next,event,chapter};
}
export function publicDialogueProofFixture(longNames=false){
  const base=dialogueProofBase(longNames);
  return {...base,...playPublicDialogueProof(base.world,base.actorId,base.firstId)};
}
