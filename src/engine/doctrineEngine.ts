import { isRetiredFromService } from './serviceRetirementEngine';
import type { Cultivator, DoctrineEndorsement, DoctrineHistory, DoctrineMove, DoctrineProposal, DoctrineSchool, DoctrineState,
  LLMDecisionPayload, MemoryEntry, ReflectionTheme, Sect, WorldEvent, WorldState } from '../types/world';
import { gainMastery } from './techniqueEngine';

const THEMES: readonly ReflectionTheme[] = ['cultivation', 'conflict', 'community', 'heavenly'];
const MEMORY_THEME: Partial<Record<MemoryEntry['category'], ReflectionTheme>> = {
  cultivation: 'cultivation', combat: 'conflict', social: 'community', heavenly: 'heavenly',
};
export const DOCTRINE_TRAINING_COST = 15;
export const DOCTRINE_TRAINING_GAIN = 4;
const EVIDENCE_WINDOW = 24;
const ENDORSEMENT_WINDOW = 24;
const ENDORSEMENT_COOLDOWN = 6;
const BALLOT_TICKS = 5;
const CHARTER_COOLDOWN = 12;
const TRAINING_COOLDOWN = 4;
const MIN_SEED_FUND = 25;
const MAX_SEED_FUND = 240;
const MIN_SUPPORT = 3;
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const schoolId = (sectId: string, theme: ReflectionTheme) => `school-${sectId}-${theme}`;
const livingActor = (world: WorldState, id: string | undefined) => world.cultivators.find((actor) => actor.id === id && live(actor));

export const DOCTRINE_LABELS: Record<ReflectionTheme, string> = {
  cultivation: '积修道统', conflict: '砺剑道统', community: '同契道统', heavenly: '问天道统',
};

export interface DoctrineOption {
  action: 'DOCTRINE';
  doctrineMove: DoctrineMove;
  doctrineTheme?: ReflectionTheme;
  targetDoctrineSchoolId?: string;
  targetDoctrineProposalId?: string;
  targetCultivatorId?: string;
}

export const createDoctrineState = (): DoctrineState => ({ schools: [], endorsements: [], proposals: [], records: [], nextId: 1 });

function endorsementEvidence(world: WorldState, actor: Cultivator, theme: ReflectionTheme): Pick<DoctrineEndorsement, 'evidenceCount' | 'score'> | undefined {
  const memories = new Map([...actor.memories, ...actor.coreMemories].map((entry) => [entry.id, entry]));
  const beliefs = actor.reflections.filter((belief) => belief.kind === 'belief' && belief.theme === theme && belief.intensity >= 5 &&
    belief.tick <= world.tick && world.tick - belief.tick <= EVIDENCE_WINDOW)
    .sort((a, b) => b.intensity - a.intensity || b.tick - a.tick || a.id.localeCompare(b.id));
  for (const belief of beliefs) {
    const recorded = new Set(belief.sourceMemoryIds.filter((id) => {
      const memory = memories.get(id);
      return memory && MEMORY_THEME[memory.category] === theme && memory.importance >= 7 && memory.emotionalValence >= 0 &&
        memory.tick <= belief.tick && world.tick - memory.tick <= EVIDENCE_WINDOW;
    }));
    if (recorded.size) return { evidenceCount: recorded.size, score: Math.min(100, 10 * belief.intensity + 4 * (recorded.size - 1)) };
  }
}

function supporters(world: WorldState, school: DoctrineSchool): DoctrineEndorsement[] {
  const members = new Set(world.cultivators.filter((actor) => live(actor) && actor.sectId === school.parentSectId).map(({ id }) => id));
  const unique = new Map<string, DoctrineEndorsement>();
  for (const row of world.doctrines.endorsements) {
    if (row.schoolId !== school.id || row.sectId !== school.parentSectId || row.theme !== school.theme ||
        row.tick > world.tick || world.tick - row.tick > ENDORSEMENT_WINDOW || !members.has(row.actorId)) continue;
    const known = unique.get(row.actorId);
    if (!known || row.tick > known.tick) unique.set(row.actorId, row);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score || a.actorId.localeCompare(b.actorId));
}

export function doctrineSupport(world: WorldState, school: DoctrineSchool): {
  supporters: number; eligibleMembers: number; threshold: number; supporterIds: string[];
} {
  const eligibleMembers = world.cultivators.filter((actor) => live(actor) && actor.sectId === school.parentSectId).length;
  const supporterIds = supporters(world, school).map(({ actorId }) => actorId);
  return { supporters: supporterIds.length, eligibleMembers, threshold: Math.max(MIN_SUPPORT, Math.ceil(eligibleMembers / 3)), supporterIds };
}

