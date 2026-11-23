import { validateCourierHandoffHistory } from '../storageCourierHandoffValidation';
import { validateDanxiaSeasonReviewHistory } from '../storageDanxiaSeasonReviewValidation';
import { validateDanxiaMedicineHistory } from '../storageDanxiaMedicineValidation';
import { validateDanxiaShortageHistory } from '../storageDanxiaShortageValidation';
import { validateCareFollowupHistory } from '../storageCareFollowupValidation';
import { COURIER_OFFER_TICKS, COURIER_ROUTE_TICKS, COURIER_SERVICE_FEE } from '../sealedCourierEngine';
import { LEASE_DEPOSIT, LEASE_OFFER_TICKS, LEASE_TERM_TICKS, LEASE_UNIT_RENT, territorialLeaseAvailability } from '../territorialLeaseEngine';
import { FORMATION_DISPATCH_QI, FORMATION_DRAW_CAP, FORMATION_MAX_THROUGHPUT, FORMATION_OFFER_TICKS, FORMATION_OVERLOAD_QI, FORMATION_RECEIPT_LIMIT, FORMATION_REPAIR_COST, FORMATION_SETUP_COST, formationLinkAvailability } from '../formationNetworkEngine';
import { INFIRMARY_HEAL_FRACTION, INFIRMARY_MAX_BEDS, INFIRMARY_QUEUE_TICKS, INFIRMARY_SHIFT_TICKS, INFIRMARY_TREATMENT_HERBS, INFIRMARY_TREATMENT_STONES } from '../infirmaryEngine';
import { HABITAT_MIN_HEALTH, HABITAT_RESTORATION_TICKS, HABITAT_SURVEY_DELAY, HABITAT_SURVEY_WINDOW } from '../habitatEngine';
import { CHRONICLE_ERRATA_MAX_RETELLINGS, CHRONICLE_ERRATA_WINDOW } from '../chronicleErrataEngine';
import { terrainTileAt } from '../terrainEngine';
import { SETTLEMENT_RELIEF } from '../settlementEngine';
import type { WorldState } from '../../types/world';
import { fail } from './primitives';
import { unique } from './semanticShared';

