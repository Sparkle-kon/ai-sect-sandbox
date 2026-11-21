import {dialoguePerson,dialogueProofBase} from './publicDialogueFixture';
import {advanceWorldTick} from '../../src/engine/worldEngine';
import type {LLMDecisionPayload,WorldState} from '../../src/types/world';

export function playWitnessedPersonalScene(world:WorldState,actorId:string,partnerId:string,
    moves:Record<string,LLMDecisionPayload>={}){
  const idle:LLMDecisionPayload={chosenAction:'REST',innerMonologue:'安坐。'};
  const options=Object.fromEntries(world.cultivators.map(({id})=>[id,moves[id]??(id===actorId?
    {chosenAction:'SOCIALIZE',targetCultivatorId:partnerId,innerMonologue:'旁人不应读出深藏的心思。',
      spokenLine:'记在原事件但不加入亲历视角。'} satisfies LLMDecisionPayload:idle)]));
  const next=advanceWorldTick(world,options,()=>.50);
  const event=next.events.find(row=>row.id===`evt-${next.tick}-${actorId}-social`);
  if(!event)throw Error('fixture native social event absent');
  return {world:next,event};
}
export function witnessedPersonalStoryFixture(){
  const seed=dialogueProofBase(),observer=dialoguePerson(seed.world,seed.secondId);
  const remote=seed.world.cultivators.find(row=>!new Set([seed.actorId,seed.firstId,observer.id]).has(row.id));
  if(!remote)throw Error('fixture independent remote actor absent');
  const otherSite=seed.world.locations.find(row=>row.type==='sect_hq');
  if(!otherSite)throw Error('fixture actual alternate site absent');
  remote.locationId=otherSite.id;
  return {...seed,remoteId:remote.id,observerId:observer.id,otherSiteId:otherSite.id};
}