function charterMember(world: WorldState, actorId: string): DoctrineSchool | undefined {
  return world.doctrines.schools.find((school) => school.status === 'autonomous' && school.memberIds.includes(actorId));
}

function stewardFor(world: WorldState, school: DoctrineSchool, sect: Sect): string | undefined {
  if (school.status !== 'autonomous') {
    return supporters(world, school).find(({ actorId }) => actorId !== sect.leaderId && !isRetiredFromService(livingActor(world, actorId)) && !charterMember(world, actorId))?.actorId;
  }
  const eligible = school.memberIds.filter((id) => id !== sect.leaderId && livingActor(world, id)?.sectId === sect.id && !isRetiredFromService(livingActor(world, id)));
  return school.stewardId && eligible.includes(school.stewardId) ? school.stewardId : eligible.slice().sort()[0];
}

const openingAmount = (sect: Sect): number => Math.min(MAX_SEED_FUND, Math.floor(sect.spiritStones / 5));

function log(world: WorldState, school: DoctrineSchool, kind: DoctrineHistory['kind'], title: string,
  description: string, actorIds: string[], amount = 0): WorldEvent {
  const id = `doctrine-record-${world.doctrines.nextId++}`;
  world.doctrines.records.push({ id, tick: world.tick, schoolId: school.id, kind, actorIds: [...new Set(actorIds)], amount,
    support: doctrineSupport(world, school).supporters, description });
  world.doctrines.records = world.doctrines.records.slice(-128);
  return { id: `evt-${world.tick}-${id}`, tick: world.tick, year: world.year, month: world.month,
    category: 'diplomacy', title, description, actorIds: [...new Set(actorIds)],
    locationId: world.sects.find(({ id: sectId }) => sectId === school.parentSectId)?.headquartersId };
}

function pendingFor(world: WorldState, school: DoctrineSchool): DoctrineProposal | undefined {
  return world.doctrines.proposals.find((proposal) => proposal.schoolId === school.id && proposal.status === 'pending');
}

function signedRolesCurrent(world: WorldState, school: DoctrineSchool, sect: Sect, proposal: DoctrineProposal): boolean {
  if (sect.leaderId !== proposal.leaderId || proposal.leaderId === proposal.stewardId ||
      livingActor(world, proposal.leaderId)?.sectId !== sect.id || livingActor(world, proposal.stewardId)?.sectId !== sect.id) return false;
  if (proposal.kind === 'reconciliation') {
    return school.status === 'autonomous' && stewardFor(world, school, sect) === proposal.stewardId &&
      school.treasury === proposal.amount;
  }
  const support = doctrineSupport(world, school);
  return school.status !== 'autonomous' && school.treasury === 0 && support.supporters >= support.threshold &&
    support.supporterIds.includes(proposal.stewardId) && !charterMember(world, proposal.stewardId) &&
    sect.spiritStones >= proposal.amount && proposal.amount >= MIN_SEED_FUND;
}

function closeProposal(world: WorldState, school: DoctrineSchool, proposal: DoctrineProposal, status: 'declined' | 'expired' | 'invalidated',
  reason: string, actorIds: string[]): WorldEvent {
  proposal.status = status;
  proposal.settledTick = world.tick;
  proposal.reason = reason;
  return log(world, school, status, status === 'declined' ? '道统议约被拒' : status === 'expired' ? '道统议约届满' : '道统议约条件失效',
    reason, actorIds);
}

