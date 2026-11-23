import { validatePilgrimageForkSave } from '../pilgrimageFork';
import { validateBuiltinScenarioOrigin } from '../storageBuiltinScenarioValidation';
import { validateDisasterShelter } from '../storageDisasterShelterValidation';
import { validateWaypostMeals } from '../storageWaypostMealValidation';
import { verifiableDanxiaScenarioOutcome } from '../scenarioDanxiaOutcome';
import { normalizeScenarioObjectives, scenarioObjectivePassed } from '../scenarioObjectiveEngine';
import { terrainTileAt } from '../terrainEngine';
import { PILGRIMAGE_ACTIVE_TICKS, PILGRIMAGE_LEG_COST, PILGRIMAGE_OFFER_TICKS } from '../pilgrimageEngine';
import { SECT_CREDIT_COLLECTION_TICKS, SECT_CREDIT_OFFER_TICKS, SECT_CREDIT_PAYMENT_MAX, SECT_CREDIT_PRINCIPAL, SECT_CREDIT_TERM_TICKS } from '../sectCreditEngine';
import { SANCTUARY_BLOCK_HP, SANCTUARY_CHARTER_TICKS, SANCTUARY_FOUND_COST, SANCTUARY_KARMA_PENALTY, SANCTUARY_MAX_SHIELD, SANCTUARY_PASS_TICKS, SANCTUARY_REPAIR_COST } from '../sanctuaryEngine';
import type { WorldState } from '../../types/world';
import { fail } from './primitives';
import { unique } from './semanticShared';

