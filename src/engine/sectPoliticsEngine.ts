import { REALM_ORDER } from '../data/initialWorld';
import type { Cultivator, LLMDecisionPayload, Sect, SectRank, SectSuccession, WorldEvent, WorldState } from '../types/world';
import { artifactPowerMultiplier } from './artifactEngine';
import { recordMemory } from './memoryEngine';
import { dropInheritance } from './techniqueEngine';

const RANKS: SectRank[] = ['外门弟子', '内门弟子', '真传弟子', '长老', '太上长老', '掌门'];
export const SECT_PROMOTION_RULES: Array<{ rank: SectRank; realm: Cultivator['realm']; contribution: number }> = [
  { rank: '太上长老', realm: '元婴', contribution: 130 },
  { rank: '长老', realm: '金丹', contribution: 75 },
  { rank: '真传弟子', realm: '筑基', contribution: 45 },
  { rank: '内门弟子', realm: '练气', contribution: 18 },
];
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const rankValue = (rank: SectRank) => RANKS.indexOf(rank);

export interface LeadershipOption {
  action: 'CHALLENGE_LEADERSHIP' | 'PLOT_COUP';
  targetCultivatorId: string;
}

export function earnedSectRank(actor: Cultivator): SectRank {
  return SECT_PROMOTION_RULES.find((rule) => actor.contribution >= rule.contribution &&
    REALM_ORDER.indexOf(actor.realm) >= REALM_ORDER.indexOf(rule.realm))?.rank ?? '外门弟子';
}

export function rewardContribution(actor: Cultivator, world: WorldState, points: number): void {
  if (actor.alive && Number.isFinite(points) && world.sects.some((sect) => sect.id === actor.sectId)) {
    actor.contribution = clamp(actor.contribution + Math.trunc(points), 0, 9999);
  }
}

const liveMembers = (world: WorldState, sect: Sect) => world.cultivators.filter((person) => person.alive && person.hp > 0 && person.sectId === sect.id);
function affinity(world: WorldState, a: Cultivator, b: Cultivator): number {
  return world.relationships.find((edge) => (edge.fromId === a.id && edge.toId === b.id) ||
    (edge.fromId === b.id && edge.toId === a.id))?.affinity ?? 0;
}

