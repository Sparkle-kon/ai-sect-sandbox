import { projectBattlefieldArrayBreak } from '../engine/battlefieldRevisit';
import { isScopedExpeditionGate } from '../engine/expeditionOmenTerms';
import { isUpperPassageEvent } from '../engine/upperPassageIsolation';
import type { LocationNode, WorldEvent, WorldState } from '../types/world';

export interface MapBattlefield {
  location: LocationNode;
  settledTick: number;
  rounds: number;
  brokenArray?: boolean;
}

export const mapBattlefieldSummary = ({ settledTick, rounds, brokenArray }: MapBattlefield) =>
  `旧战场：第 ${settledTick} 轮留下的实战遗痕（交战 ${rounds} 轮）${brokenArray ? " · 此役曾破阵，只是旧痕" : ""}`;

type PublicSource = (id: string, tick: number, check: (event: WorldEvent) => boolean) => boolean;
const validTick = (value: number) => Number.isSafeInteger(value) && value >= 0;
const bothSides = (a: string, b: string, x: string, y: string) => (a === x && b === y) || (a === y && b === x);

/** Historic geography: no active ownership, battle, occupation or visible body inferred from a prior receipt. */
export function projectMapBattlefields(world: WorldState, visibleSites: ReadonlyMap<string, LocationNode>): MapBattlefield[] {
  if (!world.sieges.some(({ theatre }) => theatre?.terminal?.battlefield === true)) return [];
  const events = new Map<string, WorldEvent | undefined>();
  for (const event of world.events) events.set(event.id, events.has(event.id) ? undefined : event);
  const source: PublicSource = (id, tick, check) => {
    // A durable native receipt outlasts the hot feed, but cannot contradict a still-retained original.
    if (!events.has(id)) return tick < world.tick;
    const event = events.get(id);
    return !!event && event.tick === tick && event.witnessScope !== 'participants' && !isUpperPassageEvent(event) &&
      (tick !== world.tick || event.year === world.year && event.month === world.month) &&
      event.category === 'diplomacy' && check(event);
  };

  const duplicate = new Set<string>();
  const ids = new Set<string>();
  for (const { id } of world.sieges) { if (ids.has(id)) duplicate.add(id); ids.add(id); }
  const bySite = new Map<string, MapBattlefield>();
  for (const siege of world.sieges) {
    const { id, startedTick, destinationId, attackerSectId, defenderSectId, participantIds, theatre } = siege;
    const location = visibleSites.get(destinationId);
    const terminal = theatre?.terminal;
    if (duplicate.has(id) || !location || location.type === 'secret_realm' || isScopedExpeditionGate(location) ||
        !theatre || !terminal || terminal.battlefield !== true || terminal.status !== siege.status ||
        !['victory', 'repelled', 'withdrawn'].includes(terminal.status) || attackerSectId === defenderSectId ||
        !validTick(startedTick) || id !== `siege-${startedTick}-${attackerSectId}-${defenderSectId}` ||
        theatre.openedTick !== startedTick || theatre.sourceLaunchId !== `evt-${startedTick}-dip-${attackerSectId}-${defenderSectId}-launch_siege` ||
        !validTick(terminal.tick) || terminal.tick !== siege.lastResolvedTick || terminal.tick > world.tick ||
        theatre.arrivedTick === undefined || !validTick(theatre.arrivedTick) || theatre.arrivedTick <= startedTick ||
        theatre.rounds.length < 1 || theatre.rounds.length > 7 || theatre.rounds.length !== siege.rounds) continue;
    if (!source(theatre.sourceLaunchId, startedTick, event => event.title === '宗门集结攻山' && event.actorIds.some(actorId => participantIds.includes(actorId)))) continue;
    let prior = theatre.arrivedTick;
    if (!theatre.rounds.every((round, index) => {
      if (round.round !== index + 1 || !validTick(round.tick) || round.tick <= prior || round.tick > terminal.tick ||
          round.sourceEventId !== `evt-${round.tick}-dip-${id}` ||
          !round.attackers.some(row => participantIds.includes(row.actorId))) return false;
      prior = round.tick;
      return source(round.sourceEventId, round.tick, event => event.locationId === destinationId &&
        (event.title === '护山阵接战' || round.tick === terminal.tick &&
          (event.title === '攻山告捷' || event.title === '攻山退兵')) && event.actorIds.some(actorId => round.attackers.some(row => row.actorId === actorId)));
    })) continue;
    if (terminal.status === 'withdrawn') {
      const matches = world.ceasefires.agreements.filter(({ id: dealId }) =>
        terminal.sourceEventId === `evt-${terminal.tick}-${dealId}-signed`);
      if (matches.length > 1 || (matches.length === 0 && terminal.tick === world.tick)) continue;
      const deal = matches[0];
      if (deal && (deal.signedTick !== terminal.tick || !deal.withdrawnSiegeIds.includes(id) ||
          !bothSides(deal.proposerSectId, deal.targetSectId, attackerSectId, defenderSectId))) continue;
      if (!terminal.sourceEventId.startsWith(`evt-${terminal.tick}-ceasefire-`) || !terminal.sourceEventId.endsWith('-signed') ||
          !source(terminal.sourceEventId, terminal.tick,
            event => event.title === '两宗签署停战撤军议约' && !!deal && event.actorIds.includes(deal.proposerId) && event.actorIds.includes(deal.targetLeaderId))) continue;
    } else if (terminal.sourceEventId !== `evt-${terminal.tick}-dip-${id}` ||
        !source(terminal.sourceEventId, terminal.tick, event => event.locationId === destinationId &&
          event.title === (terminal.status === 'victory' ? '攻山告捷' : '攻山退兵'))) continue;
    const previous = bySite.get(location.id);
    if (!previous || previous.settledTick < terminal.tick ||
        previous.settledTick === terminal.tick && previous.rounds < siege.rounds) {
      bySite.set(location.id, { location, settledTick: terminal.tick, rounds: siege.rounds,
        ...(projectBattlefieldArrayBreak(world,siege)?{brokenArray:true}:{}), });
    }
  }
  return [...bySite.values()].sort((a, b) => a.location.id < b.location.id ? -1 : a.location.id === b.location.id ? 0 : 1);
}
