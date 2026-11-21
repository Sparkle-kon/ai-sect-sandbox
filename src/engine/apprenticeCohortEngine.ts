import type {
  ApprenticeCohort, ApprenticeCohortMove, ApprenticeCohortSeat, ApprenticeCohortState, ApprenticeGraduation,
  Cultivator, LLMDecisionPayload, Technique, WorldEvent, WorldState,
} from '../types/world';
import { mentorshipBudgetRemaining, spendMentorshipBudget } from './mentorshipEngine';

export const COHORT_MIN_INVITEES = 2;
export const COHORT_MAX_INVITEES = 4;
export const COHORT_LESSON_DELAY = 2;
export const COHORT_GRADUATION_MASTERY = 40;
export const COHORT_MENTOR_MASTERY = 55;
export const COHORT_MASTERY_GAIN = 1;
const HISTORY_LIMIT = 96;

export type ApprenticeCohortOption = { action:'APPRENTICE_COHORT' } & (
  | { cohortMove:'offer';cohortInviteeIds:string[];targetTechniqueId:string;targetCohortId?:never }
  | { cohortMove:Exclude<ApprenticeCohortMove,'offer'>;targetCohortId:string;cohortInviteeIds?:never;targetTechniqueId?:never }
);
export interface ApprenticeCohortView { cohorts: ApprenticeCohort[]; graduations: ApprenticeGraduation[] }

export const createApprenticeCohortState = (): ApprenticeCohortState => ({cohorts:[],graduations:[],nextId:1});

const live = (actor: Cultivator | undefined): actor is Cultivator => !!actor?.alive && actor.hp > 0;
const actorAt = (world: WorldState, id: string) => world.cultivators.find(actor => actor.id === id);
const masteryValid = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;
const localSite = (world: WorldState, siteId: string) => world.locations.some(site => site.id === siteId &&
  site.type !== 'secret_realm' && site.type !== 'abyss');
const sameText = (a: Technique,b: Technique) => !!a.id && a.id === b.id && a.name === b.name &&
  a.spiritRoot === b.spiritRoot && a.authorId === b.authorId && a.createdTick === b.createdTick;
const curriculum = (world: WorldState, id: string | undefined) =>
  id ? world.scriptures.originals.find(original => original.id === id && original.technique.id === id)?.technique : undefined;
const signedSeat = (row: ApprenticeCohort,id: string) => row.seats.find(seat => seat.studentId === id);
const graduationKey = (studentId: string,techniqueId: string) => JSON.stringify([studentId,techniqueId]);
const participated = (seat: ApprenticeCohortSeat) => seat.status === 'attended' && seat.leftTick === undefined &&
  seat.attendedTick !== undefined && seat.acceptedTick !== undefined && seat.readyTick === seat.attendedTick;

