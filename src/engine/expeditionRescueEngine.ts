import type {
  Cultivator, ExpeditionRescue, ExpeditionRescueMove, ExpeditionRescueState, LLMDecisionPayload, LocationNode,
  MapPoint, MapTile, WorldEvent, WorldOccasion, WorldState,
} from '../types/world';
import { currentVisibleTileIds, knownMapLocations, terrainTileAt } from './terrainEngine';

export const EXPEDITION_RESCUE_OFFER_TICKS = 3;
export const EXPEDITION_RESCUE_STRIDE = 2;
export const EXPEDITION_RESCUE_HERB = 'jade_leaf';
export const EXPEDITION_RESCUE_DISTRESS_HP = .65;
const TERMINAL_RETENTION = 96;

export type ExpeditionRescueOption = { action:'EXPEDITION_RESCUE' } & (
  | { rescueMove:'signal';targetOccasionId:string;targetExpeditionRescueId?:never }
  | { rescueMove:Exclude<ExpeditionRescueMove,'signal'>;targetExpeditionRescueId:string;targetOccasionId?:never }
);
export interface ExpeditionRescueView {
  id: string;
  occasionId: string;
  role: 'explorer' | 'rescuer' | 'witness';
  status: ExpeditionRescue['status'];
  explorerId: string;
  openedTick: number;
  offerExpiresTick: number;
  rescuerId?: string;
  acceptedTick?: number;
  exitSiteId?: string;
  checkpoint?: MapPoint;
  stepsDone?: number;
  stepsTotal?: number;
  finishedTick?: number;
  reason?: ExpeditionRescue['reason'];
  supplySpent?: 1;
  arrived?: boolean;
}

export const createExpeditionRescueState = (): ExpeditionRescueState => ({ requests:[],nextId:1 });
const live = (person: Cultivator | undefined): person is Cultivator => Boolean(person?.alive && person.hp > 0);
const weak = (person: Cultivator) => person.hp <= person.maxHp * EXPEDITION_RESCUE_DISTRESS_HP;
const actorAt = (world: WorldState, id: string | undefined) => world.cultivators.find(person=>person.id===id);
const siteAt = (world: WorldState, id: string | undefined) => world.locations.find(place=>place.id===id);
const samePoint = (a: MapPoint | undefined,b: MapPoint | undefined) => !!a && !!b && a.x === b.x && a.y === b.y;
const copyPoint = ({ x,y }: MapPoint): MapPoint => ({ x,y });
const safePermanent = (site: LocationNode | undefined): site is LocationNode => !!site && site.type !== 'secret_realm' && site.type !== 'abyss';
const pending = (row: ExpeditionRescue) => row.status === 'signaled' || row.status === 'extracting';
const involved = (row: ExpeditionRescue, id: string) => row.explorerId === id || row.rescuerId === id;
const sameRescue = (row: ExpeditionRescue, expedition: WorldOccasion) => row.occasionId === expedition.id && row.gateSiteId === expedition.locationId;
const rankId = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;
const hasHerb = (actor: Cultivator) => Number.isFinite(actor.herbs[EXPEDITION_RESCUE_HERB]) && actor.herbs[EXPEDITION_RESCUE_HERB] >= 1;

function gateFor(world: WorldState, expedition: WorldOccasion | undefined, tick: number) {
  if (!expedition || expedition.kind !== 'expedition' || expedition.status !== 'running' ||
    expedition.registrationClosesTick > tick || expedition.expiresTick <= tick) return undefined;
  const gate = siteAt(world,expedition.locationId);
  return gate?.type === 'secret_realm' ? gate : undefined;
}

