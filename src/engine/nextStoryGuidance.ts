import type {Cultivator,WorldEvent,WorldOccasion,WorldState} from '../types/world';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {canSeeOccasion} from './expeditionOmenEngine';
import {projectExpeditionDungeon} from './expeditionDungeonEngine';
import {activeHeartDemon,isHeartDemonGuided} from './heartDemonEngine';
import {availableOccasionJoins} from './occasionEngine';
import {tournamentArenaRoster} from './tournamentArenaEngine';

export interface NextStoryGuidance {kind:'heart'|'dungeon'|'tournament';title:string;line:string}

function eventAt(world:WorldState,row:WorldEvent,tick:number):boolean{
  const month=world.year*12+world.month-1-(world.tick-tick);
  return tick<=world.tick&&row.tick===tick&&row.year===Math.floor(month/12)&&row.month===month%12+1;
}

const dungeonLine={
  enter:'人已到了门前。此时可照自己的名册入内。',
  gather:'脚下药园仍有灵叶。可以先采，也可以循来路退出。',
  break_array:'阵门还挡在前面。灵气够，才能亲手开阵；也可退回。',
  strike:'妖王仍在禁地。要交手就从此处迎上，也还能退回。',
  claim:'妖王已经倒下。可亲手取传承，但取到不等于脱身。',
  retreat:'眼下可走的是退路，能否脱身只看实际走过的路。',
} as const;

function heart(world:WorldState,viewer:Cultivator):NextStoryGuidance|undefined{
  const native=activeHeartDemon(world,viewer),trial=viewer.tribulation;
  if(!native||!trial||!isHeartDemonGuided(world,viewer,native))return;
  const events=world.events.filter(row=>row.id===native.finalWaveEventId);
  // The armed trial remains valid when an old hot original naturally rotates; present disputes do not.
  if(events.length){
    const [source]=events;
    if(events.length!==1||!eventAt(world,source,native.openedTick)||source.category!=='heavenly'||
      source.witnessScope!==undefined||source.title!==`第${trial.totalWaves}重雷劫`||
      source.actorIds.length!==1||source.actorIds[0]!==viewer.id||source.locationId!==native.siteId||
      source.damage?.length!==1||source.damage[0].cultivatorId!==viewer.id||source.damage[0].amount<=0)return;
  }
  return {kind:'heart',title:'心魔当前',line:native.queued?'应对已经选定，下一月才见实果。':'雷劫这最后一重已经过去。先选如何回应眼前幻象。'};
}
function dungeon(world:WorldState,viewer:Cultivator):NextStoryGuidance|undefined{
  const state=projectExpeditionDungeon(world,viewer);
  if(!state?.options.length||state.closedTick!==undefined)return;
  const rows=world.occasions.filter(row=>row.id===state.occasionId);
  if(rows.length!==1||!canSeeOccasion(world,viewer,rows[0]))return;
  const choice=state.options.find(row=>row.dungeonMove!=='retreat')??state.options[0];
  return {kind:'dungeon',title:'秘境只看眼前一步',line:dungeonLine[choice.dungeonMove]};
}
function tournamentSource(world:WorldState,occasion:WorldOccasion,tick:number,move:'open'|'commence'):boolean{
  const id=`evt-${tick}-${occasion.id}-${move}`;
  const matches=world.events.filter(row=>row.id===id);
  if(matches.length!==1)return false;
  const [row]=matches;
  return eventAt(world,row,tick)&&row.category==='heavenly'&&row.witnessScope===undefined&&
    row.locationId===occasion.locationId&&row.title===`${occasion.title}${move==='open'?'开启':'正式开始'}`&&
    (move==='open'?row.actorIds.length===0:!!occasion.arena&&
      row.actorIds.length===occasion.participantIds.length&&row.actorIds.every((id,i)=>id===occasion.participantIds[i])&&
      new Set(row.actorIds).size===row.actorIds.length&&[8,16].includes(occasion.arena.seededIds.length)&&
      new Set(occasion.arena.seededIds).size===occasion.arena.seededIds.length&&occasion.arena.seededIds.every(id=>row.actorIds.includes(id))&&
      row.description===`${occasion.arena.seededIds.length}名修士已到场。`);
}
function tournament(world:WorldState,viewer:Cultivator):NextStoryGuidance|undefined{
  const rows=world.occasions.filter(row=>row.kind==='tournament'&&!row.omenId&&
    (row.status==='registration'||row.status==='running')).sort((a,b)=>b.startedTick-a.startedTick);
  if(!rows.length)return;
  const joins=new Set(availableOccasionJoins(viewer,world,world.tick+1).map(row=>row.targetOccasionId));
  for(const row of rows){
    const site=world.locations.filter(place=>place.id===row.locationId);
    if(world.occasions.filter(other=>other.id===row.id).length!==1||site.length!==1||
      isScopedExpeditionGate(site[0])||!(site[0].type==='market'||site[0].type==='sect_hq')||
      !canSeeOccasion(world,viewer,row))continue;
    if(row.status==='registration'&&joins.has(row.id)&&!row.participantIds.includes(viewer.id)&&
      tournamentSource(world,row,row.startedTick,'open'))
      return {kind:'tournament',title:'大比尚在报名',line:'这场大比还收名册。只有报上名，才算应约。'};
    if(row.status==='running'&&row.arena&&viewer.locationId===row.locationId&&world.tick+1<row.expiresTick&&
      tournamentSource(world,row,row.arena.openedTick,'commence')&&tournamentArenaRoster(world,row).length>=2)
      return {kind:'tournament',title:'大比下一轮',line:'擂台还在进行。下一轮交手，要到下一月才落定。'};
  }
}

/** Read-only, one exact next clue. Never offers a new action, consent, or forecast. */
export function projectNextStoryGuidance(world:WorldState,viewer:Cultivator|undefined):NextStoryGuidance|undefined{
  if(!viewer?.alive||viewer.hp<=0||viewer.positionPlane!==undefined)return;
  const matches=world.cultivators.filter(row=>row.id===viewer.id);
  if(matches.length!==1||matches[0]!==viewer)return;
  return heart(world,viewer)??dungeon(world,viewer)??tournament(world,viewer);
}
