export const WAYPOST_MEAL_LEAF = 'jade_leaf';
export const WAYPOST_MEAL_REST = 5;
export const WAYPOST_MEAL_REPLY_TICKS = 3;
export const WAYPOST_MEAL_TERMINAL_LIMIT = 24;

export type WaypostMealMove = 'offer' | 'accept' | 'decline' | 'withdraw';
export type WaypostMealStatus = 'offered' | 'served' | 'declined' | 'withdrawn' | 'missed' | 'expired';
export type WaypostMealOption = { action: 'WAYPOST_MEAL' } & (
  { waypostMealMove: 'offer'; targetCultivatorId: string; targetWaypostMealId?: never } |
  { waypostMealMove: Exclude<WaypostMealMove, 'offer'>; targetWaypostMealId: string; targetCultivatorId?: never }
);
export interface WaypostMealVisit {
  journeyId: string;
  organizerId: string;
  companionId: string;
  spentByEach: number;
  legIndex: number;
  pathIndex: number;
  reachedTick: number;
  originId: string;
  destinationId: string;
}
export interface WaypostMealWitness {
  mealId:string;
  offeredTick:number;
  legIndex:number;
  pathIndex:number;
  reachedTick:number;
  tileId:string;
  point:{x:number;y:number};
}
export interface WaypostMealRecovery {
  actorId: string;
  beforeHp: number;
  afterHp: number;
  maxHp: number;
}
export interface WaypostMeal {
  id: string;
  hostId: string;
  guestId: string;
  hostVisit: WaypostMealVisit;
  guestVisit: WaypostMealVisit;
  tileId: string;
  point: { x: number; y: number };
  offeredTick: number;
  expiresTick: number;
  status: WaypostMealStatus;
  escrowLeaves: 0 | 1;
  spentLeaves: 0 | 1;
  returnedLeaves: 0 | 1;
  closedTick?: number;
  recovery?: [WaypostMealRecovery, WaypostMealRecovery];
}
export interface WaypostMealState {
  version: 1;
  nextId: number;
  meals: WaypostMeal[];
}
export const waypostMealId = (serial: number): string => `waypost-meal-${serial}`;
export const waypostMealEventId = (id: string, tick: number, phase: WaypostMealStatus): string => `evt-${id}-${tick}-${phase}`;