function physicallyPresent(world: WorldState,actor: Cultivator,siteId: string,tick: number): boolean {
  if (actor.locationId !== siteId || actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon') return false;
  const id = actor.id;
  return !(actor.guardAssignment && actor.guardAssignment.expiresTick > tick) &&
    !world.couriers.dispatches.some(row => row.courierId === id && (row.status === 'in_transit' || row.status === 'returning' ||
      row.acceptedTick === tick || row.lastAdvancedTick === tick || row.settledTick === tick)) &&
    !world.pilgrimages.journeys.some(row => (row.organizerId === id || row.companionId === id) &&
      (row.status === 'active' || row.startedTick === tick || row.lastMovedTick === tick)) &&
    !world.escorts.contracts.some(row => row.escortId === id && row.status === 'active') &&
    !world.relocations.plans.some(row => row.status === 'in_transit' && row.garrisonIds.includes(id)) &&
    !world.sieges.some(row => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(id)) &&
    !world.occasions.some(row => (row.status === 'running' || row.status === 'registration') && row.participantIds.includes(id) &&
      !world.expeditionRescues.requests.some(rescue => rescue.occasionId === row.id && rescue.arrivedIds?.includes(id))) &&
    !world.boundaryReliefs.cases.some(row => row.incomingId === id && (row.status === 'travelling' || row.status === 'returning'));
}

function isMentor(world: WorldState, actor: Cultivator | undefined, sectId: string, siteId: string,
  text: Technique | undefined,tick: number): actor is Cultivator {
  return live(actor) && !!text && !!sectId && actor.sectId === sectId && masteryValid(actor.techniqueMastery) &&
    actor.techniqueMastery >= COHORT_MENTOR_MASTERY && sameText(actor.technique,text) &&
    localSite(world,siteId) && world.sects.some(sect => sect.id === sectId) && physicallyPresent(world,actor,siteId,tick);
}

const studiesLineage = (world: WorldState, actor: Cultivator, mentorId: string, text: Technique, beforeOrAt: number) =>
  actor.id !== mentorId && sameText(actor.technique,text) &&
  world.mentorship.lineage.some(edge => edge.studentId === actor.id && edge.mentorId === mentorId &&
    sameText(edge.technique,text) && edge.formedTick <= beforeOrAt && edge.lessons > 0);

function isStudent(world: WorldState,actor: Cultivator | undefined,row: Pick<ApprenticeCohort,'mentorId'|'siteId'|'sectId'|'openedTick'>,
  text: Technique | undefined,tick: number): actor is Cultivator {
  return live(actor) && !!text && actor.sectId === row.sectId && masteryValid(actor.techniqueMastery) &&
    studiesLineage(world,actor,row.mentorId,text,row.openedTick) && physicallyPresent(world,actor,row.siteId,tick);
}

function exactIds(supplied: string[] | undefined,expected: string[] | undefined) {
  return supplied === undefined || expected === undefined ? supplied === expected :
    Array.isArray(supplied) && supplied.length === expected.length && expected.every((id,index) => supplied[index] === id);
}

export function availableApprenticeCohortActions(actor: Cultivator,world: WorldState,
  executionTick = world.tick): ApprenticeCohortOption[] {
  if ((executionTick !== world.tick && executionTick !== world.tick+1) || !live(actor) || !world.cultivators.includes(actor)) return [];
  const state = world.apprenticeCohorts;
  const result: ApprenticeCohortOption[] = [];
  const append = (row: ApprenticeCohort,cohortMove: Exclude<ApprenticeCohortMove,'offer'>) =>
    result.push({action:'APPRENTICE_COHORT',cohortMove,targetCohortId:row.id});
  let current = false;
  for (const row of state.cohorts) {
    const educator = row.mentorId === actor.id;
    const seat = signedSeat(row,actor.id);
    if (!educator && !seat) continue;
    if (row.status === 'held' && seat && participated(seat) && executionTick > row.lessonTick &&
      !state.graduations.some(proof => proof.studentId === actor.id && proof.techniqueId === row.techniqueId)) {
      append(row,'leave');
    }
    if (row.status !== 'offered' || row.openedTick > executionTick || row.lessonTick < executionTick) continue;
    if (!educator && (!seat || seat.status === 'left' || seat.status === 'missed')) continue;
    current = true;
    const text = curriculum(world,row.techniqueId);
    const mentor = educator ? actor : actorAt(world,row.mentorId);
    if (educator) {
      append(row,'cancel');
      if (executionTick === row.lessonTick && row.teachingTick === undefined &&
        row.seats.some(item => item.status === 'accepted' && item.acceptedTick === row.openedTick+1) &&
        isMentor(world,mentor,row.sectId,row.siteId,text,executionTick) &&
        mentorshipBudgetRemaining(mentor,world,executionTick) > 0) append(row,'teach');
    } else if (seat) {
      append(row,'leave');
      if (!isMentor(world,mentor,row.sectId,row.siteId,text,executionTick) ||
        !isStudent(world,actor,row,text,executionTick)) continue;
      if (executionTick === row.openedTick+1 && seat.status === 'invited') append(row,'accept');
      if (executionTick === row.lessonTick && seat.status === 'accepted' && seat.acceptedTick === row.openedTick+1 &&
        seat.readyTick === undefined) append(row,'attend');
    }
  }
  if (current || actor.techniqueMastery < COHORT_MENTOR_MASTERY) return result;
  const text = curriculum(world,actor.technique.id);
  if (!isMentor(world,actor,actor.sectId,actor.locationId,text,executionTick) || !text?.id) return result;

  const blocked = new Set<string>();
  for (const row of state.cohorts) {
    if (row.status === 'offered' && row.openedTick <= executionTick && row.lessonTick >= executionTick) {
      blocked.add(row.mentorId);
      row.seats.filter(seat => seat.status === 'invited' || seat.status === 'accepted').forEach(seat => blocked.add(seat.studentId));
    }
    if (row.techniqueId === text.id && row.status === 'held') {
      row.seats.filter(participated).forEach(seat => blocked.add(seat.studentId));
    }
  }
  for (const proof of state.graduations) if (proof.techniqueId === text.id) blocked.add(proof.studentId);
  const row = {mentorId:actor.id,siteId:actor.locationId,sectId:actor.sectId,openedTick:executionTick};
  const descendants = world.mentorship.lineage.filter(edge => edge.mentorId === actor.id &&
    edge.formedTick <= executionTick && edge.lessons > 0 && !blocked.has(edge.studentId) && sameText(edge.technique,text));
  if (descendants.length < COHORT_MIN_INVITEES) return result;
  const ids = new Set(descendants.map(edge => edge.studentId));
  const inviteeIds = world.cultivators.filter(candidate => ids.has(candidate.id) &&
    isStudent(world,candidate,row,text,executionTick)).map(candidate => candidate.id).sort().slice(0,COHORT_MAX_INVITEES);
  if (inviteeIds.length >= COHORT_MIN_INVITEES) result.push({action:'APPRENTICE_COHORT',cohortMove:'offer',cohortInviteeIds:inviteeIds,targetTechniqueId:text.id});
  return result;
}

function event(world: WorldState,row: ApprenticeCohort,token: string,title: string,description: string,studentId?: string): WorldEvent {
  return {
    id:`evt-${row.id}-${world.tick}-${token}`,tick:world.tick,year:world.year,month:world.month,category:'breakthrough',
    title,description,actorIds:studentId ? [row.mentorId,studentId] : [row.mentorId],
    witnessScope:'participants',
    ...(world.locations.some(site => site.id === row.siteId) ? {locationId:row.siteId} : {}),
  };
}

function close(row: ApprenticeCohort,tick: number,status: 'cancelled'|'expired',reason: NonNullable<ApprenticeCohort['reason']>) {
  row.status = status;
  row.closedTick = tick;
  row.reason = reason;
  for (const seat of row.seats) if (seat.status === 'invited' || seat.status === 'accepted') seat.status = 'missed';
}

export function resolveApprenticeCohortAction(world: WorldState,actor: Cultivator,payload: LLMDecisionPayload): WorldEvent | null {
  if (payload.chosenAction !== 'APPRENTICE_COHORT' || payload.targetCultivatorId !== undefined ||
    payload.targetLocationId !== undefined) return null;
  const choice = availableApprenticeCohortActions(actor,world).find(option =>
    option.cohortMove === payload.cohortMove && option.targetCohortId === payload.targetCohortId && option.targetTechniqueId === payload.targetTechniqueId &&
    exactIds(payload.cohortInviteeIds,option.cohortInviteeIds));
  if (!choice) return null;
  const state = world.apprenticeCohorts;
  if (choice.cohortMove === 'offer') {
    const row: ApprenticeCohort = {id:`apprentice-cohort-${state.nextId++}`,mentorId:actor.id,sectId:actor.sectId,
      siteId:actor.locationId,techniqueId:choice.targetTechniqueId,openedTick:world.tick,lessonTick:world.tick+COHORT_LESSON_DELAY,
      status:'offered',seats:choice.cohortInviteeIds.map(studentId => ({studentId,status:'invited'}))};
    state.cohorts.push(row);
    return event(world,row,'offer','发出合班授业邀约','候学徒逐一应允。眼下未授课，未扣教学额度。');
  }
  const row = state.cohorts.find(item => item.id === choice.targetCohortId)!;
  if (choice.cohortMove === 'cancel') {
    close(row,world.tick,'cancelled','mentor_cancelled');
    return event(world,row,'cancel','师长撤回本期授业','未结算授课，不扣教学额度，也不增加熟练。');
  }
  if (choice.cohortMove === 'teach') {
    row.teachingTick = world.tick;
    return event(world,row,'teach','师长确认本期授课','还须核验当轮实际到课，方可结算。');
  }
  const seat = signedSeat(row,actor.id)!;
  if (choice.cohortMove === 'leave') {
    seat.leftTick = world.tick;
    if (seat.status !== 'attended') seat.status = 'left';
    return event(world,row,`leave-${actor.id}`,'学徒退出本期合班','保留既有师承与已经发生的到课记录；不能再据此合班出师。',actor.id);
  }
  if (choice.cohortMove === 'accept') {
    seat.status = 'accepted';
    seat.acceptedTick = world.tick;
    return event(world,row,`accept-${actor.id}`,'学徒应允本期合班','只登记应允；尚无到课或熟练增加。',actor.id);
  }
  seat.readyTick = world.tick;
  return event(world,row,`attend-${actor.id}`,'学徒登记当轮到课','尚待同处与授课核验。',actor.id);
}

function compactCohorts(world: WorldState) {
  const state = world.apprenticeCohorts;
  if (state.cohorts.length <= HISTORY_LIMIT) return;
  const pinned = new Set(state.graduations.map(proof => proof.cohortId));
  const graduated = new Set(state.graduations.map(proof => graduationKey(proof.studentId,proof.techniqueId)));
  const living = new Set(world.cultivators.filter(live).map(actor => actor.id));
  const kept = (row: ApprenticeCohort) => row.status === 'offered' || pinned.has(row.id) ||
    row.status === 'held' && row.seats.some(seat => participated(seat) && living.has(seat.studentId) &&
      !graduated.has(graduationKey(seat.studentId,row.techniqueId)));
  const recent = new Set(state.cohorts.filter(row => !kept(row)).slice(-HISTORY_LIMIT).map(row => row.id));
  state.cohorts = state.cohorts.filter(row => kept(row) || recent.has(row.id));
}

export function advanceApprenticeCohorts(world: WorldState): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const row of world.apprenticeCohorts.cohorts) {
    if (row.status !== 'offered' || world.tick < row.lessonTick) continue;
    const text = curriculum(world,row.techniqueId);
    const mentor = actorAt(world,row.mentorId);
    const attendees: Array<{seat: ApprenticeCohortSeat;actor: Cultivator}> = [];
    if (world.tick === row.lessonTick && text) for (const seat of row.seats) {
      if (seat.status !== 'accepted' || seat.acceptedTick !== row.openedTick+1 || seat.readyTick !== world.tick) continue;
      const actor = actorAt(world,seat.studentId);
      if (isStudent(world,actor,row,text,world.tick)) attendees.push({seat,actor});
    }
    let reason: ApprenticeCohort['reason'];
    if (world.tick !== row.lessonTick || row.teachingTick !== world.tick) reason = 'missed_lesson';
    else if (!isMentor(world,mentor,row.sectId,row.siteId,text,world.tick)) reason = 'mentor_unavailable';
    else if (!attendees.length) reason = 'no_confirmed_attendance';
    else if (!spendMentorshipBudget(world,mentor)) reason = 'no_budget';
    if (reason) {
      close(row,world.tick,'expired',reason);
      events.push(event(world,row,'expired','本期合班未结算','未结成真实授课，不扣教学额度，也不增加熟练。'));
      continue;
    }
    row.status = 'held';
    row.closedTick = world.tick;
    row.instructionSpent = 1;
    for (const {seat,actor} of attendees) {
      const before = actor.techniqueMastery;
      actor.techniqueMastery = Math.min(100,before+COHORT_MASTERY_GAIN);
      seat.status = 'attended';
      seat.attendedTick = world.tick;
      seat.masteryGained = actor.techniqueMastery-before;
      events.push(event(world,row,`held-${actor.id}`,'核实本期合班到课',`现场授课已结算，本人增加 ${seat.masteryGained} 点熟练；出师另凭独立实修。`,actor.id));
    }
    for (const seat of row.seats) if (seat.status === 'invited' || seat.status === 'accepted') seat.status = 'missed';
    events.push(event(world,row,'held','本期合班授课已结算','本期核实实际到课，已用一份共用教学额度。'));
  }
  compactCohorts(world);
  return events;
}

