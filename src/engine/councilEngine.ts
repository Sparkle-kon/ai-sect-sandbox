import { canCouncilUseMisconduct, recordProbationExpulsion } from './probationEngine';
import { isRetiredFromService } from './serviceRetirementEngine';
import { archiveChronicleEvents } from './novelGenerator';
import type { CouncilBallot, CouncilBallotReplacement, CouncilPlan, CouncilProposal, CouncilRecord, CouncilVote, Cultivator, Sect, WorldEvent, WorldState } from '../types/world';
import { activeSiegeForActor, availableDiplomacyActions, resolveDiplomacyAction, sectRelation } from './diplomacyEngine';
import { recordMemory } from './memoryEngine';

const SENIORITIES = ['掌门', '太上长老', '长老'] as const;
const QUORUM = 3;
const MAX_VOTERS = 5;
const VOTES: CouncilVote[] = ['support', 'oppose', 'abstain'];
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const key = (proposal: CouncilProposal) => proposal.kind === 'war' ? `war:${proposal.targetSectId}` :
  proposal.kind === 'expel' ? `expel:${proposal.targetCultivatorId}` : `pill:${proposal.donorId}:${proposal.targetCultivatorId}`;

function members(world: WorldState, sect: Sect): Cultivator[] {
  return world.cultivators.filter((actor) => actor.sectId === sect.id && live(actor));
}
function votersFor(world: WorldState, sect: Sect, proposal: CouncilProposal): Cultivator[] {
  return members(world, sect).filter((actor) =>
    !isRetiredFromService(actor) &&
    (proposal.kind === 'war' || proposal.targetCultivatorId !== actor.id) &&
    (actor.id === sect.leaderId || actor.sectRank === '长老' || actor.sectRank === '太上长老') &&
    actor.tribulation?.stage !== 'lightning' && actor.tribulation?.stage !== 'heart_demon' && !activeSiegeForActor(world, actor) &&
    !world.occasions.some((occasion) => (occasion.status === 'registration' || occasion.status === 'running') &&
      occasion.participantIds.includes(actor.id)))
    .sort((a, b) => Number(b.id === sect.leaderId) - Number(a.id === sect.leaderId) ||
      SENIORITIES.indexOf(a.sectRank as typeof SENIORITIES[number]) - SENIORITIES.indexOf(b.sectRank as typeof SENIORITIES[number]) ||
      b.contribution - a.contribution || a.id.localeCompare(b.id)).slice(0, MAX_VOTERS);
}

const eligibleTargetForExpulsion = (world: WorldState, target: Cultivator) => target.transgressions >= 4 &&
  canCouncilUseMisconduct(world, target, target.sectId) &&
  !activeSiegeForActor(world, target) && target.tribulation?.stage !== 'lightning' && target.tribulation?.stage !== 'heart_demon' &&
  !world.occasions.some((occasion) => (occasion.status === 'running' || occasion.status === 'registration') &&
    occasion.participantIds.includes(target.id));

export function availableCouncilPlans(world: WorldState, sectId?: string): CouncilPlan[] {
  const plans: CouncilPlan[] = [];
  for (const sect of world.sects) {
    if ((sectId && sect.id !== sectId) || world.councils.some((record) => record.sectId === sect.id && record.tick === world.tick)) continue;
    const own = members(world, sect);
    const leader = own.find((item) => item.id === sect.leaderId);
    if (!leader) continue;
    const append = (proposal: CouncilProposal, title: string, summary: string) => {
      const voters = votersFor(world, sect, proposal);
      if (voters.length >= QUORUM) plans.push({ id: `council-${world.tick}-${sect.id}-${key(proposal)}`, tick: world.tick,
        sectId: sect.id, proposal, voterIds: voters.map(({ id }) => id), title, summary });
    };
    for (const target of own.filter((actor) => actor.id !== leader.id && eligibleTargetForExpulsion(world, actor))) {
      append({ kind: 'expel', targetCultivatorId: target.id }, `是否逐出${target.name}`, `宗门记录${target.name}的已认定恶行${target.transgressions}点；通过后解除宗门与守备身份，不没收个人财物。`);
    }
    const donors = own.filter((actor) => actor.pills.foundation > 0);
    if (donors.length === 1 && donors[0].pills.foundation === 1) {
      const donor = donors[0];
      for (const recipient of own.filter((actor) => actor.id !== donor.id && actor.pillToxicity < 60 &&
          (actor.realm === '练气' || actor.realm === '筑基'))) {
        append({ kind: 'allocate_pill', donorId: donor.id, targetCultivatorId: recipient.id }, `是否拨给${recipient.name}筑基丹`,
          `${donor.name}持有本宗仅存一枚筑基丹；若通过，按守恒移交${recipient.name}，不自动服用。`);
      }
    }
    for (const option of availableDiplomacyActions(leader, world).filter(({ action }) => action === 'DECLARE_WAR')) {
      const target = world.sects.find(({ id }) => id === option.targetSectId)!;
      append({ kind: 'war', targetSectId: target.id }, `是否向${target.name}宣战`, `两宗关系${sectRelation(world, sect.id, target.id)?.affinity ?? 0}，合乎外交宣战门槛。表决通过才宣战。`);
    }
  }
  return plans;
}

