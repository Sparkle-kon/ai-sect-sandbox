import type { WorkshopOrder } from '../types/world';

export const WORKSHOP_CAPACITY_RECOVERY_TICKS=4;
/** Only an actually accepted amendment may replace the execution limit; original terms remain in the order. */
export const effectiveWorkshopDeadline=(order:WorkshopOrder):number|undefined =>
  order.estateContinuation?.workUntilTick??order.capacityAmendment?.workUntilTick??order.deadlineTick;
export const effectiveWorkshopQuantity=(order:WorkshopOrder):number =>
  order.capacityAmendment?.keptQuantity??order.quantity;