export function validateLocalServices(
  w: WorldState,
  actor: ReadonlySet<string>,
  sector: ReadonlySet<string>,
  locations: ReadonlySet<string>,
): void {
  const courierSites = new Map(w.locations.map((site) => [site.id, site]));
  for (const row of w.couriers.dispatches) {
    const serial = Number(row.id.match(/^sealed-dispatch-([1-9][0-9]*)$/)?.[1]);
    const traveling = row.status === 'in_transit' || row.status === 'returning';
    const open = row.status === 'offered' || traveling;
    const accepted = row.acceptedTick !== undefined;
    const delivered = row.status === 'delivered';
    const allowedReason = row.status === 'declined' ? row.reason === 'declined' :
      row.status === 'expired' ? row.reason === 'offer_expiry' || row.reason === 'courier_death' :
      row.status === 'returned' ? ['recipient_absent','recipient_unavailable','route_lost'].some((reason) => reason === row.reason) :
      row.status === 'returning' ?
        ['recipient_absent','recipient_unavailable','hazard','route_lost'].some((reason) => reason === row.reason) :
      row.status === 'lost' ? ['hazard','courier_death','route_lost','deadline'].some((reason) => reason === row.reason) :
      row.reason === undefined;
    if (!Number.isSafeInteger(serial) || serial >= w.couriers.nextId || row.originId === row.destinationId ||
        new Set([row.senderId,row.recipientId,row.courierId]).size !== 3 ||
        [row.senderId,row.recipientId,row.courierId].some((id) => !actor.has(id)) ||
        row.openedTick > w.tick || row.offerExpiresTick !== row.openedTick + COURIER_OFFER_TICKS ||
        ((row.status === 'offered' || row.status === 'declined' || row.status === 'expired') && accepted) ||
        ((traveling || delivered || row.status === 'returned') && !accepted) ||
        (row.status === 'offered' && row.offerExpiresTick <= w.tick) ||
        (accepted !== (row.deadlineTick !== undefined)) || row.feePaid !== (accepted ? COURIER_SERVICE_FEE : 0) ||
        (row.acceptedTick !== undefined && (row.acceptedTick < row.openedTick || row.acceptedTick >= row.offerExpiresTick ||
          row.acceptedTick > w.tick || row.deadlineTick !== row.acceptedTick + COURIER_ROUTE_TICKS)) ||
        (open !== (row.settledTick === undefined)) ||
        (row.settledTick !== undefined && (row.settledTick > w.tick || row.settledTick < (row.acceptedTick ?? row.openedTick))) ||
        (row.status === 'expired' && row.reason === 'offer_expiry' && row.settledTick! < row.offerExpiresTick) ||
        (row.status === 'declined' && row.settledTick! >= row.offerExpiresTick) ||
        (traveling && row.deadlineTick! <= w.tick) || !allowedReason ||
        (delivered !== (row.deliveredTick !== undefined)) ||
        (delivered && (row.deliveredTick !== row.settledTick || row.deliveredTick !== row.lastAdvancedTick ||
          row.deliveredTick! >= row.deadlineTick!)) ||
        (row.lastAdvancedTick !== undefined && (!accepted || row.lastAdvancedTick <= row.acceptedTick! ||
          row.lastAdvancedTick > (row.settledTick ?? w.tick)))) fail('couriers.dispatches.references');
    if (traveling) {
      const start = courierSites.get(row.originId), end = courierSites.get(row.destinationId);
      if (row.path.length < 2 || row.pathIndex >= row.path.length || (!start && !end)) fail('couriers.dispatches.path');
      const first = row.path[0], last = row.path.at(-1)!;
      if (start && (first.x !== start.x || first.y !== start.y) ||
          end && (last.x !== end.x || last.y !== end.y)) fail('couriers.dispatches.path_ends');
      const tiles = row.path.map((p) => terrainTileAt(w, p.x, p.y));
      if (tiles.some((tile, i) => !tile || (i > 0 && (!tiles[i - 1] ||
        Math.abs(tile.col - tiles[i - 1]!.col) + Math.abs(tile.row - tiles[i - 1]!.row) > 1)))) fail('couriers.dispatches.path_tiles');
    } else if (row.path.length || row.pathIndex !== 0) fail('couriers.dispatches.path_closed');
    validateCourierHandoffHistory(w,row,courierSites,actor,fail);
    if (row.sealed.kind === 'public_relief') {
      const stamp = row.sealed;
      const sourceTick = Number(stamp.sourceEventId.match(/^evt-settlement-(\d+)-relief-/)?.[1]);
      const record = w.settlements.records.find(({ id }) => 'evt-' + id === stamp.sourceEventId);
      if (!Number.isSafeInteger(sourceTick) || sourceTick > row.openedTick ||
          stamp.sourceEventId !== 'evt-settlement-' + sourceTick + '-relief-' + stamp.settlementId + '-' + row.senderId ||
          stamp.stones !== SETTLEMENT_RELIEF.stones || stamp.herbs !== SETTLEMENT_RELIEF.jade_leaf ||
          (record && (record.tick !== sourceTick || record.kind !== 'relief' || record.settlementId !== stamp.settlementId ||
            record.actorId !== row.senderId || record.stones !== stamp.stones || record.herbs !== stamp.herbs))) fail('couriers.dispatches.public_proof');
    }
  }
  unique(w.watchlists.watches, ({ id }) => id, 'watchlists.watches.id');
  unique(w.watchlists.watches, ({ observerId, target }) => JSON.stringify([observerId, target.kind, target.id]), 'watchlists.watches.target');
  const watchById = new Map(w.watchlists.watches.map((row) => [row.id, row]));
  if (w.watchlists.lastCapturedTick !== undefined && w.watchlists.lastCapturedTick > w.tick) fail('watchlists.lastCapturedTick');
  for (const watch of w.watchlists.watches) {
    const serial = Number(watch.id.match(/^watch-([1-9][0-9]*)$/)?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.watchlists.nextId || !actor.has(watch.observerId) ||
        watch.createdTick > w.tick || watch.readThroughTick < watch.createdTick || watch.readThroughTick > w.tick ||
        !watch.label.trim() || /[\u0000-\u001f\u007f]/.test(watch.label)) fail('watchlists.watches.references');
  }
  unique(w.watchlists.digests, ({ watchId, tick }) => JSON.stringify([watchId, tick]), 'watchlists.digests.tick');
  for (const row of w.watchlists.digests) {
    const watch = watchById.get(row.watchId);
    if (!watch || row.tick <= watch.createdTick || row.tick > (w.watchlists.lastCapturedTick ?? -1) || !row.buckets.length) fail('watchlists.digests.references');
    unique(row.buckets, ({ category }) => category, 'watchlists.digests.category');
  }
  unique(w.territorialLeases.leases, ({ id }) => id, 'territorialLeases.leases.id');
  unique(w.territorialLeases.leases.filter(({ status }) => status === 'active'), ({ siteId }) => siteId,
    'territorialLeases.leases.active_site');
  for (const lease of w.territorialLeases.leases) {
    const serial = Number(lease.id.match(/^territorial-lease-([1-9][0-9]*)$/)?.[1]);
    const funded = lease.status === 'active' || lease.status === 'closed';
    const live = lease.status === 'active' || lease.status === 'offered';
    const receiptTimes = new Set<string>();
    if (!Number.isSafeInteger(serial) || serial >= w.territorialLeases.nextId ||
        lease.ownerSectId === lease.lesseeSectId || !sector.has(lease.ownerSectId) || !sector.has(lease.lesseeSectId) ||
        !actor.has(lease.ownerSignerId) || !actor.has(lease.lesseeSignerId) || lease.ownerSignerId === lease.lesseeSignerId ||
        lease.openedTick > w.tick || lease.offerExpiresTick !== lease.openedTick + LEASE_OFFER_TICKS ||
        (funded !== (lease.startsTick !== undefined)) || (funded !== (lease.endsTick !== undefined)) ||
        (lease.startsTick !== undefined && (lease.startsTick < lease.openedTick || lease.startsTick >= lease.offerExpiresTick ||
          lease.startsTick > w.tick || lease.endsTick !== lease.startsTick + LEASE_TERM_TICKS)) ||
        (live !== (lease.settledTick === undefined)) ||
        (lease.settledTick !== undefined && (lease.settledTick < (lease.startsTick ?? lease.openedTick) || lease.settledTick > w.tick)) ||
        (lease.status === 'active' && (!locations.has(lease.siteId) || lease.endsTick! <= w.tick || territorialLeaseAvailability(w, lease) === 'title_change')) ||
        (lease.status === 'offered' && lease.offerExpiresTick <= w.tick) ||
        (lease.status === 'declined' && lease.settledTick! >= lease.offerExpiresTick) ||
        (lease.status === 'expired' && lease.settledTick! < lease.offerExpiresTick) ||
        ((lease.status === 'closed') !== (lease.endReason !== undefined)) ||
        (lease.endReason === 'expiry' && lease.settledTick! < lease.endsTick!) ||
        (lease.endReason === 'surrender' && lease.settledTick! >= lease.endsTick!)) fail('territorialLeases.leases.references');
    if (lease.escrow + lease.rentPaid + lease.refunded !== (funded ? LEASE_DEPOSIT : 0) ||
        lease.usedUnits * LEASE_UNIT_RENT !== lease.rentPaid || (lease.status !== 'closed' && lease.refunded !== 0) ||
        (!funded && (lease.receipts.length || lease.usedUnits))) fail('territorialLeases.leases.balance');
    let summedUsed = 0, summedRent = 0, summedRefund = 0, lastTick = -1;
    for (const receipt of lease.receipts) {
      const key = JSON.stringify([receipt.tick, receipt.kind, receipt.actorId]);
      if (!funded || receipt.tick < (lease.startsTick ?? Infinity) || receipt.tick > w.tick || receipt.tick < lastTick || receiptTimes.has(key)) {
        fail('territorialLeases.leases.receipts.references');
      }
      receiptTimes.add(key); lastTick = receipt.tick;
      if (receipt.kind === 'harvest') {
        if (!receipt.actorId || !actor.has(receipt.actorId) || !receipt.herbId || !receipt.units ||
            receipt.amount !== receipt.units * LEASE_UNIT_RENT || receipt.tick >= lease.endsTick! ||
            receipt.tick > (lease.settledTick ?? w.tick)) fail('territorialLeases.leases.receipts.harvest');
        summedUsed += receipt.units ?? 0; summedRent += receipt.amount;
      } else {
        if (receipt.actorId !== undefined || receipt.herbId !== undefined || receipt.units !== undefined ||
            lease.status !== 'closed' || receipt.tick < lease.settledTick!) fail('territorialLeases.leases.receipts.refund');
        summedRefund += receipt.amount;
      }
    }
    if (summedUsed !== lease.usedUnits || summedRent !== lease.rentPaid || summedRefund !== lease.refunded) fail('territorialLeases.leases.receipts.totals');
  }
  unique(w.formations.links, ({ id }) => id, 'formations.links.id');
  unique(w.formations.links.filter(({ status }) => status === 'offered' || status === 'active' || status === 'broken'),
    ({ sectAId, sectBId }) => JSON.stringify([sectAId, sectBId]), 'formations.links.active_pair');
  for (const link of w.formations.links) {
    const serial = Number(link.id.match(/^formation-link-([1-9][0-9]*)$/)?.[1]);
    const funded = link.status === 'active' || link.status === 'broken' || link.status === 'ended';
    const open = link.status === 'offered' || link.status === 'active' || link.status === 'broken';
    if (!Number.isSafeInteger(serial) || serial >= w.formations.nextId || link.sectAId >= link.sectBId ||
        !sector.has(link.sectAId) || !sector.has(link.sectBId) || link.siteAId === link.siteBId ||
        !actor.has(link.proposerId) || !actor.has(link.recipientLeaderId) || link.proposerId === link.recipientLeaderId ||
        (link.proposerSectId !== link.sectAId && link.proposerSectId !== link.sectBId) ||
        link.openedTick > w.tick || link.offerExpiresTick !== link.openedTick + FORMATION_OFFER_TICKS ||
        (funded !== (link.fundedTick !== undefined)) || link.openedPaymentEach !== (funded ? FORMATION_SETUP_COST : 0) ||
        (link.fundedTick !== undefined && (link.fundedTick < link.openedTick || link.fundedTick >= link.offerExpiresTick || link.fundedTick > w.tick)) ||
        (open !== (link.settledTick === undefined)) ||
        (link.settledTick !== undefined && (link.settledTick < (link.fundedTick ?? link.openedTick) || link.settledTick > w.tick)) ||
        (link.status === 'offered' && link.offerExpiresTick <= w.tick) ||
        (link.status === 'expired' && link.settledTick! < link.offerExpiresTick) ||
        (link.status === 'declined' && link.settledTick! >= link.offerExpiresTick) ||
        (link.status === 'ended' ? link.endReason !== 'site_lost' : link.endReason !== undefined)) fail('formations.links.references');
    if ((link.status === 'active' || link.status === 'broken') && formationLinkAvailability(w, link) === 'site_lost') fail('formations.links.endpoints');
    const stamps = [link.lastDispatchTick, link.lastDrawTick, link.lastRepairTick, link.brokenTick];
    if (stamps.some((stamp) => stamp !== undefined && (!funded || stamp < link.fundedTick! || stamp > (link.settledTick ?? w.tick))) ||
        (link.status === 'broken' && (link.brokenTick === undefined || (link.lastRepairTick ?? -1) >= link.brokenTick)) ||
        (link.status === 'active' && link.brokenTick !== undefined && (link.lastRepairTick ?? -1) <= link.brokenTick) ||
        ((link.repairTotal > 0) !== (link.lastRepairTick !== undefined)) ||
        (link.lastRepairTick !== undefined && link.brokenTick === undefined)) fail('formations.links.timestamps');
    if (link.sentTotal !== link.transmissionLoss + link.deliveredTotal ||
        link.deliveredTotal !== link.drawnTotal + link.dissipatedTotal + link.heldA + link.heldB ||
        link.repairTotal % FORMATION_REPAIR_COST !== 0 ||
        (!funded && [link.sentTotal,link.drawnTotal,link.repairTotal,link.receipts.length].some(Boolean)) ||
        (link.status === 'ended' ? (link.heldA !== 0 || link.heldB !== 0) : link.dissipatedTotal !== 0) ||
        ((link.sentTotal > 0) !== (link.lastDispatchTick !== undefined)) ||
        ((link.drawnTotal > 0) !== (link.lastDrawTick !== undefined))) fail('formations.links.conservation');
    const observed = { sent:0, delivered:0, lost:0, drawn:0, dissipated:0, stonesSpent:0 };
    const uses = new Set<string>();
    const latest = new Map<string, number>();
    for (const receipt of link.receipts) {
      const { tick: when, kind, actorId, fromSiteId, toSiteId, sent, delivered, lost, drawn, stonesSpent, dissipated } = receipt;
      const category = kind === 'dispatch' || kind === 'overload' ? 'transfer' : kind;
      const use = JSON.stringify([category, when]);
      const keys = Object.keys(receipt);
      const exactShape = (fields: readonly string[]) => keys.length === fields.length && keys.every((key) => fields.includes(key));
      const base = ['tick','kind','actorId','fromSiteId'];
      if (!funded || when < link.fundedTick! || when > (link.settledTick ?? w.tick) || uses.has(use) ||
          (kind !== 'dissipate' && (!actorId || !actor.has(actorId) || (fromSiteId !== link.siteAId && fromSiteId !== link.siteBId)))) fail('formations.links.receipts.references');
      uses.add(use);
      if ((latest.get(category) ?? -1) > when) fail('formations.links.receipts.order');
      latest.set(category, when);
      if (kind === 'dispatch' || kind === 'overload') {
        const amount = kind === 'dispatch' ? FORMATION_DISPATCH_QI : FORMATION_OVERLOAD_QI;
        const through = Math.min(amount, FORMATION_MAX_THROUGHPUT);
        const maximum = Math.max(0, through - Math.ceil(through / 5) - Math.ceil(link.steps / 6));
        if (!exactShape([...base,'toSiteId','sent','delivered','lost']) || sent !== amount || delivered === undefined || lost === undefined ||
            toSiteId !== (fromSiteId === link.siteAId ? link.siteBId : link.siteAId) ||
            sent !== delivered + lost || delivered > maximum) fail('formations.links.receipts.transfer');
        observed.sent += sent ?? 0; observed.delivered += delivered ?? 0; observed.lost += lost ?? 0;
        if (kind === 'overload') latest.set('overload', when);
      } else if (kind === 'draw') {
        if (!exactShape([...base,'drawn']) || !(drawn && drawn <= FORMATION_DRAW_CAP)) fail('formations.links.receipts.draw');
        observed.drawn += drawn ?? 0;
      } else if (kind === 'repair') {
        if (!exactShape([...base,'stonesSpent']) || stonesSpent !== FORMATION_REPAIR_COST) fail('formations.links.receipts.repair');
        observed.stonesSpent += stonesSpent ?? 0;
      } else {
        if (!exactShape(['tick','kind','dissipated']) || link.status !== 'ended' || when !== link.settledTick ||
            dissipated !== link.dissipatedTotal) fail('formations.links.receipts.dissipate');
        observed.dissipated += dissipated ?? 0;
      }
    }
    if ((link.status === 'ended') !== latest.has('dissipate') ||
        [...latest].some(([key, when]) => key !== 'dissipate' && when !==
          (key === 'transfer' ? link.lastDispatchTick : key === 'draw' ? link.lastDrawTick : key === 'overload' ? link.brokenTick : link.lastRepairTick))) fail('formations.links.receipts.last');
    const totals = [link.sentTotal,link.deliveredTotal,link.transmissionLoss,link.drawnTotal,link.dissipatedTotal,link.repairTotal];
    if (Object.values(observed).some((amount,index) => amount > totals[index] ||
        (link.receipts.length < FORMATION_RECEIPT_LIMIT && amount !== totals[index]))) fail('formations.links.receipts.totals');
  }
  const infirmarySerials = new Set<number>();
  const infirmaryShifts = new Map(w.infirmaries.shifts.map((shift) => [shift.id, shift]));
  const infirmaryPatientMax = new Map(w.cultivators.map(({ id, maxHp }) => [id, maxHp]));
  const validInfirmarySerial = (id: string, kind: 'shift' | 'case') => {
    const serial = Number(id.match(new RegExp('^infirmary-' + kind + '-([1-9][0-9]*)$'))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.infirmaries.nextId || infirmarySerials.has(serial)) fail('infirmaries.nextId');
    infirmarySerials.add(serial);
  };
  unique(w.infirmaries.shifts.filter(({ expiresTick }) => expiresTick > w.tick), ({ guardId }) => guardId, 'infirmaries.shifts.active_guard');
  for (const shift of w.infirmaries.shifts) {
    validInfirmarySerial(shift.id, 'shift');
    if (!actor.has(shift.guardId) || !sector.has(shift.sectId) || shift.startedTick > w.tick ||
        shift.expiresTick !== shift.startedTick + INFIRMARY_SHIFT_TICKS ||
        (shift.lastServedTick !== undefined && (shift.lastServedTick <= shift.startedTick || shift.lastServedTick >= shift.expiresTick ||
          shift.lastServedTick > w.tick)) ||
        (shift.lastWithheld && (shift.lastWithheld.tick <= shift.startedTick || shift.lastWithheld.tick >= shift.expiresTick ||
          shift.lastWithheld.tick > w.tick || shift.lastWithheld.tick === shift.lastServedTick))) fail('infirmaries.shifts.references');
  }
  unique(w.infirmaries.cases.filter(({ status }) => status === 'waiting'), ({ patientId }) => patientId, 'infirmaries.cases.active_patient');
  const serviceUses = new Set<string>(), bedUses = new Map<string, number>();
  for (const row of w.infirmaries.cases) {
    validInfirmarySerial(row.id, 'case');
    const waiting = row.status === 'waiting';
    const treated = row.status === 'treated';
    if (!actor.has(row.patientId) || !sector.has(row.sectId) || row.queuedTick > w.tick ||
        row.expiresTick !== row.queuedTick + INFIRMARY_QUEUE_TICKS ||
        (waiting !== (row.settledTick === undefined)) || (treated !== (row.receipt !== undefined)) ||
        (waiting && (row.expiresTick <= w.tick || !locations.has(row.siteId))) ||
        (row.settledTick !== undefined && (row.settledTick < row.queuedTick || row.settledTick > w.tick)) ||
        (row.status === 'refused' ? row.reason !== 'refused' || row.settledTick! >= row.expiresTick :
          row.status === 'closed' ? !row.reason || row.reason === 'refused' ||
            (row.reason === 'expiry' ? row.settledTick! < row.expiresTick : row.settledTick! >= row.expiresTick) :
            row.reason !== undefined)) fail('infirmaries.cases.references');
    const receipt = row.receipt;
    if (!receipt) continue;
    const shift = infirmaryShifts.get(receipt.shiftId);
    const serviceKey = JSON.stringify([receipt.shiftId, receipt.tick]);
    const bedKey = JSON.stringify([row.sectId, row.siteId, receipt.tick]);
    const uses = (bedUses.get(bedKey) ?? 0) + 1;
    if (receipt.handoff) {
      const primary = infirmaryShifts.get(receipt.handoff.fromShiftId);
      if (!primary || primary.id === receipt.shiftId || primary.guardId === receipt.guardId || primary.guardId === row.patientId ||
          primary.sectId !== row.sectId || primary.siteId !== row.siteId ||
          receipt.tick <= primary.startedTick || receipt.tick >= primary.expiresTick ||
          !primary.lastWithheld || primary.lastWithheld.tick < receipt.tick ||
          (primary.lastWithheld.tick === receipt.tick && primary.lastWithheld.duty !== receipt.handoff.duty) ||
          primary.lastServedTick === receipt.tick) fail('infirmaries.cases.handoff');
    }
    if (!shift || receipt.guardId !== shift.guardId || receipt.guardId === row.patientId || shift.sectId !== row.sectId ||
        shift.siteId !== row.siteId || receipt.tick !== row.settledTick || receipt.tick <= row.queuedTick ||
        receipt.tick >= row.expiresTick || receipt.tick <= shift.startedTick || receipt.tick >= shift.expiresTick ||
        shift.lastServedTick === undefined || receipt.tick > shift.lastServedTick || serviceUses.has(serviceKey) || uses > INFIRMARY_MAX_BEDS ||
        receipt.stonesSpent !== INFIRMARY_TREATMENT_STONES || receipt.herbsSpent !== INFIRMARY_TREATMENT_HERBS ||
        receipt.hpRestored > Math.round((receipt.maxHpAtVisit ?? infirmaryPatientMax.get(row.patientId) ?? 0) * INFIRMARY_HEAL_FRACTION)) fail('infirmaries.cases.receipt');
    serviceUses.add(serviceKey);
    bedUses.set(bedKey, uses);
  }
  validateCareFollowupHistory(w, serviceUses, bedUses, fail);
  validateDanxiaShortageHistory(w, actor, fail);
  validateDanxiaMedicineHistory(w, actor, fail);
  validateDanxiaSeasonReviewHistory(w, actor, fail);
  const habitatSerials = new Set<number>();
  const habitatBeasts = new Map(w.spiritBeasts.map((animal) => [animal.id, animal]));
  const habitatSites = new Map(w.locations.map((site) => [site.id, site]));
  const habitatSerial = (id: string, kind: 'restoration' | 'release') => {
    const serial = Number(id.match(new RegExp('^habitat-' + kind + '-([1-9][0-9]*)$'))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.habitats.nextId || habitatSerials.has(serial)) fail('habitats.nextId');
    habitatSerials.add(serial);
  };
  unique(w.habitats.stewardships.filter(({ endedTick }) => endedTick === undefined),
    ({ siteId }) => siteId, 'habitats.stewardships.active_site');
  for (const row of w.habitats.stewardships) {
    habitatSerial(row.id, 'restoration');
    const site = habitatSites.get(row.siteId);
    if (!actor.has(row.stewardId) || !sector.has(row.sponsorSectId) || row.restoredTick > w.tick ||
        row.expiresTick !== row.restoredTick + HABITAT_RESTORATION_TICKS ||
        ((row.endedTick === undefined) !== (row.endReason === undefined)) ||
        (row.endedTick === undefined && (row.expiresTick <= w.tick || site?.type !== 'spirit_vein' ||
          Boolean(site.ownerSectId && site.ownerSectId !== row.sponsorSectId) ||
          w.sects.some(({ headquartersId }) => headquartersId === row.siteId))) ||
        (row.endedTick !== undefined && (row.endedTick < row.restoredTick || row.endedTick > w.tick ||
          (row.endReason === 'expiry' ? row.endedTick < row.expiresTick : row.endedTick >= row.expiresTick)))) {
      fail('habitats.stewardships.references');
    }
  }
  unique(w.habitats.releases.filter(({ status }) => status === 'monitoring'),
    ({ beastId }) => beastId, 'habitats.releases.monitoring_beast');
  for (const row of w.habitats.releases) {
    habitatSerial(row.id, 'release');
    const beast = habitatBeasts.get(row.beastId);
    if (!beast || !actor.has(row.formerOwnerId) || row.releasedTick > w.tick ||
        row.earliestSurveyTick !== row.releasedTick + HABITAT_SURVEY_DELAY || row.deadlineTick !== row.releasedTick + HABITAT_SURVEY_WINDOW ||
        (row.status === 'monitoring' && (row.settledTick !== undefined || row.deadlineTick <= w.tick)) ||
        (row.status !== 'monitoring' && (row.settledTick === undefined || row.settledTick > w.tick)) ||
        (row.status === 'unconfirmed' && row.settledTick! < row.deadlineTick)) fail('habitats.releases.references');
    const eye = row.observation;
    const maxBeastHp = beast?.maxHp ?? 0;
    if ((row.status === 'sighted') !== (eye !== undefined) ||
        (eye && (eye.observerId === row.formerOwnerId || !actor.has(eye.observerId) || eye.tick !== row.settledTick ||
          eye.tick < row.earliestSurveyTick || eye.tick >= row.deadlineTick || eye.hp > maxBeastHp ||
          eye.hp < maxBeastHp * HABITAT_MIN_HEALTH))) fail('habitats.releases.sighting');
  }
  unique(w.chronicleErrata.sources, ({ sourceEventId }) => sourceEventId, 'chronicleErrata.sources.id');
  const errataSources = new Map(w.chronicleErrata.sources.map((row) => [row.sourceEventId, row]));
  const errataVenues = new Map(w.locations.map(({ id, type }) => [id, type]));
  const errataPrivate = new Set(w.events.filter(({ witnessScope, tick }) => witnessScope === 'participants' || tick > w.tick).map(({ id }) => id));
  for (const fact of errataSources.values()) {
    const type = errataVenues.get(fact.locationId);
    if (fact.tick > w.tick || errataPrivate.has(fact.sourceEventId) || type === 'secret_realm') {
      fail('chronicleErrata.sources.public_time');
    }
    if (fact.kind === 'duel') {
      const liveFact = w.witnesses.facts.find(({ eventId }) => eventId === fact.sourceEventId);
      const publicEvent = w.events.find(({ id }) => id === fact.sourceEventId);
      if (fact.participantIds.length !== 2 || new Set(fact.participantIds).size !== 2 ||
          fact.participantIds.some((id) => !actor.has(id)) || !fact.participantIds.includes(fact.winnerId) ||
          !['duel', 'kill'].some((suffix) => fact.sourceEventId === 'evt-' + fact.tick + '-' + fact.participantIds[0] + '-' + suffix) ||
          (liveFact && (liveFact.tick !== fact.tick || liveFact.locationId !== fact.locationId || liveFact.winnerId !== fact.winnerId ||
            fact.participantIds.some((id) => !liveFact.participantIds.includes(id)))) ||
          (publicEvent && (publicEvent.tick !== fact.tick || publicEvent.locationId !== fact.locationId || publicEvent.duelWinnerId !== fact.winnerId ||
            fact.participantIds.some((id) => !publicEvent.actorIds.includes(id))))) fail('chronicleErrata.sources.duel_proof');
    } else {
      const recordId = 'settlement-' + fact.tick + '-relief-' + fact.settlementId + '-' + fact.actorId;
      const receipt = w.settlements.records.find(({ id }) => id === recordId);
      if ((type && type !== 'market') || !actor.has(fact.actorId) || fact.sourceEventId !== 'evt-' + recordId ||
          fact.stones !== SETTLEMENT_RELIEF.stones || fact.herbs !== SETTLEMENT_RELIEF.jade_leaf ||
          (receipt && (receipt.kind !== 'relief' || receipt.tick !== fact.tick || receipt.actorId !== fact.actorId ||
            receipt.settlementId !== fact.settlementId || receipt.stones !== fact.stones || receipt.herbs !== fact.herbs))) fail('chronicleErrata.sources.relief_proof');
    }
  }
  const errataSerials = new Set<number>();
  const validateErrataSerial = (id: string, kind: 'retelling' | 'correction') => {
    const serial = Number(id.match(new RegExp('^chronicle-' + kind + '-([1-9][0-9]*)$'))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.chronicleErrata.nextId || errataSerials.has(serial)) fail('chronicleErrata.nextId');
    errataSerials.add(serial);
  };
  const errataClaims = new Map<string, typeof w.chronicleErrata.retellings>();
  unique(w.chronicleErrata.retellings, ({ sourceEventId, authorId }) => JSON.stringify([sourceEventId, authorId]), 'chronicleErrata.retellings.once');
  const errataKey = (reading: typeof w.chronicleErrata.retellings[number]['reading']) =>
    reading.kind === 'duel' ? reading.winnerId : reading.delivery;
  for (const row of w.chronicleErrata.retellings) {
    validateErrataSerial(row.id, 'retelling');
    const fact = errataSources.get(row.sourceEventId);
    if (!fact || !actor.has(row.authorId) || row.tick < fact.tick || row.tick > w.tick ||
        row.tick >= fact.tick + CHRONICLE_ERRATA_WINDOW || row.reading.kind !== fact.kind ||
        (fact.kind === 'duel' && row.reading.kind === 'duel' && !fact.participantIds.includes(row.reading.winnerId))) fail('chronicleErrata.retellings.provenance');
    const claims = errataClaims.get(row.sourceEventId) ?? [];
    if (claims.length >= CHRONICLE_ERRATA_MAX_RETELLINGS) fail('chronicleErrata.retellings.count');
    claims.push(row); errataClaims.set(row.sourceEventId, claims);
  }
  unique(w.chronicleErrata.corrections, ({ sourceEventId }) => sourceEventId, 'chronicleErrata.corrections.once');
  for (const row of w.chronicleErrata.corrections) {
    validateErrataSerial(row.id, 'correction');
    const fact = errataSources.get(row.sourceEventId);
    const claims = errataClaims.get(row.sourceEventId) ?? [];
    const ids = new Set(row.contestedRetellingIds);
    if (!fact || !actor.has(row.editorId) || row.tick < fact.tick || row.tick > w.tick || row.tick >= fact.tick + CHRONICLE_ERRATA_WINDOW ||
        (fact.kind === 'duel' ? fact.participantIds.includes(row.editorId) : fact.actorId === row.editorId) ||
        row.reading.kind !== fact.kind || errataKey(row.reading) !== (fact.kind === 'duel' ? fact.winnerId : 'full_supplies') ||
        ids.size !== claims.length || ids.size !== row.contestedRetellingIds.length ||
        new Set(claims.map(({ reading }) => errataKey(reading))).size < 2 ||
        claims.some((claim) => claim.authorId === row.editorId || claim.tick >= row.tick || !ids.has(claim.id))) fail('chronicleErrata.corrections.provenance');
  }
  unique(w.pilgrimages.journeys, ({ id }) => id, 'pilgrimages.journeys.id');
}