export function validateJourneys(
  w: WorldState,
  actor: ReadonlySet<string>,
  sector: ReadonlySet<string>,
  locations: ReadonlySet<string>,
  map: ReadonlySet<string>,
): void {
  const reservedPilgrims = new Set<string>();
  const pilgrimageSites = new Map(w.locations.map((site) => [site.id, site]));
  for (const row of w.pilgrimages.journeys) {
    const serial = Number(row.id.match(/^pilgrimage-([1-9][0-9]*)$/)?.[1]);
    const pending = row.status === 'proposed';
    const active = row.status === 'active';
    const existing = pending || active;
    const started = row.startedTick !== undefined && row.expiresTick !== undefined;
    const moving = row.path.length > 0;
    const validReason = row.status === 'withdrawn' ? row.reason === 'withdrawn' :
      row.status === 'declined' ? row.reason === 'declined' :
      row.status === 'interrupted' ? row.reason === 'member_missing' || row.reason === 'lost_site' :
      row.status === 'expired' ? row.reason === (started ? 'journey_expiry' : 'offer_expiry') : row.reason === undefined;
    if (!Number.isSafeInteger(serial) || serial >= w.pilgrimages.nextId ||
        row.stopIds.length !== 3 || new Set(row.stopIds).size !== 3 ||
        row.organizerId === row.companionId || !actor.has(row.organizerId) || !actor.has(row.companionId) ||
        row.proposedTick > w.tick || row.offerExpiresTick !== row.proposedTick + PILGRIMAGE_OFFER_TICKS ||
        ((row.startedTick === undefined) !== (row.expiresTick === undefined)) ||
        (started && (row.startedTick! < row.proposedTick || row.startedTick! >= row.offerExpiresTick ||
          row.expiresTick !== row.startedTick! + PILGRIMAGE_ACTIVE_TICKS || row.startedTick! > w.tick)) ||
        (existing !== (row.settledTick === undefined)) ||
        (row.settledTick !== undefined && (row.settledTick > w.tick || row.settledTick < (row.startedTick ?? row.proposedTick))) ||
        !validReason || (active && (!started || row.expiresTick! <= w.tick)) ||
        (pending && (started || row.offerExpiresTick <= w.tick)) ||
        (row.status === 'declined' && started) ||
        (row.status === 'completed' ? !started || row.legIndex !== 2 : row.legIndex > 1) ||
        (row.status === 'expired' && row.settledTick! < (started ? row.expiresTick! : row.offerExpiresTick)) ||
        (existing && row.stopIds.some((id) => !pilgrimageSites.has(id) || pilgrimageSites.get(id)?.type === 'secret_realm'))) fail('pilgrimages.journeys.references');
    if (existing) {
      for (const memberId of [row.organizerId, row.companionId]) {
        if (reservedPilgrims.has(memberId)) fail('pilgrimages.journeys.membership');
        reservedPilgrims.add(memberId);
      }
    }
    if (active && [row.organizerId, row.companionId].some((id) => !w.cultivators.some((member) =>
      member.id === id && member.alive && member.hp > 0 && member.locationId === row.stopIds[row.legIndex]))) fail('pilgrimages.journeys.occupants');
    if (row.stopsVisited.length !== (started ? row.legIndex + 1 : 0) || (!started && row.legIndex !== 0) ||
        row.stopsVisited.some((stop, index) => stop.locationId !== row.stopIds[index] ||
          (index === 0 ? stop.tick !== row.startedTick : stop.tick <= row.stopsVisited[index - 1].tick) ||
          stop.tick >= (row.expiresTick ?? 0) || stop.tick > (row.settledTick ?? w.tick))) fail('pilgrimages.journeys.arrivals');
    const launched = row.spentByEach / PILGRIMAGE_LEG_COST;
    if (!Number.isInteger(launched) || launched < row.legIndex || launched > row.legIndex + 1 ||
        (!started && launched !== 0) || (active && launched !== row.legIndex + Number(moving)) ||
        (row.status === 'withdrawn' && launched !== row.legIndex) ||
        (Boolean(launched) !== (row.lastMovedTick !== undefined)) ||
        (row.lastMovedTick !== undefined && (row.lastMovedTick <= (row.startedTick ?? Infinity) ||
          row.lastMovedTick < (row.stopsVisited.at(-1)?.tick ?? 0) ||
          row.lastMovedTick > (row.settledTick ?? w.tick) || row.lastMovedTick >= (row.expiresTick ?? 0)))) fail('pilgrimages.journeys.spend');
    if (moving) {
      const origin = pilgrimageSites.get(row.stopIds[row.legIndex]);
      const dest = pilgrimageSites.get(row.stopIds[row.legIndex + 1]);
      const first = row.path[0], last = row.path.at(-1);
      if (!active || !origin || !dest || !last || row.path.length < 3 || row.pathIndex < 1 || row.pathIndex >= row.path.length - 1 ||
          first.x !== origin.x || first.y !== origin.y || last.x !== dest.x || last.y !== dest.y) fail('pilgrimages.journeys.path');
      const tilePath = row.path.map((point) => terrainTileAt(w, point.x, point.y));
      if (tilePath.some((tile, index) => {
        const earlier = tilePath[index - 1];
        return !tile || (index > 0 && (!earlier || Math.abs(tile.col - earlier.col) + Math.abs(tile.row - earlier.row) > 1));
      })) fail('pilgrimages.journeys.path_tile');
    } else if (row.pathIndex !== 0) fail('pilgrimages.journeys.path_index');
    unique(row.aid, ({ giverId, locationId }) => JSON.stringify([giverId, locationId]), 'pilgrimages.journeys.aid_once');
    if (row.aid.some((given) => {
      const hit = row.stopsVisited.findIndex(({ locationId }) => locationId === given.locationId);
      const nextArrival = row.stopsVisited[hit + 1];
      return !(given.giverId === row.organizerId && given.receiverId === row.companionId ||
        given.giverId === row.companionId && given.receiverId === row.organizerId) ||
        hit < 0 || hit >= 2 || given.tick <= row.stopsVisited[hit].tick ||
        given.tick >= (row.expiresTick ?? 0) || given.tick > (row.settledTick ?? w.tick) ||
        Boolean(nextArrival && given.tick > nextArrival.tick);
    })) fail('pilgrimages.journeys.aid_references');
    const camps = row.camps ?? [];
    unique(camps, ({ legIndex }) => String(legIndex), 'pilgrimages.journeys.camp_leg_once');
    for (const camp of camps) {
      const reached = row.stopsVisited[camp.legIndex];
      const following = row.stopsVisited[camp.legIndex + 1];
      const at = terrainTileAt(w, camp.point.x, camp.point.y);
      const closed = camp.closedTick;
      const ready = camp.openedTick + 1;
      const activePoint = row.path[camp.pathIndex];
      const recovery = camp.recovery ?? [];
      unique(recovery, ({ actorId }) => actorId, 'pilgrimages.journeys.camp_recovered_once');
      if (!started || !reached || at?.id !== camp.tileId || camp.payerId !== row.organizerId ||
          launched <= camp.legIndex || camp.openedTick <= reached.tick || camp.openedTick > w.tick ||
          ready >= (row.expiresTick ?? 0) || (following && (closed === undefined || following.tick < closed)) ||
          (camp.status === 'pitched' && (!active || closed !== undefined || w.tick > ready || row.legIndex !== camp.legIndex ||
            row.pathIndex !== camp.pathIndex || activePoint?.x !== camp.point.x || activePoint?.y !== camp.point.y ||
            (row.lastMovedTick ?? Infinity) >= camp.openedTick)) ||
          (camp.status !== 'pitched' && (closed === undefined || closed < camp.openedTick || closed > (row.settledTick ?? w.tick))) ||
          ((camp.status === 'resumed' || camp.status === 'dismantled') && closed !== ready) ||
          (camp.status === 'expired' && (closed ?? 0) <= ready) ||
          (camp.status === 'resumed' && (row.lastMovedTick ?? 0) < ready) ||
          (camp.status !== 'resumed' && camp.recovery !== undefined) ||
          recovery.some(({ actorId }) => actorId !== row.organizerId && actorId !== row.companionId)) {
        fail('pilgrimages.journeys.camp_source');
      }
    }
  }
  validateWaypostMeals(w,fail);
  validatePilgrimageForkSave(w,fail);
  validateDisasterShelter(w,fail);
  unique(w.credit.loans, ({ id }) => id, 'credit.loans.id');
  unique(w.credit.loans.filter(({ status }) => status === 'offered' || status === 'active'),
    ({ borrowerSectId }) => borrowerSectId, 'credit.loans.active_borrower');
  unique(w.credit.restrictions, ({ sectId }) => sectId, 'credit.restrictions.sect');
  if (w.credit.restrictions.some(({ sectId }) => !sector.has(sectId))) fail('credit.restrictions.references');
  for (const loan of w.credit.loans) {
    const funded = loan.status === 'active' || loan.status === 'paid' || loan.status === 'defaulted';
    const closed = loan.status !== 'offered' && loan.status !== 'active';
    const serial = Number(loan.id.match(/^sect-credit-([1-9][0-9]*)$/)?.[1]);
    const paidByTick = new Map<number,number>();
    for (const row of loan.receipts) paidByTick.set(row.tick, (paidByTick.get(row.tick) ?? 0) + row.amount);
    if ([...paidByTick.values()].some((amount) => amount > SECT_CREDIT_PAYMENT_MAX)) fail('credit.loans.payment_tick');
    if (!Number.isSafeInteger(serial) || serial >= w.credit.nextId || loan.lenderSectId === loan.borrowerSectId ||
        !sector.has(loan.lenderSectId) || !sector.has(loan.borrowerSectId) || !actor.has(loan.lenderSignerId) ||
        !actor.has(loan.borrowerSignerId) || loan.lenderSignerId === loan.borrowerSignerId ||
        loan.openedTick > w.tick || loan.offerExpiresTick !== loan.openedTick + SECT_CREDIT_OFFER_TICKS ||
        funded !== (loan.fundedTick !== undefined) || funded !== (loan.dueTick !== undefined) ||
        funded !== (loan.collectionUntilTick !== undefined) || closed !== (loan.settledTick !== undefined) ||
        (loan.fundedTick !== undefined && (loan.fundedTick < loan.openedTick || loan.fundedTick > w.tick ||
          loan.fundedTick >= loan.offerExpiresTick || loan.dueTick !== loan.fundedTick + SECT_CREDIT_TERM_TICKS ||
          loan.collectionUntilTick !== loan.dueTick + SECT_CREDIT_COLLECTION_TICKS)) ||
        (loan.settledTick !== undefined && (loan.settledTick < (loan.fundedTick ?? loan.openedTick) || loan.settledTick > w.tick)) ||
        (loan.lastCollectionTick !== undefined && (loan.dueTick === undefined || loan.collectionUntilTick === undefined ||
          loan.lastCollectionTick < loan.dueTick || loan.lastCollectionTick >= loan.collectionUntilTick || loan.lastCollectionTick > w.tick)) ||
        loan.receipts.some((row) => loan.fundedTick === undefined || row.tick < loan.fundedTick || row.tick > w.tick ||
          (loan.settledTick !== undefined && row.tick > loan.settledTick) ||
          (row.kind === 'collection' && (loan.dueTick === undefined || loan.collectionUntilTick === undefined ||
            row.tick < loan.dueTick || row.tick >= loan.collectionUntilTick)))) fail('credit.loans.references');
    const paid = loan.receipts.reduce((sum,row) => sum + row.amount, 0);
    if (loan.principal !== SECT_CREDIT_PRINCIPAL || loan.paidTotal !== paid || loan.paidTotal + loan.writtenOff > loan.principal ||
        (!funded && (paid !== 0 || loan.writtenOff !== 0)) ||
        (loan.status === 'active' && paid >= loan.principal) ||
        (loan.status === 'paid' && paid !== loan.principal) ||
        (loan.status === 'defaulted' ? (loan.writtenOff <= 0 || loan.paidTotal + loan.writtenOff !== loan.principal)
          : loan.writtenOff !== 0)) fail('credit.loans.principal');
  }
  const sanctuaryIds = new Set<number>();
  const sanctuaryIndex = new Map(w.sanctuary.charters.map((charter) => [charter.id, charter]));
  const validSanctuarySerial = (id: string, kind: 'charter' | 'pass' | 'incident') => {
    const serial = Number(id.match(new RegExp(`^sanctuary-${kind}-([1-9][0-9]*)$`))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.sanctuary.nextId || sanctuaryIds.has(serial)) fail('sanctuary.nextId');
    sanctuaryIds.add(serial);
  };
  unique(w.sanctuary.charters.filter(({ status, expiresTick }) => status === 'active' && expiresTick > w.tick),
    ({ siteId }) => siteId, 'sanctuary.charters.active_site');
  unique(w.sanctuary.passes.filter(({ status, expiresTick }) => status === 'active' && expiresTick > w.tick),
    ({ actorId }) => actorId, 'sanctuary.passes.active_actor');
  unique(w.sanctuary.passes, ({ charterId, actorId }) => JSON.stringify([charterId,actorId]), 'sanctuary.passes.identity');
  for (const row of w.sanctuary.charters) {
    validSanctuarySerial(row.id, 'charter');
    if (!sector.has(row.sponsorSectId) || !actor.has(row.founderId) || (row.status === 'active' && !locations.has(row.siteId)) ||
        row.openedTick > w.tick || row.expiresTick !== row.openedTick + SANCTUARY_CHARTER_TICKS ||
        (row.status === 'ended') !== (row.endedTick !== undefined) || (row.endedTick !== undefined) !== (row.endReason !== undefined) ||
        (row.endedTick !== undefined && (row.endedTick < row.openedTick || row.endedTick > w.tick)) ||
        (row.lastRepairTick !== undefined && (row.lastRepairTick < row.openedTick || row.lastRepairTick > w.tick)) ||
        row.maxShieldHp !== SANCTUARY_MAX_SHIELD || row.shieldHp > row.maxShieldHp ||
        row.stonesSpent < SANCTUARY_FOUND_COST || (row.stonesSpent - SANCTUARY_FOUND_COST) % SANCTUARY_REPAIR_COST !== 0) fail('sanctuary.charters.references');
  }
  for (const row of w.sanctuary.passes) {
    validSanctuarySerial(row.id, 'pass');
    const charter = sanctuaryIndex.get(row.charterId);
    if (!charter || !actor.has(row.actorId) || row.issuedTick < charter.openedTick || row.issuedTick > w.tick ||
        row.expiresTick <= row.issuedTick || row.expiresTick !== Math.min(row.issuedTick + SANCTUARY_PASS_TICKS, charter.expiresTick) ||
        (row.status === 'ended') !== (row.endedTick !== undefined) || (row.endedTick !== undefined) !== (row.endReason !== undefined) ||
        (row.endedTick !== undefined && (row.endedTick < row.issuedTick || row.endedTick > w.tick))) fail('sanctuary.passes.references');
  }
  for (const row of w.sanctuary.incidents) {
    validSanctuarySerial(row.id, 'incident');
    const charter = sanctuaryIndex.get(row.charterId);
    if (!charter || !actor.has(row.aggressorId) || !actor.has(row.visitorId) || row.aggressorId === row.visitorId ||
        row.tick < charter.openedTick || row.tick > w.tick || row.sourceEventId !== `evt-${row.id}` ||
        row.shieldSpent !== (row.kind === 'blocked' ? SANCTUARY_BLOCK_HP : 0) ||
        row.karmaPenalty > SANCTUARY_KARMA_PENALTY) fail('sanctuary.incidents.references');
  }
  const bookmarkRows = w.annotations.bookmarks;
  const noteRows = w.annotations.notes;
  unique([...bookmarkRows,...noteRows], ({ id }) => id, 'annotations.id');
  unique(bookmarkRows, ({ eventId }) => eventId, 'annotations.bookmarks.eventId');
  const annotationSerials = new Set<number>();
  for (const item of [...bookmarkRows, ...noteRows]) {
    const prefix = 'eventId' in item ? 'bookmark' : 'annotation';
    const serial = Number(item.id.match(new RegExp(`^${prefix}-([1-9][0-9]*)$`))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.annotations.nextId || annotationSerials.has(serial)) fail('annotations.nextId');
    annotationSerials.add(serial);
  }
  const privateEvents = new Set(w.events.filter(({ witnessScope }) => witnessScope === 'participants').map(({ id }) => id));
  for (const row of bookmarkRows) if (row.eventTick > row.createdTick || row.createdTick > w.tick ||
      privateEvents.has(row.eventId) || /[\u0000-\u001f\u007f]/.test(row.title)) fail('annotations.bookmarks.references');
  for (const row of noteRows) if (!map.has(row.target.tileId) || row.createdTick > row.updatedTick ||
      row.updatedTick > w.tick || !row.text.trim() || /[\u0000-\u001f\u007f]/.test(row.text) ||
      (row.target.kind === 'site' && /[\u0000-\u001f\u007f]/.test(row.target.siteName))) fail('annotations.notes.references');
  if (w.scenarioOrigin && (w.scenarioOrigin.endTick > w.tick || !w.worldgen ||
      !/^scenario-[0-9a-f]{32}$/.test(w.scenarioOrigin.id))) fail('scenarioOrigin.references');
  validateBuiltinScenarioOrigin(w,fail);
  if (Boolean(w.scenarioAudit) !== (w.scenarioOrigin?.version === 2 || w.scenarioOrigin?.version === 3)) fail('scenarioAudit.authority');
  if (w.scenarioAudit) {
    const { scenarioId, seed, profileId, evaluatedTick, cards } = w.scenarioAudit;
    if (!w.scenarioOrigin || scenarioId !== w.scenarioOrigin.id || evaluatedTick !== w.scenarioOrigin.endTick ||
        evaluatedTick > w.tick || seed !== w.random.seed || profileId !== w.worldgen?.profileId) fail('scenarioAudit.authority');
    try { normalizeScenarioObjectives(cards.map(({ objective }) => objective)); }
    catch { fail('scenarioAudit.objectives'); }
    if(cards.some(card=>card.objective.kind==='danxia_medicine_outcome')!==(w.scenarioOrigin?.version===3))
      fail('scenarioAudit.objectives.version');
    for (const [index, card] of cards.entries()) {
      const { objective, evidence, passed } = card;
      if (card.id !== 'objective-' + (index + 1) || objective.kind !== evidence.kind) fail('scenarioAudit.cards.identity');
      if (passed !== scenarioObjectivePassed(objective, evidence)) fail('scenarioAudit.cards.verdict');
      if (objective.kind==='danxia_medicine_outcome' && evidence.kind==='danxia_medicine_outcome' &&
        (!w.worldgen?.resources.some(row=>row.actorId===objective.actorId) ||
          !w.settlements.villages.some(row=>row.id===objective.settlementId) ||
          evidence.verified!==verifiableDanxiaScenarioOutcome(w,objective,evaluatedTick))) fail('scenarioAudit.cards.danxiaProof');
      if (evidence.kind === 'cultivator_survives' &&
          ((!evidence.found && (evidence.alive || evidence.hp !== 0)) || (evidence.alive && evidence.hp <= 0))) fail('scenarioAudit.cards.survival');
      if (evidence.kind === 'site_qi' && !evidence.found && evidence.qi !== 0) fail('scenarioAudit.cards.qi');
      if (evidence.kind === 'sect_treasury' &&
          (evidence.total !== evidence.atSite + evidence.inTransit || (!evidence.found && evidence.total !== 0))) fail('scenarioAudit.cards.treasury');
    }
  }
  if (w.worldgen) {
    const birthActors = unique(w.worldgen.resources, (item) => item.actorId, 'worldgen.resources.actorId');
    if (w.worldgen.seed !== w.random.seed || w.worldgen.birthTick > w.tick ||
        birthActors.size === 0 || w.worldgen.resources.some(({ actorId, locationId }) => !actor.has(actorId) || !locations.has(locationId))) {
      fail('worldgen.references');
    }
  }
  if (w.terrain.tiles.length !== w.terrain.columns * w.terrain.rows) fail('terrain.tiles.length');
  if (w.terrain.tiles.some((tile, index) => tile.col !== index % w.terrain.columns ||
      tile.row !== Math.floor(index / w.terrain.columns) || (tile.ownerSectId && !sector.has(tile.ownerSectId)))) fail('terrain.tiles.grid');
  for (const sect of w.sects) {
    if (!locations.has(sect.headquartersId) || sect.arrayHp > sect.arrayMaxHp ||
        (sect.leaderId && !w.cultivators.some((person) => person.id === sect.leaderId && person.sectId === sect.id))) fail('sects.references');
  }
  for (const site of w.locations) if (site.ownerSectId && !sector.has(site.ownerSectId)) fail('locations.ownerSectId');
  for (const person of w.cultivators) {
    if ((person.sectId && !sector.has(person.sectId)) || (person.alive && !person.positionPlane && !locations.has(person.locationId)) || person.hp > person.maxHp ||
        (person.namedHeirId && (!actor.has(person.namedHeirId) || person.namedHeirId === person.id)) ||
        person.exploredTileIds.some((id) => !map.has(id)) || person.artifacts.some((art) => art.boundTo && !actor.has(art.boundTo))) fail('cultivators.references');
  }
  for (const edge of w.relationships) if (!actor.has(edge.fromId) || !actor.has(edge.toId) || edge.fromId === edge.toId) fail('relationships.references');
  for (const relation of w.diplomacy) if (!sector.has(relation.sectAId) || !sector.has(relation.sectBId) || relation.sectAId === relation.sectBId) fail('diplomacy.references');
  unique(w.diplomacy, (r) => [r.sectAId,r.sectBId].sort().join('|'), 'diplomacy.pairs');
  for (const siege of w.sieges) if (!sector.has(siege.attackerSectId) || !sector.has(siege.defenderSectId) ||
      siege.attackerSectId === siege.defenderSectId || siege.participantIds.some((id) => !actor.has(id))) fail('sieges.references');
  for (const tribute of w.tributeDemands) if (!sector.has(tribute.demanderSectId) || !sector.has(tribute.targetSectId) ||
      tribute.demanderSectId === tribute.targetSectId) fail('tributeDemands.references');
  for (const meeting of w.occasions) if (((meeting.status === 'registration' || meeting.status === 'running') && !locations.has(meeting.locationId)) ||
      meeting.participantIds.some((id) => !actor.has(id))) fail('occasions.references');
  for (const bounty of w.bounties) if (!actor.has(bounty.targetCultivatorId) || bounty.sponsorSectIds.some((id) => !sector.has(id)) ||
      bounty.escrow.some((item) => !sector.has(item.sectId)) || (bounty.hunterId && !actor.has(bounty.hunterId))) fail('bounties.references');
  unique(w.sieges, ({ id }) => id, 'sieges.id'); unique(w.tributeDemands, ({ id }) => id, 'tributeDemands.id');
  unique(w.ceasefires.agreements, ({ id }) => id, 'ceasefires.id');
}
