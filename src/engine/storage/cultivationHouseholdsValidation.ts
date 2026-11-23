import { validateMortalAgeCohorts } from '../storageMortalAgeCohorts';
import { SEASON_REVIEW_CASE_LIMIT, SEASON_REVIEW_WINDOW, seasonReviewProofId } from '../seasonReviewEngine';
import { RELIC_EXHIBIT_DURATION, RELIC_EXHIBIT_OFFER_TICKS } from '../relicExhibitEngine';
import { validateArtifactSalvageHistory } from '../storageSalvageValidation';
import { validateVillageEvolutionHistory } from '../storageVillageEvolutionValidation';
import { validateDoctrineFoundingHistory } from '../storageDoctrineFoundingValidation';
import { validateDoctrineMaturityHistory } from '../storageDoctrineMaturityValidation';
import { validateToolLoanHistory } from '../storageToolLoanValidation';
import { VILLAGE_WORK_ADULTS_PER_LABOR, VILLAGE_WORK_RULES } from '../villageWorksEngine';
import { HOUSEHOLD_GUARDIAN_OFFER_TICKS, initializeHouseholds } from '../householdEngine';
import { researchTechniqueId, RESEARCH_DEPOSIT, RESEARCH_PROJECT_TICKS, RESEARCH_REQUIRED_RESEARCHERS, RESEARCH_REQUIRED_TURNS, RESEARCH_WORK_COST } from '../researchEngine';
import { COMPETITION_RULES, publicCompetitionStandings } from '../competitionEngine';
import { SETTLEMENT_RELIEF } from '../settlementEngine';
import type { WorldState } from '../../types/world';
import { fail } from './primitives';
import { unique } from './semanticShared';

