import type {
  Cultivator, FieldObservatoryRun, LLMDecisionPayload, LocationNode, ShortShift, ShortShiftMove,
  ShortShiftState, WorldEvent, WorldState,
} from '../types/world';
import { OBSERVATORY_RETENTION_TICKS } from './fieldObservatoryEngine';
import { terrainTileAt } from './terrainEngine';
import { localQiWeather } from './weatherEngine';

export const SHORT_SHIFT_WAGE = 12;
export const SHORT_SHIFT_OFFER_TICKS = 3;
const SHORT_SHIFT_HISTORY_LIMIT = 96;

export type ShortShiftOption = { action:'SHORT_SHIFT' } & (
  | {shortShiftMove:'offer'; targetCultivatorId:string; targetObservatoryTick:number; targetShortShiftId?:never}
  | {shortShiftMove:Exclude<ShortShiftMove,'offer'>; targetShortShiftId:string; targetCultivatorId?:never; targetObservatoryTick?:never}
);
type MeasuredRun = Extract<FieldObservatoryRun,{status:'measured'}>;
type Reason = NonNullable<ShortShift['closeReason']>;
const open = (row: ShortShift) => row.status==='offered' || row.status==='active';
const live = (actor: Cultivator | undefined): actor is Cultivator => Boolean(actor?.alive && actor.hp>0);
const at = (world: WorldState,id: string) => world.cultivators.find(actor=>actor.id===id);
const siteAt = (world: WorldState,id: string) => world.locations.find(site=>site.id===id);
const participant = (row: ShortShift,id: string) => row.hostId===id || row.workerId===id;
const ascii = (a: string,b: string) => a<b ? -1 : a>b ? 1 : 0;
const personalFunds = (actor: Cultivator) => Number.isFinite(actor.spiritStones) && actor.spiritStones>=SHORT_SHIFT_WAGE;

export const createShortShiftState = (): ShortShiftState => ({shifts:[],nextId:1});

function physicallyAt(world: WorldState,actor: Cultivator|undefined,locationId: string,tick: number): actor is Cultivator {
  if (!live(actor) || actor.locationId!==locationId || actor.tribulation?.stage==='lightning' || actor.tribulation?.stage==='heart_demon') return false;
  const id=actor.id;
  return !world.couriers.dispatches.some(row=>row.courierId===id &&
      (row.status==='in_transit' || row.status==='returning' || row.acceptedTick===tick || row.lastAdvancedTick===tick || row.settledTick===tick)) &&
    !world.pilgrimages.journeys.some(row=>(row.organizerId===id || row.companionId===id) &&
      (row.status==='active' || row.startedTick===tick || row.lastMovedTick===tick)) &&
    !world.escorts.contracts.some(row=>row.escortId===id && row.status==='active') &&
    !world.relocations.plans.some(row=>row.status==='in_transit' && row.garrisonIds.includes(id)) &&
    !world.sieges.some(row=>row.participantIds.includes(id) && (row.status==='marching' || row.status==='sieging')) &&
    !world.occasions.some(row=>(row.status==='running' || row.status==='registration') && row.participantIds.includes(id) &&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id && rescue.arrivedIds?.includes(id)));
}

function titledSite(world: WorldState,host: Cultivator|undefined,hostSectId: string,siteId: string) {
  const site=siteAt(world,siteId);
  if (!live(host) || host.sectId!==hostSectId || host.sectRank!=='掌门' || !site || site.type!=='sect_hq' ||
    site.ownerSectId!==hostSectId || !terrainTileAt(world,site.x,site.y) ||
    !world.sects.some(sect=>sect.id===hostSectId && sect.leaderId===host.id && sect.headquartersId===site.id) ||
    world.relocations.plans.some(row=>row.sectId===hostSectId && row.status==='in_transit') ||
    world.sieges.some(row=>row.destinationId===site.id && row.status==='sieging')) return undefined;
  return site;
}
const visitor = (world: WorldState,actor: Cultivator|undefined,expectedSect: string,hostSectId: string): actor is Cultivator =>
  live(actor) && !!expectedSect && expectedSect!==hostSectId && actor.sectId===expectedSect && world.sects.some(sect=>sect.id===expectedSect) &&
  !world.diplomacy.some(row=>row.pact==='war' && ((row.sectAId===expectedSect && row.sectBId===hostSectId) ||
    (row.sectBId===expectedSect && row.sectAId===hostSectId)));
const observations = (world: WorldState,id: string) => Object.hasOwn(world.fieldObservatories.byActor,id) ?
  world.fieldObservatories.byActor[id].runs : [];
const measured = (world: WorldState,hostId: string,siteId: string,observedTick: number,throughTick: number) =>
  observations(world,hostId).filter((run):run is MeasuredRun=>run.status==='measured' && run.locationId===siteId &&
    run.targetTick<=observedTick && throughTick-run.targetTick<=OBSERVATORY_RETENTION_TICKS);
