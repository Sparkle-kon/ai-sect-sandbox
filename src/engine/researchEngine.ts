import type { Cultivator, LLMDecisionPayload, LocationNode, ResearchContribution, ResearchMove, ResearchProject, ResearchState, ResearchTopic,
  ResearchWithdrawalReason, Sect, SpiritRoot, Technique, WorldEvent, WorldState } from '../types/world';
import { registerScriptureOriginal } from './scriptureEngine';

export const RESEARCH_DEPOSIT = Object.freeze({ stones: 40, earthRoots: 2 });
export const RESEARCH_WORK_COST = Object.freeze({ stones: 10, earthRoots: 1 });
export const RESEARCH_REQUIRED_TURNS = 4;
export const RESEARCH_REQUIRED_RESEARCHERS = 2;
export const RESEARCH_PROJECT_TICKS = 8;

export const RESEARCH_TOPICS: Readonly<Record<ResearchTopic, { label: string; question: string; techniqueName: string; spiritRoot: SpiritRoot }>> = {
  qi_foundation: { label: '木灵筑基', question: '木性吐纳如何在多次重复下稳定引导灵气？', techniqueName: '四候引木经', spiritRoot: '木' },
  warding: { label: '土契护脉', question: '以玄土根校勘引脉次序，能否复现稳土护脉的功法？', techniqueName: '玄土回脉典', spiritRoot: '土' },
};
const TOPICS = ['qi_foundation', 'warding'] as const;
const AUTHORIZED = new Set<Cultivator['sectRank']>(['长老', '太上长老', '掌门']);
const RETURN_HISTORY = 64;
const REOPEN_WAIT = 4;
const alive = (actor: Cultivator) => actor.alive && actor.hp > 0;
const sectOf = (world: WorldState, id: string) => world.sects.find((sect) => sect.id === id);
const person = (world: WorldState, id: string) => world.cultivators.find((actor) => actor.id === id);
const relocating = (world: WorldState, sectId: string) =>
  world.relocations.plans.some((plan) => plan.sectId === sectId && plan.status === 'in_transit');

export interface ResearchOption {
  action: 'RESEARCH';
  researchMove: ResearchMove;
  researchTopic?: ResearchTopic;
  targetResearchId?: string;
  researchWithdrawReason?: ResearchWithdrawalReason;
}

export const createResearchState = (): ResearchState => ({ projects: [], nextId: 1 });

function digest(text: string): string {
  let a = 0x811c9dc5, b = 0x84222325;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ text.charCodeAt(text.length - 1 - i), 0x01000193);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

/** Per-sect research of a topic identifies a single canonical discovery, regardless of venue moves or retries. */
export function researchTechniqueId(sectId: string, topic: ResearchTopic): string {
  return `technique-research-${topic}-${digest(sectId)}`;
}

function discoveryAlreadyExists(world: WorldState, sectId: string, topic: ResearchTopic): boolean {
  const id = researchTechniqueId(sectId, topic);
  return world.scriptures.originals.some((item) => item.id === id) || world.sects.some((sect) => sect.pavilion.some((text) => text.id === id)) ||
    world.research.projects.some((project) => project.status === 'completed' && project.discoveryTechniqueId === id);
}

function campus(world: WorldState, sect: Sect): LocationNode | undefined {
  if (sect.facilities.scripture_pavilion < 1 || relocating(world, sect.id)) return undefined;
  return world.locations.find((site) => site.id === sect.headquartersId && (!site.ownerSectId || site.ownerSectId === sect.id));
}

function duties(world: WorldState, actor: Cultivator): boolean {
  return Boolean(actor.guardAssignment && actor.guardAssignment.expiresTick > world.tick) ||
    world.escorts.contracts.some((deal) => deal.escortId === actor.id && deal.status === 'active') ||
    world.sieges.some((siege) => (siege.status === 'marching' || siege.status === 'sieging') && siege.participantIds.includes(actor.id)) ||
    world.occasions.some((occasion) => (occasion.status === 'registration' || occasion.status === 'running') && occasion.participantIds.includes(actor.id)) ||
    actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon';
}

function withdrawalReasons(world: WorldState, actor: Cultivator, project: ResearchProject, sect: Sect): ResearchWithdrawalReason[] {
  const reasons: ResearchWithdrawalReason[] = [];
  if (actor.hp / Math.max(1, actor.maxHp) <= .55) reasons.push('injury');
  if (actor.locationId !== sect.headquartersId || duties(world, actor)) reasons.push('assignment');
  if (relocating(world, sect.id) || sect.headquartersId !== project.locationId) reasons.push('relocation');
  if (actor.spiritStones < RESEARCH_DEPOSIT.stones) reasons.push('hardship');
  return reasons;
}

