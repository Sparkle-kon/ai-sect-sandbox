import type {SectLiveSource} from '../types/sectLive';
import type {Cultivator,LocationNode,WorldEvent,WorldState} from '../types/world';
import {ALCHEMY_RECIPES} from './alchemyCatalog';
import {isChronicleStoryFact} from './chronicleLead';
import {furnaceSafetyDamage} from './furnaceSafetyEngine';
import {onLowerPlane} from './upperPassageIsolation';
import {matchSectChallengeResult,SECT_CHALLENGE_PUBLIC_TITLE} from './sectChallengeProof';
import {sameGeneratedWorld} from './worldIdentity';

const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
type SourceKind=SectLiveSource['kind'];
type Bout=NonNullable<SectLiveSource['bout']>;

function uniqueIndex<T extends {id:string}>(rows:readonly T[]):Map<string,T|undefined>{
  const result=new Map<string,T|undefined>();
  for(const row of rows)result.set(row.id,result.has(row.id)?undefined:row);
  return result;
}

function exact<T>(rows:readonly T[],test:(row:T)=>boolean):T|undefined{
  let result:T|undefined;
  for(const row of rows)if(test(row)){
    if(result!==undefined)return;
    result=row;
  }
  return result;
}

const sameIds=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
const validAmount=(amount:number|undefined)=>typeof amount==='number'&&Number.isSafeInteger(amount)&&amount>0;
const publicSite=(site:LocationNode|undefined):site is LocationNode=>
  !!site&&site.type!=='secret_realm'&&site.expeditionOmenId===undefined;
const sameBout=(a:Bout|undefined,b:Bout|undefined)=>a===undefined?b===undefined:
  !!b&&a.occasionId===b.occasionId&&a.round===b.round&&a.bout===b.bout;

function dated(world:WorldState,event:WorldEvent):boolean{
  return Number.isSafeInteger(event.tick)&&Number.isSafeInteger(event.year)&&Number.isInteger(event.month)&&
    event.month>=1&&event.month<=12&&event.tick>=0&&event.tick<=world.tick&&
    (world.year-event.year)*12+world.month-event.month===world.tick-event.tick;
}

const burstPills=['golden','barrier','heart_poison'] as const;
type BurstPill=typeof burstPills[number];
const burstPill=(eventId:string,prefix:string):BurstPill|undefined=>
  burstPills.find(pill=>eventId===prefix+'alchemy-burst-'+pill);

/** Immutable native key restrictions used by the save schema even after a hot event has aged out. */
export function isSectLiveSourceId(source:SectLiveSource):boolean {
  const [first,second]=source.castIds;
  const prefix=`evt-${source.tick}-${first}-`;
  if(source.kind==='tournament'){
    const bout=source.bout;
    return source.castIds.length===2&&!!first&&!!second&&first!==second&&!!bout&&
      Number.isSafeInteger(bout.round)&&bout.round>0&&Number.isSafeInteger(bout.bout)&&bout.bout>=0&&
      ['round','champion'].some(suffix=>source.sourceEventId===`evt-${source.tick}-${bout.occasionId}-${suffix}`);
  }
  if(source.bout)return false;
  switch(source.kind){
    case 'furnace_hazard':
      return source.castIds.length===0&&new RegExp(`^evt-furnace-safety-[1-9]\\d*-closed-${source.tick}$`).test(source.sourceEventId);
    case 'sect_challenge':
      return source.castIds.length===2&&!!first&&!!second&&first!==second&&
        new RegExp(`^evt-${source.tick}-sect-challenge-(?:inbound|outbound)-[0-9]+-completed$`).test(source.sourceEventId);
    case 'combat':
      return source.castIds.length===2&&!!first&&!!second&&first!==second&&source.sourceEventId===prefix+'duel';
    case 'furnace':
      return source.castIds.length===1&&!!first&&burstPill(source.sourceEventId,prefix)!==undefined;
    case 'tribulation':
      return source.castIds.length===1&&!!first&&source.sourceEventId.startsWith(prefix)&&
        /^tribulation-(?:start|wave-[1-6]|passed|failure)$/.test(source.sourceEventId.slice(prefix.length));
  }
}

