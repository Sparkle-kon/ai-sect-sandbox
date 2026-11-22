import type {LLMDecisionPayload,WorldState} from '../src/types/world';
import {isLivingSixMillenniaActor,SIX_MILLENNIA_STEWARD,SIX_MILLENNIA_WELL} from './sixMillenniaControls';

export const TEN_MILLENNIA_SOURCE_TICK=72_034;
export const TEN_MILLENNIA_TERM_TICK=120_034;
export const TEN_MILLENNIA_CONTROLLER='All living actors receive REST except the original local well steward only if the remaining years exceed natural lifespan and HP ≥90%; then actual CULTIVATE or BREAKTHROUGH at Qi ≥90. No recruitment, authorship, or annual approximation. The attested source steward already has enough lifespan.';
export function tenMillenniaNativeOrders(world:Pick<WorldState,'tick'|'cultivators'>):Record<string,LLMDecisionPayload>{
  const yearsLeft=Math.ceil((TEN_MILLENNIA_TERM_TICK-world.tick)/12)+1;
  return Object.fromEntries(world.cultivators.filter(isLivingSixMillenniaActor).map(person=>[person.id,{
    chosenAction:person.id===SIX_MILLENNIA_STEWARD&&person.positionPlane===undefined&&person.locationId===SIX_MILLENNIA_WELL&&
      person.age+yearsLeft>=person.lifespan&&person.hp>=person.maxHp*.9?
      (person.qiProgress>=90?'BREAKTHROUGH':'CULTIVATE'):'REST',
    innerMonologue:'隔离验收：按原生月历及本人实际境界留驻。',
  }]));
}
