// Extracted from the native decision flow; evaluation order belongs to the enclosing Utility pipeline.
import { Cultivator, WorldState, LLMDecisionPayload } from '../../types/world';
import { availableCeasefireActions } from '../ceasefireEngine';
import { autonomousExpeditionRescueOptions, verifiedHeartDemonChoiceEffect } from '../heartDemonChoicePolicy';
import { EXPEDITION_RESCUE_DISTRESS_HP } from '../expeditionRescueEngine';
import { type AscensionOption, availableAscensionActions, activeAscensionForActor } from '../ascensionEngine';
import { activeAvatar } from '../avatarEngine';
import { exactAscensionDecision, ascensionCommand } from '../ascensionCognition';
import { ascensionDamage } from '../ascensionTerms';

/** Treaty decisions share exactly the written choices, including when the leader is deployed. */
export function utilityCeasefireDecision(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  const sect = world.sects.find(({ id, leaderId }) => id === actor.sectId && leaderId === actor.id);
  if (!sect) return undefined;
  const choices = availableCeasefireActions(actor, world);
  const shouldDecline = actor.personality === '狂傲' && actor.hp > actor.maxHp * .85 && sect.arrayHp > sect.arrayMaxHp * .65;
  const move = choices.find(({ ceasefireMove }) => ceasefireMove === (shouldDecline ? 'decline' : 'accept')) ??
    choices.find(({ ceasefireMove }) => ceasefireMove === 'offer');
  return move ? { ...move, chosenAction: 'CEASEFIRE', innerMonologue: '兵疲须议，若立停战，须见真实撤军与库银担保。' } : undefined;
}

/** Rescuers opt in only through an actually delivered, currently actionable distress signal. */
export function utilityExpeditionRescueDecision(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  if (!world.expeditionRescues.requests.length && !world.occasions.some((row) => row.kind === 'expedition' && row.status === 'running')) return undefined;
  const choices = autonomousExpeditionRescueOptions(actor,world);
  const withdraw = actor.hp > actor.maxHp * EXPEDITION_RESCUE_DISTRESS_HP ? choices.find((option) => option.rescueMove === 'withdraw' &&
    world.expeditionRescues.requests.some((row) => row.id === option.targetExpeditionRescueId && row.status === 'signaled' && row.explorerId === actor.id)) : undefined;
  const affected=verifiedHeartDemonChoiceEffect(world,actor);
  const accept = affected || actor.hp >= actor.maxHp * .65 && actor.personality !== '嗜血' && actor.personality !== '诡诈' ?
    choices.find(({ rescueMove }) => rescueMove === 'accept') : undefined;
  const option = withdraw ?? choices.find(({ rescueMove }) => rescueMove === 'signal') ?? accept;
  if (!option) return undefined;
  const thought = option.rescueMove === 'signal' ? '向确能收到的在场见证人发出求援。' : option.rescueMove === 'accept' ?
    '我自愿携实物补给接应，只沿已核实的撤离路。' : '已脱离伤势所致的求援条件；在尚未交付补给时撤信。';
  return { ...option, chosenAction: option.action, innerMonologue: thought };
}

export function availableAutonomousAscensionActions(actor: Cultivator, world: WorldState,
  executionTick = world.tick): readonly AscensionOption[] {
  if (actor.positionPlane !== undefined || actor.realm !== '渡劫' || actor.realmStage !== 9 ||
      activeAvatar(world) === actor || world.month === 12 && executionTick === world.tick + 1 && actor.age + 1 >= actor.lifespan)
    return [];
  const actions = availableAscensionActions(actor, world, executionTick);
  return actor.hp >= actor.maxHp * .77 ? actions : actions.filter(option => option.ascensionMove !== 'start');
}

export function utilityAscensionDecision(actor: Cultivator, world: WorldState): LLMDecisionPayload | undefined {
  const options = availableAutonomousAscensionActions(actor, world);
  const opening = options.find(row => row.ascensionMove === 'start');
  if (opening) return exactAscensionDecision(ascensionCommand(opening), options);
  const trial = activeAscensionForActor(world, actor);
  const wave = trial && ([1, 2, 3] as const)[trial.waves.length];
  if (!wave) return undefined;
  const safe = (stance: 'guard' | 'advance') => actor.hp > ascensionDamage(actor.maxHp, wave, stance);
  const picked = actor.personality === '狂傲' && actor.hp >= actor.maxHp * .85 && safe('advance')
    ? options.find(row => row.ascensionMove === 'advance') : undefined;
  const choice = picked ?? options.find(row => row.ascensionMove === 'guard' && safe('guard')) ??
    options.find(row => row.ascensionMove === 'advance' && safe('advance')) ?? options.find(row => row.ascensionMove === 'retreat');
  return choice ? exactAscensionDecision(ascensionCommand(choice), options) : undefined;
}
