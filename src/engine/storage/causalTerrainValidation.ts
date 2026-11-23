import { alignedWeatherPinnedRuns } from '../alignedWeatherTerms';
import { expeditionOmenPinnedRuns } from '../expeditionOmenEngine';
import { observatoryStationValid } from '../observatoryStation';
import { validateAlignedWeatherHistory } from '../storageAlignedWeatherValidation';
import { OBSERVATORY_LEAD_TICKS, OBSERVATORY_RETENTION_TICKS, OBSERVATORY_TERMINAL_LIMIT } from '../fieldObservatoryEngine';
import { ARBITRATION_HEARING_WINDOW, ARBITRATION_JOIN_WINDOW, ARBITRATION_MAX_APPOINTMENTS_PER_SIDE } from '../oathArbitrationEngine';
import { ROAD_PATH_TILE_LIMIT } from '../roadEngine';
import { causalChronicleOutcomeCompatible, causalPredecessorCompatible } from '../chronicleCausalityEngine';
import { terrainTileAt } from '../terrainEngine';
import { MORTAL_MATURITY_TICKS } from '../reincarnationEngine';
import type { WorldState } from '../../types/world';
import { fail } from './primitives';
import { unique } from './semanticShared';

export function validateCausalTerrain(
  w: WorldState,
  actor: ReadonlySet<string>,
  sector: ReadonlySet<string>,
): ReadonlySet<string> {
  const causalNodes = new Map(w.chronicleCausality.nodes.map((node) => [node.eventId, node]));
  for (const sect of w.sects) if (sect.officeVacancy) {
    const { eventId, tick: opened } = sect.officeVacancy;
    const evidence = causalNodes.get(eventId);
    if (sect.leaderId !== undefined || opened > w.tick || eventId !== `evt-${opened}-${sect.id}-leadership-office-vacant` ||
        (evidence && (evidence.kind !== 'sect_vacancy' || evidence.entityId !== sect.id || evidence.tick !== opened))) {
      fail('sects.officeVacancy.source');
    }
  }
  if (causalNodes.size !== w.chronicleCausality.nodes.length) fail('chronicleCausality.events.unique');
  if (causalNodes.size) {
    const liveFacts = new Map<string, typeof w.events>();
    for (const fact of w.events) if (causalNodes.has(fact.id)) {
      const matching = liveFacts.get(fact.id);
      if (matching) matching.push(fact);
      else liveFacts.set(fact.id, [fact]);
    }
    let previousSequence = 0;
    let previousTick = 0;
    for (const node of w.chronicleCausality.nodes) {
      const live = liveFacts.get(node.eventId);
      if (node.sequence <= previousSequence || node.sequence >= w.chronicleCausality.nextSequence ||
          node.tick < previousTick || node.tick > w.tick || !causalChronicleOutcomeCompatible(node.kind, node.outcome) ||
          (live && (live.length !== 1 || live[0].tick !== node.tick || live[0].locationId !== node.locationId ||
            live[0].witnessScope === 'participants' || live[0].category !== 'diplomacy')) ||
          node.eventId.startsWith('evt-sealed-dispatch-')) fail('chronicleCausality.events.source');
      previousSequence = node.sequence;
      previousTick = node.tick;
      unique(node.predecessors, ({ eventId }) => eventId, 'chronicleCausality.predecessors.unique');
      unique(node.predecessors.filter(({ relation }) => relation !== 'withdrew_siege'),
        ({ relation }) => relation, 'chronicleCausality.predecessors.role');
      for (const edge of node.predecessors) {
        const source = causalNodes.get(edge.eventId);
        if (!source || source.sequence >= node.sequence || source.tick > node.tick ||
            !causalPredecessorCompatible(node, source, edge.relation)) fail('chronicleCausality.predecessors.reference');
      }
    }
  }
  const map = unique(w.terrain.tiles, (item) => item.id, 'terrain.tiles.id');
  if ((w.terrainSuccession.lastAdvancedTick ?? 0) > w.tick) fail('terrainSuccession.lastAdvancedTick');
  unique(w.terrainSuccession.cells, ({ tileId }) => tileId, 'terrainSuccession.cells.tile');
  for (const cell of w.terrainSuccession.cells) {
    if (!map.has(cell.tileId) || cell.firstTick > cell.lastStressTick || cell.lastStressTick > w.tick ||
        cell.consecutiveStress > cell.lastStressTick - cell.firstTick + 1 ||
        cell.recoverableLoss + cell.permanentLoss > cell.baselineQi + 1e-8 ||
        (cell.lastWorkedTick !== undefined && (cell.lastWorkedTick < cell.firstTick || cell.lastWorkedTick > w.tick)) ||
        (cell.lastWorkedTick === undefined) !== (cell.lastWorkedBy === undefined) ||
        (cell.lastWorkedBy !== undefined && !actor.has(cell.lastWorkedBy)) ||
        (cell.workCount > 0 && cell.lastWorkedTick === undefined)) fail('terrainSuccession.cells.references');
  }
  const fieldActorStates = new Map(Object.entries(w.fieldObservatories.byActor));
  const pinnedWeatherRuns = alignedWeatherPinnedRuns(w);
  const pinnedOmenRuns = expeditionOmenPinnedRuns(w);
  const weatherSites = new Map(w.locations.map((site) => [site.id,site]));
  const readingValid = ({ kind, intensity }: { kind: string; intensity: number }) =>
    Math.abs(intensity * 100 - Math.round(intensity * 100)) <= 1e-8 &&
    (kind === '平息' ? intensity === 0 : intensity >= .05);
  for (const [operatorId, entry] of fieldActorStates) {
    if (!actor.has(operatorId) || (!entry.runs.length && !entry.inbox.length) ||
        entry.runs.filter(({ status }) => status === 'pending').length > 1 ||
        entry.runs.filter(({ status, openedTick }) => status !== 'pending' &&
          !pinnedWeatherRuns.get(operatorId)?.has(openedTick) && !pinnedOmenRuns.get(operatorId)?.has(openedTick)).length > OBSERVATORY_TERMINAL_LIMIT)
      fail('fieldObservatories.byActor.references');
    unique(entry.runs, ({ openedTick }) => String(openedTick), 'fieldObservatories.runs.tick');
    unique(entry.inbox, ({ operatorId, openedTick }) => JSON.stringify([operatorId, openedTick]), 'fieldObservatories.inbox.source');
    for (const run of entry.runs) {
      const site = weatherSites.get(run.locationId);
      if (!site || run.station && !observatoryStationValid(w,site,run.station) ||
          run.openedTick > w.tick || run.targetTick !== run.openedTick + OBSERVATORY_LEAD_TICKS ||
          !readingValid(run.baseline) || run.forecast.kind !== run.baseline.kind || run.forecast.intensity !== run.baseline.intensity ||
          (run.status === 'measured' ? run.targetTick > w.tick || !run.reading || !readingValid(run.reading) :
            ('reading' in run || 'relay' in run || (run.status === 'missed' && run.targetTick > w.tick))) ||
          (run.status === 'measured' && run.relay && (!actor.has(run.relay.recipientId) || run.relay.recipientId === operatorId ||
            run.relay.relayedTick <= run.targetTick || run.relay.relayedTick > w.tick || run.relay.relayedTick > run.targetTick + OBSERVATORY_RETENTION_TICKS)))
        fail('fieldObservatories.runs.references');
    }
    for (const inbox of entry.inbox) {
      const actual = fieldActorStates.get(inbox.operatorId)?.runs.find(({ openedTick }) => openedTick === inbox.openedTick);
      if (!actual || actual.status !== 'measured' || actual.relay?.recipientId !== operatorId) fail('fieldObservatories.inbox.references');
    }
  }
  validateAlignedWeatherHistory(w, actor, fail);
  unique(w.oathArbitrations.cases, ({ oathId }) => oathId, 'oathArbitrations.cases.oath');
  const tenderKey = (oathId: string, at: number) => JSON.stringify([oathId, at]);
  unique(w.oathArbitrations.observations, ({ oathId, tenderTick }) => tenderKey(oathId, tenderTick), 'oathArbitrations.observations.tender');
  const actualOaths = new Map(w.oaths.contracts.map((row) => [row.id, row]));
  const observations = new Map(w.oathArbitrations.observations.map((row) => [tenderKey(row.oathId, row.tenderTick), row]));
  const caseOaths = new Set(w.oathArbitrations.cases.map(({ oathId }) => oathId));
  for (const row of w.oathArbitrations.observations) {
    const oath = actualOaths.get(row.oathId);
    if (row.tenderTick > w.tick || !row.observerIds.length || row.observerIds.some((id) => !actor.has(id)) ||
        (oath ? row.siteId !== oath.locationId || row.observerIds.includes(oath.requesterId) || row.observerIds.includes(oath.providerId) ||
          !oath.evidence.some((item) => item.kind === 'tender' && item.actorId === oath.providerId && !item.requesterPresent &&
            item.locationId === row.siteId && item.tick === row.tenderTick && item.quantity === oath.quantity) : !caseOaths.has(row.oathId)))
      fail('oathArbitrations.observations.references');
    unique(row.observerIds, (id) => id, 'oathArbitrations.observations.observer');
  }
  for (const panel of w.oathArbitrations.cases) {
    const oath = actualOaths.get(panel.oathId);
    const observed = observations.get(tenderKey(panel.oathId, panel.tenderTick));
    const joined = panel.joinedTick;
    const closed = panel.closedTick;
    if (panel.id !== `arbitration-${panel.oathId}` || !observed || observed.siteId !== panel.siteId ||
        !actor.has(panel.requesterId) || !actor.has(panel.providerId) || panel.requesterId === panel.providerId ||
        observed.observerIds.includes(panel.requesterId) || observed.observerIds.includes(panel.providerId) ||
        (oath && (oath.requesterId !== panel.requesterId || oath.providerId !== panel.providerId || oath.locationId !== panel.siteId)) ||
        panel.tenderTick > panel.openedTick || panel.openedTick > w.tick || panel.joinUntilTick <= panel.openedTick ||
        panel.joinUntilTick > panel.openedTick + ARBITRATION_JOIN_WINDOW ||
        (panel.status === 'closed' ? closed === undefined || !panel.disposition || closed < (joined ?? panel.openedTick) || closed > w.tick :
          closed !== undefined || panel.disposition !== undefined || !oath || oath.settledTick !== undefined) ||
        (joined === undefined ? panel.status === 'hearing' || panel.expiresTick !== undefined || !!panel.filing || panel.appointments.length > 0 :
          panel.status === 'offered' || joined < panel.openedTick || joined >= panel.joinUntilTick || joined > w.tick ||
          panel.expiresTick === undefined || panel.expiresTick < joined + ARBITRATION_HEARING_WINDOW ||
          (oath && panel.expiresTick !== Math.max(oath.deadlineTick ?? joined, joined) + ARBITRATION_HEARING_WINDOW)) ||
        (panel.disposition === 'unjoined' && joined !== undefined) ||
        (panel.disposition === 'refund' && (joined === undefined || !panel.filing ||
          (oath && (oath.status !== 'excused' || oath.settledTick !== closed))))) fail('oathArbitrations.cases.references');
    const seated = panel.appointments.filter(({ endedTick }) => endedTick === undefined);
    unique(seated, ({ side }) => side, 'oathArbitrations.appointments.side');
    unique(seated, ({ appointeeId }) => appointeeId, 'oathArbitrations.appointments.adjudicator');
    for (const side of ['requester','provider'] as const) if (panel.appointments.filter((row) => row.side === side).length > ARBITRATION_MAX_APPOINTMENTS_PER_SIDE)
      fail('oathArbitrations.appointments.history');
    for (const judge of panel.appointments) {
      if (!actor.has(judge.appointeeId) || judge.appointeeId === panel.requesterId || judge.appointeeId === panel.providerId ||
          observed?.observerIds.includes(judge.appointeeId) || judge.nominatedTick < (joined ?? Infinity) ||
          judge.nominatedTick >= (panel.expiresTick ?? 0) || judge.nominatedTick > (closed ?? w.tick) ||
          (judge.acceptedTick !== undefined && (judge.acceptedTick < judge.nominatedTick || judge.acceptedTick > (judge.endedTick ?? closed ?? w.tick))) ||
          (judge.endedTick === undefined) !== (judge.recusal === undefined) ||
          (judge.endedTick !== undefined && (judge.endedTick < judge.nominatedTick || judge.endedTick > (closed ?? w.tick))) ||
          (judge.vote === undefined) !== (judge.votedTick === undefined) ||
          (judge.votedTick !== undefined && (judge.votedTick <= (judge.acceptedTick ?? Infinity) ||
            judge.votedTick >= (panel.expiresTick ?? 0) || judge.votedTick > (judge.endedTick ?? closed ?? w.tick) ||
            (judge.vote === 'refund' && (!panel.filing || judge.votedTick < panel.filing.tick))))) fail('oathArbitrations.appointments.references');
    }
    if (panel.filing && (!observed?.observerIds.includes(panel.filing.observerId) || panel.filing.tick < (joined ?? Infinity) ||
        panel.filing.tick >= (panel.expiresTick ?? 0) || panel.filing.tick > (closed ?? w.tick))) fail('oathArbitrations.filing.references');
    if (panel.disposition === 'refund' && (seated.length !== 2 || seated.some(({ vote, acceptedTick }) => vote !== 'refund' || acceptedTick === undefined)))
      fail('oathArbitrations.refund.proof');
  }
  let lastCensusTick = -1;
  const censusSources = new Map(w.settlements.records.map((row) => [row.id, row]));
  const currentCensusVillages = new Set(w.settlements.villages.map(({ id }) => id));
  const censusReceipts = new Set<string>();
  for (const period of w.villageCensuses.periods) {
    if (period.tick <= lastCensusTick || period.tick > w.tick || (period.tick === w.tick &&
        (period.year !== w.year || period.month !== w.month))) fail('villageCensuses.periods.window');
    lastCensusTick = period.tick;
    const openingIds = unique(period.opening, ({ villageId }) => villageId, 'villageCensuses.opening.village');
    const checkCensusCount = ({ villageId, population, juveniles }: typeof period.opening[number]) => {
      if (!currentCensusVillages.has(villageId) || juveniles > population) fail('villageCensuses.count.references');
    };
    period.opening.forEach(checkCensusCount);
    if (period.closing) {
      unique(period.closing, ({ villageId }) => villageId, 'villageCensuses.closing.village');
      period.closing.forEach(checkCensusCount);
    }
    const movementSource = { birth:'growth', death:'disaster', migration:'migration', enrollment:'recruitment' } as const;
    for (const row of period.movements) {
      const existing = censusSources.get(row.id);
      if (censusReceipts.has(row.id) || !openingIds.has(row.villageId) || row.people < 1 ||
          (row.kind === 'migration' ? !row.targetVillageId || row.targetVillageId === row.villageId || !openingIds.has(row.targetVillageId)
            : row.targetVillageId !== undefined) ||
          (row.kind === 'enrollment' ? row.people !== 1 || !row.volunteerId || !row.cultivatorId ||
            row.cultivatorId !== `recruit-${row.volunteerId}` || !actor.has(row.cultivatorId)
            : row.volunteerId !== undefined || row.cultivatorId !== undefined) ||
          (row.kind === 'maturation' ? row.bornTick === undefined || period.tick - row.bornTick < MORTAL_MATURITY_TICKS ||
            row.id !== `mature-${period.tick}-${row.villageId}-${row.bornTick}`
            : row.kind === 'birth' ? row.bornTick !== period.tick : row.bornTick !== undefined) ||
          (row.deathCause !== undefined && (row.kind !== 'death' || row.id !== `settlement-${period.tick}-old_age-${row.villageId}-registered`)) ||
          (existing && (row.kind === 'maturation' || existing.kind !== (row.deathCause==='old_age'?'old_age':movementSource[row.kind]) ||
            existing.tick !== period.tick || existing.settlementId !== row.villageId || existing.targetSettlementId !== row.targetVillageId ||
            existing.people !== row.people || existing.volunteerId !== row.volunteerId || existing.cultivatorId !== row.cultivatorId)))
        fail('villageCensuses.movements.references');
      censusReceipts.add(row.id);
    }
    unique(period.observations, ({ villageId }) => villageId, 'villageCensuses.observations.village');
    for (const local of period.observations) {
      checkCensusCount(local.count);
      if (local.count.villageId !== local.villageId || !openingIds.has(local.villageId) || !actor.has(local.observerId) ||
          (local.sample && (local.sample.juveniles > local.count.juveniles ||
            local.sample.adults + local.sample.namedResidents > local.count.population - local.count.juveniles)))
        fail('villageCensuses.observations.references');
    }
  }
  if ((w.roads.lastAdvancedTick ?? 0) > w.tick) fail('roads.lastAdvancedTick');
  unique(w.roads.links, ({ id }) => id, 'roads.links.id');
  unique(w.roads.links.filter(({ closedTick }) => closedTick === undefined),
    ({ anchorSiteId, otherSiteId }) => JSON.stringify([anchorSiteId, otherSiteId].sort()), 'roads.links.activePair');
  unique(w.roads.crossings, ({ id }) => id, 'roads.crossings.id');
  unique(w.roads.crossings, ({ journeyId, legIndex }) => JSON.stringify([journeyId, legIndex]), 'roads.crossings.leg');
  const roadsById = new Map(w.roads.links.map((road) => [road.id, road]));
  const roadSerials = new Set<number>();
  const walksById = new Map(w.pilgrimages.journeys.map((journey) => [journey.id, journey]));
  for (const link of w.roads.links) {
    const serial = Number(link.id.match(/^road-([1-9][0-9]*)$/)?.[1]);
    const closed = link.closedTick;
    const from = w.locations.find(({ id }) => id === link.anchorSiteId);
    const to = w.locations.find(({ id }) => id === link.otherSiteId);
    if (!Number.isSafeInteger(serial) || serial >= w.roads.nextId || roadSerials.has(serial) || !sector.has(link.sectId) || link.anchorSiteId === link.otherSiteId ||
        link.openedTick > w.tick || (closed === undefined ? link.closeReason !== undefined || !from || !to :
          !link.closeReason || closed < link.openedTick || closed > w.tick) ||
        (link.lastMaintainedTick === undefined) !== (link.lastMaintainedBy === undefined) ||
        (link.lastPatrolledTick === undefined) !== (link.lastPatrolledBy === undefined) ||
        (link.lastMaintainedTick !== undefined && (link.lastMaintainedTick < link.openedTick || link.lastMaintainedTick > (closed ?? w.tick) ||
          !actor.has(link.lastMaintainedBy!))) ||
        (link.lastPatrolledTick !== undefined && (link.lastPatrolledTick < link.openedTick || link.lastPatrolledTick > (closed ?? w.tick) ||
          !actor.has(link.lastPatrolledBy!))) || link.path.length < 2 ||
        (from && (link.path[0].x !== from.x || link.path[0].y !== from.y)) ||
        (to && (link.path.at(-1)?.x !== to.x || link.path.at(-1)?.y !== to.y))) fail('roads.links.references');
    roadSerials.add(serial);
    const points = link.path.map(({ x, y }) => terrainTileAt(w, x, y));
    const walked = points.filter((cell, index) => index === 0 || cell?.id !== points[index - 1]?.id);
    if (points.some((tile) => !tile) || walked.length < 2 || walked.length > ROAD_PATH_TILE_LIMIT || walked.length !== points.length ||
        new Set(walked.map((cell) => cell?.id)).size !== walked.length ||
        walked.some((cell, index) => index > 0 && (!cell ||
          Math.abs(cell.col - walked[index - 1]!.col) + Math.abs(cell.row - walked[index - 1]!.row) !== 1))) fail('roads.links.path');
  }
  for (const crossing of w.roads.crossings) {
    const serial = Number(crossing.id.match(/^crossing-([1-9][0-9]*)$/)?.[1]);
    const road = roadsById.get(crossing.roadId);
    const journey = walksById.get(crossing.journeyId);
    const from = journey?.stopIds[crossing.legIndex], to = journey?.stopIds[crossing.legIndex + 1];
    if (!Number.isSafeInteger(serial) || serial >= w.roads.nextId || roadSerials.has(serial) || !road || !actor.has(crossing.payerId) || !actor.has(crossing.companionId) || crossing.payerId === crossing.companionId ||
        crossing.departedTick < road.openedTick || crossing.departedTick > w.tick ||
        (road.closedTick !== undefined && crossing.departedTick > road.closedTick) ||
        crossing.paidSteps !== road.path.length - 1 ||
        Math.ceil(crossing.paidSteps / crossing.stride) >= Math.ceil(crossing.freeSteps / crossing.freeStride) ||
        (journey && (journey.organizerId !== crossing.payerId || journey.companionId !== crossing.companionId ||
          crossing.departedTick <= (journey.startedTick ?? Infinity) || crossing.departedTick >= (journey.expiresTick ?? 0) ||
          !((from === road.anchorSiteId && to === road.otherSiteId) || (from === road.otherSiteId && to === road.anchorSiteId)) ||
          (journey.status === 'active' && journey.legIndex === crossing.legIndex && (journey.path.length !== crossing.paidSteps + 1 ||
            journey.path.some(({ x, y }, index) => {
              const step = road.path[from === road.anchorSiteId ? index : road.path.length - index - 1];
              return !step || x !== step.x || y !== step.y;
            })))))) fail('roads.crossings.references');
    roadSerials.add(serial);
  }
  unique(w.probation.expulsions, ({ id }) => id, 'probation.expulsions.id');
  unique(w.probation.cases, ({ id }) => id, 'probation.cases.id');
  return map;
}