export function validateCultivationHouseholds(
  w: WorldState,
  actor: ReadonlySet<string>,
  sector: ReadonlySet<string>,
  locations: ReadonlySet<string>,
  villagers: ReadonlySet<string>,
  value: unknown,
): { settlementIds: ReadonlySet<string>; volunteerIds: ReadonlySet<string> } {
  const { seasons, entries: competitionEntries, scores: competitionScores, honors: competitionHonors } = w.competitions;
  unique(w.competitions.optOutActorIds, (id) => id, 'competitions.optout.id');
  if (w.competitions.optOutActorIds.some((id) => !actor.has(id))) fail('competitions.optout.references');
  unique(seasons, ({ id }) => id, 'competitions.seasons.id');
  unique(seasons, ({ year }) => String(year), 'competitions.seasons.year');
  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const entryKey = ({ seasonId, actorId }: { seasonId: string; actorId: string }) => JSON.stringify([seasonId, actorId]);
  unique(competitionEntries, entryKey, 'competitions.entries.identity');
  unique(competitionScores, ({ id }) => id, 'competitions.scores.id');
  unique(competitionScores, ({ seasonId, actorId, sourceId, rule }) => JSON.stringify([seasonId, actorId, sourceId, rule]), 'competitions.scores.source');
  unique(competitionHonors, ({ id }) => id, 'competitions.honors.id');
  unique(competitionHonors, ({ seasonId }) => seasonId, 'competitions.honors.season');
  if (seasons.filter(({ status }) => status === 'open').length !== 1) fail('competitions.seasons.active');
  for (const season of seasons) if (season.openedTick > w.tick ||
      ((season.status === 'settled') !== (season.closedTick !== undefined)) ||
      (season.closedTick !== undefined && (season.closedTick < season.openedTick || season.closedTick > w.tick))) {
    fail('competitions.seasons.references');
  }
  const entryByIdentity = new Map(competitionEntries.map((entry) => [entryKey(entry), entry]));
  for (const entry of competitionEntries) {
    const season = seasonById.get(entry.seasonId);
    if (!season || !actor.has(entry.actorId) || entry.joinedTick < season.openedTick || entry.joinedTick > w.tick ||
        (season.closedTick !== undefined && entry.joinedTick >= season.closedTick) ||
        (entry.withdrawnTick !== undefined && (entry.withdrawnTick < entry.joinedTick || entry.withdrawnTick > w.tick ||
          (season.closedTick !== undefined && entry.withdrawnTick >= season.closedTick)))) fail('competitions.entries.references');
  }
  for (const row of competitionScores) {
    const entry = entryByIdentity.get(entryKey(row));
    const season = seasonById.get(row.seasonId);
    if (!entry || !season || row.tick <= entry.joinedTick || row.tick > w.tick ||
        (entry.withdrawnTick !== undefined && row.tick > entry.withdrawnTick) ||
        (season.closedTick !== undefined && row.tick >= season.closedTick) ||
        row.points !== COMPETITION_RULES[row.rule].points) fail('competitions.scores.references');
  }
  for (const honor of competitionHonors) {
    const season = seasonById.get(honor.seasonId);
    if (!actor.has(honor.actorId) || honor.awardedTick > w.tick ||
        (season && (season.status !== 'settled' || honor.awardedTick !== season.closedTick))) fail('competitions.honors.references');
  }
  unique(w.competitionReviews.proofs, ({ id }) => id, 'competitionReviews.proofs.id');
  unique(w.competitionReviews.proofs, ({ seasonId, sourceId, rule }) => JSON.stringify([seasonId, sourceId, rule]), 'competitionReviews.proofs.source');
  unique(w.competitionReviews.cases, ({ scoreId }) => scoreId, 'competitionReviews.cases.score');
  unique(w.competitionReviews.corrections, ({ scoreId }) => scoreId, 'competitionReviews.corrections.score');
  unique(w.competitionReviews.honorChanges, ({ seasonId }) => seasonId, 'competitionReviews.honorChanges.season');
  const reviewProofs = new Map(w.competitionReviews.proofs.map((proof) => [proof.id, proof]));
  const scoreById = new Map(competitionScores.map((row) => [row.id, row]));
  const reviewCases = new Map(w.competitionReviews.cases.map((row) => [row.scoreId, row]));
  const originalHonors = new Map(competitionHonors.map((row) => [row.id, row]));
  const reviewCorrections = new Set(w.competitionReviews.corrections.map(({ scoreId }) => scoreId));
  const retainedRelief = new Map(w.settlements.records.map((row) => [row.id, row]));
  const retainedTournaments = new Map(w.occasions.map((row) => [row.id, row]));
  const stageCounts = new Map<string, number>();
  const pinnedWinners = new Set(w.competitionReviews.corrections.filter(({ newActorId }) => !!newActorId).map(({ proofId }) => proofId));
  if (pinnedWinners.size !== w.competitionReviews.corrections.filter(({ newActorId }) => !!newActorId).length)
    fail('competitionReviews.corrections.oneAward');
  for (const proof of w.competitionReviews.proofs) {
    const current = seasons.find(({ id }) => id === proof.seasonId);
    if (!current || proof.tick < current.openedTick || proof.tick >= (current.closedTick ?? Infinity) || proof.tick > w.tick ||
        !actor.has(proof.actorId) || !locations.has(proof.locationId) || proof.id !== seasonReviewProofId(proof.rule, proof.sourceId, proof.seasonId)) fail('competitionReviews.proofs.references');
    if (proof.rule === 'public_relief') {
      const historic = retainedRelief.get(proof.sourceId);
      if (!proof.settlementId || proof.stones !== SETTLEMENT_RELIEF.stones || proof.herbs !== SETTLEMENT_RELIEF.jade_leaf ||
          'occasionId' in proof || 'championRound' in proof || 'competitiveWinRound' in proof || 'opponentId' in proof ||
          !villagers.has(proof.settlementId) ||
          w.settlements.villages.find(({ id }) => id === proof.settlementId)?.locationId !== proof.locationId ||
          (historic && (historic.kind !== 'relief' || historic.settlementId !== proof.settlementId ||
            historic.stones !== proof.stones || historic.herbs !== proof.herbs || historic.actorId !== proof.actorId || historic.tick !== proof.tick)))
        fail('competitionReviews.proofs.relief');
    } else {
      const actual = retainedTournaments.get(proof.occasionId);
      if (!proof.occasionId || proof.sourceId !== `${proof.occasionId}:champion` || !proof.opponentId ||
          !actor.has(proof.opponentId) || proof.opponentId === proof.actorId ||
          proof.championRound < 1 || proof.competitiveWinRound < 1 || proof.competitiveWinRound > proof.championRound ||
          'settlementId' in proof || 'stones' in proof || 'herbs' in proof ||
          (actual && (actual.kind !== 'tournament' || actual.status !== 'completed' || actual.lastResolvedTick !== proof.tick ||
            actual.championId !== proof.actorId || actual.locationId !== proof.locationId || actual.round !== proof.championRound ||
            !actual.bouts.some(({ winnerId, firstId, secondId, round }) => winnerId === proof.actorId &&
              round === proof.competitiveWinRound && [firstId, secondId].includes(proof.opponentId) &&
              [firstId, secondId].includes(proof.actorId))))) fail('competitionReviews.proofs.tournament');
    }
  }
  for (const row of w.competitionReviews.cases) {
    const season = seasons.find(({ id }) => id === row.seasonId);
    const score = scoreById.get(row.scoreId);
    const proof = reviewProofs.get(row.proofId);
    const separate = (stageCounts.get(row.seasonId) ?? 0) + 1;
    stageCounts.set(row.seasonId, separate);
    if (!season || season.closedTick === undefined || separate > SEASON_REVIEW_CASE_LIMIT ||
        !score || !proof || score.seasonId !== row.seasonId || proof.seasonId !== row.seasonId ||
        score.sourceId !== proof.sourceId || score.rule !== proof.rule || row.id !== `review-${row.scoreId}` ||
        !competitionEntries.some((entry) => entry.seasonId === row.seasonId && entry.actorId === row.applicantId && entry.withdrawnTick === undefined) ||
        row.openedTick < season.closedTick || row.openedTick >= season.closedTick + SEASON_REVIEW_WINDOW || row.openedTick > w.tick ||
        (row.status === 'pending' ? row.closedTick !== undefined :
          row.closedTick === undefined || row.closedTick < season.closedTick + SEASON_REVIEW_WINDOW || row.closedTick > w.tick) ||
        (row.status === 'corrected') !== reviewCorrections.has(row.scoreId)) fail('competitionReviews.cases.references');
  }
  for (const correction of w.competitionReviews.corrections) {
    const original = scoreById.get(correction.scoreId);
    const proof = reviewProofs.get(correction.proofId);
    const review = reviewCases.get(correction.scoreId);
    if (!original || !proof || !review || review.proofId !== proof.id || review.closedTick !== correction.tick ||
        original.actorId !== correction.previousActorId || original.seasonId !== correction.seasonId || original.points !== correction.points ||
        (correction.reason === 'wrong_recipient' ? correction.newActorId !== proof.actorId || correction.newActorId === original.actorId ||
          !competitionEntries.some((entry) => entry.seasonId === correction.seasonId && entry.actorId === correction.newActorId &&
            entry.joinedTick < proof.tick && (entry.withdrawnTick === undefined || entry.withdrawnTick > proof.tick)) :
          correction.newActorId !== undefined)) fail('competitionReviews.corrections.references');
  }
  for (const adjustment of w.competitionReviews.honorChanges) {
    const original = originalHonors.get(adjustment.originalHonorId);
    const stillKnown = seasons.some(({ id }) => id === adjustment.seasonId);
    const expected = stillKnown ? publicCompetitionStandings(w, adjustment.seasonId).find(({ rank }) => rank === 1) : undefined;
    if (!original || original.seasonId !== adjustment.seasonId || original.actorId !== adjustment.previousActorId ||
        adjustment.tick < original.awardedTick + SEASON_REVIEW_WINDOW || adjustment.tick > w.tick ||
        (adjustment.newActorId ? !actor.has(adjustment.newActorId) || adjustment.score === undefined || adjustment.score <= 0
          : adjustment.score !== undefined) ||
        (stillKnown && (expected?.actorId !== adjustment.newActorId || expected?.score !== adjustment.score ||
          !w.competitionReviews.corrections.some(({ seasonId, tick }) =>
            seasonId === adjustment.seasonId && tick === adjustment.tick)))) fail('competitionReviews.honorChanges.references');
  }

  unique(w.scriptures.originals, ({ id }) => id, 'scriptures.originals.id');
  unique(w.scriptures.editions, ({ id }) => id, 'scriptures.editions.id');
  unique(w.scriptures.editions.filter(({ kind }) => kind !== 'corrected'),
    ({ originalId, authorId }) => JSON.stringify([originalId, authorId]), 'scriptures.editions.annotator');
  unique(w.scriptures.editions.filter(({ kind }) => kind === 'corrected'),
    ({ parentEditionId }) => parentEditionId ?? '', 'scriptures.editions.correction');
  const originalById = new Map(w.scriptures.originals.map((original) => [original.id, original]));
  const editionById = new Map(w.scriptures.editions.map((edition) => [edition.id, edition]));
  for (const original of w.scriptures.originals) {
    if (original.id !== original.technique.id || original.firstSeenTick > w.tick ||
        (original.technique.createdTick !== undefined && original.technique.createdTick > original.firstSeenTick) ||
        (original.technique.authorId && !actor.has(original.technique.authorId)) ||
        (original.sourceSectId && !sector.has(original.sourceSectId))) fail('scriptures.originals.references');
  }
  for (const edition of w.scriptures.editions) {
    const original = originalById.get(edition.originalId);
    const parent = edition.parentEditionId ? editionById.get(edition.parentEditionId) : undefined;
    if (!original || !actor.has(edition.authorId) || edition.createdTick > w.tick || edition.createdTick < original.firstSeenTick ||
        (edition.kind === 'corrected' && (!parent || parent.id === edition.id || parent.originalId !== original.id ||
          parent.kind !== 'misread' || parent.createdTick > edition.createdTick || !edition.evidence)) ||
        (edition.kind !== 'corrected' && (edition.parentEditionId !== undefined || edition.evidence !== undefined)) ||
        (edition.evidence && (edition.evidence.locationId !== edition.locationId ||
          (edition.evidence.kind === 'pavilion') !== (edition.evidence.sectId !== undefined))) ||
        (edition.evidence?.sectId && !sector.has(edition.evidence.sectId))) fail('scriptures.editions.references');
  }
  for (const person of w.cultivators) if (person.activeEdition) {
    const active = person.activeEdition;
    const edition = editionById.get(active.editionId);
    const original = originalById.get(active.originalId)?.technique;
    if (!edition || !original || active.originalId !== person.technique.id || edition.originalId !== active.originalId ||
        edition.kind !== active.kind || original.name !== person.technique.name || original.spiritRoot !== person.technique.spiritRoot ||
        original.authorId !== person.technique.authorId || original.createdTick !== person.technique.createdTick) {
      fail('scriptures.active.references');
    }
  }
  unique(w.research.projects, ({ id }) => id, 'research.projects.id');
  unique(w.research.projects.filter(({ status }) => status === 'open'), ({ sectId }) => sectId, 'research.projects.active');
  unique(w.research.projects.filter(({ status }) => status === 'completed'),
    ({ sectId, topic }) => JSON.stringify([sectId, topic]), 'research.projects.discovery');
  for (const project of w.research.projects) {
    unique(project.contributors, ({ actorId }) => actorId, 'research.projects.contributors');
    const serial = Number(project.id.match(/^research-([1-9][0-9]*)$/)?.[1]);
    const completed = project.status === 'completed';
    if (!Number.isSafeInteger(serial) || serial >= w.research.nextId || !sector.has(project.sectId) || !actor.has(project.proposerId) ||
        !locations.has(project.locationId) || project.startedTick > w.tick || project.deadlineTick !== project.startedTick + RESEARCH_PROJECT_TICKS ||
        (project.status === 'open') === (project.settledTick !== undefined) ||
        (project.settledTick !== undefined && (project.settledTick < project.startedTick || project.settledTick > w.tick)) ||
        completed !== (project.discoveryTechniqueId !== undefined) || completed !== (project.discoveryLocationId !== undefined) ||
        (completed && (project.discoveryTechniqueId !== researchTechniqueId(project.sectId, project.topic) ||
          !originalById.has(project.discoveryTechniqueId ?? '') || !locations.has(project.discoveryLocationId!) ||
          project.contributors.filter(({ workTurns }) => workTurns > 0).length < RESEARCH_REQUIRED_RESEARCHERS ||
          project.contributors.reduce((total, row) => total + row.workTurns, 0) < RESEARCH_REQUIRED_TURNS))) fail('research.projects.references');
    for (const row of project.contributors) {
      const held = project.status === 'open' && row.withdrawnTick === undefined;
      if (!actor.has(row.actorId) || row.joinedTick < project.startedTick || row.joinedTick >= project.deadlineTick || row.joinedTick > w.tick ||
          (row.workTurns > 0) !== (row.lastWorkedTick !== undefined) ||
          (row.lastWorkedTick !== undefined && (row.lastWorkedTick <= row.joinedTick || row.lastWorkedTick >= project.deadlineTick || row.lastWorkedTick > w.tick)) ||
          (row.withdrawnTick !== undefined) !== (row.withdrawReason !== undefined) ||
          (row.withdrawnTick !== undefined && (row.withdrawnTick < (row.lastWorkedTick ?? row.joinedTick) || row.withdrawnTick > w.tick))) {
        fail('research.projects.work');
      }
      if (row.spent.stones !== row.workTurns * RESEARCH_WORK_COST.stones || row.spent.earthRoots !== row.workTurns * RESEARCH_WORK_COST.earthRoots ||
          (held ? (row.escrow.stones + row.spent.stones !== RESEARCH_DEPOSIT.stones || row.escrow.earthRoots + row.spent.earthRoots !== RESEARCH_DEPOSIT.earthRoots)
            : (row.escrow.stones !== 0 || row.escrow.earthRoots !== 0))) fail('research.projects.escrow');
    }
  }
  const fragmentById = new Map(w.relics.fragments.map((fragment) => [fragment.id, fragment]));
  unique(w.relics.fragments, ({ id }) => id, 'relics.fragments.id');
  const estateIds = new Set(w.estates.entries.map(({ id }) => id));
  unique(w.relicExhibits.entries, ({ id }) => id, 'relicExhibits.entries.id');
  unique(w.relicExhibits.entries.filter(({ status }) => status !== 'closed'),
    ({ artifactId }) => artifactId, 'relicExhibits.entries.openArtifact');
  const displays = w.relicExhibits.entries.filter(({ status }) => status === 'on_display');
  unique(displays, ({ siteId }) => siteId, 'relicExhibits.entries.activeSite');
  for (const entry of w.relicExhibits.entries) {
    const serial = Number(entry.id.match(/^exhibit-([1-9][0-9]*)$/)?.[1]);
    const accepted = entry.acceptedTick, closed = entry.closedTick;
    if (!Number.isSafeInteger(serial) || serial >= w.relicExhibits.nextId ||
        !actor.has(entry.ownerId) || !actor.has(entry.hostLeaderId) || entry.ownerId === entry.hostLeaderId ||
        !sector.has(entry.hostSectId) || entry.offeredTick > w.tick ||
        entry.offerExpiresTick !== entry.offeredTick + RELIC_EXHIBIT_OFFER_TICKS ||
        (entry.status !== 'closed' && (closed !== undefined || entry.closeReason !== undefined || !locations.has(entry.siteId))) ||
        (entry.status === 'closed' && (closed === undefined || !entry.closeReason || closed > w.tick || closed < (accepted ?? entry.offeredTick))) ||
        (entry.status === 'offered' && accepted !== undefined) ||
        (accepted === undefined ? entry.expiresTick !== undefined :
          accepted < entry.offeredTick || accepted >= entry.offerExpiresTick || accepted > w.tick ||
          entry.expiresTick !== accepted + RELIC_EXHIBIT_DURATION) ||
        (entry.status === 'on_display' ? (accepted === undefined || !entry.custody || entry.custody.id !== entry.artifactId ||
          entry.custody.relicSetId !== entry.setId || (entry.custody.boundTo && entry.custody.boundTo !== entry.ownerId)) :
          entry.custody !== undefined) ||
        (entry.closeReason === 'offer_expired' && (accepted !== undefined || (closed ?? 0) < entry.offerExpiresTick)) ||
        (entry.closeReason === 'term_complete' && (accepted === undefined || (closed ?? 0) < (entry.expiresTick ?? Infinity))) ||
        ((entry.closeReason === 'declined' || entry.closeReason === 'withdrawn' || entry.closeReason === 'item_unavailable') && accepted !== undefined) ||
        ((entry.closeReason === 'recalled' || entry.closeReason === 'host_closed') && accepted === undefined)) fail('relicExhibits.entries.references');
  }
  const exhibitItems = displays.flatMap(({ custody }) => custody ? [custody] : []);
  const heldTools = w.toolLoans.loans.flatMap(({ custody })=>custody?[custody]:[]);
  const canonicalArtifacts = [...w.cultivators.flatMap((person) => person.artifacts),
    ...w.estates.entries.flatMap((estate) => estate.holdings.artifacts), ...exhibitItems, ...heldTools];
  validateToolLoanHistory(w,canonicalArtifacts,actor,fail);
  validateArtifactSalvageHistory(w, canonicalArtifacts, actor, fail);
  const displayIds = new Set(displays.map(({ artifactId }) => artifactId));
  unique(canonicalArtifacts.filter((item) => item.id && displayIds.has(item.id)), (item) => item.id!, 'relicExhibits.custody.unique');
  const relicArtifacts = new Set<string>();
  const usedFragments = new Set<string>();
  for (const item of canonicalArtifacts) {
    if (item.relicSetId === undefined && item.relicFragmentIds === undefined) continue;
    const [frame, core] = item.relicFragmentIds ?? [];
    if (!item.relicSetId || !item.id || !frame || !core || frame === core || relicArtifacts.has(item.id) ||
        usedFragments.has(frame) || usedFragments.has(core)) return fail('relics.artifact.references');
    for (const [fragmentId, slot] of [[frame, 'frame'], [core, 'core']] as const) {
      const fragment = fragmentById.get(fragmentId);
      if (!fragment || fragment.slot !== slot || fragment.setId !== item.relicSetId ||
          fragment.holder.kind !== 'consumed' || fragment.holder.id !== item.id) fail('relics.artifact.parts');
      usedFragments.add(fragmentId);
    }
    relicArtifacts.add(item.id);
  }
  const expeditionProofs = new Set<string>();
  for (const fragment of w.relics.fragments) {
    const { source, holder } = fragment;
    if (source.tick > w.tick ||
        (source.kind === 'wild_cache' && (!locations.has(source.locationId) || source.eventId !== undefined || source.occasionId !== undefined)) ||
        (holder.kind === 'site' && !locations.has(holder.id)) ||
        (holder.kind === 'actor' && !actor.has(holder.id)) ||
        (holder.kind === 'estate' && !estateIds.has(holder.id)) ||
        (holder.kind === 'consumed' && (!relicArtifacts.has(holder.id) || !usedFragments.has(fragment.id)))) fail('relics.fragments.references');
    if (source.kind === 'expedition') {
      if (!source.eventId || !source.occasionId || expeditionProofs.has(source.eventId)) return fail('relics.fragments.provenance');
      expeditionProofs.add(source.eventId);
    }
  }
  const doctrineSchoolById = new Map(w.doctrines.schools.map((school) => [school.id, school]));
  validateDoctrineFoundingHistory(w,actor,fail);
  validateDoctrineMaturityHistory(w,fail);
  unique(w.doctrines.schools, ({ id }) => id, 'doctrines.schools.id');
  unique(w.doctrines.schools, ({ parentSectId, theme }) => JSON.stringify([parentSectId, theme]), 'doctrines.schools.theme');
  unique(w.doctrines.endorsements, ({ actorId }) => actorId, 'doctrines.endorsements.actorId');
  unique(w.doctrines.proposals, ({ id }) => id, 'doctrines.proposals.id');
  unique(w.doctrines.proposals.filter(({ status }) => status === 'pending'), ({ schoolId }) => schoolId, 'doctrines.proposals.pending');
  unique(w.doctrines.records, ({ id }) => id, 'doctrines.records.id');
  const doctrineSequence = new Set<number>();
  for (const row of [...w.doctrines.proposals, ...w.doctrines.records]) {
    const prefix = 'votes' in row ? 'proposal' : 'record';
    const serial = Number(row.id.match(new RegExp(`^doctrine-${prefix}-([1-9][0-9]*)$`))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.doctrines.nextId || doctrineSequence.has(serial)) fail('doctrines.nextId');
    doctrineSequence.add(serial);
  }
  const doctrineMembers = new Set<string>();
  for (const school of w.doctrines.schools) {
    if (!sector.has(school.parentSectId) || !actor.has(school.founderId) ||
        (school.stewardId && (!actor.has(school.stewardId) || !school.memberIds.includes(school.stewardId))) || school.foundedTick > w.tick ||
        (school.lastChangeTick !== undefined && (school.lastChangeTick < school.foundedTick || school.lastChangeTick > w.tick)) ||
        (school.lastTrainingTick !== undefined && (school.lastTrainingTick < school.foundedTick || school.lastTrainingTick > w.tick)) ||
        (school.status !== 'autonomous' && (school.treasury !== 0 || school.memberIds.length !== 0))) fail('doctrines.schools.references');
    for (const member of school.memberIds) {
      if (!actor.has(member) || doctrineMembers.has(member)) fail('doctrines.schools.members');
      doctrineMembers.add(member);
    }
  }
  for (const row of w.doctrines.endorsements) {
    const school = doctrineSchoolById.get(row.schoolId);
    if (!actor.has(row.actorId) || !school || school.parentSectId !== row.sectId ||
        school.theme !== row.theme || row.tick < school.foundedTick || row.tick > w.tick) fail('doctrines.endorsements.references');
  }
  for (const row of w.doctrines.proposals) {
    const school = doctrineSchoolById.get(row.schoolId);
    unique(row.votes, ({ actorId }) => actorId, 'doctrines.proposals.vote');
    if (!school || row.openedTick < school.foundedTick || row.openedTick > w.tick || row.openedTick >= row.expiresTick ||
        !actor.has(row.stewardId) || !actor.has(row.leaderId) || row.stewardId === row.leaderId ||
        (row.status === 'pending') !== (row.settledTick === undefined) ||
        row.votes.length !== (row.status === 'accepted' || row.status === 'declined' ? 2 : 1) ||
        row.votes[0]?.verdict !== 'accept' ||
        (row.status === 'accepted' && row.votes[1]?.verdict !== 'accept') ||
        (row.status === 'declined' && row.votes[1]?.verdict !== 'decline') ||
        (row.settledTick !== undefined && (row.settledTick < row.openedTick || row.settledTick > w.tick)) ||
        row.votes.some((vote) => (vote.actorId !== row.stewardId && vote.actorId !== row.leaderId) ||
          vote.tick < row.openedTick || vote.tick > w.tick || vote.tick > row.expiresTick)) fail('doctrines.proposals.references');
  }
  for (const row of w.doctrines.records) if (!doctrineSchoolById.has(row.schoolId) || row.tick > w.tick ||
      row.actorIds.some((actorId) => !actor.has(actorId))) fail('doctrines.records.references');
  for (const village of w.settlements.villages) {
    // Older snapshots have the original numbered volunteers but no cohort metadata.
    if (village.nextVolunteerSequence === undefined) {
      const highest = village.volunteers.reduce((max, item) => {
        const ordinal = Number(item.id.match(/-vol-(\d+)$/)?.[1] ?? 0);
        return Number.isSafeInteger(ordinal) ? Math.max(max, ordinal) : max;
      }, 4);
      village.nextVolunteerSequence = highest + 1;
    }
    village.juvenileCohorts ??= [];
    if (village.juvenileCohorts.some(({ bornTick }) => bornTick > w.tick) ||
        village.juvenileCohorts.reduce((sum, group) => sum + group.count, 0) > village.population) fail('settlements.cohorts');
  }
  const settlementIds = unique(w.settlements.villages, ({id}) => id, 'settlements.villages.id');
  const volunteers = w.settlements.villages.flatMap((village) => village.volunteers);
  const volunteerIds = unique(volunteers, ({id}) => id, 'settlements.volunteers.id');
  unique(w.settlements.records, ({id}) => id, 'settlements.records.id');
  for (const village of w.settlements.villages) {
    if (!locations.has(village.locationId) || village.population > village.capacity ||
        village.volunteers.some((volunteer) => volunteer.enlistedCultivatorId &&
          (volunteer.enlistedCultivatorId !== `recruit-${volunteer.id}` || !actor.has(volunteer.enlistedCultivatorId)))) fail('settlements.villages.references');
  }
  // Explicit values from the same native recruitment are corroborating facts.
  // A missing value on either side is legacy/neutral and never backfilled here.
  const linkedGender=new Map(volunteers.flatMap(person=>person.enlistedCultivatorId&&person.gender!==undefined?
    [[person.enlistedCultivatorId,person.gender] as const]:[]));
  if(linkedGender.size&&w.cultivators.some(person=>person.gender!==undefined&&linkedGender.has(person.id)&&
      person.gender!==linkedGender.get(person.id)))fail('settlements.volunteers.genderLink');
  for (const row of w.settlements.records) {
    if (!settlementIds.has(row.settlementId) || (row.targetSettlementId && !settlementIds.has(row.targetSettlementId)) ||
        (row.actorId && !actor.has(row.actorId)) || (row.sectId && !sector.has(row.sectId)) ||
        (row.volunteerId && !volunteerIds.has(row.volunteerId)) || (row.cultivatorId && !actor.has(row.cultivatorId))) fail('settlements.records.references');
  }
  validateVillageEvolutionHistory(w,fail);
  validateMortalAgeCohorts(w,fail);
  unique(w.villageWorks.projects, ({ id }) => id, 'villageWorks.projects.id');
  unique(w.villageWorks.projects.filter(({ status }) => status === 'building'), ({ settlementId }) => settlementId,
    'villageWorks.projects.active_village');
  unique(w.villageWorks.projects.filter(({ status }) => status === 'completed'),
    ({ settlementId, kind }) => JSON.stringify([settlementId, kind]), 'villageWorks.projects.completed_kind');
  for (const project of w.villageWorks.projects) {
    const serial = Number(project.id.match(/^village-work-([1-9][0-9]*)$/)?.[1]);
    const rule = VILLAGE_WORK_RULES[project.kind];
    const complete = project.status === 'completed';
    const building = project.status === 'building';
    if (!Number.isSafeInteger(serial) || serial >= w.villageWorks.nextId || !sector.has(project.sponsorSectId) ||
        !actor.has(project.sponsorId) || project.startedTick > w.tick || project.deadlineTick !== project.startedTick + rule.ticks ||
        project.stonesSpent !== rule.stones || project.rootsSpent !== rule.roots ||
        (building !== (project.settledTick === undefined)) ||
        (building && (project.deadlineTick <= w.tick || !settlementIds.has(project.settlementId))) ||
        (project.settledTick !== undefined && (project.settledTick <= project.startedTick || project.settledTick > w.tick)) ||
        ((project.status === 'abandoned') !== (project.endReason !== undefined)) ||
        (project.endReason === 'deadline' && project.settledTick! < project.deadlineTick)) fail('villageWorks.projects.references');
    let total = 0, recent = project.startedTick;
    for (const row of project.receipts) {
      if (row.tick <= recent || row.tick >= project.deadlineTick || row.tick > (project.settledTick ?? w.tick) ||
          row.labor > Math.floor(row.adultsAvailable / VILLAGE_WORK_ADULTS_PER_LABOR)) fail('villageWorks.projects.labor_receipt');
      total += row.labor; recent = row.tick;
    }
    if (project.laborTotal !== total || total > rule.labor ||
        (project.receipts.at(-1)?.tick !== project.lastWorkedTick) ||
        (complete ? total !== rule.labor || project.settledTick !== project.lastWorkedTick : total >= rule.labor)) fail('villageWorks.projects.labor_total');
    if (complete ? project.capacityBefore === undefined || project.capacityAfter !== project.capacityBefore + rule.capacityGain :
        project.capacityBefore !== undefined || project.capacityAfter !== undefined) fail('villageWorks.projects.capacity');
  }
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'households')) initializeHouseholds(w);
  const groups = new Map(w.households.groups.map((row) => [row.id, row]));
  unique(w.households.groups, ({ id }) => id, 'households.groups.id');
  const residentCount = new Map<string, number>(), trackedAdults = new Map<string, number>();
  const canonicalCohorts = new Map<string, number>(), trackedCohorts = new Map<string, number>();
  const settlers = new Map(w.settlements.villages.map((row) => [row.id, row]));
  const actualPeople = new Map(w.cultivators.map((row) => [row.id, row]));
  const villageVolunteers = new Map(w.settlements.villages.flatMap((village) =>
    village.volunteers.map((person) => [person.id, { village, person }] as const)));
  for (const village of w.settlements.villages) for (const row of village.juvenileCohorts) {
    const key = JSON.stringify([village.id, row.bornTick]);
    canonicalCohorts.set(key, (canonicalCohorts.get(key) ?? 0) + row.count);
  }
  for (const group of w.households.groups) {
    if (!settlementIds.has(group.originSettlementId) || group.createdTick > w.tick ||
        group.id !== 'household-' + group.originSettlementId + '-' + group.branch ||
        !group.presences.some(({ settlementId }) => settlementId === group.originSettlementId)) fail('households.groups.references');
    unique(group.presences, ({ settlementId }) => settlementId, 'households.groups.presence');
    for (const row of group.presences) {
      if (!settlementIds.has(row.settlementId)) fail('households.presences.references');
      trackedAdults.set(row.settlementId, (trackedAdults.get(row.settlementId) ?? 0) + row.adults);
      unique(row.juvenileCohorts, ({ bornTick }) => String(bornTick), 'households.presences.cohort');
      for (const { bornTick, count } of row.juvenileCohorts) {
        const key = JSON.stringify([row.settlementId, bornTick]);
        const accounted = (trackedCohorts.get(key) ?? 0) + count;
        if (count < 1 || bornTick > w.tick || accounted > (canonicalCohorts.get(key) ?? 0)) fail('households.presences.cohort_budget');
        trackedCohorts.set(key, accounted);
      }
    }
  }
  unique(w.households.members, ({ volunteerId }) => volunteerId, 'households.members.volunteer');
  const recruitedMembers = new Map<string, typeof w.households.members[number]>();
  for (const row of w.households.members) {
    const group = groups.get(row.householdId);
    const actual = villageVolunteers.get(row.volunteerId);
    const recruit = row.recruitedId && actualPeople.get(row.recruitedId);
    const isRecruit = row.status === 'recruited' || row.status === 'deceased';
    if (!group?.presences.some(({ settlementId }) => settlementId === row.settlementId) ||
        row.registeredTick > w.tick || (row.status === 'resident') !== (row.settledTick === undefined) ||
        (row.settledTick !== undefined && (row.settledTick < row.registeredTick || row.settledTick > w.tick)) ||
        (isRecruit !== (row.recruitedId !== undefined)) ||
        (isRecruit && (!recruit || row.recruitedId !== 'recruit-' + row.volunteerId)) ||
        (row.status === 'resident' && (!actual || actual.village.id !== row.settlementId || actual.person.enlistedCultivatorId))) fail('households.members.references');
    if (row.status === 'resident') residentCount.set(row.settlementId, (residentCount.get(row.settlementId) ?? 0) + 1);
    if (row.recruitedId) {
      if (recruitedMembers.has(row.recruitedId)) fail('households.members.recruit');
      recruitedMembers.set(row.recruitedId, row);
    }
  }
  for (const [siteId, village] of settlers) {
    const currentYoung = village.juvenileCohorts.reduce((sum, cohort) => sum + cohort.count, 0);
    const currentNamed = village.volunteers.filter(({ enlistedCultivatorId }) => !enlistedCultivatorId).length;
    if ((trackedAdults.get(siteId) ?? 0) > Math.max(0, village.population - currentYoung - currentNamed) ||
        (residentCount.get(siteId) ?? 0) > currentNamed) fail('households.population_budget');
  }
  unique(w.households.guardianships, ({ id }) => id, 'households.guardianships.id');
  const guardianNext = new Map<string, string>();
  const activeWards = new Set<string>();
  for (const row of w.households.guardianships) {
    const serial = Number(row.id.match(/^household-guardian-([1-9][0-9]*)$/)?.[1]);
    const unsettled = row.status === 'offered' || row.status === 'active';
    const member = recruitedMembers.get(row.wardId);
    if (!Number.isSafeInteger(serial) || serial >= w.households.nextId || row.guardianId === row.wardId ||
        !actor.has(row.guardianId) || !actor.has(row.wardId) || member?.householdId !== row.householdId ||
        row.openedTick > w.tick || row.expiresTick !== row.openedTick + HOUSEHOLD_GUARDIAN_OFFER_TICKS ||
        ((row.status === 'active' || row.status === 'offered') !== (row.settledTick === undefined)) ||
        (row.status === 'active' && row.acceptedTick === undefined) ||
        (['offered','declined','expired'].includes(row.status) && row.acceptedTick !== undefined) ||
        (row.acceptedTick !== undefined && (row.acceptedTick < row.openedTick || row.acceptedTick >= row.expiresTick || row.acceptedTick > w.tick)) ||
        (row.status === 'offered' && row.expiresTick <= w.tick) ||
        (row.settledTick !== undefined && (row.settledTick < (row.acceptedTick ?? row.openedTick) || row.settledTick > w.tick)) ||
        (row.status === 'ended' ? row.endReason !== 'death' :
          row.status === 'expired' ? row.endReason !== 'expiry' || row.settledTick! < row.expiresTick :
          row.status === 'declined' ? row.endReason !== 'declined' :
          row.status === 'renounced' ? row.endReason !== 'renounced' : row.endReason !== undefined)) fail('households.guardianships.references');
    if (unsettled) {
      if (guardianNext.has(row.guardianId) || activeWards.has(row.wardId)) fail('households.guardianships.exclusivity');
      guardianNext.set(row.guardianId, row.wardId); activeWards.add(row.wardId);
    }
  }
  const verifiedGuardianPaths = new Set<string>();
  for (const start of guardianNext.keys()) {
    const path = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined && !verifiedGuardianPaths.has(current)) {
      if (path.has(current)) fail('households.guardianships.cycle');
      path.add(current);
      current = guardianNext.get(current);
    }
    for (const person of path) verifiedGuardianPaths.add(person);
  }
  return { settlementIds, volunteerIds };
}