/** At most one agenda per sect per year; priority is discipline, aid, then war. */
export function annualCouncilPlans(world: WorldState): CouncilPlan[] {
  if (world.tick <= 1 || world.month !== 1) return [];
  const priorities = { expel: 0, allocate_pill: 1, war: 2 };
  const selected = new Map<string, CouncilPlan>();
  for (const plan of availableCouncilPlans(world).sort((a, b) =>
      priorities[a.proposal.kind] - priorities[b.proposal.kind] || a.id.localeCompare(b.id))) {
    if (!selected.has(plan.sectId)) selected.set(plan.sectId, plan);
  }
  return [...selected.values()];
}

function utilityBallot(world: WorldState, plan: CouncilPlan, voter: Cultivator): CouncilBallot {
  const proposal = plan.proposal;
  let score: number;
  let reason: string;
  if (proposal.kind === 'war') {
    const relation = sectRelation(world, plan.sectId, proposal.targetSectId);
    const friendly = world.cultivators.filter((actor) => live(actor) && actor.sectId === plan.sectId).reduce((sum, actor) => sum + actor.combatPower, 0);
    const rival = world.cultivators.filter((actor) => live(actor) && actor.sectId === proposal.targetSectId).reduce((sum, actor) => sum + actor.combatPower, 0);
    score = -(relation?.affinity ?? 0) / 3 - 24 + (friendly >= rival ? 15 : -22) +
      (voter.personality === '嗜血' || voter.personality === '狂傲' ? 12 : voter.personality === '苟道' ? -12 : 0);
    reason = friendly >= rival ? '本宗战力尚可，但宣战后须承担持续消耗。' : '敌宗战力更强，现时开战恐伤弟子与公库。';
  } else {
    const target = world.cultivators.find((actor) => actor.id === proposal.targetCultivatorId)!;
    const edge = world.relationships.find((item) => (item.fromId === voter.id && item.toId === target.id) ||
      (item.toId === voter.id && item.fromId === target.id))?.affinity ?? 0;
    if (proposal.kind === 'expel') {
      score = target.transgressions * 8 - 22 - edge * .35 + (voter.personality === '刚正' ? 8 : 0);
      reason = score > 0 ? '恶行已有记录，逐出可以避免宗门继续承担其行为后果。' : '证据达到议事门槛，但我认为尚可先行约束。';
    } else {
      score = target.qiProgress * .35 + target.contribution * .12 - target.pillToxicity * .5 + edge * .12 -
        (voter.id === proposal.donorId ? 12 : 5);
      reason = score > 0 ? '此弟子气机及贡献能支撑优先调拨，丹药仍须谨慎服用。' : '丹药稀缺，目标的气机或丹毒情况不足以支持优先调拨。';
    }
  }
  return { voterId: voter.id, vote: score > 7 ? 'support' : score < -7 ? 'oppose' : 'abstain', reason, source: 'utility' };
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 220) : '';
}

