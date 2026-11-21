import type { Artifact, ToolLoan, WorkshopOrder, WorldState } from '../types/world';
import { ARTIFACT_RULES } from './artifactEngine';
import { proveWorkshopArtifactOrigin } from './artifactSalvageEngine';
import { TOOL_LOAN_OFFER_TICKS, TOOL_LOAN_QUALITY_BONUS, TOOL_LOAN_USE_TICKS, TOOL_LOAN_WEAR } from './toolLoanEngine';

const sameOrigin = (a: ToolLoan['origin'], b: ToolLoan['origin']) =>
  a.orderId === b.orderId && a.piece === b.piece && a.makerId === b.makerId &&
  a.siteId === b.siteId && a.blankTick === b.blankTick && a.finishedTick === b.finishedTick;

function deadlineAt(job: WorkshopOrder, tick: number): number {
  return job.capacityAmendment && job.capacityAmendment.acceptedTick <= tick
    ? job.capacityAmendment.workUntilTick : job.deadlineTick ?? 0;
}

export function validateToolLoanHistory(
  world: WorldState, artifacts: readonly Artifact[], actorIds: ReadonlySet<string>, fail: (path: string) => never,
): void {
  if (world.toolLoans.loans.length === 0) {
    if (world.workshops.orders.some((job) => job.work.some(({ toolUse }) => toolUse !== undefined)))
      fail('toolLoans.loans.nativeWork');
    return;
  }
  const orders = new Map(world.workshops.orders.map((job) => [job.id, job]));
  const people = new Map(world.cultivators.map((actor) => [actor.id, actor]));
  const retired = new Set(world.artifactSalvages.receipts.map(({ artifactId }) => artifactId));
  const custodyCount = new Map<string, number>();
  for (const item of artifacts) if (item.id) custodyCount.set(item.id, (custodyCount.get(item.id) ?? 0) + 1);
  const ids = new Set<string>(), occupiedItems = new Set<string>(), occupiedJobs = new Set<string>();
  const custodyTerms = new Map<string, { start: number; end: number }[]>();
  const workedJobs = new Set<string>(), verifiedWork = new Set<string>();
  const baseDurability = ARTIFACT_RULES.法器.durability;
  for (const loan of world.toolLoans.loans) {
    const { id, artifactId, lenderId, borrowerId, offeredTick, expiresTick, acceptedTick, useUntilTick, status,
      closedTick, custody, release, wear, initialDurability, maxDurability } = loan;
    const serial = Number(/^tool-loan-([1-9]\d*)$/.exec(id)?.[1]);
    const job = orders.get(loan.workshopId);
    const held = status === 'active' || status === 'awaiting_recovery';
    const accepted = held || status === 'returned' || status === 'probate';
    const closed = !held && status !== 'offered';
    if (!Number.isSafeInteger(serial) || serial >= world.toolLoans.nextId || ids.has(id) ||
        !actorIds.has(lenderId) || !actorIds.has(borrowerId) || lenderId === borrowerId ||
        !job || job.patronId !== lenderId || job.makerId !== borrowerId || job.siteId !== loan.siteId ||
        job.acceptedTick === undefined || job.acceptedTick >= offeredTick ||
        (job.settledTick !== undefined && job.settledTick < offeredTick) || offeredTick + 2 >= deadlineAt(job, offeredTick) ||
        offeredTick > world.tick || expiresTick !== offeredTick + TOOL_LOAN_OFFER_TICKS ||
        loan.origin.finishedTick >= offeredTick || !proveWorkshopArtifactOrigin(world, { id: artifactId, tier: '法器', workshopOrigin: loan.origin }) ||
        ![baseDurability, Math.ceil(baseDurability * 1.2)].includes(maxDurability) ||
        !Number.isSafeInteger(initialDurability) || initialDurability < TOOL_LOAN_WEAR || initialDurability > maxDurability)
      return fail('toolLoans.loans.source');
    ids.add(id);
    if (held !== !!custody || accepted !== (acceptedTick !== undefined) || accepted !== (useUntilTick !== undefined) ||
        closed !== (closedTick !== undefined) || closedTick !== undefined && (closedTick < offeredTick || closedTick > world.tick) ||
        (status === 'offered' && world.tick >= expiresTick) ||
        (status === 'expired' && closedTick !== expiresTick) ||
        (status === 'declined' && (closedTick! <= offeredTick || closedTick! >= expiresTick)) ||
        (status === 'withdrawn' && closedTick! >= expiresTick))
      return fail('toolLoans.loans.lifecycle');
    if (status === 'offered' || held) {
      if (occupiedItems.has(artifactId) || occupiedJobs.has(job.id)) return fail('toolLoans.loans.concurrent');
      occupiedItems.add(artifactId);
      occupiedJobs.add(job.id);
    }
    if (!accepted) {
      if (wear || release) return fail('toolLoans.loans.unaccepted');
      continue;
    }
    if (acceptedTick! <= offeredTick || acceptedTick! >= expiresTick || acceptedTick! > world.tick ||
        (useUntilTick !== Math.min(acceptedTick! + TOOL_LOAN_USE_TICKS, deadlineAt(job, acceptedTick!)) &&
          !(job.capacityAmendment?.acceptedTick === acceptedTick &&
            useUntilTick === Math.min(acceptedTick! + TOOL_LOAN_USE_TICKS, job.deadlineTick ?? 0))) ||
        acceptedTick! + 1 >= useUntilTick || (job.settledTick !== undefined && job.settledTick < acceptedTick!) ||
        (status === 'active' && (job.status !== 'active' || world.tick >= useUntilTick ||
          !people.get(lenderId)?.alive || !people.get(borrowerId)?.alive)))
      return fail('toolLoans.loans.terms');
    const terms = custodyTerms.get(artifactId) ?? [];
    terms.push({ start: acceptedTick!, end: closedTick ?? Infinity });
    custodyTerms.set(artifactId, terms);
    if (custody && (custody.id !== artifactId || custody.name !== loan.artifactName || custody.tier !== '法器' ||
        custody.boundTo !== undefined || custody.soul !== undefined || custody.relicSetId !== undefined ||
        custody.relicFragmentIds !== undefined || (custody.resonance !== undefined && custody.resonance !== 0) ||
        custody.maxDurability !== maxDurability || custody.durability !== (wear?.durabilityAfter ?? initialDurability) ||
        custodyCount.get(artifactId) !== 1 || retired.has(artifactId) ||
        !custody.workshopOrigin || !sameOrigin(custody.workshopOrigin, loan.origin)))
      return fail('toolLoans.loans.custody');
    if ((status === 'awaiting_recovery' || status === 'returned') && !release || status === 'active' && release ||
        release && (release.tick < acceptedTick! || release.tick > world.tick ||
          (wear !== undefined && release.tick < wear.tick) ||
          (release.reason === 'borrower_released' && (release.tick <= acceptedTick! || release.tick >= useUntilTick)) ||
          (release.reason === 'term_expired' && release.tick !== useUntilTick) ||
          (release.reason === 'borrower_died' && people.get(borrowerId)?.alive !== false) ||
          (release.reason === 'workshop_closed' && (job.settledTick === undefined || job.settledTick > release.tick))) ||
        status === 'returned' && closedTick! <= release!.tick ||
        status === 'probate' && (people.get(lenderId)?.alive !== false || closedTick! < acceptedTick! ||
          (release !== undefined && closedTick! < release.tick) || (wear !== undefined && closedTick! < wear.tick)))
      return fail('toolLoans.loans.release');
    if (wear) {
      const native = job.work[(wear.piece - 1) * 2 + 1];
      if (workedJobs.has(job.id) || wear.tick <= acceptedTick! || wear.tick >= useUntilTick || wear.tick > world.tick ||
          wear.workshopId !== job.id || wear.stage !== 'finish' || wear.durabilityBefore !== initialDurability ||
          wear.durabilityAfter !== initialDurability - TOOL_LOAN_WEAR || wear.scoreBonus !== TOOL_LOAN_QUALITY_BONUS ||
          !native || native.tick !== wear.tick || native.piece !== wear.piece || native.stage !== 'finish' ||
          native.toolUse?.loanId !== id || native.toolUse.scoreBonus !== wear.scoreBonus ||
          native.qualityScore !== Math.min(100, native.toolUse.baseScore + wear.scoreBonus))
        return fail('toolLoans.loans.wear');
      workedJobs.add(job.id);
      verifiedWork.add(id);
    }
  }
  for (const terms of custodyTerms.values()) {
    terms.sort((a, b) => a.start - b.start);
    if (terms.some(({ start }, index) => index > 0 && terms[index - 1].end >= start))
      return fail('toolLoans.loans.concurrent');
  }
  for (const job of orders.values()) for (const native of job.work) {
    if (native.toolUse && !verifiedWork.delete(native.toolUse.loanId)) return fail('toolLoans.loans.nativeWork');
  }
  if (verifiedWork.size > 0) fail('toolLoans.loans.nativeWork');
}
