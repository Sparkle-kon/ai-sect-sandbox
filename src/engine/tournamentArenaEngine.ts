import {ARTIFACT_RULES} from './artifactEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import type {TournamentArena,TournamentArenaBout,TournamentArenaRound} from '../types/tournamentArena';
import type {Cultivator,WorldEvent,WorldOccasion,WorldState} from '../types/world';

import { TOURNAMENT_ARENA_TITLE, TOURNAMENT_ARENA_PRIZE_NAME, tournamentArenaPrizeId } from './tournamentArenaTerms';
export { TOURNAMENT_ARENA_TITLE, TOURNAMENT_ARENA_PRIZE_NAME, tournamentArenaPrizeId } from './tournamentArenaTerms';
type Pair=Pick<TournamentArenaBout,'firstId'|'secondId'>;

export interface TournamentArenaView extends TournamentArena {
  occasionId:string;
  title:string;
  siteId:string;
  status:WorldOccasion['status'];
  currentPairs:Pair[];
}

const liveHere=(actor:Cultivator|undefined,siteId:string):actor is Cultivator=>
  Boolean(actor?.alive&&actor.hp>0&&actor.positionPlane===undefined&&actor.locationId===siteId);
function actorIndex(world:WorldState){
  const found=new Map<string,Cultivator|undefined>();
  for(const actor of world.cultivators)found.set(actor.id,found.has(actor.id)?undefined:actor);
  return found;
}
const publicVenue=(world:WorldState,id:string)=>{
  const matches=world.locations.filter(row=>row.id===id);
  return matches.length===1&&(matches[0].type==='market'||matches[0].type==='sect_hq')&&!isScopedExpeditionGate(matches[0]);
};
const seasonEvent=(world:WorldState,occasion:WorldOccasion,event:WorldEvent,slug:string)=>
  event.id===`evt-${world.tick}-${occasion.id}-${slug}`&&event.tick===world.tick&&event.year===world.year&&event.month===world.month&&
  event.locationId===occasion.locationId&&event.witnessScope===undefined&&event.category==='heavenly';
export function openTournamentArena(world:WorldState,occasion:WorldOccasion,event:WorldEvent):void{
  if(occasion.arena||occasion.kind!=='tournament'||occasion.status!=='running'||occasion.omenId||occasion.round!==0||
    occasion.lastResolvedTick!==world.tick||!world.occasions.includes(occasion)||!publicVenue(world,occasion.locationId)||
    !seasonEvent(world,occasion,event,'commence')||![8,16].includes(occasion.remainingIds.length)||
    new Set(occasion.remainingIds).size!==occasion.remainingIds.length)return;
  const index=actorIndex(world);
  if(occasion.remainingIds.some(id=>!occasion.participantIds.includes(id)||!liveHere(index.get(id),occasion.locationId)))return;
  occasion.arena={openedTick:world.tick,seededIds:[...occasion.remainingIds],rounds:[]};
}
export function tournamentArenaRoster(world:WorldState,occasion:WorldOccasion):Cultivator[]{
  const index=actorIndex(world),seen=new Set<string>();
  return occasion.remainingIds.flatMap(id=>{
    const actor=index.get(id);
    if(seen.has(id)||!liveHere(actor,occasion.locationId))return [];
    seen.add(id);return [actor];
  });
}
const exactTerminals=new WeakMap<WorldOccasion,WorldEvent>();
export const isFreshTournamentArenaTerminal=(occasion:WorldOccasion,event:WorldEvent):boolean=>exactTerminals.get(occasion)===event;
const asPairs=(roster:readonly Cultivator[]):Pair[]=>
  Array.from({length:Math.ceil(roster.length/2)},(_,i)=>{
    const firstId=roster[i].id,secondId=roster[roster.length-i-1].id;
    return firstId===secondId?{firstId}:{firstId,secondId};
  });

