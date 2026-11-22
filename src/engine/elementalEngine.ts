import { artifactPowerMultiplier, equippedArtifact } from './artifactEngine';
import type { Cultivator, LocationNode, SpiritRoot } from '../types/world';

type Phase = Exclude<SpiritRoot, '雷' | '暗' | '天灵根'>;
export type ElementalRelationship = 'matching' | 'nurturing' | 'overcoming' | 'neutral';
const NURTURES: Record<Phase, Phase> = { 金: '水', 水: '木', 木: '火', 火: '土', 土: '金' };
const OVERCOMES: Record<SpiritRoot, SpiritRoot | undefined> = {
  金: '木', 木: '土', 土: '水', 水: '火', 火: '金', 雷: '暗', 暗: '天灵根', 天灵根: '雷',
};

function isPhase(root: SpiritRoot): root is Phase {
  return root !== '雷' && root !== '暗' && root !== '天灵根';
}

export function elementalRelation(source: SpiritRoot, target: SpiritRoot): ElementalRelationship {
  if (source === target) return 'matching';
  if (OVERCOMES[source] === target) return 'overcoming';
  if (isPhase(source) && NURTURES[source] === target) return 'nurturing';
  return 'neutral';
}

export function cultivationMultiplier(actor: Cultivator, place: LocationNode | undefined): number {
  const byRoot = (root:SpiritRoot) => {
    const own=elementalRelation(root,actor.technique.spiritRoot);
    return own==='matching'?1.12:own==='nurturing'?1.08:own==='overcoming'?.84:1;
  };
  const roots=actor.clanHeritage?.roots;
  const first=byRoot(actor.spiritRoot);
  // The actual recorded secondary root benefits the existing affinity law, never stacking above its native cap.
  const rootFactor=roots?.[0]===actor.spiritRoot&&roots[1]!==undefined?Math.max(first,byRoot(roots[1])):first;
  if (!place) return rootFactor;
  const ambient = elementalRelation(place.spiritRoot, actor.technique.spiritRoot);
  const siteFactor = ambient === 'matching' ? 1.27 : ambient === 'nurturing' ? 1.17 : ambient === 'overcoming' ? 0.76 : 1;
  return rootFactor * siteFactor;
}

export function strikeMultiplier(attacker: Cultivator, defender: Cultivator): number {
  const technique = attacker.technique.spiritRoot;
  const gear = equippedArtifact(attacker)?.spiritRoot;
  const edge = elementalRelation(technique, defender.spiritRoot);
  const reverse = elementalRelation(defender.spiritRoot, technique);
  const matchup = edge === 'overcoming' ? 1.22 : reverse === 'overcoming' ? 0.84 : 1;
  const resonance = gear === undefined ? 'neutral' : elementalRelation(gear, technique);
  const gearFactor = resonance === 'matching' ? 1.1 : resonance === 'nurturing' ? 1.05 : resonance === 'overcoming' ? 0.95 : 1;
  return matchup * gearFactor * artifactPowerMultiplier(attacker);
}

export function compareCultivationSites(actor: Cultivator, a: LocationNode, b: LocationNode): number {
  return b.spiritQi * cultivationMultiplier(actor, b) - a.spiritQi * cultivationMultiplier(actor, a);
}