export function availableDoctrineActions(actor: Cultivator, world: WorldState): DoctrineOption[] {
  if (!live(actor) || !world.cultivators.includes(actor)) return [];
  const sect = world.sects.find(({ id }) => id === actor.sectId);
  if (!sect || actor.locationId !== sect.headquartersId ||
      !world.locations.some(({ id }) => id === sect.headquartersId)) return [];
  const options: DoctrineOption[] = [];
  const add = (option: Omit<DoctrineOption, 'action'>) => options.push({ action: 'DOCTRINE', ...option });
  const charter = charterMember(world, actor.id);
  const existing = world.doctrines.endorsements.find(({ actorId }) => actorId === actor.id);
  if (!existing || world.tick - existing.tick >= ENDORSEMENT_COOLDOWN) {
    for (const theme of THEMES) {
      if ((!charter || charter.theme === theme) && endorsementEvidence(world, actor, theme)) {
        add({ doctrineMove: 'endorse', doctrineTheme: theme });
      }
    }
  }
  const schools = world.doctrines.schools.filter(({ parentSectId }) => parentSectId === sect.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const school of schools) {
    const proposal = pendingFor(world, school);
    const stewardId = stewardFor(world, school, sect);
    const isSigner = actor.id === sect.leaderId || actor.id === stewardId;
    if (proposal) {
      if (world.tick < proposal.expiresTick && [proposal.stewardId, proposal.leaderId].includes(actor.id) &&
          !proposal.votes.some(({ actorId }) => actorId === actor.id)) {
        // Decline remains available to the named signatory; acceptance requires current legal authority.
        if (signedRolesCurrent(world, school, sect, proposal)) add({ doctrineMove: 'accept', targetDoctrineProposalId: proposal.id });
        add({ doctrineMove: 'decline', targetDoctrineProposalId: proposal.id });
      }
    } else if (isSigner && stewardId && sect.leaderId && stewardId !== sect.leaderId &&
        livingActor(world, sect.leaderId)?.sectId === sect.id &&
        (school.lastChangeTick === undefined || world.tick - school.lastChangeTick >= CHARTER_COOLDOWN)) {
      const totals = doctrineSupport(world, school);
      if (school.status === 'autonomous') add({ doctrineMove: 'propose_reconciliation', targetDoctrineSchoolId: school.id });
      else if (totals.supporters >= totals.threshold && openingAmount(sect) >= MIN_SEED_FUND) {
        add({ doctrineMove: 'propose_separation', targetDoctrineSchoolId: school.id });
      }
    }
    if (school.status !== 'autonomous') continue;
    if (!charter && supporters(world, school).some(({ actorId }) => actorId === actor.id)) {
      add({ doctrineMove: 'join', targetDoctrineSchoolId: school.id });
    }
    if (charter?.id === school.id && (!proposal || proposal.stewardId !== actor.id)) {
      add({ doctrineMove: 'leave', targetDoctrineSchoolId: school.id });
    }
    if (!proposal && actor.id === stewardId && school.treasury >= DOCTRINE_TRAINING_COST &&
        (school.lastTrainingTick === undefined || world.tick - school.lastTrainingTick >= TRAINING_COOLDOWN)) {
      for (const memberId of [...school.memberIds].sort()) {
        const member = livingActor(world, memberId);
        if (member && member.id !== actor.id && member.sectId === sect.id && member.locationId === actor.locationId &&
            member.techniqueMastery < 100) add({ doctrineMove: 'fund_training', targetDoctrineSchoolId: school.id, targetCultivatorId: memberId });
      }
    }
  }
  return options;
}

function closeAccepted(world: WorldState, sect: Sect, school: DoctrineSchool, proposal: DoctrineProposal): WorldEvent {
  proposal.status = 'accepted';
  proposal.settledTick = world.tick;
  school.lastChangeTick = world.tick;
  if (proposal.kind === 'separation') {
    sect.spiritStones -= proposal.amount;
    school.treasury += proposal.amount;
    school.memberIds = [proposal.stewardId]; // Other endorsers explicitly opt in; no unilateral transfers of members.
    school.stewardId = proposal.stewardId;
    school.status = 'autonomous';
    proposal.reason = '宗门与道统双方完成书面签议；仅授权款项划入自治学舍，成员可以自主加入。';
    return log(world, school, 'separation', '道统和平分立', proposal.reason, [proposal.stewardId, proposal.leaderId], proposal.amount);
  }
  sect.spiritStones += school.treasury;
  school.treasury = 0;
  school.memberIds = [];
  delete school.stewardId;
  school.status = 'reconciled';
  proposal.reason = '双方同意收回自治章程，学舍余额返还原宗，所有修士保留原宗籍与个人财物。';
  return log(world, school, 'reconciliation', '宗门道统和解', proposal.reason, [proposal.stewardId, proposal.leaderId], proposal.amount);
}