function qualifiedWork(world: WorldState, actor: Cultivator, sect: Sect): boolean {
  return campus(world, sect)?.id === actor.locationId && !duties(world, actor) && actor.hp / Math.max(1, actor.maxHp) > .55;
}

export function visibleResearchProjects(world: WorldState, actor?: Cultivator): ResearchProject[] {
  const selected = actor && person(world, actor.id);
  return world.research.projects.filter((project) => project.startedTick <= world.tick &&
    (project.status === 'completed' || project.sectId === selected?.sectId));
}

export function availableResearchActions(actor: Cultivator, world: WorldState): ResearchOption[] {
  if (!alive(actor) || !world.cultivators.includes(actor)) return [];
  const sect = sectOf(world, actor.sectId);
  if (!sect) return [];
  const options: ResearchOption[] = [];
  const add = (choice: Omit<ResearchOption, 'action'>) => options.push({ action: 'RESEARCH', ...choice });
  const project = world.research.projects.find((item) => item.sectId === sect.id && item.status === 'open');
  if (!project) {
    if (!qualifiedWork(world, actor, sect) || (!AUTHORIZED.has(actor.sectRank) && actor.techniqueMastery < 55)) return options;
    const latest = [...world.research.projects].reverse().find((item) => item.sectId === sect.id && item.settledTick !== undefined);
    if (latest?.settledTick !== undefined && world.tick - latest.settledTick < REOPEN_WAIT) return options;
    for (const topic of TOPICS) if (!discoveryAlreadyExists(world, sect.id, topic)) add({ researchMove: 'propose', researchTopic: topic });
    return options;
  }
  if (world.tick >= project.deadlineTick || discoveryAlreadyExists(world, sect.id, project.topic)) return options;
  const record = project.contributors.find((item) => item.actorId === actor.id);
  if (!record) {
    if (qualifiedWork(world, actor, sect) && actor.spiritStones >= RESEARCH_DEPOSIT.stones && actor.herbs.earth_root >= RESEARCH_DEPOSIT.earthRoots &&
        !world.research.projects.some((other) => other.status === 'open' && other.contributors.some((member) =>
          member.actorId === actor.id && member.withdrawnTick === undefined))) add({ researchMove: 'join', targetResearchId: project.id });
    return options;
  }
  if (record.withdrawnTick !== undefined) return options;
  for (const reason of withdrawalReasons(world, actor, project, sect)) {
    add({ researchMove: 'withdraw', targetResearchId: project.id, researchWithdrawReason: reason });
  }
  if (qualifiedWork(world, actor, sect) && world.tick > record.joinedTick && (record.lastWorkedTick === undefined || record.lastWorkedTick < world.tick) &&
      record.escrow.stones >= RESEARCH_WORK_COST.stones && record.escrow.earthRoots >= RESEARCH_WORK_COST.earthRoots) {
    add({ researchMove: 'work', targetResearchId: project.id });
  }
  return options;
}

function releaseUnspent(actor: Cultivator, member: ResearchContribution): void {
  actor.spiritStones += member.escrow.stones;
  actor.herbs.earth_root += member.escrow.earthRoots;
  member.escrow = { stones: 0, earthRoots: 0 };
}

function event(world: WorldState, project: ResearchProject, slug: string, title: string, description: string, actorIds: string[],
  locationId = project.locationId, publicResult = false): WorldEvent {
  return { id: `evt-${world.tick}-${project.id}-${slug}`, tick: world.tick, year: world.year, month: world.month,
    title, description, actorIds, locationId, category: publicResult ? 'breakthrough' : 'diplomacy',
    ...(publicResult ? {} : { witnessScope: 'participants' as const }) };
}

function resultIfComplete(world: WorldState, project: ResearchProject, sect: Sect, currentHq: string): WorldEvent | null {
  const worked = project.contributors.filter((row) => row.workTurns > 0);
  if (worked.length < RESEARCH_REQUIRED_RESEARCHERS ||
      worked.reduce((sum, row) => sum + row.workTurns, 0) < RESEARCH_REQUIRED_TURNS ||
      discoveryAlreadyExists(world, sect.id, project.topic)) return null;
  const rules = RESEARCH_TOPICS[project.topic];
  const technique: Technique = { id: researchTechniqueId(sect.id, project.topic), name: rules.techniqueName,
    spiritRoot: rules.spiritRoot, createdTick: world.tick };
  if (!registerScriptureOriginal(world, technique, 'pavilion', currentHq, sect.id)) return null;
  sect.pavilion.push(technique);
  project.status = 'completed';
  project.settledTick = world.tick;
  project.discoveryTechniqueId = technique.id;
  project.discoveryLocationId = currentHq;
  for (const item of project.contributors) {
    const actor = person(world, item.actorId);
    if (actor) releaseUnspent(actor, item);
  }
  return event(world, project, 'complete', '宗门共研发现入阁',
    `${worked.length}名修士用实际材料完成复验，唯一一部《${technique.name}》入现任山门藏经阁；只归还各人未用的自有材料。`,
    worked.map(({ actorId }) => actorId), currentHq, true);
}

