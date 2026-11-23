import type { Cultivator, LLMDecisionPayload, MentorshipState, Technique, TuitionOffer, WorldEvent, WorldState } from '../types/world';
import { recordMemory } from './memoryEngine';
import { rewardContribution } from './sectPoliticsEngine';

export const MENTOR_MONTHLY_BUDGET = 2;
const OFFER_LIFETIME = 4;
const HISTORY_LIMIT = 150;
const MAX_PENDING = 80;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const techniqueKey = (technique: Technique) => technique.id ?? `${technique.name}/${technique.spiritRoot}`;

export interface MentorshipOption {
  action: 'TEACH' | 'ACCEPT_TUITION' | 'DECLINE_TUITION';
  targetCultivatorId?: string;
  targetTuitionId?: string;
}

export function createMentorshipState(): MentorshipState { return { offers: [], lineage: [], budgets: [] }; }

export function mentorshipBudgetRemaining(actor: Cultivator, world: WorldState, executionTick = world.tick): number {
  if (executionTick !== world.tick && executionTick !== world.tick + 1) return 0;
  const used = world.mentorship.budgets.find((entry) => entry.mentorId === actor.id && entry.tick === executionTick)?.spent ?? 0;
  return Math.max(0, MENTOR_MONTHLY_BUDGET - used);
}

/** One actual teaching slot in the same canonical mentor/turn budget, shared by individual and cohort instruction. */
export function spendMentorshipBudget(world: WorldState, mentor: Cultivator): boolean {
  if (!live(mentor) || !world.cultivators.includes(mentor)) return false;
  const budget = world.mentorship.budgets.find((entry) => entry.mentorId === mentor.id && entry.tick === world.tick);
  if (budget) {
    if (budget.spent >= MENTOR_MONTHLY_BUDGET) return false;
    budget.spent++;
  } else {
    world.mentorship.budgets.push({ mentorId: mentor.id, tick: world.tick, spent: 1 });
  }
  return true;
}

function wouldCycle(world: WorldState, mentorId: string, studentId: string): boolean {
  const seen = new Set<string>([studentId]);
  let cursor: string | undefined = mentorId;
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = world.mentorship.lineage.find((edge) => edge.studentId === cursor)?.mentorId;
  }
  return false;
}

function canTeach(world: WorldState, mentor: Cultivator, student: Cultivator): boolean {
  if (!live(mentor) || !live(student) || mentor.id === student.id || !mentor.sectId ||
      !world.sects.some(({ id }) => id === mentor.sectId) || mentor.sectId !== student.sectId ||
      mentor.locationId !== student.locationId || mentor.techniqueMastery < 55 ||
      mentor.techniqueMastery - student.techniqueMastery < 10) return false;
  if (mentor.tribulation?.stage === 'lightning' || mentor.tribulation?.stage === 'heart_demon' ||
      student.tribulation?.stage === 'lightning' || student.tribulation?.stage === 'heart_demon') return false;
  const parent = world.mentorship.lineage.find((edge) => edge.studentId === student.id);
  if (parent && world.mentorTransfers.releases.some(row => row.studentId === student.id &&
      row.oldMentorId === parent.mentorId && row.formedTick === parent.formedTick)) return false;
  return (!parent || parent.mentorId === mentor.id) && !wouldCycle(world, mentor.id, student.id);
}