function tournamentSource(world:WorldState,event:WorldEvent,site:LocationNode):SectLiveSource|undefined{
  if(event.category!=='heavenly'||!event.id.endsWith('-round')&&!event.id.endsWith('-champion'))return;
  const prefix=`evt-${event.tick}-`;
  if(!event.id.startsWith(prefix))return;
  const terminal=event.id.endsWith('-champion');
  const occasionId=event.id.slice(prefix.length,terminal?-9:-6);
  const occasion=exact(world.occasions,row=>row.id===occasionId);
  if(!occasion||occasion.kind!=='tournament'||occasion.locationId!==site.id||occasion.omenId!==undefined||!occasion.arena)return;
  const round=exact(occasion.arena.rounds,row=>row.eventId===event.id&&row.tick===event.tick);
  if(!round||round.round<1||round.tick<=occasion.arena.openedTick||
    (terminal?(event.title!=='大比魁首揭晓'||occasion.arena.terminal?.eventId!==event.id||occasion.arena.terminal.status!=='completed'||
      event.actorIds.length!==1||occasion.championId!==event.actorIds[0]):
      event.title!==`大比第${round.round}轮`||!sameIds(event.actorIds,occasion.participantIds)))return;
  const original=occasion.bouts.filter(row=>row.round===round.round);
  if(original.length!==round.bouts.length||round.bouts.some((bout,i)=>original[i].firstId!==bout.firstId||
      original[i].secondId!==bout.secondId||original[i].winnerId!==bout.winnerId))return;
  const index=round.bouts.findIndex(bout=>!!bout.secondId&&bout.firstId!==bout.secondId&&
    (bout.winnerId===bout.firstId||bout.winnerId===bout.secondId)&&
    (validAmount(bout.firstDamage)||validAmount(bout.secondDamage)));
  if(index<0)return;
  const {firstId,secondId}=round.bouts[index];
  if(!secondId||!occasion.arena.seededIds.includes(firstId)||!occasion.arena.seededIds.includes(secondId))return;
  return {tick:event.tick,sourceEventId:event.id,siteId:site.id,kind:'tournament',castIds:[firstId,secondId],
    bout:{occasionId,round:round.round,bout:index}};
}

function tribulationSource(world:WorldState,event:WorldEvent,actor:Cultivator,prefix:string):boolean{
  const trial=actor.tribulation;
  if(!trial||trial.id!==`trial-${actor.id}-${trial.startedTick}`||
      !event.id.startsWith(prefix+'tribulation-')||trial.startedTick>event.tick||!onLowerPlane(actor))return false;
  const token=event.id.slice((prefix+'tribulation-').length);
  if(token==='start')return event.category==='heavenly'&&event.title==='天劫降临'&&trial.startedTick===event.tick;
  if(trial.startedTick>=event.tick)return false;
  if(token==='passed'||token==='failure'){
    if(trial.resolvedTick!==event.tick)return false;
    return token==='passed'?trial.stage==='passed'&&event.category==='breakthrough'&&event.title==='天劫圆满':
      trial.stage==='failed'&&(event.category==='death'&&event.title==='渡劫陨落'||
        event.category==='heavenly'&&event.title==='渡劫失败');
  }
  const wave=/^wave-([1-6])$/.exec(token);
  const n=wave&&Number(wave[1]);
  return !!n&&event.category==='heavenly'&&event.title===`第${n}重雷劫`&&
    n<=trial.totalWaves&&trial.nextWave>n&&event.tick>=trial.startedTick+n&&
    (event.tick<world.tick||trial.lastActedTick===event.tick)&&event.damage?.length===1&&
    event.damage[0].cultivatorId===actor.id&&validAmount(event.damage[0].amount);
}