export function resolveCouncil(world: WorldState, plan: CouncilPlan, replacements: CouncilBallotReplacement[] = []): CouncilRecord | null {
  const current = availableCouncilPlans(world, plan.sectId).find((candidate) =>
    candidate.id === plan.id && candidate.tick === plan.tick && candidate.summary === plan.summary && key(candidate.proposal) === key(plan.proposal) &&
    candidate.voterIds.length === plan.voterIds.length && candidate.voterIds.every((id, i) => id === plan.voterIds[i]));
  if (!current) return null; // Stale async replies never consume this sect's council opportunity.
  const voterSet = new Set(current.voterIds);
  const count = new Map<string, number>();
  for (const item of replacements) if (item && voterSet.has(item.voterId)) count.set(item.voterId, (count.get(item.voterId) ?? 0) + 1);
  const valid = new Map(replacements.filter((item) => item && count.get(item.voterId) === 1 && VOTES.includes(item.vote) &&
    cleanText(item.reason)).map((item) => [item.voterId, item]));
  const ballots: CouncilBallot[] = current.voterIds.map((voterId) => {
    const voter = world.cultivators.find(({ id }) => id === voterId)!;
    const proposed = valid.get(voterId);
    return proposed ? { voterId, vote: proposed.vote, reason: cleanText(proposed.reason), source: 'llm' } : utilityBallot(world, current, voter);
  });
  const tally = {
    support: ballots.filter(({ vote }) => vote === 'support').length, oppose: ballots.filter(({ vote }) => vote === 'oppose').length,
    abstain: ballots.filter(({ vote }) => vote === 'abstain').length, required: Math.floor(ballots.length / 2) + 1,
  };
  const labels: Record<CouncilVote, string> = { support: '赞成', oppose: '反对', abstain: '弃权' };
  const record: CouncilRecord = { ...current, ballots, tally, rounds: [
    { round: 1, turns: ballots.map((ballot) => {
      const opening = cleanText(valid.get(ballot.voterId)?.opening);
      return { voterId: ballot.voterId, text: opening || `关于此议，我会考量下面这一点：${utilityBallot(world, current, world.cultivators.find(({ id }) => id === ballot.voterId)!).reason}`,
        source: opening ? 'llm' : 'utility' };
    }) },
    { round: 2, turns: ballots.map(({ voterId, vote, reason, source }) => ({ voterId, text: `我投${labels[vote]}。\n${reason}`, source })) },
  ], status: 'rejected', outcome: '未达到全体席位过半，现实状态不变。' };
  const sect = world.sects.find(({ id }) => id === current.sectId)!;
  const proposal = current.proposal;
  let effect: WorldEvent | null = null;
  if (tally.support >= tally.required) {
    record.status = 'passed';
    if (proposal.kind === 'war') {
      const leader = world.cultivators.find(({ id }) => id === sect.leaderId)!;
      effect = resolveDiplomacyAction(world, leader, { chosenAction: 'DECLARE_WAR', targetSectId: proposal.targetSectId, innerMonologue: '遵议会决议宣战' });
      if (!effect) { record.status = 'stale'; record.outcome = '外交状态变化，决议未落实。'; }
      else record.outcome = effect.description;
    } else if (proposal.kind === 'expel') {
      const target = world.cultivators.find(({ id }) => id === proposal.targetCultivatorId)!;
      target.sectId = ''; target.sectRank = '外门弟子'; target.contribution = 0;
      delete target.guardAssignment;
      if (target.activeScheme?.status === 'active') {
        target.activeScheme.status = 'failed'; target.activeScheme.finishedTick = world.tick; target.activeScheme.outcome = '离开宗门，原有宗门计划终止。';
      }
      if (target.locationId === sect.headquartersId) {
        target.locationId = world.locations.find(({ type, ownerSectId }) => type === 'market' && !ownerSectId)?.id ?? target.locationId;
      }
      record.outcome = `${target.name}已被逐出${sect.name}，个人储物保留。`;
      recordMemory(target, world.tick, record.outcome, 9, 'social', -4);
    } else {
      const donor = world.cultivators.find(({ id }) => id === proposal.donorId)!;
      const recipient = world.cultivators.find(({ id }) => id === proposal.targetCultivatorId)!;
      donor.pills.foundation--; recipient.pills.foundation++;
      record.outcome = `一枚筑基丹已从${donor.name}移交${recipient.name}，宗门库存总量不变。`;
      recordMemory(recipient, world.tick, record.outcome, 8, 'cultivation', 4);
    }
  }
  const summary: WorldEvent = {
    id: `evt-${current.id}`, tick: world.tick, year: world.year, month: world.month, title: `${sect.name}长老议决：${current.title}`,
    description: `赞成${tally.support}、反对${tally.oppose}、弃权${tally.abstain}。\n${record.outcome}`, category: 'diplomacy',
    actorIds: [...current.voterIds], locationId: sect.headquartersId,
  };
  world.councils = [record, ...world.councils].slice(0, Math.max(96, world.sects.length));
  if (record.status === 'passed' && record.proposal.kind === 'expel') recordProbationExpulsion(world, record);
  const events = [summary, ...(effect ? [effect] : [])];
  archiveChronicleEvents(world, events);
  world.events = [...events, ...world.events].slice(0, 120);
  return record;
}