export function resolveDoctrineAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'DOCTRINE') return null;
  const option = availableDoctrineActions(actor, world).find((candidate) => candidate.doctrineMove === decision.doctrineMove &&
    candidate.doctrineTheme === decision.doctrineTheme && candidate.targetDoctrineSchoolId === decision.targetDoctrineSchoolId &&
    candidate.targetDoctrineProposalId === decision.targetDoctrineProposalId && candidate.targetCultivatorId === decision.targetCultivatorId);
  if (!option) return null;
  const sect = world.sects.find(({ id }) => id === actor.sectId)!;
  if (option.doctrineMove === 'endorse') {
    const theme = option.doctrineTheme!;
    const evidence = endorsementEvidence(world, actor, theme)!;
    const id = schoolId(sect.id, theme);
    let school = world.doctrines.schools.find((entry) => entry.id === id);
    if (!school) {
      school = { id, parentSectId: sect.id, theme, founderId: actor.id, foundedTick: world.tick, status: 'attached', memberIds: [], treasury: 0 };
      world.doctrines.schools.push(school);
    }
    world.doctrines.endorsements = world.doctrines.endorsements.filter(({ actorId }) => actorId !== actor.id);
    world.doctrines.endorsements.push({ actorId: actor.id, sectId: sect.id, schoolId: id, theme, tick: world.tick, ...evidence });
    return log(world, school, 'endorse', '有据立论', `${actor.name}声明支持${DOCTRINE_LABELS[theme]}。仅登记依据数量，不公开个人回忆。`, [actor.id]);
  }
  if (option.doctrineMove === 'accept' || option.doctrineMove === 'decline') {
    const proposal = world.doctrines.proposals.find(({ id }) => id === option.targetDoctrineProposalId)!;
    const school = world.doctrines.schools.find(({ id }) => id === proposal.schoolId)!;
    proposal.votes.push({ actorId: actor.id, tick: world.tick, verdict: option.doctrineMove });
    if (option.doctrineMove === 'decline') return closeProposal(world, school, proposal, 'declined', '一方明确拒绝，原成员及财产归属保持不变。', [actor.id]);
    return closeAccepted(world, sect, school, proposal);
  }
  const school = world.doctrines.schools.find(({ id }) => id === option.targetDoctrineSchoolId)!;
  if (option.doctrineMove === 'propose_separation' || option.doctrineMove === 'propose_reconciliation') {
    const kind = option.doctrineMove === 'propose_separation' ? 'separation' : 'reconciliation';
    const amount = kind === 'separation' ? openingAmount(sect) : school.treasury;
    const id = `doctrine-proposal-${world.doctrines.nextId++}`;
    world.doctrines.proposals.push({ id, schoolId: school.id, kind, openedTick: world.tick, expiresTick: world.tick + BALLOT_TICKS,
      stewardId: stewardFor(world, school, sect)!, leaderId: sect.leaderId!, amount, status: 'pending',
      votes: [{ actorId: actor.id, tick: world.tick, verdict: 'accept' }] });
    return log(world, school, 'proposal', '道统议约登记', `一方发起${kind === 'separation' ? '和平分立' : '和解'}议约并签议，待另一方决定。拟划转${amount}灵石，尚未付款。`, [actor.id], amount);
  }
  if (option.doctrineMove === 'join') {
    school.memberIds.push(actor.id);
    if (!school.stewardId && actor.id !== sect.leaderId) school.stewardId = actor.id;
    return log(world, school, 'join', '自愿入道统学舍', `${actor.name}自愿参加自治学舍，宗籍和宗门职位不变。`, [actor.id]);
  }
  if (option.doctrineMove === 'leave') {
    school.memberIds = school.memberIds.filter((id) => id !== actor.id);
    if (school.stewardId === actor.id) {
      delete school.stewardId;
      school.stewardId = stewardFor(world, school, sect);
    }
    return log(world, school, 'leave', '自愿退出道统学舍', `${actor.name}退出自治学舍，个人物资仍归本人。`, [actor.id]);
  }
  const student = livingActor(world, option.targetCultivatorId)!;
  school.treasury -= DOCTRINE_TRAINING_COST;
  school.lastTrainingTick = world.tick;
  student.spiritStones += DOCTRINE_TRAINING_COST;
  const before = student.techniqueMastery;
  gainMastery(student, DOCTRINE_TRAINING_GAIN);
  return log(world, school, 'training', '道统学舍资助修习', `学舍向${student.name}发放${DOCTRINE_TRAINING_COST}灵石，功法熟练度提升${student.techniqueMastery - before}。`,
    [actor.id, student.id], DOCTRINE_TRAINING_COST);
}

export function advanceDoctrines(world: WorldState): WorldEvent[] {
  const result: WorldEvent[] = [];
  const now = world.tick;
  world.doctrines.endorsements = world.doctrines.endorsements.filter((row) =>
    now - row.tick <= ENDORSEMENT_WINDOW && livingActor(world, row.actorId)?.sectId === row.sectId);
  for (const school of world.doctrines.schools) {
    const sect = world.sects.find(({ id }) => id === school.parentSectId);
    if (!sect) continue;
    if (school.status === 'autonomous') {
      school.memberIds = school.memberIds.filter((id) => livingActor(world, id)?.sectId === sect.id);
      school.stewardId = stewardFor(world, school, sect);
    }
    const proposal = pendingFor(world, school);
    if (!proposal) continue;
    if (now >= proposal.expiresTick) result.push(closeProposal(world, school, proposal, 'expired', '议约期限内没有取得两方许可，未划拨财物。', []));
    else if (!signedRolesCurrent(world, school, sect, proposal)) result.push(closeProposal(world, school, proposal, 'invalidated',
      '签署资格、支持门槛或资金条件已经变化，议约撤销，未划拨财物。', []));
  }
  const terminal = new Set(world.doctrines.proposals.filter(({ status }) => status !== 'pending').slice(-64));
  world.doctrines.proposals = world.doctrines.proposals.filter((row) => row.status === 'pending' || terminal.has(row));
  return result;
}