function paidBurst(world:WorldState,event:WorldEvent,site:LocationNode,actor:Cultivator,pill:BurstPill):boolean{
  const recipe=ALCHEMY_RECIPES[pill];
  if(event.category!=='heavenly'||event.title!==`${actor.name}炸炉`||site.type==='abyss'||
    !onLowerPlane(actor)||site.furnaceGrade<recipe.furnaceGrade||
    event.damage?.length!==1||event.damage[0].cultivatorId!==actor.id||
    !validAmount(event.damage[0].amount)||event.damage[0].amount>12||
    event.description!==`炼制【${recipe.name}】时丹炉猛然炸响；${actor.name}损失${event.damage[0].amount}点气血，未成丹。`)return false;
  if(!world.furnaceReservations.uses.some(row=>row.tick===event.tick&&row.kind==='brew'&&
    row.siteId===site.id&&row.actorId===actor.id))return false;
  const month=exact(world.resourceFlow.months,row=>row.tick===event.tick&&row.year===event.year&&row.month===event.month);
  if(!month)return false;
  const own=month.entries.filter(row=>row.mechanism==='alchemy'&&row.refId===site.id&&row.tick===event.tick&&
    row.visibility.kind==='participants'&&sameIds(row.visibility.actorIds,[actor.id]));
  const paid=own.filter(row=>row.kind==='consumption'&&row.from.kind==='actor'&&row.from.id===actor.id);
  const charge=exact(paid,row=>row.reason==='brew_fee'&&row.good==='stone');
  const cost=Math.ceil(recipe.spiritStones*(1-Math.max(0,site.furnaceGrade-recipe.furnaceGrade)*.15));
  return charge?.amount===cost&&!own.some(row=>row.kind==='production'&&row.reason==='brew_output')&&
    Object.entries(recipe.herbs).every(([herb,amount])=>
      exact(paid,row=>row.reason==='brew_material'&&row.good===herb)?.amount===amount);
}

function hazardSource(world:WorldState,event:WorldEvent,site:LocationNode):boolean{
  if(event.actorIds.length||event.category!=='heavenly'||event.title!=='兽潮实损，炉事暂止')return false;
  const damaged=exact(world.furnaceSafety.cases,row=>row.siteId===site.id&&row.damagedTick===event.tick&&
    event.id===`evt-${row.id}-closed-${event.tick}`);
  if(!damaged||damaged.hazardCreatedTick>=event.tick||damaged.integrityBefore<=0)return false;
  const beforeRepair=damaged.receipts.length===0;
  return !beforeRepair||damaged.integrity===Math.max(0,damaged.integrityBefore-furnaceSafetyDamage(damaged.severity));
}

function nativeSource(world:WorldState,event:WorldEvent,site:LocationNode,
  actors:ReadonlyMap<string,Cultivator|undefined>):SectLiveSource|undefined {
  if(event.witnessScope!==undefined||event.locationId!==site.id||!dated(world,event)||!isChronicleStoryFact(event,world.tick))return;
  const base={tick:event.tick,sourceEventId:event.id,siteId:site.id} as const;
  const challenge=event.title===SECT_CHALLENGE_PUBLIC_TITLE&&matchSectChallengeResult(world,event);
  if(challenge&&event.actorIds.every(id=>!!actors.get(id)))
    return {...base,kind:'sect_challenge',castIds:[challenge.challengerId,challenge.defenderId]};
  const contest=tournamentSource(world,event,site);
  if(contest&&contest.castIds.every(id=>!!actors.get(id)))return contest;
  if(hazardSource(world,event,site))return {...base,kind:'furnace_hazard',castIds:[]};
  const [first,second]=event.actorIds,actor=actors.get(first);
  if(!actor)return;
  const prefix=`evt-${event.tick}-${first}-`;
  if(event.actorIds.length===1){
    if(tribulationSource(world,event,actor,prefix))return {...base,kind:'tribulation',castIds:[first]};
    const pill=burstPill(event.id,prefix);
    if(pill&&paidBurst(world,event,site,actor,pill))return {...base,kind:'furnace',castIds:[first]};
  }
  if(event.actorIds.length===2&&first!==second&&actors.has(second)&&actors.get(second)&&event.id===prefix+'duel'&&
    event.category==='combat'&&event.title.startsWith('惊天斗法：')&&
    (event.duelWinnerId===first||event.duelWinnerId===second)&&!!event.damage?.length&&
    new Set(event.damage.map(hit=>hit.cultivatorId)).size===event.damage.length&&
    event.damage.every(hit=>(hit.cultivatorId===first||hit.cultivatorId===second)&&validAmount(hit.amount)))
    return {...base,kind:'combat',castIds:[first,second]};
}