const heldSource = (world: WorldState,row: ShortShift,observedTick: number,throughTick=observedTick) =>
  measured(world,row.hostId,row.siteId,observedTick,throughTick).some(run=>run.openedTick===row.observatoryOpenedTick);
const instrumentBusy = (world: WorldState,actor: Cultivator,tick: number) => observations(world,actor.id).some(run=>
  run.openedTick===tick || (run.status==='pending' || run.status==='measured') && run.targetTick===tick ||
  run.status==='measured' && run.relay?.relayedTick===tick);

function siteAuthority(world: WorldState,row: ShortShift,host: Cultivator|undefined,worker: Cultivator|undefined,tick: number,
  throughTick=tick):LocationNode|undefined {
  const site=titledSite(world,host,row.hostSectId,row.siteId);
  return site && visitor(world,worker,row.workerSectId,row.hostSectId) && heldSource(world,row,tick,throughTick) ? site : undefined;
}

export function availableShortShiftActions(actor: Cultivator,world: WorldState,executionTick=world.tick): ShortShiftOption[] {
  if ((executionTick!==world.tick && executionTick!==world.tick+1) || !live(actor) || !world.cultivators.includes(actor)) return [];
  const { shifts }=world.shortShifts;
  const own=shifts.find(row=>open(row) && participant(row,actor.id));
  if (own) {
    const result:ShortShiftOption[]=[];
    const add=(shortShiftMove:Exclude<ShortShiftMove,'offer'>)=>result.push({action:'SHORT_SHIFT',shortShiftMove,targetShortShiftId:own.id});
    const host=at(world,own.hostId),worker=at(world,own.workerId);
    if (own.status==='offered' && own.offeredTick<=executionTick && executionTick<own.offerExpiresTick) {
      if (own.hostId===actor.id) add('withdraw');
      else {
        add('decline');
        if (executionTick>own.offeredTick && siteAuthority(world,own,host,worker,executionTick,executionTick+1) &&
          physicallyAt(world,host,own.siteId,executionTick) && physicallyAt(world,actor,own.siteId,executionTick) &&
          personalFunds(host) && !instrumentBusy(world,actor,executionTick+1)) add('accept');
      }
    } else if (own.status==='active' && own.shiftTick!==undefined && executionTick<=own.shiftTick) {
      if ((own.acceptedTick??Infinity)<=executionTick) add('withdraw');
      if (own.workerId===actor.id && executionTick===own.shiftTick && siteAuthority(world,own,host,worker,executionTick) &&
        physicallyAt(world,actor,own.siteId,executionTick) && !instrumentBusy(world,actor,executionTick) &&
        Number.isFinite(actor.spiritStones) && actor.spiritStones>=0 && own.escrowStones===SHORT_SHIFT_WAGE) add('work');
    }
    return result;
  }
  const site=titledSite(world,actor,actor.sectId,actor.locationId);
  if (!site || !personalFunds(actor) || !physicallyAt(world,actor,site.id,executionTick) ||
      shifts.some(row=>open(row) && row.siteId===site.id)) return [];
  const readings=measured(world,actor.id,site.id,executionTick,executionTick+SHORT_SHIFT_OFFER_TICKS)
    .sort((a,b)=>b.openedTick-a.openedTick);
  if (!readings.length) return [];
  const occupied=new Set(shifts.filter(open).flatMap(row=>[row.hostId,row.workerId]));
  const candidates=world.cultivators.filter(worker=>!occupied.has(worker.id) &&
    visitor(world,worker,worker.sectId,actor.sectId) && physicallyAt(world,worker,site.id,executionTick))
    .sort((a,b)=>ascii(a.id,b.id));
  return candidates.flatMap(worker=>readings.map(run=>({
    action:'SHORT_SHIFT',shortShiftMove:'offer',targetCultivatorId:worker.id,targetObservatoryTick:run.openedTick,
  })));
}

function event(world: WorldState,row: ShortShift,token: string,title: string,description: string): WorldEvent {
  return {id:`evt-${row.id}-${world.tick}-${token}`,tick:world.tick,year:world.year,month:world.month,
    category:'diplomacy',title,description,actorIds:[row.hostId,row.workerId],witnessScope:'participants',
    ...(siteAt(world,row.siteId) ? {locationId:row.siteId} : {})};
}

function close(world: WorldState,row: ShortShift,status:Exclude<ShortShift['status'],'offered'|'active'|'completed'>,reason: Reason,
  actor?: Cultivator): boolean {
  if (!open(row)) return false;
  if (row.escrowStones>0) {
    // A real deceased owner remains the original payor; probate deals with the actual refunded purse next.
    const owner=at(world,row.hostId);
    if (!owner) return false; // Never redirect or erase missing-owner custody.
    const unused=row.escrowStones;
    owner.spiritStones+=unused;
    row.escrowStones=0;
    row.refundedStones+=unused;
  }
  row.status=status;
  row.closeReason=reason;
  row.closedTick=world.tick;
  if (actor) row.closedById=actor.id;
  return true;
}

