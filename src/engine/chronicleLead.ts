import type { ChronicleAnchor, WorldEvent, WorldState } from '../types/world';

type StoryFact = ChronicleAnchor | WorldEvent;
export interface ChronicleLead {
  actorId: string;
  name: string;
  eventIds: readonly string[];
  firstTick: number;
  lastTick: number;
}

const WINDOW_TICKS = 24;
const strongCategories = new Set<StoryFact['category']>(['combat', 'breakthrough', 'death', 'intrigue']);
const cmp = (a:string,b:string) => a < b ? -1 : a > b ? 1 : 0;
const localOnly = /^(?:evt-(?:sealed-dispatch|sparring|expedition-rescue|short-shift|boundary-relief|apprentice-cohort|household-name|caravan-restitution|village-granary|infirmary)-|evt-pilgrimage-[1-9]\d*-(?:camp(?:-expiry|-interruption)?|dismantled|resumed)-\d+$)/;

/** The public reading room never turns a participant's record into public narrative. */
export function isChronicleStoryFact(fact: StoryFact, throughTick: number): boolean {
  return Boolean(fact.id && fact.title.trim() && Number.isSafeInteger(fact.tick) && fact.tick >= 0 &&
    fact.tick <= throughTick && !localOnly.test(fact.id) &&
    (!('witnessScope' in fact) || fact.witnessScope !== 'participants'));
}

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id,i) => id === b[i]);
const sameLiveFact = (a: WorldEvent, b: WorldEvent) => a.tick === b.tick && a.title === b.title &&
  a.description === b.description && a.category === b.category && a.locationId === b.locationId &&
  sameIds(a.actorIds,b.actorIds) && JSON.stringify(a.dialogue) === JSON.stringify(b.dialogue);

export function publicChronicleSceneEvents(world: WorldState): WorldEvent[] {
  const index = new Map<string,WorldEvent>();
  const excluded = new Set<string>();
  for (const fact of world.events) {
    const previous = index.get(fact.id);
    if (!isChronicleStoryFact(fact,world.tick) || previous && !sameLiveFact(previous,fact)) excluded.add(fact.id);
    if (!previous) index.set(fact.id,fact);
  }
  return [...index.values()].filter(fact=>!excluded.has(fact.id));
}

function publicWindow(world: WorldState, endTick: number, supplied?: readonly StoryFact[]): StoryFact[] {
  const start = Math.max(0,endTick-WINDOW_TICKS+1);
  const current = new Map<string,WorldEvent>();
  const disputed = new Set<string>();
  for (const fact of world.events) {
    const previous = current.get(fact.id);
    if (!isChronicleStoryFact(fact,endTick) || previous && !sameLiveFact(previous,fact)) disputed.add(fact.id);
    current.set(fact.id,fact);
  }
  const map = new Map<string,StoryFact>();
  for (const fact of supplied ?? [...world.chronicleArchive.anchors,...world.events]) {
    const now = current.get(fact.id);
    const previous = map.get(fact.id);
    if (fact.tick < start || !isChronicleStoryFact(fact,endTick) || disputed.has(fact.id)) continue;
    if (now && (now.tick !== fact.tick || now.category !== fact.category ||
      now.title.trim().slice(0,80) !== fact.title.trim().slice(0,80) ||
      !sameIds([...new Set(now.actorIds)].slice(0,12),fact.actorIds.slice(0,12))) || previous &&
      (previous.tick !== fact.tick || previous.category !== fact.category)) {
      disputed.add(fact.id);
      continue;
    }
    map.set(fact.id,fact);
  }
  return [...map.values()].filter(fact=>!disputed.has(fact.id))
    .sort((a,b)=>a.tick-b.tick||cmp(a.id,b.id));
}

/** Counts distinctly recorded named participation, not fame, future survival, or simulation priority. */
export function projectChronicleLead(world: WorldState, facts?: readonly StoryFact[],
  throughTick = world.tick): ChronicleLead | undefined {
  if (!Number.isSafeInteger(throughTick) || throughTick < 0 || throughTick > world.tick) return undefined;
  const people = new Map(world.cultivators.map(({id,name})=>[id,name.trim()]));
  type Candidate = {actorId:string;name:string;events:StoryFact[];periods:Set<number>;categories:Set<StoryFact['category']>;decisive:number;uniqueLead:number};
  const candidates = new Map<string,Candidate>();
  for (const fact of publicWindow(world,throughTick,facts)) {
    // Crowds and casualty rolls do not manufacture a named protagonist through sheer volume.
    const distinct = [...new Set(fact.actorIds)];
    if (!distinct.length || distinct.length > 6 || fact.category === 'heavenly') continue;
    const names = new Map<string,number>();
    for (const id of distinct) {
      const name = people.get(id);
      if (name) names.set(name,(names.get(name)??0)+1);
    }
    const participants = distinct.filter(id => {
      const name = people.get(id);
      if (!name) return false;
      const namedQuote = fact.dialogue?.turns.some(turn => turn.speakerId === id && turn.speakerName.trim() === name);
      return Boolean(namedQuote || (names.get(name) === 1 && (fact.title.includes(name) || fact.description.includes(name)) &&
        ![...names.keys()].some(other => other !== name && other.includes(name) &&
          (fact.title.includes(other) || fact.description.includes(other)))));
    });
    const namedFirst = distinct[0] === participants[0] && participants.length === 1 &&
      fact.title.includes(people.get(participants[0]) ?? '\u0000');
    for (const actorId of participants) {
      const name = people.get(actorId)!;
      const row = candidates.get(actorId) ?? {actorId,name,events:[],periods:new Set<number>(),
        categories:new Set<StoryFact['category']>(),decisive:0,uniqueLead:0};
      row.events.push(fact);
      row.periods.add(fact.tick);
      row.categories.add(fact.category);
      if (strongCategories.has(fact.category)) row.decisive++;
      if (namedFirst) row.uniqueLead++;
      candidates.set(actorId,row);
    }
  }
  const eligible = [...candidates.values()].filter(row=>row.events.length>=3 && row.periods.size>=2 &&
    row.categories.size>=2 && row.decisive>=1 && row.uniqueLead>=1);
  eligible.sort((a,b) => b.periods.size-a.periods.size || b.categories.size-a.categories.size ||
    b.uniqueLead-a.uniqueLead || b.decisive-a.decisive || b.events.length-a.events.length ||
    a.events[0].tick-b.events[0].tick || cmp(a.actorId,b.actorId));
  const row = eligible[0];
  if (!row) return undefined;
  return {actorId:row.actorId,name:row.name,eventIds:row.events.map(fact=>fact.id),
    firstTick:row.events[0].tick,lastTick:row.events[row.events.length-1].tick};
}