export function matchesSectLiveEvent(world:WorldState,source:SectLiveSource,event:WorldEvent):boolean{
  if(event.id!==source.sourceEventId||event.tick!==source.tick||event.locationId!==source.siteId||!isSectLiveSourceId(source))return false;
  const site=exact(world.locations,row=>row.id===source.siteId);
  if(!publicSite(site))return false;
  const admitted=nativeSource(world,event,site,uniqueIndex(world.cultivators));
  return !!admitted&&admitted.kind===source.kind&&sameIds(admitted.castIds,source.castIds)&&sameBout(admitted.bout,source.bout);
}

export function resolveSectLiveSource(world:WorldState,source:SectLiveSource):WorldEvent|undefined{
  const event=exact(world.events,row=>row.id===source.sourceEventId);
  return event&&matchesSectLiveEvent(world,source,event)?event:undefined;
}

const subjectPriority:Readonly<Record<SourceKind,number>>={sect_challenge:0,tournament:1,tribulation:2,furnace:3,furnace_hazard:4,combat:5};
const sameEvent=(a:WorldEvent,b:WorldEvent)=>a.tick===b.tick&&a.year===b.year&&a.month===b.month&&a.title===b.title&&
  a.description===b.description&&a.category===b.category&&a.locationId===b.locationId&&a.witnessScope===b.witnessScope&&
  a.duelWinnerId===b.duelWinnerId&&sameIds(a.actorIds,b.actorIds)&&
  (a.damage?.length??0)===(b.damage?.length??0)&&(a.damage??[]).every((row,i)=>
    row.cultivatorId===b.damage?.[i]?.cultivatorId&&row.amount===b.damage[i].amount);

/** Only the sealed completed monthly batch may open a room. Use bounded native proofs, never prose alone. */
export function collectSectLiveSources(world:WorldState,previous:WorldState,completedEvents:readonly WorldEvent[]):readonly SectLiveSource[]{
  const managed=world.sectManagement;
  if(!managed||!sameGeneratedWorld(world,previous)||
    world.tick!==previous.tick+1||world.tick<=managed.foundedTick)return [];
  const sites=uniqueIndex(world.locations),retained=uniqueIndex(world.events),actors=uniqueIndex(world.cultivators);
  const sources:SectLiveSource[]=[];
  for(const [id,event] of uniqueIndex(completedEvents)){
    if(!event||event.tick!==world.tick||!event.locationId)continue;
    const stored=retained.get(id),site=sites.get(event.locationId);
    if(!stored||!sameEvent(stored,event)||!publicSite(site))continue;
    const source=nativeSource(world,event,site,actors);
    if(source)sources.push(source);
  }
  return sources.sort((a,b)=>subjectPriority[a.kind]-subjectPriority[b.kind]||cmp(a.sourceEventId,b.sourceEventId));
}

/** A dated native witness may speak; current proximity alone is never historical knowledge. */
export function knowsSectLiveSource(actor:Cultivator,source:SectLiveSource,event:WorldEvent):boolean{
  if(event.witnessScope!==undefined||event.id!==source.sourceEventId||event.tick!==source.tick||event.locationId!==source.siteId)
    return false;
  if(source.castIds.includes(actor.id))return true;
  // The general bracket event names the registration roster, including names that
  // did not fight. That list cannot prove a remote registrant watched this bout.
  if(event.actorIds.includes(actor.id))return source.kind!=='tournament';
  return actor.rumors.some(rumor=>rumor.id===`rumor-${event.id}`&&rumor.provenance==='witness'&&rumor.hops===0&&
    rumor.originEventId===event.id&&rumor.originTick===event.tick&&rumor.learnedTick===event.tick&&
    rumor.subject===event.title&&rumor.locationId===source.siteId&&rumor.originSourceCultivatorId===actor.id&&
    rumor.sourceCultivatorId===undefined&&rumor.witnessScope===undefined&&rumor.confidence>=25&&rumor.confidence<=100);
}
