import type { BountyEntry, Cultivator, LLMDecisionPayload, Sect, WorldEvent, WorldState } from '../types/world';
import { activeSiegeForActor, sectRelation } from './diplomacyEngine';
import { recordMemory } from './memoryEngine';

const THRESHOLD = 4;
const COOLDOWN = 12;
const MAX_OPEN = 8;
const FUND_RESERVE = 100;
const live = (person: Cultivator) => person.alive && person.hp > 0;
const inTrial = (person: Cultivator) => person.tribulation?.stage === 'lightning' || person.tribulation?.stage === 'heart_demon';
const atOccasion = (world: WorldState, person: Cultivator) => world.occasions.some((entry) =>
  (entry.status === 'registration' || entry.status === 'running') && entry.participantIds.includes(person.id));

export function recordTransgression(actor: Cultivator, kind: 'killing' | 'betrayal'): void {
  const value = kind === 'killing' ? 2 : 3;
  actor.disciplineRevision = (actor.disciplineRevision ?? 0) + 1;
  actor.transgressions = Math.min(100, actor.transgressions + value);
  actor.karma = Math.max(-100, actor.karma - (kind === 'killing' ? 12 : 18));
}

function allied(world: WorldState, a: string, b: string): boolean {
  return a === b || sectRelation(world, a, b)?.pact === 'alliance';
}

function sponsorOptions(world: WorldState, target: Cultivator): Sect[] {
  return world.sects.filter((sect) => sect.id !== target.sectId && sect.alignment === '正道' && sect.leaderId &&
    world.cultivators.some((leader) => leader.id === sect.leaderId && leader.sectId === sect.id && live(leader)) &&
    sect.spiritStones >= FUND_RESERVE + 75)
    .sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));
}

function event(world: WorldState, token: string, title: string, description: string,
  actorIds: string[], locationId?: string, category: WorldEvent['category'] = 'diplomacy'): WorldEvent {
  return { id: `evt-${world.tick}-bounty-${token}`, tick: world.tick, year: world.year, month: world.month,
    title, description, category, actorIds, locationId };
}

function withdraw(world: WorldState, bounty: BountyEntry): WorldEvent {
  for (const deposit of bounty.escrow) {
    const sect = world.sects.find(({ id }) => id === deposit.sectId);
    if (sect) sect.spiritStones += deposit.amount;
  }
  bounty.escrow = [];
  bounty.status = 'withdrawn';
  bounty.settledTick = world.tick;
  return event(world, bounty.id, '天机悬赏撤销', '目标已不在世或失联，未核准的赏金按出资原路退还。', []);
}

export function advanceBounties(world: WorldState): WorldEvent[] {
  const results: WorldEvent[] = [];
  for (const bounty of world.bounties) {
    if (bounty.status !== 'open') continue;
    const target = world.cultivators.find(({ id }) => id === bounty.targetCultivatorId);
    if (!target || !live(target)) results.push(withdraw(world, bounty));
  }
  for (const target of world.cultivators) {
    if (world.bounties.filter(({ status }) => status === 'open').length >= MAX_OPEN) break;
    if (!live(target) || (target.transgressions < THRESHOLD &&
        !(target.transgressions >= 2 && target.karma <= -70))) continue;
    if (world.bounties.some((bounty) => bounty.targetCultivatorId === target.id && (
      bounty.status === 'open' || world.tick - (bounty.settledTick ?? bounty.issuedTick) < COOLDOWN))) continue;
    const [lead] = sponsorOptions(world, target);
    if (!lead) continue;
    const allies = world.sects.filter((sect) => sect.id !== lead.id && sect.id !== target.sectId && allied(world, lead.id, sect.id) &&
      sect.spiritStones >= FUND_RESERVE + 40).sort((a, b) => a.id.localeCompare(b.id));
    const leadAmount = Math.min(240, 75 + 12 * target.transgressions, lead.spiritStones - FUND_RESERVE);
    const escrow = [{ sectId: lead.id, amount: leadAmount }, ...allies.map(({ id }) => ({ sectId: id, amount: 40 }))];
    for (const deposit of escrow) world.sects.find(({ id }) => id === deposit.sectId)!.spiritStones -= deposit.amount;
    const reward = escrow.reduce((sum, deposit) => sum + deposit.amount, 0);
    const reason = `查明有累积恶行（${target.transgressions}点），列入天机悬赏。`;
    const bounty: BountyEntry = { id: `bounty-${world.tick}-${target.id}`, targetCultivatorId: target.id, reason,
      issuedTick: world.tick, reward, status: 'open', sponsorSectIds: escrow.map(({ sectId }) => sectId), escrow };
    world.bounties.push(bounty);
    results.push(event(world, bounty.id, `天机悬赏：${target.name}`,
      `${lead.name}${allies.length ? '与盟友' : ''}预存${reward}灵石。目标行踪不详，核验战果方可领取。`, [], lead.headquartersId));
  }
  return results;
}