function physicallyInGate(world: WorldState, actor: Cultivator | undefined, expedition: WorldOccasion, tick: number): actor is Cultivator {
  if (!live(actor) || actor.locationId !== expedition.locationId || !expedition.participantIds.includes(actor.id) ||
    actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon') return false;
  const id = actor.id;
  return !world.couriers.dispatches.some(row=>row.courierId===id &&
    (row.status==='in_transit' || row.status==='returning' || row.lastAdvancedTick===tick || row.settledTick===tick)) &&
    !world.pilgrimages.journeys.some(row=>(row.organizerId===id || row.companionId===id) && row.status==='active') &&
    !world.escorts.contracts.some(row=>row.escortId===id && row.status==='active') &&
    !world.relocations.plans.some(row=>row.garrisonIds.includes(id) && row.status==='in_transit') &&
    !world.sieges.some(row=>row.participantIds.includes(id) && (row.status==='marching' || row.status==='sieging')) &&
    !world.occasions.some(row=>row!==expedition && row.participantIds.includes(id) && row.status==='running');
}
function atUntraversedGate(world: WorldState, actor: Cultivator | undefined, expedition: WorldOccasion, tick: number): actor is Cultivator {
  return physicallyInGate(world,actor,expedition,tick) && !world.expeditionRescues.requests.some(row=>
    sameRescue(row,expedition) && involved(row,actor.id) && row.pathIndex>0 && !row.arrivedIds?.includes(actor.id) &&
    (row.status==='extracting' || row.status==='interrupted'));
}
const unsafeTiles = (world: WorldState,tick: number) => new Set(world.mapHazards
  .filter(row=>row.createdTick<=tick && tick<row.expiresTick && row.intensity>=2).map(row=>row.tileId));
const adjacent = (a: MapTile,b: MapTile) => Math.abs(a.col-b.col)+Math.abs(a.row-b.row) === 1;

function plannedExit(world: WorldState, expedition: WorldOccasion, gate: LocationNode, explorer: Cultivator,
  rescuer: Cultivator, acceptanceTick: number): { exit: LocationNode;path:MapPoint[] } | undefined {
  const origin = terrainTileAt(world,gate.x,gate.y);
  if (!origin) return undefined;
  const explorerTiles = new Set([...explorer.exploredTileIds,...currentVisibleTileIds(world,explorer)]);
  const rescuerTiles = new Set([...rescuer.exploredTileIds,...currentVisibleTileIds(world,rescuer)]);
  const explorerSites = new Set(knownMapLocations(world,explorer).map(site=>site.id));
  const rescuerSites = new Set(knownMapLocations(world,rescuer).map(site=>site.id));
  const unsafe = unsafeTiles(world,acceptanceTick);
  if (unsafe.has(origin.id)) return undefined;
  const { columns,rows,tiles } = world.terrain;
  const maxSteps = (expedition.expiresTick - acceptanceTick - 1) * EXPEDITION_RESCUE_STRIDE;
  if (maxSteps < 1) return undefined;
  const legal = (tile: MapTile) => explorerTiles.has(tile.id) && rescuerTiles.has(tile.id) && !unsafe.has(tile.id);
  const distance = new Map([[origin.id,0]]);
  const previous = new Map<string,MapTile>();
  const queue = [origin];
  for (let i=0;i<queue.length;i++) {
    const tile = queue[i];
    const next = distance.get(tile.id)!+1;
    if (next>maxSteps) continue;
    for (const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]) {
      const col=tile.col+dx,row=tile.row+dy;
      if (col<0 || col>=columns || row<0 || row>=rows) continue;
      const candidate=tiles[row*columns+col];
      if (!candidate || distance.has(candidate.id) || !legal(candidate)) continue;
      distance.set(candidate.id,next);
      previous.set(candidate.id,tile);
      queue.push(candidate);
    }
  }
  const destinations = world.locations.flatMap(site=>{
    if (!safePermanent(site) || !explorerSites.has(site.id) || !rescuerSites.has(site.id)) return [];
    const tile=terrainTileAt(world,site.x,site.y);
    const steps=tile && distance.get(tile.id);
    return tile && steps ? [{site,tile,steps}] : []; // A shared tile is not a route-backed extraction.
  }).sort((a,b)=>a.steps-b.steps || rankId(a.site.id,b.site.id));
  const picked = destinations[0];
  if (!picked) return undefined;
  const trail = [picked.tile];
  while (trail[0].id!==origin.id) trail.unshift(previous.get(trail[0].id)!);
  const path = trail.map((tile,i)=>i===0 ? copyPoint(gate) : i===trail.length-1 ? copyPoint(picked.site) :
    {x:(tile.col+.5)*1000/columns,y:(tile.row+.5)*600/rows});
  return {exit:picked.site,path};
}

function potentialWitnesses(world: WorldState, caseOwner: Cultivator, expedition: WorldOccasion,tick: number) {
  const requests = world.expeditionRescues.requests;
  return [...new Set(expedition.participantIds)].filter(id=>id!==caseOwner.id).sort(rankId).filter(id=>
    atUntraversedGate(world,actorAt(world,id),expedition,tick) &&
    !requests.some(row=>pending(row) && involved(row,id)));
}

