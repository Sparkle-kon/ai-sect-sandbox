import type { GrandSiegeRound } from '../types/grandSiege';
import type { ChronicleAnchor, WorldEvent } from '../types/world';
import { isChronicleStoryFact } from './chronicleLead';
import type { FocalLayer, FocalLayerContext } from './focalLayerEvidence';

const sameIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);
const unique = <T>(rows: readonly T[]): T | undefined => rows.length === 1 ? rows[0] : undefined;
const clean = (text: string, limit: number) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, limit);
const positiveTick = (tick: number) => Number.isSafeInteger(tick) && tick > 0;
const validCount = (n: number, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const sameEvidence = (filed: ChronicleAnchor, original: ChronicleAnchor) =>
  filed.id === original.id && filed.tick === original.tick && filed.year === original.year &&
  filed.month === original.month && filed.category === original.category && filed.locationId === original.locationId &&
  filed.title === clean(original.title, 80) && filed.description === clean(original.description, 220) &&
  sameIds(filed.actorIds, [...new Set(original.actorIds)].slice(0, 12));

/** Layer the selected real battlefield, not a same-named campaign, current scenery, or a future turn. */
export function writeFocalSiegeLayers({ world, focal, throughTick, anchors, publicOriginal }: FocalLayerContext): FocalLayer[] {
  const cutoff = focal.tick;
  if (!positiveTick(cutoff) || !positiveTick(throughTick) || cutoff > throughTick || throughTick > world.tick ||
    !focal.locationId || !isChronicleStoryFact(focal, cutoff)) return [];

  const proof = (id: string, tick: number, category: WorldEvent['category'], locationId?: string): WorldEvent | undefined => {
    if (!positiveTick(tick) || tick > cutoff) return;
    const sampled = unique(anchors.filter(row => row.id === id));
    const raw = sampled && publicOriginal(id);
    if (!sampled || !raw || raw.witnessScope !== undefined || raw.id !== id || raw.tick !== tick ||
      raw.category !== category || !raw.locationId || (locationId !== undefined && raw.locationId !== locationId) ||
      !isChronicleStoryFact(raw, cutoff) || !isChronicleStoryFact(sampled, cutoff) || !sameEvidence(sampled, raw)) return;
    return raw;
  };

  const roundId = (tick: number, id: string) => `evt-${tick}-dip-${id}`;
  const frontId = (tick: number, id: string) => `evt-${tick}-${id}-front-theatre`;
  const siege = unique(world.sieges.filter(row =>
    focal.id === roundId(cutoff, row.id) || focal.id === frontId(cutoff, row.id)));
  const theatre = siege?.theatre;
  if (!siege || !theatre || siege.destinationId !== focal.locationId ||
    siege.attackerSectId === siege.defenderSectId || !positiveTick(siege.startedTick) ||
    siege.id !== `siege-${siege.startedTick}-${siege.attackerSectId}-${siege.defenderSectId}` ||
    siege.startedTick !== theatre.openedTick ||
    theatre.sourceLaunchId !== `evt-${siege.startedTick}-dip-${siege.attackerSectId}-${siege.defenderSectId}-launch_siege` ||
    new Set(siege.participantIds).size !== siege.participantIds.length || siege.participantIds.length < 2 ||
    theatre.arrivedTick === undefined || !positiveTick(theatre.arrivedTick) ||
    theatre.arrivedTick < siege.startedTick + 2 || theatre.arrivedTick >= cutoff) return [];
  const arrivalTick = theatre.arrivedTick;
  const rounds = theatre.rounds.filter(row => row.tick <= cutoff);
  if (!rounds.length || rounds.length > 7 || rounds.some((row, index) =>
    row.round !== index + 1 || !positiveTick(row.tick) || row.tick <= (rounds[index - 1]?.tick ?? arrivalTick) ||
    row.sourceEventId !== roundId(row.tick, siege.id) ||
    !validCount(row.wallMax) || !validCount(row.wallBefore, row.wallMax) || !validCount(row.wallAfter, row.wallBefore) ||
    row.wallBefore - row.wallAfter > 128 ||
    new Set([...row.attackers, ...row.defenders].map(fighter => fighter.actorId)).size !== row.attackers.length + row.defenders.length ||
    row.attackers.some(fighter => !siege.participantIds.includes(fighter.actorId)) ||
    row.defenders.some(fighter => siege.participantIds.includes(fighter.actorId)))) return [];

  const selected = proof(focal.id, cutoff, focal.category, siege.destinationId);
  if (!selected || !sameEvidence(focal, selected)) return [];
  const localRound = rounds.at(-1);
  if (!localRound || localRound.tick !== cutoff) return []; // Neither a threatened battle nor a no-fight withdrawal.
  const wall = (row: GrandSiegeRound): WorldEvent | undefined => {
    const damage = row.wallBefore - row.wallAfter;
    if (damage <= 0) return;
    const source = proof(row.sourceEventId, row.tick, 'diplomacy', siege.destinationId);
    return source?.title === '护山阵接战' &&
      source.description === `护山阵受损${damage}，尚余${row.wallAfter}阵力。` &&
      row.attackers.every(fighter => source.actorIds.includes(fighter.actorId)) ? source : undefined;
  };
  const front = (row: GrandSiegeRound): { source: WorldEvent; text: string } | undefined => {
    const clash = row.clash;
    if (row.round !== 1 || !clash || clash.attackerId === clash.defenderId ||
      !row.attackers.some(fighter => fighter.actorId === clash.attackerId) ||
      !row.defenders.some(fighter => fighter.actorId === clash.defenderId) ||
      ![clash.attackerId, clash.defenderId].includes(clash.winnerId) ||
      !validCount(clash.attackerDamage, 12) || clash.attackerDamage === 0 ||
      !validCount(clash.defenderDamage, 12) || clash.defenderDamage === 0) return;
    const source = proof(frontId(row.tick, siege.id), row.tick, 'combat', siege.destinationId);
    if (!source || source.title !== (row.hero ? '重阵将倾，有人死守' : '叩关之际，两锋出阵') ||
      !sameIds(source.actorIds, [...new Set([clash.attackerId, clash.defenderId, ...(row.hero ? [row.hero.actorId] : [])])]) ||
      !/^鼓声忽断。[^。！？\n]+与[^。！？\n]+越出阵前，各受一击，[^。！？\n]+占得上风。/u.test(source.description)) return;
    // Names come from this exact historical public description, never the present roster.
    const names = source.description.match(/^鼓声忽断。([\p{L}\p{M}\p{N}· ]{1,26})与([\p{L}\p{M}\p{N}· ]{1,26})越出阵前，各受一击，/u);
    return { source, text: names && !names[1].includes('与') && !names[2].includes('与')
      ? `鼓声忽断。${names[1]}与${names[2]}越出阵前，各受了一击。`
      : '鼓声忽断。阵前两人各受了一击。' };
  };

  const ending = theatre.terminal;
  let aftermath: string | undefined;
  if (ending?.tick === cutoff && ending.sourceEventId === focal.id && ending.battlefield &&
    focal.id === localRound.sourceEventId && selected.category === 'diplomacy' &&
    [...localRound.attackers, ...localRound.defenders].every(fighter => selected.actorIds.includes(fighter.actorId))) {
    if (ending.status === 'victory' && localRound.wallAfter === 0 && selected.title === '攻山告捷') {
      const paid = selected.description.match(/^[^。！？\n]+攻破[^。！？\n]+防线，夺得(0|[1-9]\d*)灵石战赔后撤离。$/u);
      if (paid && validCount(Number(paid[1]), 500)) aftermath = paid[1] === '0'
        ? '守线终于被攻破。联军没有留下，随后撤离了山门。'
        : '守线终于被攻破。联军取了战赔，随后撤离了山门。';
    }
    if (ending.status === 'repelled' && selected.title === '攻山退兵' &&
      /^[^。！？\n]+未能攻破[^。！？\n]+防线，联军撤退。$/u.test(selected.description))
      aftermath = '守线没被攻破。联军从山门前撤了。';
  }
  const sameMonthWall = wall(localRound);
  const sameMonthFront = front(localRound);
  if (!aftermath && focal.id !== sameMonthWall?.id && focal.id !== sameMonthFront?.source.id) return [];

  const layers: FocalLayer[] = [];
  const launch = proof(theatre.sourceLaunchId, siege.startedTick, 'diplomacy');
  const reached = proof(roundId(arrivalTick, siege.id), arrivalTick, 'diplomacy', siege.destinationId);
  const launchCount = launch?.description.match(/^[^。！？\n]+耗费[1-9]\d*灵石，集结([1-9]\d*)名修士向[^。！？\n]+出征。$/u)?.[1];
  const launched = launch?.title === '宗门集结攻山' && sameIds(launch.actorIds, siege.participantIds) &&
    Number(launchCount) === siege.participantIds.length ? launch : undefined;
  const arrived = reached?.title === '联军抵达山门' && reached.actorIds.length > 0 &&
    reached.actorIds.every(id => siege.participantIds.includes(id)) &&
    /^[^。！？\n]+联军抵达[^。！？\n]+山门，准备破阵。$/u.test(reached.description) ? reached : undefined;
  if (launched || arrived) layers.push({
    role: 'approach',
    text: (launched ? '出征的灵石已经付了，人马往山门去。' : '') +
      (arrived ? '联军到了山门外，准备动护山阵。' : ''),
    eventIds: [...(launched ? [launched.id] : []), ...(arrived ? [arrived.id] : [])],
  });

  const clash = sameMonthFront ?? front(rounds[0]);
  const damage = [...rounds].reverse().flatMap(row => {
    const source = row === localRound ? sameMonthWall : wall(row);
    return source ? [{ source, wallAfter: row.wallAfter }] : [];
  })[0];
  if (clash || damage) layers.push({
    role: 'exchange',
    text: (clash?.text ?? '') +
      (damage ? (damage.wallAfter > 0 ? '护山阵也受了冲击，阵力减去一截，却还撑着。' : '护山阵受了这一阵冲击，阵力随之耗尽。') : ''),
    eventIds: [...(clash ? [clash.source.id] : []), ...(damage ? [damage.source.id] : [])],
  });
  if (aftermath) layers.push({ role: 'aftermath', text: aftermath, eventIds: [selected.id] });
  return layers;
}
