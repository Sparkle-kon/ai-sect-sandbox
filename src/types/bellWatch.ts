import type { RouteWarningHazardProof } from './world';

export type BellWatchMove = 'inspect' | 'reroute';
export type BellWatchOutcome = 'inspected' | 'arrived' | 'blocked' | 'absent';

export interface BellWatchListener {
  actorId: string;
  siteId: string;
}

export interface BellWatchDamage {
  hazard: RouteWarningHazardProof;
  tick: number;
  integrityBefore: number;
  integrityAfter: number;
}

export interface BellWatchChoice {
  move: BellWatchMove;
  tick: number;
  pathTileIds: string[];
  pathIndex: number;
  destinationId: string;
  returning?: true;
  lastMovedTick?: number;
  endedTick?: number;
  outcome?: BellWatchOutcome;
}

export interface BellWatchReceipt extends BellWatchListener {
  tick: number;
}

export interface BellWatchState {
  id: string;
  sectId: string;
  openedTick: number;
  watcherId: string;
  listeners: BellWatchListener[];
  damage?: BellWatchDamage;
  choice?: BellWatchChoice;
  receipts: BellWatchReceipt[];
  waits?: BellWatchReceipt[];
}

export interface BellWatchOption {
  chosenAction: 'BELL_WATCH';
  bellWatchMove: BellWatchMove;
  targetBellWatchId: string;
}

export interface BellWatchView {
  title: string;
  siteId: string;
  phase: 'pending' | 'travelling' | 'awaiting' | 'received' | 'not_received';
  body: string;
  options: BellWatchOption[];
}

/** Predictable private marker ID, without a readable location or outcome in generic history. */
export function bellWatchEventId(watchId:string,kind:string,tick:number,proof?:string):string{
  let key=0xcbf29ce484222325n;
  for(const value of JSON.stringify([watchId,kind,proof??null]))
    key=BigInt.asUintN(64,(key^BigInt(value.codePointAt(0)??0))*0x100000001b3n);
  return `evt-bell-report-${tick}-${key.toString(16).padStart(16,'0')}`;
}

export function bellWatchEventProof(watch:BellWatchState,kind:string):string|undefined{
  const {choice,damage}=watch;
  if(kind==='changed'&&damage)return JSON.stringify([damage.hazard.id,damage.hazard.tileId,damage.hazard.createdTick,
    damage.integrityBefore,damage.integrityAfter]);
  if(kind==='waiting'&&watch.waits) return JSON.stringify(watch.waits.map(row=>[row.actorId,row.siteId,row.tick]));
  if(choice&&kind==='settled')return JSON.stringify([choice.outcome,choice.pathIndex,
    watch.receipts.map(row=>[row.actorId,row.siteId,row.tick])]);
  if(choice&&kind===choice.move)return JSON.stringify([choice.move,choice.destinationId,choice.pathTileIds]);
  return undefined;
}
