import type {
  Cultivator, HouseholdMember, HouseholdNameEntry, HouseholdNameState, LLMDecisionPayload,
  MortalSettlement, MortalVolunteer, WorldEvent, WorldState,
} from '../types/world';

export const HOUSEHOLD_NAME_OFFER_TICKS = 3;
export const HOUSEHOLD_NAME_ALIASES = ['听泉','守拙','小满','行舟'] as const;
const HISTORY_LIMIT = 96;

export type HouseholdNameOption = {action:'HOUSEHOLD_NAME'} & (
  | {nameMove:'offer';householdAlias:string;targetHouseholdNameId?:never}
  | {nameMove:'offer_clear';householdAlias?:never;targetHouseholdNameId?:never}
  | {nameMove:'verify'|'withdraw';targetHouseholdNameId:string;householdAlias?:never}
);
export interface HouseholdNamedPerson {
  id: string;
  name: string;
  alias?: string;
  status: 'resident'|'recruited'|'deceased'|'visitor';
  volunteerId?: string;
  householdId?: string;
  actorId?: string;
  present?: true;
}
export interface HouseholdNameView { settlementId: string; entries: HouseholdNamedPerson[]; proposals: HouseholdNameEntry[] }
export interface HouseholdNameLookup { status: 'unique'|'ambiguous'|'unresolved'; matches: HouseholdNamedPerson[] }

export const createHouseholdNameState = (): HouseholdNameState => ({entries:[],nextId:1});

const live = (actor: Cultivator | undefined): actor is Cultivator => !!actor?.alive && actor.hp > 0;
const adult = (actor: Cultivator) => Number.isFinite(actor.age) && actor.age >= 18;
const actorAt = (world: WorldState,id: string) => world.cultivators.find(actor => actor.id === id);
const normalizeName = (name: string) => name.trim().normalize('NFC');
const byStableId = (a: {id:string},b: {id:string}) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

