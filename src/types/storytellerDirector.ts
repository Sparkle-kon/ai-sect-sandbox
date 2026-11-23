export const STORYTELLER_STYLES = [
  {id:'still_water',label:'静水流深',cadence:3},
  {id:'wandering_jianghu',label:'江湖风波',cadence:2},
  {id:'great_calamity',label:'天地大劫',cadence:1},
] as const;
export type StorytellerStyle = typeof STORYTELLER_STYLES[number]['id'];
export const STORYTELLER_MOVES=['rest','cultivate','talk','travel'] as const;
export type StorytellerMove = typeof STORYTELLER_MOVES[number];
export const STORYTELLER_STORYLETS=[
  'rain-eaves','lamplight-rest','shared-tea','mountain-road','storm-watch','retreat-from-danger',
] as const;
export type StorytellerStoryletId = typeof STORYTELLER_STORYLETS[number];
export type StorytellerTone = 'quiet' | 'journey' | 'crisis';

export const STORYTELLER_STORYLET_TONES:Readonly<Record<StorytellerStoryletId,StorytellerTone>>=Object.freeze({
  'rain-eaves':'quiet','lamplight-rest':'quiet','shared-tea':'journey','mountain-road':'journey',
  'storm-watch':'crisis','retreat-from-danger':'crisis',
});
export const STORYTELLER_PULSE_LIMIT=24;
export const STORYTELLER_WORLD_BEATS=['conflict','peril','celebration','quiet'] as const;
export type StorytellerWorldBeat=typeof STORYTELLER_WORLD_BEATS[number];
export const STORYTELLER_PULSE_REASONS=[
  'health','local_peril','open_road','companion','world_pressure','breather','change_of_pace','cadence',
] as const;
export type StorytellerPulseReason=typeof STORYTELLER_PULSE_REASONS[number];
export interface StorytellerPulsePoint {
  tick:number;
  tension:number;
  worldBeat:StorytellerWorldBeat;
  offeredTone?:StorytellerTone;
  reason?:StorytellerPulseReason;
}
export interface StorytellerPulseDatedPoint extends StorytellerPulsePoint {
  year:number;
  month:number;
  beatLabel:string;
  reasonLabel?:string;
}
export interface StorytellerPulseView {
  title:'天势';
  points:StorytellerPulseDatedPoint[];
  current:StorytellerPulseDatedPoint;
}


export interface StorytellerOffer {
  id: string;
  storyletId: StorytellerStoryletId;
  actorId: string;
  siteId: string;
  openedTick: number;
  expiresTick: number;
  optionMoves: StorytellerMove[];
  targetActorId?: string;
  targetSiteId?: string;
}

export interface StorytellerOutcome {
  offerId: string;
  actorId: string;
  storyletId: StorytellerStoryletId;
  move: StorytellerMove;
  tick: number;
}

export interface StorytellerDirectorState {
  style: StorytellerStyle;
  focusActorId?: string;
  configuredTick: number;
  lastOfferTick: number;
  lastAdvancedTick?: number;
  tension: number;
  pulse?: StorytellerPulsePoint[];
  offer?: StorytellerOffer;
  lastOutcome?: StorytellerOutcome;
}

export interface StorytellerOption {
  chosenAction: 'STORYTELLER_CHOICE';
  storytellerOfferId: string;
  storytellerMove: StorytellerMove;
}

export interface StorytellerView {
  style: StorytellerStyle;
  tension: number;
  actorId: string;
  actorName: string;
  siteId: string;
  siteName: string;
  storyletId: StorytellerStoryletId;
  tone: StorytellerTone;
  title: string;
  body: string;
  options: Array<{label:string;decision:StorytellerOption}>;
  openedTick: number;
  expiresTick: number;
}

export function storytellerOfferId(openedTick:number,actorId:string,storyletId:StorytellerStoryletId):string{
  let hash=0x811c9dc5;
  for(const char of JSON.stringify([actorId,storyletId]))
    hash=Math.imul(hash^(char.codePointAt(0)??0),0x01000193);
  return `storyteller-${openedTick}-${(hash>>>0).toString(16).padStart(8,'0')}`;
}

/** Immutable authored consent matrix, shared with save validation; order is also UI order. */
const all=Object.freeze([...STORYTELLER_MOVES]);
const quiet=Object.freeze(['rest','cultivate','talk'] as const);
const route=Object.freeze(['rest','cultivate','travel'] as const);
export const STORYTELLER_STORYLET_MOVES:Readonly<Record<StorytellerStoryletId,readonly StorytellerMove[]>>=Object.freeze({
  'rain-eaves':quiet,'lamplight-rest':quiet,'shared-tea':all,'mountain-road':all,
  'storm-watch':all,'retreat-from-danger':route,
});