export function hasOpenExpeditionRescue(world: WorldState, occasionId: string): boolean {
  const occasion = world.occasions.find(row=>row.id===occasionId);
  if (!occasion || !gateFor(world,occasion,world.tick)) return false;
  return world.expeditionRescues.requests.some(row=>sameRescue(row,occasion) && (pending(row) ||
    row.status==='interrupted' && row.pathIndex>0 && [row.explorerId,row.rescuerId].some(id=>
      id!==undefined && !row.arrivedIds?.includes(id) && physicallyInGate(world,actorAt(world,id),occasion,world.tick))));
}

export function rescueHoldsExpeditionRoll(world: WorldState, occasionId: string, actorId: string): boolean {
  return world.expeditionRescues.requests.some(row=>row.occasionId===occasionId && involved(row,actorId) &&
    (pending(row) || row.status==='interrupted' && row.pathIndex>0 && !row.arrivedIds?.includes(actorId)));
}

export function rescuedMemberOutOfOccasion(world: WorldState, occasionId: string, actorId: string): boolean {
  return world.expeditionRescues.requests.some(row=>row.occasionId===occasionId && row.arrivedIds?.includes(actorId));
}

export function availableExpeditionRescueActions(actor: Cultivator, world: WorldState, executionTick = world.tick): ExpeditionRescueOption[] {
  if ((executionTick!==world.tick && executionTick!==world.tick+1) || !live(actor) || !world.cultivators.includes(actor)) return [];
  const { requests } = world.expeditionRescues;
  const expedition = world.occasions.find(row=>row.kind==='expedition' && row.status==='running' &&
    row.locationId===actor.locationId && row.participantIds.includes(actor.id));
  const gate = gateFor(world,expedition,executionTick);
  if (!expedition || !gate || !atUntraversedGate(world,actor,expedition,executionTick)) return [];
  const options: ExpeditionRescueOption[] = [];
  const own = requests.find(row=>sameRescue(row,expedition) && pending(row) && involved(row,actor.id));
  if (own) {
    if (own.status==='signaled' && own.explorerId===actor.id && executionTick<own.offerExpiresTick)
      options.push({action:'EXPEDITION_RESCUE',rescueMove:'withdraw',targetExpeditionRescueId:own.id});
    return options;
  }
  if (hasHerb(actor)) for (const row of requests) {
    if (!sameRescue(row,expedition) || row.status!=='signaled' || row.openedTick>=executionTick ||
      row.offerExpiresTick<=executionTick || !row.witnessIds.includes(actor.id)) continue;
    const explorer=actorAt(world,row.explorerId);
    if (!physicallyInGate(world,explorer,expedition,executionTick) || !weak(explorer) ||
      !plannedExit(world,expedition,gate,explorer,actor,executionTick)) continue;
    options.push({action:'EXPEDITION_RESCUE',rescueMove:'accept',targetExpeditionRescueId:row.id});
  }
  if (weak(actor) && executionTick+2<expedition.expiresTick &&
    !requests.some(row=>sameRescue(row,expedition) && row.explorerId===actor.id) &&
    potentialWitnesses(world,actor,expedition,executionTick).length) {
    options.push({action:'EXPEDITION_RESCUE',rescueMove:'signal',targetOccasionId:expedition.id});
  }
  return options;
}

function event(world: WorldState, row: ExpeditionRescue, key: string,title: string,description: string,siteId?: string): WorldEvent {
  const actorIds = row.rescuerId ? [row.explorerId,row.rescuerId] : [row.explorerId,...row.witnessIds];
  return { id:`evt-${row.id}-${world.tick}-${key}`,tick:world.tick,year:world.year,month:world.month,
    title,description,category:'heavenly',actorIds,witnessScope:'participants',...(siteId ? {locationId:siteId} : {}) };
}

function close(world: WorldState, row: ExpeditionRescue, status: 'rescued'|'withdrawn'|'expired'|'interrupted',
  reason?: ExpeditionRescue['reason']) {
  row.status=status;
  row.finishedTick=world.tick;
  if (reason) row.reason=reason;
}

