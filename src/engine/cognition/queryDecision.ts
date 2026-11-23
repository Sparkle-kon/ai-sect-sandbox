import type { Cultivator, WorldState, LLMConfig, LLMDecisionPayload } from '../../types/world';
import { computeHeuristicDecision } from './heuristicDecision';
import { actorFallbackRandom } from '../worldRandom';
import { activeCourierForActor } from '../sealedCourierEngine';
import { utilityCourierHandoffOffer, availableAutonomousCultivationClanActions, waitForOwnClanChoice } from './decisionFactsLate';
import { availableObservatoryActions } from '../fieldObservatoryEngine';

import { requestCultivatorLLMDecision } from './providerDecision';

/** Compatibility for callers explicitly delegating the old, snapshot-local Utility fallback. */
export async function queryCultivatorLLMDecision(
  cultivator: Cultivator,
  world: WorldState,
  config: LLMConfig,
  onSource?: (source: 'llm' | 'utility') => void,
  requestTick = world.tick,
): Promise<LLMDecisionPayload> {
  const fallback = (): LLMDecisionPayload => {
    onSource?.('utility');
    if(cultivator.positionPlane!==undefined)
      return computeHeuristicDecision(cultivator,world,actorFallbackRandom(world,cultivator.id,requestTick));
    if (activeCourierForActor(world, cultivator)) {
      return (requestTick === world.tick + 1 ? utilityCourierHandoffOffer(cultivator, world, requestTick) : undefined) ??
        { chosenAction: 'REST', innerMonologue: '实际在途，不在旧站另作事务。' };
    }
    const due = Object.hasOwn(world.fieldObservatories.byActor, cultivator.id) ?
      availableObservatoryActions(cultivator, world, requestTick).find(({ observatoryMove }) => observatoryMove === 'measure') : undefined;
    return due ? { ...due, chosenAction: 'FIELD_OBSERVATORY', innerMonologue: '如期到场，实测再与旧预测相比。' }
      : computeHeuristicDecision(cultivator, world, actorFallbackRandom(world, cultivator.id, requestTick));
  };
  const familyInquiry = config.enabled && Boolean(config.apiKey.trim()) && requestTick === world.tick + 1 &&
    availableAutonomousCultivationClanActions(cultivator, world, requestTick).length > 0;
  const answer = await requestCultivatorLLMDecision(cultivator, world, config, requestTick);
  if (!answer) {
    if (familyInquiry) { onSource?.('utility'); return waitForOwnClanChoice(); }
    return fallback();
  }
  onSource?.('llm');
  return answer;
}