export function availableMentorshipActions(actor: Cultivator, world: WorldState, includeTeaching = true): MentorshipOption[] {
  if (!live(actor)) return [];
  const pending = world.mentorship.offers.filter(({ status, expiresTick }) => status === 'pending' && expiresTick > world.tick);
  const requests: MentorshipOption[] = [];
  for (const offer of pending.filter(({ studentId }) => studentId === actor.id)) {
    requests.push({ action: 'DECLINE_TUITION', targetTuitionId: offer.id });
    const mentor = world.cultivators.find(({ id }) => id === offer.mentorId);
    if (mentor && canTeach(world, mentor, actor) && techniqueKey(mentor.technique) === techniqueKey(offer.technique)) {
      requests.push({ action: 'ACCEPT_TUITION', targetTuitionId: offer.id });
    }
  }
  if (!includeTeaching || pending.length >= MAX_PENDING || !mentorshipBudgetRemaining(actor, world)) return requests;
  for (const student of world.cultivators) {
    if (!canTeach(world, actor, student) || pending.some(({ studentId }) => studentId === student.id) ||
        world.mentorship.offers.some((offer) => offer.mentorId === actor.id && offer.studentId === student.id &&
          world.tick - (offer.resolvedTick ?? offer.createdTick) < 2)) continue;
    requests.push({ action: 'TEACH', targetCultivatorId: student.id });
  }
  return requests;
}

function event(world: WorldState, offer: TuitionOffer, suffix: string, title: string, description: string, locationId: string): WorldEvent {
  return { id: `evt-${offer.id}-${suffix}`, tick: world.tick, year: world.year, month: world.month, title, description,
    category: 'breakthrough', actorIds: [offer.mentorId, offer.studentId], locationId, witnessScope: 'participants' };
}

export function mentorshipTechniqueMultiplier(world: WorldState, actor: Cultivator): number {
  const link = world.mentorship.lineage.find((edge) => edge.studentId === actor.id && techniqueKey(edge.technique) === techniqueKey(actor.technique));
  return 1 - (link?.flaw ?? 0) / 500;
}

export function resolveMentorshipAction(world: WorldState, actor: Cultivator, decision: LLMDecisionPayload, rng: () => number): WorldEvent | null {
  const option = availableMentorshipActions(actor, world).find(({ action, targetCultivatorId, targetTuitionId }) =>
    action === decision.chosenAction && targetCultivatorId === decision.targetCultivatorId && targetTuitionId === decision.targetTuitionId);
  if (!option) return null;
  const state = world.mentorship;
  if (option.action === 'TEACH') {
    const student = world.cultivators.find(({ id }) => id === option.targetCultivatorId)!;
    if (!spendMentorshipBudget(world, actor)) return null;
    const offer: TuitionOffer = { id: `tuition-${world.tick}-${actor.id}-${student.id}`, mentorId: actor.id, studentId: student.id,
      technique: { ...actor.technique }, createdTick: world.tick, expiresTick: world.tick + OFFER_LIFETIME, status: 'pending' };
    state.offers.unshift(offer);
    return event(world, offer, 'offered', '师门传法邀约', `${actor.name}愿向${student.name}传授【${offer.technique.name}】，尚待答复。`, actor.locationId);
  }
  const offer = state.offers.find(({ id }) => id === option.targetTuitionId)!;
  offer.resolvedTick = world.tick;
  if (option.action === 'DECLINE_TUITION') {
    offer.status = 'declined';
    offer.outcome = `${actor.name}谢绝传法，未改修功法。`;
    return event(world, offer, 'declined', '弟子婉拒传法', offer.outcome, actor.locationId);
  }
  const mentor = world.cultivators.find(({ id }) => id === offer.mentorId)!;
  const mentorLineage = state.lineage.find((edge) => edge.studentId === mentor.id &&
    techniqueKey(edge.technique) === techniqueKey(offer.technique));
  const inheritedFlaw = Math.round((mentorLineage?.flaw ?? 0) * .72);
  const localMistake = rng() < (100 - mentor.techniqueMastery) * .003 ? 12 : 0;
  const old = state.lineage.find((edge) => edge.studentId === actor.id);
  const sameTechnique = techniqueKey(actor.technique) === techniqueKey(offer.technique);
  const sameLine = old && techniqueKey(old.technique) === techniqueKey(offer.technique);
  const flaw = clamp(sameLine ? Math.round(old.flaw * .50 + inheritedFlaw * .50) + localMistake : inheritedFlaw + localMistake, 0, 100);
  if (!sameTechnique) {
    actor.technique = { ...offer.technique };
    delete actor.activeEdition;
  }
  const gain = Math.max(3, Math.round((mentor.techniqueMastery - (sameTechnique ? actor.techniqueMastery : 0)) * .28) - Math.floor(flaw / 10));
  actor.techniqueMastery = Math.min(100, mentor.techniqueMastery, (sameTechnique ? actor.techniqueMastery : 12) + gain);
  if (old) {
    old.technique = { ...offer.technique }; old.lastLessonTick = world.tick; old.lessons++; old.flaw = flaw;
  } else state.lineage.push({ mentorId: mentor.id, studentId: actor.id, technique: { ...offer.technique },
    formedTick: world.tick, lastLessonTick: world.tick, lessons: 1, flaw });
  if (!world.relationships.some((edge) =>
    (edge.fromId === mentor.id && edge.toId === actor.id) || (edge.fromId === actor.id && edge.toId === mentor.id))) {
    world.relationships.push({ fromId: mentor.id, toId: actor.id, type: '师徒', affinity: 35, note: '经同意传法结缘' });
  }
  rewardContribution(mentor, world, 4);
  offer.status = 'accepted';
  offer.outcome = `${actor.name}受${mentor.name}指点，修习【${offer.technique.name}】至熟练${actor.techniqueMastery}。${flaw ? `当前有${flaw}点偏差，可经练习与纠正减少。` : '本次未发现承袭偏差。'}`;
  recordMemory(actor, world.tick, offer.outcome, 7, 'cultivation', 3);
  recordMemory(mentor, world.tick, offer.outcome, 6, 'cultivation', 2);
  return event(world, offer, 'accepted', '同门传法完成', offer.outcome, actor.locationId);
}