export function resolveResearchAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload): WorldEvent | null {
  if (decision.chosenAction !== 'RESEARCH') return null;
  const option = availableResearchActions(actor, world).find((item) => item.researchMove === decision.researchMove &&
    item.researchTopic === decision.researchTopic && item.targetResearchId === decision.targetResearchId &&
    item.researchWithdrawReason === decision.researchWithdrawReason);
  if (!option) return null;
  const sect = sectOf(world, actor.sectId)!;
  if (option.researchMove === 'propose') {
    const topic = option.researchTopic!;
    const project: ResearchProject = { id: `research-${world.research.nextId++}`, sectId: sect.id, proposerId: actor.id, topic,
      locationId: actor.locationId, startedTick: world.tick, deadlineTick: world.tick + RESEARCH_PROJECT_TICKS, status: 'open', contributors: [] };
    world.research.projects.push(project);
    return event(world, project, 'proposed', '宗门提交限期共研问题', RESEARCH_TOPICS[topic].question, [actor.id]);
  }
  const project = world.research.projects.find(({ id }) => id === option.targetResearchId)!;
  if (option.researchMove === 'join') {
    actor.spiritStones -= RESEARCH_DEPOSIT.stones;
    actor.herbs.earth_root -= RESEARCH_DEPOSIT.earthRoots;
    project.contributors.push({ actorId: actor.id, joinedTick: world.tick, workTurns: 0,
      escrow: { ...RESEARCH_DEPOSIT }, spent: { stones: 0, earthRoots: 0 } });
    return event(world, project, `join-${actor.id}`, '修士自愿托管共研材料', '只从本人的自有资源封存材料，不复制宗门库银。', [actor.id]);
  }
  const member = project.contributors.find(({ actorId }) => actorId === actor.id)!;
  if (option.researchMove === 'withdraw') {
    releaseUnspent(actor, member);
    member.withdrawnTick = world.tick;
    member.withdrawReason = option.researchWithdrawReason!;
    return event(world, project, `withdraw-${actor.id}`, '共研有由退出', '记录有效退出事由，退回实际未用物资；已经完成的复验仍按人署录。',
      [actor.id], actor.locationId);
  }
  member.lastWorkedTick = world.tick;
  member.workTurns++;
  member.escrow.stones -= RESEARCH_WORK_COST.stones;
  member.escrow.earthRoots -= RESEARCH_WORK_COST.earthRoots;
  member.spent.stones += RESEARCH_WORK_COST.stones;
  member.spent.earthRoots += RESEARCH_WORK_COST.earthRoots;
  return resultIfComplete(world, project, sect, actor.locationId) ??
    event(world, project, `work-${actor.id}`, '共研复验完成一轮', '此轮实际占用修士行动并消耗本人已托管材料，逐人记录。', [actor.id], actor.locationId);
}

export function advanceResearch(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const project of world.research.projects) {
    if (project.status !== 'open') continue;
    for (const member of project.contributors) {
      if (member.withdrawnTick !== undefined) continue;
      const actor = person(world, member.actorId);
      if (!actor || (alive(actor) && actor.sectId === project.sectId)) continue;
      releaseUnspent(actor, member);
      member.withdrawnTick = world.tick;
      member.withdrawReason = 'ineligible';
      events.push(event(world, project, `ineligible-${actor.id}`, '共研资格变化，释放材料', '成员已无法继续参与，实际余额退回本人账册（遗产可继续结算）。', [actor.id]));
    }
    if (world.tick < project.deadlineTick && sectOf(world, project.sectId) &&
        !discoveryAlreadyExists(world, project.sectId, project.topic)) continue;
    for (const item of project.contributors) {
      const actor = person(world, item.actorId);
      if (actor) releaseUnspent(actor, item);
    }
    project.status = 'expired';
    project.settledTick = world.tick;
    events.push(event(world, project, 'expired', '共研未发表，余额退回',
      '期限或现有条件不再允许发表；不凭空解锁功法，未消耗的自有材料原样返还。', [project.proposerId]));
  }
  const orphanedMaterials = (project: ResearchProject) => project.contributors.some(({ escrow }) => escrow.stones > 0 || escrow.earthRoots > 0);
  const expired = new Set(world.research.projects.filter((project) => project.status === 'expired' && !orphanedMaterials(project)).slice(-RETURN_HISTORY));
  world.research.projects = world.research.projects.filter((project) => project.status !== 'expired' || orphanedMaterials(project) || expired.has(project));
  return events;
}