function physicallyPresent(world: WorldState,actor: Cultivator | undefined,siteId: string,tick: number): actor is Cultivator {
  if (!live(actor) || actor.locationId !== siteId || actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon') return false;
  const id = actor.id;
  return !world.couriers.dispatches.some(row => row.courierId === id && (row.status === 'in_transit' || row.status === 'returning')) &&
    !world.pilgrimages.journeys.some(row => row.status === 'active' && (row.organizerId === id || row.companionId === id)) &&
    !world.boundaryReliefs.cases.some(row => row.incomingId === id && (row.status === 'travelling' || row.status === 'returning')) &&
    !world.escorts.contracts.some(row => row.escortId === id && row.status === 'active') &&
    !world.relocations.plans.some(row => row.status === 'in_transit' && row.garrisonIds.includes(id)) &&
    !world.sieges.some(row => (row.status === 'marching' || row.status === 'sieging') && row.participantIds.includes(id)) &&
    !world.occasions.some(row => (row.status === 'running' || row.status === 'registration') && row.participantIds.includes(id) &&
      !world.expeditionRescues.requests.some(rescue => rescue.occasionId === row.id && rescue.arrivedIds?.includes(id))) &&
    !world.expeditionRescues.requests.some(row => row.gateSiteId === siteId && (row.explorerId === id || row.rescuerId === id) &&
      row.supplySpent === 1 && (row.status === 'extracting' || row.status === 'interrupted' && row.pathIndex > 0 &&
        !row.arrivedIds?.includes(id) && world.occasions.some(occasion => occasion.id === row.occasionId && occasion.status === 'running'))) &&
    // Accepting or settling a courier or pilgrimage used the person's current action, even at the named endpoint.
    (tick !== world.tick || !world.couriers.dispatches.some(row => row.courierId === id && row.acceptedTick !== undefined &&
      (row.acceptedTick === tick || row.lastAdvancedTick === tick || row.settledTick === tick))) &&
    (tick !== world.tick || !world.pilgrimages.journeys.some(row => (row.organizerId === id || row.companionId === id) &&
      (row.startedTick === tick || row.lastMovedTick === tick)));
}

function localVillage(world: WorldState,actor: Cultivator,tick: number,settlementId?: string): MortalSettlement | undefined {
  const village = world.settlements.villages.find(row => row.locationId === actor.locationId &&
    (settlementId === undefined || row.id === settlementId));
  return village && world.locations.some(site => site.id === village.locationId && site.type !== 'secret_realm' && site.type !== 'abyss') &&
    physicallyPresent(world,actor,village.locationId,tick) ? village : undefined;
}

const sameEnrollment = (entry: HouseholdNameEntry,member: HouseholdMember) =>
  entry.actorId === member.recruitedId && entry.volunteerId === member.volunteerId &&
  entry.householdId === member.householdId && entry.settlementId === member.settlementId;
const hasHousehold = (world: WorldState,member: HouseholdMember) => world.households.groups.some(group =>
  group.id === member.householdId && group.presences.some(presence => presence.settlementId === member.settlementId));
const matchesRecruit = (actor: Cultivator,member: HouseholdMember,volunteer?: MortalVolunteer): boolean =>
  actor.id === member.recruitedId && actor.id === `recruit-${member.volunteerId}` &&
  (!volunteer || volunteer.enlistedCultivatorId === actor.id && volunteer.name === actor.name);

function ownEnrollment(world: WorldState,actor: Cultivator,village: MortalSettlement,tick: number): HouseholdMember | undefined {
  if (!actor.id.startsWith('recruit-') || !adult(actor) || !live(actor)) return undefined;
  const member = world.households.members.find(row => row.recruitedId === actor.id && row.settlementId === village.id &&
    row.status === 'recruited' && row.registeredTick <= tick && row.settledTick !== undefined && row.settledTick <= tick);
  return member && hasHousehold(world,member) &&
    matchesRecruit(actor,member,village.volunteers.find(person => person.id === member.volunteerId)) ? member : undefined;
}

function latestVerified(entries: readonly HouseholdNameEntry[],tick: number): Map<string,HouseholdNameEntry> {
  const latest = new Map<string,HouseholdNameEntry>();
  for (const entry of entries) {
    if (entry.status !== 'verified' || entry.closedTick === undefined || entry.closedTick > tick) continue;
    const prior = latest.get(entry.actorId);
    if (!prior || entry.closedTick > prior.closedTick! ||
      entry.closedTick === prior.closedTick && entry.openedTick >= prior.openedTick) latest.set(entry.actorId,entry);
  }
  return latest;
}

const stillProposed = (entry: HouseholdNameEntry,tick: number) =>
  entry.status === 'proposed' && entry.openedTick <= tick && tick < entry.expiresTick;

function canVerify(world: WorldState,witness: Cultivator,village: MortalSettlement,entry: HouseholdNameEntry,tick: number): boolean {
  if (entry.actorId === witness.id || !adult(witness) || entry.openedTick >= tick || !stillProposed(entry,tick) ||
    entry.settlementId !== village.id) return false;
  const owner = actorAt(world,entry.actorId);
  if (!physicallyPresent(world,owner,village.locationId,tick)) return false;
  const member = ownEnrollment(world,owner,village,tick);
  return !!member && sameEnrollment(entry,member);
}

export function availableHouseholdNameActions(actor: Cultivator,world: WorldState,
  executionTick = world.tick): HouseholdNameOption[] {
  if (executionTick !== world.tick && executionTick !== world.tick+1 || !live(actor) || !adult(actor) ||
    !world.cultivators.includes(actor)) return [];
  const village = localVillage(world,actor,executionTick);
  if (!village) return [];
  const { entries } = world.householdNames;
  const options: HouseholdNameOption[] = [];
  for (const entry of entries) if (canVerify(world,actor,village,entry,executionTick)) {
    options.push({action:'HOUSEHOLD_NAME',nameMove:'verify',targetHouseholdNameId:entry.id});
  }
  const owner = ownEnrollment(world,actor,village,executionTick);
  if (!owner) return options;
  const pending = entries.find(entry => sameEnrollment(entry,owner) && stillProposed(entry,executionTick));
  if (pending) {
    options.push({action:'HOUSEHOLD_NAME',nameMove:'withdraw',targetHouseholdNameId:pending.id});
    return options;
  }
  const current = latestVerified(entries.filter(entry => sameEnrollment(entry,owner)),executionTick).get(actor.id);
  const alias = current?.kind === 'alias' ? current.alias : undefined;
  for (const choice of HOUSEHOLD_NAME_ALIASES) if (choice !== alias && choice !== actor.name) {
    options.push({action:'HOUSEHOLD_NAME',nameMove:'offer',householdAlias:choice});
  }
  if (alias !== undefined) options.push({action:'HOUSEHOLD_NAME',nameMove:'offer_clear'});
  return options;
}

function event(world: WorldState,entry: HouseholdNameEntry,token: string,title: string,description: string): WorldEvent {
  const village = world.settlements.villages.find(row => row.id === entry.settlementId);
  return {
    id:`evt-${entry.id}-${world.tick}-${token}`,tick:world.tick,year:world.year,month:world.month,category:'diplomacy',
    title,description,actorIds:[entry.actorId,...(entry.witnessId ? [entry.witnessId] : [])],witnessScope:'participants',
    ...(village && world.locations.some(site => site.id === village.locationId) ? {locationId:village.locationId} : {}),
  };
}

export function resolveHouseholdNameAction(world: WorldState,actor: Cultivator,payload: LLMDecisionPayload): WorldEvent | null {
  if (payload.chosenAction !== 'HOUSEHOLD_NAME' || payload.targetLocationId !== undefined ||
    payload.targetSettlementId !== undefined || payload.targetCultivatorId !== undefined || payload.targetVolunteerId !== undefined) return null;
  const option = availableHouseholdNameActions(actor,world).find(candidate => candidate.nameMove === payload.nameMove &&
    candidate.householdAlias === payload.householdAlias && candidate.targetHouseholdNameId === payload.targetHouseholdNameId);
  if (!option) return null;
  const state = world.householdNames;
  if (option.nameMove === 'offer' || option.nameMove === 'offer_clear') {
    const village = localVillage(world,actor,world.tick)!;
    const member = ownEnrollment(world,actor,village,world.tick)!;
    const entry: HouseholdNameEntry = {
      id:`household-name-${state.nextId++}`,actorId:actor.id,volunteerId:member.volunteerId,householdId:member.householdId,
      settlementId:member.settlementId,kind:option.nameMove === 'offer' ? 'alias' : 'clear',
      ...(option.nameMove === 'offer' ? {alias:option.householdAlias} : {}),
      openedTick:world.tick,expiresTick:world.tick+HOUSEHOLD_NAME_OFFER_TICKS,status:'proposed',
    };
    state.entries.push(entry);
    return event(world,entry,'offer','本人提出坊籍称名变更','待另一位在场成年人核验；本名、籍贯和亲缘均不变。');
  }
  const entry = state.entries.find(row => row.id === option.targetHouseholdNameId)!;
  entry.closedTick = world.tick;
  if (option.nameMove === 'withdraw') {
    entry.status = 'withdrawn';
    return event(world,entry,'withdraw','本人撤回称名提议','撤回不改动既有坊籍称名。');
  }
  entry.status = 'verified';
  entry.witnessId = actor.id;
  return event(world,entry,'verify','独立在场成年人核验称名',
    entry.kind === 'alias' ? `本坊登记别称「${entry.alias}」，不替换本名，不因同名合并身份。` : '撤去本坊登记别称，保留本名与原始身份。');
}

export function advanceHouseholdNames(world: WorldState): WorldEvent[] {
  const { entries } = world.householdNames;
  const events: WorldEvent[] = [];
  for (const entry of entries) {
    if (entry.status !== 'proposed') continue;
    const owner = actorAt(world,entry.actorId);
    const village = world.settlements.villages.find(row => row.id === entry.settlementId);
    const origin = village && owner && ownEnrollment(world,owner,village,world.tick);
    if (world.tick < entry.expiresTick && origin && sameEnrollment(entry,origin)) continue;
    entry.status = 'expired'; entry.closedTick = world.tick;
    events.push(event(world,entry,'expire','称名提议未生效','因期限或身份凭据失效，既有称名没有改变。'));
  }
  if (entries.length > HISTORY_LIMIT) {
    // A verified clear is just as durable as an alias; otherwise pruning could resurrect an old alias.
    const pinned = new Set([...latestVerified(entries,world.tick).values()].map(entry => entry.id));
    const keep = (entry: HouseholdNameEntry) => entry.status === 'proposed' || pinned.has(entry.id);
    const recent = new Set(entries.filter(entry => !keep(entry)).slice(-HISTORY_LIMIT).map(entry => entry.id));
    world.householdNames.entries = entries.filter(entry => keep(entry) || recent.has(entry.id));
  }
  return events;
}

export function projectHouseholdNames(world: WorldState,viewer?: Cultivator,settlementId?: string): HouseholdNameView | undefined {
  if (!viewer || !world.cultivators.includes(viewer)) return undefined;
  const village = localVillage(world,viewer,world.tick,settlementId);
  if (!village) return undefined;
  const names = world.householdNames.entries.filter(entry => entry.settlementId === village.id);
  const aliases = latestVerified(names,world.tick);
  const volunteers = new Map(village.volunteers.map(person => [person.id,person]));
  const people = new Map(world.cultivators.map(person => [person.id,person]));
  const visible: HouseholdNamedPerson[] = [];
  const registered = new Set<string>();
  for (const member of world.households.members) {
    if (member.settlementId !== village.id || member.registeredTick > world.tick || member.status === 'retired' ||
      !hasHousehold(world,member)) continue;
    const volunteer = volunteers.get(member.volunteerId);
    const base = {id:`household:${member.volunteerId}`,volunteerId:member.volunteerId,householdId:member.householdId};
    if (member.status === 'resident') {
      if (volunteer && !volunteer.enlistedCultivatorId) visible.push({...base,name:volunteer.name,status:'resident',present:true});
      continue;
    }
    const actor = member.recruitedId ? people.get(member.recruitedId) : undefined;
    if (!actor || member.settledTick === undefined || member.settledTick > world.tick || !matchesRecruit(actor,member,volunteer)) continue;
    registered.add(actor.id);
    const isAlive = actor.alive && actor.hp > 0;
    if (member.status === 'deceased' ? isAlive : !isAlive) continue;
    const variation = aliases.get(actor.id);
    const alias = variation?.kind === 'alias' && sameEnrollment(variation,member) ? variation.alias : undefined;
    visible.push({...base,name:volunteer?.name ?? actor.name,...(alias ? {alias} : {}),actorId:actor.id,status:member.status,
      ...(member.status === 'recruited' && physicallyPresent(world,actor,village.locationId,world.tick) ? {present:true} : {})});
  }
  const localNames = new Set(visible.flatMap(({name,alias}) => alias ? [normalizeName(name),normalizeName(alias)] : [normalizeName(name)]));
  for (const actor of world.cultivators) {
    if (registered.has(actor.id) || actor.locationId !== village.locationId || !localNames.has(normalizeName(actor.name)) ||
      !physicallyPresent(world,actor,village.locationId,world.tick)) continue;
    visible.push({id:`visitor:${actor.id}`,actorId:actor.id,name:actor.name,status:'visitor',present:true});
  }
  const proposals = names.filter(entry => stillProposed(entry,world.tick) &&
    (entry.actorId === viewer.id || canVerify(world,viewer,village,entry,world.tick))).map(entry => ({...entry}));
  return {settlementId:village.id,entries:visible.sort(byStableId),proposals:proposals.sort(byStableId)};
}

export function lookupHouseholdNames(world: WorldState,viewer: Cultivator | undefined,settlementId: string,input: string): HouseholdNameLookup {
  const needle = normalizeName(input);
  if (!needle) return {status:'unresolved',matches:[]};
  const matches = projectHouseholdNames(world,viewer,settlementId)?.entries.filter(entry =>
    normalizeName(entry.name) === needle || entry.alias !== undefined && normalizeName(entry.alias) === needle) ?? [];
  return {status:matches.length > 1 ? 'ambiguous' : matches[0]?.status === 'resident' || matches[0]?.status === 'recruited'
    ? 'unique' : 'unresolved',matches};
}