function supporters(world: WorldState, sect: Sect, candidate: Cultivator, incumbent?: Cultivator, local = false): Cultivator[] {
  const eligible = local ? world.cultivators.filter((person) => person.alive && person.hp > 0 &&
    person.locationId === sect.headquartersId) : liveMembers(world, sect);
  return eligible.filter((person) => person.id !== candidate.id && person.id !== incumbent?.id &&
    affinity(world, person, candidate) >= (person.sectId === sect.id ? 25 : 65) &&
    (!incumbent || affinity(world, person, candidate) - affinity(world, person, incumbent) >= 10))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function event(world: WorldState, sect: Sect, label: string, title: string, description: string, actors: string[],
  category: WorldEvent['category'] = 'intrigue', hidden = false): WorldEvent {
  return { id: `evt-${world.tick}-${sect.id}-leadership-${label}`, tick: world.tick,
    year: world.year, month: world.month, title, description, category, actorIds: actors,
    locationId: sect.headquartersId, ...(hidden ? { witnessScope: 'participants' as const } : {}) };
}

function appoint(world: WorldState, sect: Sect, candidate: Cultivator, method: SectSuccession['method'],
  backing: Cultivator[], previousLeaderId: string | undefined): void {
  for (const person of world.cultivators) {
    if (person.sectId === sect.id && person.sectRank === '掌门') person.sectRank = earnedSectRank(person);
  }
  sect.leaderId = candidate.id;
  candidate.sectRank = '掌门';
  sect.succession = { tick: world.tick, method, previousLeaderId, leaderId: candidate.id, supporterIds: backing.map((person) => person.id) };
}

export function maintainSectPolitics(world: WorldState): WorldEvent[] {
  const results: WorldEvent[] = [];
  for (const sect of world.sects) {
    const members = liveMembers(world, sect);
    const incumbent = members.find((person) => person.id === sect.leaderId);
    for (const person of world.cultivators) {
      if (person.sectId !== sect.id || (!person.alive && person.sectRank !== '掌门')) continue;
      person.sectRank = person.id === incumbent?.id ? '掌门' : earnedSectRank(person);
    }
    if (incumbent) continue;
    const previousLeaderId = sect.leaderId;
    if (!members.length) {
      delete sect.leaderId;
      continue;
    }
    const senior = members.filter((person) => rankValue(person.sectRank) >= rankValue('长老'));
    const eligible = senior.length ? senior : members;
    const votes = eligible.map((candidate) => ({ candidate, voters: [] as Cultivator[] }));
    for (const person of members) {
      const ballot = votes.filter(({ candidate }) => candidate.id !== person.id && affinity(world, person, candidate) >= 25)
        .sort((a, b) => affinity(world, person, b.candidate) - affinity(world, person, a.candidate) ||
          b.candidate.contribution - a.candidate.contribution || a.candidate.id.localeCompare(b.candidate.id));
      ballot[0]?.voters.push(person);
    }
    votes.sort((a, b) => b.voters.length - a.voters.length || rankValue(b.candidate.sectRank) - rankValue(a.candidate.sectRank) ||
      b.candidate.contribution - a.candidate.contribution || b.candidate.combatPower - a.candidate.combatPower ||
      a.candidate.id.localeCompare(b.candidate.id));
    const winner = votes[0];
    appoint(world, sect, winner.candidate, 'election', winner.voters, previousLeaderId);
    const description = `${sect.name}掌门出缺，${winner.candidate.name}${winner.voters.length ? `获${winner.voters.length}名同门推举` : '依辈分与贡献顺位'}继承掌门之位。`;
    recordMemory(winner.candidate, world.tick, description, 9, 'social', 4);
    results.push(event(world, sect, 'vacancy', `${sect.name}推举新掌门`, description, [winner.candidate.id, ...winner.voters.map(({ id }) => id)], 'diplomacy'));
  }
  return results;
}

export function availableLeadershipActions(actor: Cultivator, world: WorldState): LeadershipOption[] {
  const sect = world.sects.find((item) => item.id === actor.sectId);
  if (!sect || !actor.alive || actor.hp <= 0 || actor.locationId !== sect.headquartersId || actor.id === sect.leaderId ||
      (sect.succession && world.tick - sect.succession.tick < 3)) return [];
  const incumbent = liveMembers(world, sect).find((person) => person.id === sect.leaderId && person.locationId === actor.locationId);
  if (!incumbent) return [];
  const rank = rankValue(earnedSectRank(actor));
  if (rank < rankValue('长老')) return [];
  const backing = supporters(world, sect, actor, incumbent, true);
  if (!backing.length) return [];
  const result: LeadershipOption[] = [{ action: 'CHALLENGE_LEADERSHIP', targetCultivatorId: incumbent.id }];
  const conspiratorial = actor.personality === '阴险' || actor.personality === '诡诈' || actor.personality === '嗜血';
  if (conspiratorial && rank >= rankValue('太上长老') && backing.length >= 2 && affinity(world, actor, incumbent) <= -25) {
    result.push({ action: 'PLOT_COUP', targetCultivatorId: incumbent.id });
  }
  return result;
}

export function resolveLeadershipAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload, rng: () => number): WorldEvent | null {
  const option = availableLeadershipActions(actor, world).find((choice) =>
    choice.action === decision.chosenAction && choice.targetCultivatorId === decision.targetCultivatorId);
  if (!option) return null;
  const sect = world.sects.find((item) => item.id === actor.sectId)!;
  const incumbent = world.cultivators.find((person) => person.id === option.targetCultivatorId)!;
  const backing = supporters(world, sect, actor, incumbent, true);
  const defenders = supporters(world, sect, incumbent, actor, true);
  const coup = option.action === 'PLOT_COUP';
  const strength = (person: Cultivator) => person.combatPower * (.55 + .45 * person.hp / Math.max(1, person.maxHp)) * artifactPowerMultiplier(person);
  const side = (person: Cultivator, allies: Cultivator[]) => strength(person) +
    allies.reduce((score, ally) => score + Math.min(strength(ally), strength(person)) * (coup ? .24 : .10) * (ally.sectId === sect.id ? 1 : .55), 0);
  const attack = side(actor, backing) * (coup ? 1.08 : 1) * (.80 + .40 * rng());
  const defense = side(incumbent, defenders) * (.80 + .40 * rng());
  const won = attack > defense;
  const loser = won ? incumbent : actor;
  const damage = Math.max(1, Math.round(loser.maxHp * (coup ? .40 : .22)));
  loser.hp = Math.max(coup ? 0 : 1, loser.hp - damage);
  if (!loser.hp) { loser.alive = false; dropInheritance(loser, world); }
  if (won) appoint(world, sect, actor, coup ? 'coup' : 'challenge', backing, incumbent.id);
  else if (coup) {
    actor.karma = clamp(actor.karma - 10, -100, 100);
    rewardContribution(actor, world, -12);
  }
  const title = won ? (coup ? '宗门易主' : '掌门挑战告捷') : (coup ? '密谋夺权失败' : '掌门挑战落败');
  const description = `${actor.name}${coup ? '联络心腹发动夺位密谋' : '在宗门前正式挑战掌门'}，${won ? `战胜${incumbent.name}接掌${sect.name}` : `被${incumbent.name}挫败`}${loser.alive ? '。' : `，${loser.name}因重伤陨落。`}`;
  recordMemory(actor, world.tick, description, 9, coup ? 'combat' : 'social', won ? 4 : -4);
  recordMemory(incumbent, world.tick, description, 9, coup ? 'combat' : 'social', won ? -4 : 4);
  return event(world, sect, `${actor.id}-${actor.memorySequence}`, title, description, [actor.id, incumbent.id, ...backing.map(({ id }) => id)],
    !loser.alive ? 'death' : 'intrigue', coup && !won && loser.alive);
}