export function recordTournamentArenaRound(world:WorldState,occasion:WorldOccasion,event:WorldEvent,
  roster:readonly Cultivator[],bouts:readonly TournamentArenaBout[]):void{
  const arena=occasion.arena;
  if(!arena||arena.terminal||!world.occasions.includes(occasion)||world.tick<=(arena.rounds.at(-1)?.tick??arena.openedTick)||
    occasion.round!==arena.rounds.length+1||occasion.round>Math.log2(arena.seededIds.length)||occasion.lastResolvedTick!==world.tick||!['round','champion','close'].some(slug=>seasonEvent(world,occasion,event,slug)))return;
  const entrants=arena.rounds.at(-1)?.bouts.map(row=>row.winnerId)??arena.seededIds;
  const attendees=new Set(roster.map(actor=>actor.id));
  const pairs=asPairs(roster);
  const ordered=entrants.filter(id=>attendees.has(id));
  if(ordered.length!==roster.length||ordered.some((id,i)=>id!==roster[i]?.id)||pairs.length!==bouts.length||
    pairs.some((pair,i)=>pair.firstId!==bouts[i].firstId||pair.secondId!==bouts[i].secondId))return;
  const native=occasion.bouts.filter(row=>row.round===occasion.round);
  if(native.length!==bouts.length||native.some((row,i)=>row.firstId!==bouts[i].firstId||row.secondId!==bouts[i].secondId||
    row.winnerId!==bouts[i].winnerId))return;
  const round:TournamentArenaRound={round:occasion.round,tick:world.tick,eventId:event.id,
    absentIds:entrants.filter(id=>!attendees.has(id)),bouts:bouts.map(bout=>({...bout}))};
  arena.rounds.push(round);
}
/** Called once native scoring, closing and original champion settlement are real. */
export function finishTournamentArena(world:WorldState,occasion:WorldOccasion,event:WorldEvent):void{
  const arena=occasion.arena,status=occasion.status;
  if(!arena||arena.terminal||!world.occasions.includes(occasion)||occasion.lastResolvedTick!==world.tick||
    (status!=='completed'&&status!=='cancelled')||!seasonEvent(world,occasion,event,status==='completed'?'champion':'close'))return;
  arena.terminal={tick:world.tick,status,eventId:event.id};
  exactTerminals.set(occasion,event);
  if(status!=='completed'||!occasion.championId||event.actorIds.length!==1||event.actorIds[0]!==occasion.championId)return;
  const last=arena.rounds.at(-1),final=last?.bouts[0];
  // A walkover may still be a real native legacy win, but not a contested Grand Arena prize.
  if(!last||last.eventId!==event.id||last.bouts.length!==1||!final?.secondId||final.winnerId!==occasion.championId)return;
  const champion=actorIndex(world).get(occasion.championId);
  if(!champion?.alive||champion.hp<=0)return;
  const id=tournamentArenaPrizeId(occasion.id);
  if(world.cultivators.some(actor=>actor.artifacts.some(item=>item.id===id)))return;
  const durability=ARTIFACT_RULES.通天灵宝.durability;
  champion.artifacts.push({id,name:TOURNAMENT_ARENA_PRIZE_NAME,tier:'通天灵宝',durability,maxDurability:durability,
    spiritRoot:champion.spiritRoot});
  champion.title=TOURNAMENT_ARENA_TITLE;
  arena.prize={tick:world.tick,actorId:champion.id,artifactId:id,title:TOURNAMENT_ARENA_TITLE};
}

export function projectTournamentArena(world:WorldState,occasionId:string):TournamentArenaView|undefined{
  const rows=world.occasions.filter(row=>row.id===occasionId);
  if(rows.length!==1)return undefined;
  const [occasion]=rows;
  if(!occasion.arena||occasion.kind!=='tournament'||!publicVenue(world,occasion.locationId))return undefined;
  return {...structuredClone(occasion.arena),occasionId,title:occasion.title,siteId:occasion.locationId,status:occasion.status,
    currentPairs:occasion.status==='running'?asPairs(tournamentArenaRoster(world,occasion)):[]};
}
