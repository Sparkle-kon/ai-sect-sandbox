import type { Cultivator, LLMDecisionPayload, WorldEvent, WorldState } from '../types/world';
import { scriptedDialogue } from './dialogueEngine';
import { recordMemory } from './memoryEngine';
import { gainMastery } from './techniqueEngine';

type EncounterAction = 'TRADE' | 'DUAL_CULTIVATE' | 'SECT_DIPLOMACY';
export const ARTIFACT_TRADE_PRICE = 120;

export function availableEncounters(actor: Cultivator, world: WorldState) {
  const location = world.locations.find((place) => place.id === actor.locationId);
  return world.cultivators.filter((other) => other.alive && other.id !== actor.id &&
    other.locationId === actor.locationId).flatMap((other) => {
    const edge = world.relationships.find((item) =>
      (item.fromId === actor.id && item.toId === other.id) || (item.toId === actor.id && item.fromId === other.id));
    const affinity = edge?.affinity ?? 0;
    const opportunities: { action: EncounterAction; targetId: string }[] = [];
    if (location?.type === 'market' && actor.spiritStones >= ARTIFACT_TRADE_PRICE &&
        affinity >= -15 && other.artifacts.length > 1 &&
        other.artifacts.slice(1).some((item) => !actor.artifacts.some((owned) => owned.name === item.name))) {
      opportunities.push({ action: 'TRADE', targetId: other.id });
    }
    if (affinity >= 65 && actor.qiProgress <= 88 && other.qiProgress <= 88 &&
        actor.hp >= actor.maxHp * 0.5 && other.hp >= other.maxHp * 0.5) {
      opportunities.push({ action: 'DUAL_CULTIVATE', targetId: other.id });
    }
    if ((location?.type === 'market' || location?.type === 'sect_hq') && actor.sectId !== other.sectId && affinity >= -35 &&
        world.sects.some((sect) => sect.id === actor.sectId && sect.spiritStones >= 30) &&
        world.sects.some((sect) => sect.id === other.sectId && sect.spiritStones >= 30)) {
      opportunities.push({ action: 'SECT_DIPLOMACY', targetId: other.id });
    }
    return opportunities;
  });
}

export function resolveEncounter(
  action: EncounterAction,
  world: WorldState,
  actor: Cultivator,
  decision: LLMDecisionPayload,
  adjust: (target: Cultivator, amount: number) => void
): WorldEvent | null {
  const candidate = availableEncounters(actor, world).find((option) => option.action === action &&
    (decision.targetCultivatorId === undefined || option.targetId === decision.targetCultivatorId));
  const target = world.cultivators.find((other) => other.id === candidate?.targetId);
  if (!target) return null;
  let kind: NonNullable<WorldEvent['dialogue']>['kind'];
  let title: string;
  let outcome: string;
  switch (action) {
    case 'TRADE': {
      const item = target.artifacts.slice(1).find((artifact) => !actor.artifacts.some((owned) => owned.name === artifact.name));
      if (!item) return null;
      target.artifacts.splice(target.artifacts.indexOf(item, 1), 1);
      actor.artifacts.push(item);
      actor.spiritStones -= ARTIFACT_TRADE_PRICE;
      target.spiritStones += ARTIFACT_TRADE_PRICE;
      adjust(target, 5);
      kind = 'trade';
      title = `坊市易宝：${actor.name}与${target.name}`;
      outcome = `${actor.name}以 ${ARTIFACT_TRADE_PRICE} 灵石换得【${item.name}】，双方当面交割。`;
      break;
    }
    case 'DUAL_CULTIVATE':
      actor.qiProgress = Math.min(100, actor.qiProgress + 12);
      target.qiProgress = Math.min(100, target.qiProgress + 12);
      gainMastery(actor, 2);
      gainMastery(target, 2);
      adjust(target, 4);
      kind = 'dual_cultivation';
      title = `合修周天：${actor.name}与${target.name}`;
      outcome = '两人自愿同修吐纳，修行进度各增 12，未逾约定。';
      break;
    case 'SECT_DIPLOMACY': {
      const first = world.sects.find((sect) => sect.id === actor.sectId);
      const second = world.sects.find((sect) => sect.id === target.sectId);
      if (!first || !second) return null;
      first.spiritStones -= 30;
      second.spiritStones -= 30;
      first.reputation += 2;
      second.reputation += 2;
      adjust(target, 9);
      kind = 'sect_diplomacy';
      title = `会晤：${first.name}与${second.name}`;
      outcome = '两宗各出三十灵石置办信物，互递善意，各增两点声望，未签盟约。';
      break;
    }
  }
  recordMemory(actor, world.tick, outcome, 7, 'social', 3);
  recordMemory(target, world.tick, outcome, 7, 'social', 3);
  return {
    id: `evt-${world.tick}-${actor.id}-${kind}`, tick: world.tick, year: world.year, month: world.month,
    title, description: outcome, category: 'diplomacy', actorIds: [actor.id, target.id], locationId: actor.locationId,
    dialogue: scriptedDialogue(kind, actor, target, outcome, decision.spokenLine),
  };
}
