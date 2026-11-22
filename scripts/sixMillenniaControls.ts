import type {Cultivator,LLMDecisionPayload,WorldState} from '../src/types/world';

export const SIX_MILLENNIA_ROOT_TICK=34;
export const SIX_MILLENNIA_SOURCE_TICK=36_034;
export const SIX_MILLENNIA_TERM_TICK=72_034;
export const SIX_MILLENNIA_SEAL_INTERVAL=1_200;
export const SIX_MILLENNIA_STEWARD='elder-danxia-1';
export const SIX_MILLENNIA_WELL='loc-vein-north';
export const SIX_MILLENNIA_CONTROLLER='All living actors receive REST except original well steward when future natural lifespan is insufficient: while at the same physical well and HP ≥90%, use actual CULTIVATE or BREAKTHROUGH at Qi ≥90. No scripted recruitment; never edit actor or clock.';

export const isLivingSixMillenniaActor=(actor:Pick<Cultivator,'alive'|'hp'>):boolean=>actor.alive&&actor.hp>0;
export function sixMillenniaNativeOrders(world:Pick<WorldState,'tick'|'cultivators'>):Record<string,LLMDecisionPayload>{
  const yearsLeft=Math.ceil((SIX_MILLENNIA_TERM_TICK-world.tick)/12)+1;
  return Object.fromEntries(world.cultivators.filter(isLivingSixMillenniaActor).map(person=>[person.id,{
    chosenAction:person.id===SIX_MILLENNIA_STEWARD&&person.positionPlane===undefined&&person.locationId===SIX_MILLENNIA_WELL&&
      person.age+yearsLeft>=person.lifespan&&person.hp>=person.maxHp*.9?
      (person.qiProgress>=90?'BREAKTHROUGH':'CULTIVATE'):'REST',
    innerMonologue:'隔离验收：按原生月历及本人实际境界留驻。',
  }]));
}

export function sixMillenniaQueryPercentiles(samples:readonly number[]):{samples:number;p50Ms:number;p95Ms:number}{
  if(!samples.length||samples.some(value=>!Number.isFinite(value)||value<0))throw Error('No valid duration observations.');
  const ordered=[...samples].sort((a,b)=>a-b);
  const at=(fraction:number)=>ordered[Math.ceil(ordered.length*fraction)-1];
  return {samples:samples.length,p50Ms:at(.50),p95Ms:at(.95)};
}