export function resolveExpeditionRescueAction(world: WorldState, actor: Cultivator, payload: LLMDecisionPayload): WorldEvent | null {
  if (payload.chosenAction!=='EXPEDITION_RESCUE' || payload.targetLocationId!==undefined || payload.targetCultivatorId!==undefined) return null;
  const option = availableExpeditionRescueActions(actor,world).find(row=>row.rescueMove===payload.rescueMove &&
    row.targetOccasionId===payload.targetOccasionId && row.targetExpeditionRescueId===payload.targetExpeditionRescueId);
  if (!option) return null;
  const { requests } = world.expeditionRescues;
  if (option.rescueMove==='signal') {
    const expedition=world.occasions.find(row=>row.id===option.targetOccasionId)!;
    const row: ExpeditionRescue = {id:`expedition-rescue-${world.expeditionRescues.nextId++}`,
      occasionId:expedition.id,explorerId:actor.id,gateSiteId:expedition.locationId,
      witnessIds:potentialWitnesses(world,actor,expedition,world.tick), openedTick:world.tick,
      offerExpiresTick:world.tick+EXPEDITION_RESCUE_OFFER_TICKS,status:'signaled',path:[],pathIndex:0};
    requests.push(row);
    return event(world,row,'signal','实到同伴听见秘境求援','只向这座实到星门的同行者求援，未支付物资、也未移动。',row.gateSiteId);
  }
  const row=requests.find(value=>value.id===option.targetExpeditionRescueId)!;
  if (option.rescueMove==='withdraw') {
    close(world,row,'withdrawn','withdrawn');
    return event(world,row,'withdrawn','求援者撤回信号','尚未同意撤离，无消耗、无位移。',row.gateSiteId);
  }
  const expedition=world.occasions.find(value=>value.id===row.occasionId)!;
  const gate=gateFor(world,expedition,world.tick)!;
  const explorer=actorAt(world,row.explorerId)!;
  const plan=plannedExit(world,expedition,gate,explorer,actor,world.tick);
  if (!plan || !hasHerb(actor)) return null;
  actor.herbs[EXPEDITION_RESCUE_HERB]-=1;
  Object.assign(row,{ rescuerId:actor.id,acceptedTick:world.tick,exitSiteId:plan.exit.id,path:plan.path,status:'extracting',supplySpent:1 });
  return event(world,row,'accepted','同行者同意实路撤离','救援者实耗一株青玉叶；双方应下后，下回合方能起行。',row.gateSiteId);
}

export function expireOccasionRescues(world: WorldState,occasionId: string): WorldEvent[] {
  return world.expeditionRescues.requests.flatMap(row=>{
    if (!pending(row) || row.occasionId!==occasionId) return [];
    close(world,row,row.status==='signaled' ? 'expired' : 'interrupted','gate_closed');
    return [event(world,row,'gate-closed','星门关闭前未能完成撤离','未把未走完的行程当成抵达，未退还已耗补给。')];
  });
}

function prune(world: WorldState) {
  const state=world.expeditionRescues;
  const terminal=state.requests.filter(row=>!pending(row))
    .sort((a,b)=>(b.finishedTick??-1)-(a.finishedTick??-1) || Number(b.id.slice(18))-Number(a.id.slice(18)));
  const keep = new Set(terminal.slice(0,TERMINAL_RETENTION).map(row=>row.id));
  const running = new Set(world.occasions.filter(row=>row.status==='running' && row.kind==='expedition').map(row=>row.id));
  state.requests=state.requests.filter(row=>pending(row) || running.has(row.occasionId) || row.finishedTick===world.tick || keep.has(row.id));
}