export function resolveShortShiftAction(world: WorldState,actor: Cultivator,payload: LLMDecisionPayload):WorldEvent|null {
  if (payload.chosenAction!=='SHORT_SHIFT' || payload.targetLocationId!==undefined) return null;
  const chosen=availableShortShiftActions(actor,world).find(option=>option.shortShiftMove===payload.shortShiftMove &&
    option.targetShortShiftId===payload.targetShortShiftId && option.targetObservatoryTick===payload.targetObservatoryTick &&
    option.targetCultivatorId===payload.targetCultivatorId);
  if (!chosen) return null;
  const state=world.shortShifts;
  if (chosen.shortShiftMove==='offer') {
    const worker=at(world,chosen.targetCultivatorId)!;
    const row:ShortShift={id:`short-shift-${state.nextId++}`,hostId:actor.id,workerId:worker.id,hostSectId:actor.sectId,
      workerSectId:worker.sectId,siteId:actor.locationId,observatoryOpenedTick:chosen.targetObservatoryTick,
      offeredTick:world.tick,offerExpiresTick:world.tick+SHORT_SHIFT_OFFER_TICKS,status:'offered',
      escrowStones:0,paidStones:0,refundedStones:0};
    state.shifts.push(row);
    return event(world,row,'offer','提出跨宗观象短聘','只提出下一轮实测差事；此时未扣个人薪资，未授宗籍与位阶。');
  }
  const row=state.shifts.find(item=>item.id===chosen.targetShortShiftId)!;
  if (chosen.shortShiftMove==='accept') {
    const host=at(world,row.hostId)!;
    host.spiritStones-=SHORT_SHIFT_WAGE;
    row.escrowStones=SHORT_SHIFT_WAGE;
    row.acceptedTick=world.tick;
    row.shiftTick=world.tick+1;
    row.status='active';
    return event(world,row,'accept','访客自愿受聘','由原聘主的个人钱袋实托约定薪资；只认下一轮的实际到场读数。');
  }
  if (chosen.shortShiftMove==='withdraw' || chosen.shortShiftMove==='decline') {
    const declined=chosen.shortShiftMove==='decline';
    if (!close(world,row,declined?'declined':'withdrawn',declined?'declined':actor.id===row.hostId?'host_withdrew':'worker_withdrew',actor)) return null;
    return event(world,row,declined?'declined':'withdrawn',declined?'访客谢绝短聘':'一方自愿退出短聘',
      '未有到场实测或工钱；只将尚未支出的薪资退还原聘主。');
  }
  const site=siteAt(world,row.siteId)!;
  const {kind,intensity}=localQiWeather(world,site);
  row.attendance={tick:world.tick,reading:{kind,intensity}};
  actor.spiritStones+=row.escrowStones;
  row.paidStones=row.escrowStones;
  row.escrowStones=0;
  row.status='completed';
  row.closedTick=world.tick;
  return event(world,row,'completed','访客到场实测并领薪','记录本人本轮独立实测，托存薪资仅交割一次；旧观象记录、宗籍与位阶均未改动。');
}

/** Call after the worker had their real attendance turn, but before the original owner's estate capture. */
export function advanceShortShifts(world: WorldState):WorldEvent[] {
  const state=world.shortShifts;
  if (!state.shifts.length) return [];
  const events:WorldEvent[]=[];
  for (const row of state.shifts) {
    if (!open(row)) continue;
    const host=at(world,row.hostId),worker=at(world,row.workerId);
    const lost=!live(host)||!live(worker);
    const reason:Reason|undefined=lost?'party_lost':
      !siteAuthority(world,row,host,worker,world.tick)?'access_revoked':
      row.status==='offered' && world.tick>=row.offerExpiresTick?'offer_expired':
      row.status==='active' && world.tick>=(row.shiftTick??Infinity)?'shift_missed':undefined;
    if (!reason) continue;
    const expired=reason==='offer_expired'||reason==='shift_missed';
    if (close(world,row,expired?'expired':'revoked',reason)) {
      events.push(event(world,row,reason,expired?'短聘期限已过':'短聘资格或场地失效','没有代为读数或付薪；只返还实际未支出薪资。'));
    }
  }
  const closed=state.shifts.filter(row=>!open(row)).sort((a,b)=>(b.closedTick??-1)-(a.closedTick??-1) ||
    Number(b.id.slice(12))-Number(a.id.slice(12)));
  const keep=new Set(closed.slice(0,SHORT_SHIFT_HISTORY_LIMIT).map(row=>row.id));
  state.shifts=state.shifts.filter(row=>open(row)||row.closedTick===world.tick||keep.has(row.id));
  return events;
}

export function visibleShortShifts(world: WorldState,viewer?: Cultivator): ShortShift[] {
  if (!viewer || at(world,viewer.id)!==viewer) return [];
  return world.shortShifts.shifts.filter(row=>row.offeredTick<=world.tick && participant(row,viewer.id)).map(row=>structuredClone(row));
}