/** Called only after the genuine CULTIVATE mutation; attendance itself is never practice proof. */
export function recordCohortPractice(world: WorldState,actor: Cultivator,beforeMastery: number): WorldEvent | null {
  const after = actor.techniqueMastery;
  if (!live(actor) || actor.currentAction !== 'CULTIVATE' || !world.cultivators.includes(actor) ||
    !masteryValid(beforeMastery) || !masteryValid(after) || after < COHORT_GRADUATION_MASTERY ||
    after <= beforeMastery || after > beforeMastery+3) return null;
  const state = world.apprenticeCohorts;
  if (!state.cohorts.length || !actor.technique.id) return null;
  const text = curriculum(world,actor.technique.id);
  if (!text || state.graduations.some(proof => proof.studentId === actor.id && proof.techniqueId === text.id)) return null;
  const row = state.cohorts.find(cohort => {
    if (cohort.status !== 'held' || cohort.instructionSpent !== 1 || cohort.techniqueId !== text.id ||
      cohort.sectId !== actor.sectId || cohort.lessonTick >= world.tick) return false;
    const seat = signedSeat(cohort,actor.id);
    return !!seat && participated(seat) && seat.attendedTick === cohort.lessonTick &&
      studiesLineage(world,actor,cohort.mentorId,text,cohort.openedTick);
  });
  if (!row) return null;
  state.graduations.push({cohortId:row.id,studentId:actor.id,mentorId:row.mentorId,
    techniqueId:row.techniqueId,tick:world.tick,masteryBefore:beforeMastery,masteryAfter:after});
  return event(world,row,`graduate-${actor.id}`,'独立实修，核定出师',`据先前核实到课与随后独立实修，已核定熟练由 ${beforeMastery} 增至 ${after}；同一人同一功法只出师一次。`,actor.id);
}

export function visibleApprenticeCohorts(world: WorldState,viewer?: Cultivator): ApprenticeCohortView {
  if (!viewer || !world.cultivators.includes(viewer)) return {cohorts:[],graduations:[]};
  return {
    cohorts:world.apprenticeCohorts.cohorts.flatMap(row => {
      const seats = row.mentorId === viewer.id ? row.seats : row.seats.filter(seat => seat.studentId === viewer.id);
      return seats.length ? [{...row,seats:seats.map(seat => ({...seat}))}] : [];
    }),
    graduations:world.apprenticeCohorts.graduations.filter(proof => proof.mentorId === viewer.id ||
      proof.studentId === viewer.id).map(proof => ({...proof})),
  };
}
