import type {
  Cultivator, LLMDecisionPayload, MortalSettlement, VillageGranariesState, VillageGranary, VillageGranaryMove,
  VillageGranaryReceipt, WorldEvent, WorldState,
} from '../types/world';
import { flowActor, flowGranary, recordResourceFlow } from './resourceFlowEngine';
import { villageSupplyNet } from './villageSupplyAccounting';

export const VILLAGE_GRANARY_CAPACITY = { roots:20,stones:80 } as const;
export const VILLAGE_GRANARY_DONATION = { roots:2,stones:8 } as const;
export const VILLAGE_GRANARY_DRAW = { roots:1,stones:4 } as const;
export const VILLAGE_GRANARY_DISASTER_WINDOW = 3;
export const VILLAGE_GRANARY_MIN_STRESS = 35;
export const VILLAGE_GRANARY_STRESS_REDUCTION = 8;
export const VILLAGE_GRANARY_RELIEF_COOLDOWN = 2;
export const VILLAGE_GRANARY_RECEIPT_LIMIT = 64;

export interface VillageGranaryOption {
  action: 'VILLAGE_GRANARY';
  granaryMove: VillageGranaryMove;
  targetSettlementId: string;
}
export type VillageGranaryReceiptView = (
  | {kind:VillageGranaryDonationMove;tick:number}
  | {kind:'draw';tick:number;stressBefore:number;stressAfter:number;disasterTick:number}
) & {own?:true};
export interface VillageGranaryView extends Omit<VillageGranary,'receipts'> {
  siteId: string;
  stress: number;
  canDraw: boolean;
  lastDisasterTick?: number;
  receipts: VillageGranaryReceiptView[];
}

export const createVillageGranariesState = (): VillageGranariesState => ({granaries:[]});