export function maintainMentorship(world: WorldState): void {
  const state = world.mentorship;
  if (state.lastMaintainedTick === world.tick) return;
  state.lastMaintainedTick = world.tick;
  state.budgets = state.budgets.filter(({ tick }) => tick === world.tick);
  const liveIds = new Set(world.cultivators.filter(live).map(({ id }) => id));
  for (const offer of state.offers) {
    if (offer.status === 'pending' && (world.tick >= offer.expiresTick || !liveIds.has(offer.mentorId) || !liveIds.has(offer.studentId))) {
      offer.status = 'expired'; offer.resolvedTick = world.tick; offer.outcome = '传法邀约到期或当事者已不能赴约。';
    }
  }
  const open = state.offers.filter(({ status }) => status === 'pending');
  const pinned = new Set(world.mentorTransfers.releases.map(({sourceTuitionId}) => sourceTuitionId));
  const reunionPinned=new Set((world.apprenticeshipReunions?.cases??[]).flatMap(entry=>entry.teaching?[entry.teaching.tuitionId]:[]));
  const learned = new Map(state.lineage.map(row => [row.studentId,row]));
  const retained = state.offers.filter(row => {
    if(reunionPinned.has(row.id)&&row.status!=='pending')return true;
    if (row.status !== 'accepted') return false;
    const lineage = learned.get(row.studentId);
    return pinned.has(row.id) || lineage?.mentorId === row.mentorId && lineage.lastLessonTick === row.resolvedTick &&
      techniqueKey(lineage.technique) === techniqueKey(row.technique);
  });
  const retainedIds = new Set(retained.map(({id})=>id));
  const recent = new Set(state.offers.filter(({ status,id }) => status !== 'pending' && !retainedIds.has(id))
    .slice(0, Math.max(0,HISTORY_LIMIT-open.length)).map(({id})=>id));
  state.offers = [...open,...state.offers.filter(({id})=>retainedIds.has(id)||recent.has(id))];
  for (const edge of state.lineage) {
    const student = world.cultivators.find(({ id }) => id === edge.studentId);
    if (student && live(student) && student.currentAction === 'CULTIVATE' && world.tick > edge.lastLessonTick &&
        techniqueKey(student.technique) === techniqueKey(edge.technique)) {
      edge.flaw = Math.max(0, edge.flaw - (student.techniqueMastery >= 65 ? 2 : 1));
    }
  }
}