/** Atomic per-turn physical stride. It never rolls an expedition or creates an item or actor. */
export function advanceExpeditionRescues(world: WorldState): WorldEvent[] {
  if (!world.expeditionRescues.requests.length) return [];
  const events: WorldEvent[]=[];
  const unsafe=unsafeTiles(world,world.tick);
  for (const row of world.expeditionRescues.requests) {
    if (!pending(row)) continue;
    const expedition=world.occasions.find(value=>value.id===row.occasionId);
    const gate=gateFor(world,expedition,world.tick);
    if (!expedition || !gate || !sameRescue(row,expedition)) continue; // Canonical occasion close owns gate-expiry sequencing.
    const explorer=actorAt(world,row.explorerId), rescuer=actorAt(world,row.rescuerId);
    if (row.status==='signaled') {
      const timedOut = world.tick>=row.offerExpiresTick;
      if (timedOut || !physicallyInGate(world,explorer,expedition,world.tick) || !weak(explorer)) {
        close(world,row,timedOut ? 'expired' : 'interrupted',timedOut ? 'offer_expired' : 'participant_lost');
        events.push(event(world,row,'signal-closed',timedOut ? '求援等待已过期' : '求援现场已改变','无人支付救援补给，未移动。',row.gateSiteId));
      }
      continue;
    }
    if (world.tick<=(row.acceptedTick??Infinity) || row.lastAdvancedTick===world.tick) continue;
    const exit=siteAt(world,row.exitSiteId);
    const travellers=[explorer,rescuer].filter(person=>physicallyInGate(world,person,expedition,world.tick));
    // A deceased member cannot later rejoin at an unwalked checkpoint. A living but displaced
    // member is a real interruption instead, not someone we can silently carry or drop.
    if (!travellers.length || [explorer,rescuer].some(person=>live(person) && !travellers.includes(person))) {
      close(world,row,'interrupted','participant_lost');
      events.push(event(world,row,'lost','撤离队伍失去可行进成员','未记作抵达，已耗补给不退。'));
      continue;
    }
    const at=row.path[row.pathIndex];
    const currentTile=at && terrainTileAt(world,at.x,at.y);
    const next=Math.min(row.path.length-1,row.pathIndex+EXPEDITION_RESCUE_STRIDE);
    const walked: string[]=[];
    let previous=currentTile;
    let valid=safePermanent(exit) && samePoint(gate,row.path[0]) && samePoint(exit,row.path.at(-1)) &&
      next>row.pathIndex && !!currentTile && !unsafe.has(currentTile.id);
    if (valid) for (let i=row.pathIndex+1;i<=next;i++) {
      const point=row.path[i];
      const tile=point && terrainTileAt(world,point.x,point.y);
      if (!tile || !previous || !adjacent(previous,tile) || unsafe.has(tile.id)) {valid=false;break;}
      walked.push(tile.id);
      previous=tile;
    }
    if (!valid || !exit) {
      close(world,row,'interrupted','unsafe_route');
      events.push(event(world,row,'unsafe','实路撤离遇阻','没有跨过未经核实的关口，未报抵达。'));
      continue;
    }
    row.lastAdvancedTick=world.tick;
    row.pathIndex=next;
    for (const person of travellers) person.exploredTileIds=[...new Set([...person.exploredTileIds,...walked])];
    if (next<row.path.length-1) {
      events.push(event(world,row,'stride','同行沿实路撤离一段','只记已经行过的关口，未报离开星门。'));
      continue;
    }
    for (const person of travellers) person.locationId=exit.id;
    row.arrivedIds=travellers.map(person=>person.id);
    const both=travellers.length===2;
    close(world,row,both ? 'rescued' : 'interrupted',both ? undefined : 'participant_lost');
    events.push(event(world,row,both ? 'rescued' : 'survivor',both ? '求援双方已实路撤离' : '仅幸存成员实际到达','只登记实际走完全程的成员；原有人物和财物未复制。',exit.id));
  }
  prune(world);
  return events;
}

/** The exact route stays private. Prior witnesses do not get later actions they did not witness. */
export function visibleExpeditionRescues(world: WorldState,viewer?: Cultivator): ExpeditionRescueView[] {
  if (!viewer || actorAt(world,viewer.id)!==viewer) return [];
  return world.expeditionRescues.requests.flatMap(row=>{
    if (row.openedTick>world.tick) return [];
    const role=viewer.id===row.explorerId ? 'explorer' : viewer.id===row.rescuerId ? 'rescuer' :
      !row.rescuerId && row.witnessIds.includes(viewer.id) ? 'witness' : undefined;
    if (!role) return [];
    const view:ExpeditionRescueView={id:row.id,occasionId:row.occasionId,role,status:row.status,explorerId:row.explorerId,
      openedTick:row.openedTick,offerExpiresTick:row.offerExpiresTick,
      ...(row.finishedTick===undefined ? {} : {finishedTick:row.finishedTick}),
      ...(row.reason===undefined ? {} : {reason:row.reason})};
    if (role!=='witness' && row.acceptedTick!==undefined) {
      Object.assign(view,{rescuerId:row.rescuerId,acceptedTick:row.acceptedTick,exitSiteId:row.exitSiteId,
        stepsDone:row.pathIndex,stepsTotal:row.path.length-1,supplySpent:row.supplySpent,arrived:row.arrivedIds?.includes(viewer.id)??false});
      const point=row.path[row.pathIndex];
      const occasion=world.occasions.find(value=>value.id===row.occasionId);
      if ((row.status==='extracting' || row.status==='interrupted' && row.pathIndex>0 && !view.arrived) &&
        occasion && gateFor(world,occasion,world.tick) && physicallyInGate(world,viewer,occasion,world.tick) && point) view.checkpoint=copyPoint(point);
    }
    return [view];
  });
}