function credibleLead(world: WorldState, hunter: Cultivator, target: Cultivator): string | undefined {
  return hunter.rumors.filter((rumor) => rumor.provenance !== 'fabricated' && rumor.confidence >= 55 &&
    rumor.originTick <= world.tick && world.tick - rumor.originTick <= 8 && rumor.learnedTick <= world.tick &&
    rumor.locationId !== hunter.locationId && world.locations.some(({ id }) => id === rumor.locationId) &&
    !rumor.subject.includes('悬赏') && rumor.subject.includes(target.name))
    .sort((a, b) => b.confidence - a.confidence || b.originTick - a.originTick || a.id.localeCompare(b.id))[0]?.locationId;
}

function knownHunt(world: WorldState, actor: Cultivator, bounty: BountyEntry) {
  if (bounty.status !== 'open' || bounty.targetCultivatorId === actor.id) return undefined;
  const sect = world.sects.find(({ id }) => id === actor.sectId);
  const target = world.cultivators.find(({ id }) => id === bounty.targetCultivatorId);
  if (!sect || !target || !live(target) || target.sectId === sect.id || activeSiegeForActor(world, target) ||
      atOccasion(world, target) || inTrial(target) ||
      !(sect.alignment === '正道' || bounty.sponsorSectIds.some((id) => allied(world, id, sect.id)))) return undefined;
  if (target.locationId === actor.locationId) return { target, local: true, locationId: actor.locationId };
  const lead = credibleLead(world, actor, target);
  return lead ? { target, local: false, locationId: lead } : undefined;
}

export function availableBountyHunts(actor: Cultivator, world: WorldState): Array<{ action: 'PURSUE_BOUNTY'; targetBountyId: string }> {
  if (!live(actor) || actor.transgressions >= THRESHOLD || actor.karma <= -50 || inTrial(actor) ||
      activeSiegeForActor(world, actor) || atOccasion(world, actor) || !world.locations.some(({ id }) => id === actor.locationId)) return [];
  return world.bounties.filter((bounty) => knownHunt(world, actor, bounty))
    .map(({ id }) => ({ action: 'PURSUE_BOUNTY', targetBountyId: id }));
}

export type BountyCombatResult = WorldEvent | { event: WorldEvent; winnerId: string } | null;

export function pursueBounty(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload,
  duel: (target: Cultivator) => BountyCombatResult): WorldEvent | null {
  if (decision.chosenAction !== 'PURSUE_BOUNTY' ||
      !availableBountyHunts(actor, world).some(({ targetBountyId }) => targetBountyId === decision.targetBountyId)) return null;
  const bounty = world.bounties.find(({ id }) => id === decision.targetBountyId)!;
  const hunt = knownHunt(world, actor, bounty)!;
  if (!hunt.local) {
    actor.locationId = hunt.locationId;
    return event(world, `${bounty.id}-${actor.id}-search`, '循线追索', `${actor.name}依传闻前往查证悬赏目标，不知线索是否仍然有效。`, [actor.id], actor.locationId, 'intrigue');
  }
  const combat = duel(hunt.target);
  if (!combat) return null;
  const result = 'event' in combat ? combat.event : combat;
  const winner = 'event' in combat ? combat.winnerId : undefined;
  if (!live(actor) || (!winner && live(hunt.target)) || (winner && winner !== actor.id) ||
      !result.actorIds.includes(actor.id) || !result.actorIds.includes(hunt.target.id) ||
      bounty.status !== 'open') return result;
  const amount = bounty.escrow.reduce((sum, deposit) => sum + deposit.amount, 0);
  bounty.status = 'claimed';
  bounty.hunterId = actor.id;
  bounty.settledTick = world.tick;
  bounty.escrow = [];
  actor.spiritStones += amount;
  const captured = live(hunt.target);
  if (captured) {
    const prison = world.sects.find(({ id }) => id === bounty.sponsorSectIds[0])?.headquartersId;
    if (prison && world.locations.some(({ id }) => id === prison)) hunt.target.locationId = prison;
    hunt.target.qiProgress = 0;
    hunt.target.transgressions = Math.max(0, hunt.target.transgressions - THRESHOLD);
  }
  const description = `${result.description} ${actor.name}${captured ? '擒获目标并押交悬赏宗门' : '完成追缉'}，领取托管赏金${amount}灵石。`;
  recordMemory(actor, world.tick, description, 9, 'combat', 4);
  return { ...result, title: captured ? '悬赏目标归案' : '悬赏追缉告捷', description };
}