function empty(villageId: string): VillageGranary {
  return {settlementId:villageId,roots:0,stones:0,donatedRoots:0,donatedStones:0,spentRoots:0,spentStones:0,receipts:[]};
}
const live = (actor: Cultivator) => actor.alive && actor.hp > 0;
const count = (value: number, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const finiteAtLeast = (value: number, minimum: number) => Number.isFinite(value) && value >= minimum;
const exactPayload = new Set(['chosenAction','innerMonologue','spokenLine','granaryMove','targetSettlementId']);
export const granaryAt = (world: WorldState, villageId: string) =>
  world.villageGranaries.granaries.find(item => item.settlementId === villageId);

function presentAt(world: WorldState,actor: Cultivator,tick: number): MortalSettlement|undefined {
  if (!live(actor) || actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon') return undefined;
  const village = world.settlements.villages.find(item => item.locationId === actor.locationId);
  if (!village || !world.locations.some(site => site.id === village.locationId &&
    site.type !== 'abyss' && site.type !== 'secret_realm')) return undefined;
  const id = actor.id;
  const assignment = actor.guardAssignment;
  if (assignment && assignment.expiresTick > tick && assignment.locationId !== actor.locationId ||
    world.couriers.dispatches.some(item => item.courierId === id && (item.status === 'in_transit' || item.status === 'returning' ||
      item.acceptedTick !== undefined && (item.acceptedTick === tick || item.lastAdvancedTick === tick || item.settledTick === tick))) ||
    world.pilgrimages.journeys.some(item => (item.organizerId === id || item.companionId === id) &&
      (item.status === 'active' || item.startedTick === tick || item.lastMovedTick === tick ||
        item.camps?.some(camp => camp.openedTick === tick || camp.closedTick === tick))) ||
    world.escorts.contracts.some(item => item.escortId === id && item.status === 'active') ||
    world.relocations.plans.some(item => item.status === 'in_transit' && item.garrisonIds.includes(id)) ||
    world.boundaryReliefs.cases.some(item => item.incomingId === id && (item.status === 'travelling' || item.status === 'returning')) ||
    world.sieges.some(item => (item.status === 'marching' || item.status === 'sieging') && item.participantIds.includes(id)) ||
    world.occasions.some(item => (item.status === 'running' || item.status === 'registration') && item.participantIds.includes(id) &&
      !world.expeditionRescues.requests.some(rescue => rescue.occasionId === item.id && rescue.arrivedIds?.includes(id))) ||
    world.expeditionRescues.requests.some(item => item.gateSiteId === actor.locationId &&
      (item.explorerId === id || item.rescuerId === id) && item.supplySpent === 1 &&
      (item.status === 'extracting' || item.status === 'interrupted' && item.pathIndex > 0 &&
        !item.arrivedIds?.includes(id) && world.occasions.some(occasion => occasion.id === item.occasionId && occasion.status === 'running')))) {
    return undefined;
  }
  return village;
}

export function presentAtVillageGranary(world: WorldState,actor: Cultivator,tick=world.tick): MortalSettlement|undefined {
  return (tick===world.tick || tick===world.tick+1) && finiteAtLeast(actor.age,18) && world.cultivators.includes(actor)
    ? presentAt(world,actor,tick) : undefined;
}

export type VillageGranaryDonationMove = Exclude<VillageGranaryMove,'draw'>;
export const villageGranaryDonationAssets = (kind: VillageGranaryDonationMove): {roots:number;stones:number} => ({
  roots:kind==='donate_stones'?0:VILLAGE_GRANARY_DONATION.roots,
  stones:kind==='donate_roots'?0:VILLAGE_GRANARY_DONATION.stones,
});
export const villageGranaryDonationReason = (kind: VillageGranaryDonationMove) =>
  kind==='donate_roots'?'granary_donation_roots':kind==='donate_stones'?'granary_donation_stones':'granary_donation';

function validBook(book: VillageGranary, supply: ReturnType<typeof villageSupplyNet>): boolean {
  return count(book.roots) && count(book.stones) && book.roots <= VILLAGE_GRANARY_CAPACITY.roots &&
    book.stones <= VILLAGE_GRANARY_CAPACITY.stones && count(book.donatedRoots) && count(book.donatedStones) &&
    count(book.spentRoots) && count(book.spentStones) && book.donatedRoots-book.spentRoots+supply.roots === book.roots &&
    book.donatedStones-book.spentStones+supply.stones === book.stones &&
    book.roots+supply.reserveRoots <= VILLAGE_GRANARY_CAPACITY.roots &&
    book.stones+supply.reserveStones <= VILLAGE_GRANARY_CAPACITY.stones;
}

function localDisasterTick(world: WorldState,village: MortalSettlement): number|undefined {
  const tick = village.lastDisasterTick;
  return tick !== undefined && count(tick) && tick <= world.tick && world.settlements.records.some(record =>
    record.kind === 'disaster' && record.settlementId === village.id && record.tick === tick) ? tick : undefined;
}

function mayDraw(world: WorldState,village: MortalSettlement,book: VillageGranary,executionTick: number): boolean {
  if (world.settlements.lastAdvancedTick !== world.tick || !count(village.population,1) ||
    !finiteAtLeast(village.stress,VILLAGE_GRANARY_MIN_STRESS) || village.stress > 100 ||
    book.roots < VILLAGE_GRANARY_DRAW.roots || book.stones < VILLAGE_GRANARY_DRAW.stones ||
    book.lastDrawTick === executionTick ||
    (village.lastReliefTick !== undefined && executionTick-village.lastReliefTick < VILLAGE_GRANARY_RELIEF_COOLDOWN)) return false;
  const disasterTick = localDisasterTick(world,village);
  return disasterTick !== undefined && executionTick-disasterTick <= VILLAGE_GRANARY_DISASTER_WINDOW;
}

export function availableVillageGranaryActions(actor: Cultivator,world: WorldState,
  executionTick = world.tick): VillageGranaryOption[] {
  const village = presentAtVillageGranary(world,actor,executionTick);
  if (!village || !count(village.population,1)) return [];
  const book = granaryAt(world,village.id) ?? empty(village.id);
  const supply = villageSupplyNet(world,village.id);
  if (!validBook(book,supply) || book.receipts.some(row => row.actorId === actor.id && row.tick === executionTick)) return [];
  const options: VillageGranaryOption[] = [];
  const add = (granaryMove: VillageGranaryOption['granaryMove']) =>
    options.push({action:'VILLAGE_GRANARY',granaryMove,targetSettlementId:village.id});
  if (mayDraw(world,village,book,executionTick)) add('draw');
  for (const kind of ['donate','donate_roots','donate_stones'] as const) {
    const {roots,stones}=villageGranaryDonationAssets(kind);
    if ((roots===0 || count(actor.herbs.earth_root,roots)) && (stones===0 || finiteAtLeast(actor.spiritStones,stones)) &&
      book.roots+supply.reserveRoots+roots <= VILLAGE_GRANARY_CAPACITY.roots &&
      book.stones+supply.reserveStones+stones <= VILLAGE_GRANARY_CAPACITY.stones &&
      count(book.donatedRoots+roots) && count(book.donatedStones+stones)) add(kind);
  }
  return options;
}

/** Both assets and the dated domain receipt mutate in the same synchronous operation. */
export function resolveVillageGranaryAction(world: WorldState,actor: Cultivator,payload: LLMDecisionPayload): WorldEvent|null {
  if (payload.chosenAction !== 'VILLAGE_GRANARY' || Object.entries(payload).some(([field,value]) =>
    value !== undefined && !exactPayload.has(field) && !(field === 'action' && value === 'VILLAGE_GRANARY'))) return null;
  const choice = availableVillageGranaryActions(actor,world).find(option =>
    option.granaryMove === payload.granaryMove && option.targetSettlementId === payload.targetSettlementId);
  if (!choice) return null;
  const village = world.settlements.villages.find(item => item.id === choice.targetSettlementId)!;
  let book = granaryAt(world,village.id);
  if (!book) {
    book = empty(village.id);
    world.villageGranaries.granaries.push(book);
  }
  const tick = world.tick;
  const id = `evt-village-granary-${tick}-${village.id}-${actor.id}-${choice.granaryMove}`;
  const granary = flowGranary(village.id);
  const participant = flowActor(actor.id);
  const visibility = {kind:'participants' as const,actorIds:[actor.id]};
  let receipt: VillageGranaryReceipt;
  if (choice.granaryMove !== 'draw') {
    const kind = choice.granaryMove;
    const {roots,stones} = villageGranaryDonationAssets(kind);
    const reason = villageGranaryDonationReason(kind);
    if (roots) {
      actor.herbs.earth_root -= roots;
      book.roots += roots;
      book.donatedRoots += roots;
      if (kind==='donate_roots') book.rootOnlyDonations=(book.rootOnlyDonations??0)+1;
      recordResourceFlow(world,{kind:'transfer',mechanism:'granary',reason,refId:village.id,
        from:participant,to:granary,good:'earth_root',amount:roots,visibility});
    }
    if (stones) {
      actor.spiritStones -= stones;
      book.stones += stones;
      book.donatedStones += stones;
      if (kind==='donate_stones') book.stoneOnlyDonations=(book.stoneOnlyDonations??0)+1;
      recordResourceFlow(world,{kind:'transfer',mechanism:'granary',reason,refId:village.id,
        from:participant,to:granary,good:'stone',amount:stones,visibility});
    }
    receipt = {kind,tick,actorId:actor.id};
  } else {
    const {roots,stones} = VILLAGE_GRANARY_DRAW;
    const stressBefore = village.stress;
    book.roots -= roots; book.spentRoots += roots;
    book.stones -= stones; book.spentStones += stones;
    book.lastDrawTick = tick;
    village.stress -= VILLAGE_GRANARY_STRESS_REDUCTION;
    village.lastReliefTick = tick;
    receipt = {kind:'draw',tick,actorId:actor.id,stressBefore,stressAfter:village.stress,disasterTick:village.lastDisasterTick!};
    recordResourceFlow(world,{kind:'consumption',mechanism:'granary',reason:'granary_draw',refId:village.id,
      from:granary,good:'earth_root',amount:roots,visibility});
    recordResourceFlow(world,{kind:'consumption',mechanism:'granary',reason:'granary_draw',refId:village.id,
      from:granary,good:'stone',amount:stones,visibility});
  }
  book.receipts.push(receipt);
  if (book.receipts.length > VILLAGE_GRANARY_RECEIPT_LIMIT) book.receipts.shift();
  const donation = receipt.kind !== 'draw';
  return {id,tick,year:world.year,month:world.month,category:'diplomacy',witnessScope:'participants',actorIds:[actor.id],
    locationId:village.locationId,title:receipt.kind==='donate_roots'?'实付玄土根入义仓':receipt.kind==='donate_stones'?'实付灵石入义仓':
      donation?'实物捐入村落义仓':'灾后短缺，义仓实耗',
    description:donation ? '由本人现有库存实付，不改变人口或灾情。' : '从义仓扣除实物以缓和灾后压力，不计个人赈济或功绩。'};
}

export function projectVillageGranary(world: WorldState,viewer?: Cultivator,settlementId?: string): VillageGranaryView|undefined {
  if (!viewer || !world.cultivators.includes(viewer)) return undefined;
  const village = presentAt(world,viewer,world.tick);
  if (!village || (settlementId !== undefined && settlementId !== village.id)) return undefined;
  const book = granaryAt(world,village.id) ?? empty(village.id);
  if (!validBook(book,villageSupplyNet(world,village.id))) return undefined;
  const {receipts,lastDrawTick,...balances} = book;
  const lastDisasterTick = localDisasterTick(world,village);
  return {...balances,siteId:village.locationId,stress:village.stress,
    canDraw:finiteAtLeast(viewer.age,18) && !receipts.some(row => row.actorId === viewer.id && row.tick === world.tick) &&
      mayDraw(world,village,book,world.tick),
    ...(lastDrawTick !== undefined && lastDrawTick <= world.tick ? {lastDrawTick} : {}),
    ...(lastDisasterTick !== undefined ? {lastDisasterTick} : {}),
    receipts:receipts.filter(row => row.tick <= world.tick).map(({actorId,...row}) =>
      ({...row,...(actorId === viewer.id ? {own:true as const} : {})}))};
}
