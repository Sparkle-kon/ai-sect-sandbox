import type {TianjiGazetteEntry,TianjiGazetteIssue,TianjiGazetteSource,TianjiGazetteTrigger} from '../types/tianjiGazette';
import type {DramaticBondFact} from '../types/dramaticBond';
import type {ChronicleAnchor,Cultivator,LocationNode,WorldEvent,WorldState} from '../types/world';
import {isChronicleStoryFact} from './chronicleLead';
import {dramaticBondReadVenue,matchesDramaticBondFact} from './dramaticBondTerms';
import {TIANJI_GAZETTE_HISTORY,TIANJI_GAZETTE_WINDOW,tianjiGazetteBattleVenue,tianjiGazetteIssueId,tianjiGazetteMatchesSource,tianjiGazetteVenue} from './tianjiGazetteTerms';
export {TIANJI_GAZETTE_HISTORY,TIANJI_GAZETTE_WINDOW,tianjiGazetteIssueId,tianjiGazetteMatchesSource} from './tianjiGazetteTerms';

type Fact=WorldEvent|ChronicleAnchor;
type Headline=Extract<TianjiGazetteEntry,{kind:'headline'}>;
type Feature=Extract<TianjiGazetteEntry,{kind:'dark_horse'}>;
type Pair=Extract<TianjiGazetteEntry,{kind:'rivalry'}>;
type Notice=Extract<TianjiGazetteEntry,{kind:'bounty'}>;
const byId=(a:string,b:string)=>a<b?-1:a>b?1:0;
const uniqueIndex=<T extends {id:string}>(rows:readonly T[])=>{
  const map=new Map<string,T|undefined>();
  for(const row of rows)map.set(row.id,map.has(row.id)?undefined:row);
  return map;
};
const sourceOf=(event:Fact&{locationId:string}):TianjiGazetteSource=>({
  sourceEventId:event.id,tick:event.tick,year:event.year,month:event.month,siteId:event.locationId,
});
const stamp=(row:DramaticBondFact):TianjiGazetteSource=>({sourceEventId:row.sourceEventId,tick:row.tick,year:row.year,month:row.month,siteId:row.siteId});
const foundSite=(sites:ReadonlyMap<string,LocationNode|undefined>,id:string|undefined):id is string=>
  Boolean(id&&tianjiGazetteVenue(sites.get(id)));
const publicEvent=(event:Fact,through:number)=>isChronicleStoryFact(event,through)&&
  (!('witnessScope' in event)||event.witnessScope===undefined);
const sameContext=(a:Fact,b:Fact)=>a.id===b.id&&a.tick===b.tick&&a.year===b.year&&a.month===b.month&&
  a.category===b.category&&a.locationId===b.locationId;
const exactIds=(a:readonly string[],b:readonly string[])=>a.length===b.length&&a.every((id,i)=>id===b[i]);
function sourceIndex(world:WorldState,completed:readonly WorldEvent[]=[]){
  const hot=uniqueIndex(world.events),current=uniqueIndex(completed),archive=new Map<string,ChronicleAnchor|undefined>();
  for(const [id,event] of current){
    if(!hot.has(id))hot.set(id,event);
    else{
      const other=hot.get(id);
      if(!event||!other||!sameContext(event,other)||!exactIds(event.actorIds,other.actorIds)||
        event.witnessScope!==other.witnessScope||event.duelWinnerId!==other.duelWinnerId)hot.set(id,undefined);
    }
  }
  const add=(row:ChronicleAnchor)=>{
    if(!archive.has(row.id)){archive.set(row.id,row);return;}
    const prior=archive.get(row.id);
    if(!prior||!sameContext(prior,row)||!exactIds(prior.actorIds,row.actorIds))archive.set(row.id,undefined);
  };
  world.chronicleArchive.anchors.forEach(add);
  for(const chapter of [...world.chronicleArchive.chapters,...world.coldHistory.chapters]){
    if(chapter.startTick>chapter.endTick||chapter.endTick>world.tick)continue;
    for(const row of chapter.anchors)if(row.tick>=chapter.startTick&&row.tick<=chapter.endTick)add(row);
  }
  const trusted=(id:string)=>{
    const live=hot.get(id),old=archive.get(id);
    return (!hot.has(id)||!!live&&publicEvent(live,world.tick))&&(!archive.has(id)||!!old&&publicEvent(old,world.tick))&&
      (!live||!old||sameContext(live,old)&&exactIds(live.actorIds.slice(0,12),old.actorIds));
  };
  return {hot,archive,trusted,event:(id:string)=>trusted(id)?hot.get(id)??archive.get(id):undefined};
}
type Sources=ReturnType<typeof sourceIndex>;
type Sites=ReadonlyMap<string,LocationNode|undefined>;
const newest=<T extends TianjiGazetteSource>(rows:T[]):T|undefined=>
  rows.sort((a,b)=>b.tick-a.tick||byId(a.sourceEventId,b.sourceEventId))[0];

function siegeHeadlines(world:WorldState,sources:Sources,sites:Sites,from:number):Headline[]{
  return world.sieges.flatMap(siege=>{
    const terminal=siege.theatre?.terminal;
    if(!terminal?.battlefield||terminal.tick<from||!siege.theatre?.rounds.length||
      terminal.status==='withdrawn'||siege.status!==terminal.status||siege.rounds<1||
      !tianjiGazetteBattleVenue(sites.get(siege.destinationId))||terminal.sourceEventId!==`evt-${terminal.tick}-dip-${siege.id}`)return [];
    const source=sources.event(terminal.sourceEventId);
    if(!source||source.category!=='diplomacy'||source.tick!==terminal.tick||source.locationId!==siege.destinationId)return [];
    return [{...sourceOf({...source,locationId:siege.destinationId}),kind:'headline',story:'siege',siegeId:siege.id,
      attackerSectId:siege.attackerSectId,defenderSectId:siege.defenderSectId,outcome:terminal.status}];
  });
}
function arenaStories(world:WorldState,sources:Sources,sites:Sites,from:number){
  const headlines:Headline[]=[],upsets:Feature[]=[];
  for(const occasion of world.occasions){
    const arena=occasion.arena,terminal=arena?.terminal;
    if(!arena||occasion.kind!=='tournament'||occasion.status!=='completed'||terminal?.status!=='completed'||terminal.tick<from||
      !arena.prize||arena.prize.tick!==terminal.tick||arena.prize.actorId!==occasion.championId||!foundSite(sites,occasion.locationId))continue;
    const final=arena.rounds.at(-1);
    const win=sources.event(terminal.eventId),winner=occasion.championId;
    if(!winner||terminal.eventId!==`evt-${terminal.tick}-${occasion.id}-champion`||!win||win.tick!==terminal.tick||
      win.category!=='heavenly'||win.locationId!==occasion.locationId||!exactIds(win.actorIds,[winner])||
      final?.eventId!==win.id||final.bouts.length!==1||!final.bouts[0].secondId||final.bouts[0].winnerId!==winner)continue;
    headlines.push({...sourceOf({...win,locationId:occasion.locationId}),kind:'headline',story:'tournament',occasionId:occasion.id,winnerId:winner});
    const ranks=new Map(arena.seededIds.map((id,index)=>[id,index+1]));
    for(const round of arena.rounds){
      const ev=sources.event(round.eventId);
      if(!ev||round.tick<from||ev.tick!==round.tick||ev.category!=='heavenly'||ev.locationId!==occasion.locationId)continue;
      for(const bout of round.bouts){
        if(!bout.secondId||bout.winnerId!==bout.firstId&&bout.winnerId!==bout.secondId)continue;
        const opponentId=bout.winnerId===bout.firstId?bout.secondId:bout.firstId;
        const winnerSeed=ranks.get(bout.winnerId),opponentSeed=ranks.get(opponentId);
        if(!winnerSeed||!opponentSeed||winnerSeed<=opponentSeed)continue;
        upsets.push({...sourceOf({...ev,locationId:occasion.locationId}),kind:'dark_horse',occasionId:occasion.id,
          winnerId:bout.winnerId,opponentId,winnerSeed,opponentSeed,round:round.round});
      }
    }
  }
  const upset=upsets.sort((a,b)=>(b.winnerSeed-b.opponentSeed)-(a.winnerSeed-a.opponentSeed)||b.tick-a.tick||
    byId(a.sourceEventId,b.sourceEventId)||byId(a.winnerId,b.winnerId))[0];
  return {headlines,upset};
}
function pairStory(world:WorldState,sources:Sources,from:number):Pair|undefined{
  const facts=world.dramaticBonds?.facts??[],counts=new Map<string,number>();
  for(const row of facts)counts.set(row.sourceEventId,(counts.get(row.sourceEventId)??0)+1);
  const groups=new Map<string,DramaticBondFact[]>();
  for(const row of facts){
    if(row.tick<from||row.tick>world.tick||counts.get(row.sourceEventId)!==1||
      (row.kind!=='duel'&&row.kind!=='lethal_duel')||!dramaticBondReadVenue(world,row)||!sources.trusted(row.sourceEventId))continue;
    const hot=sources.hot.get(row.sourceEventId),old=sources.archive.get(row.sourceEventId);
    if(hot&&!matchesDramaticBondFact(row,hot)||old&&(!tianjiGazetteMatchesSource(stamp(row),old)||!exactIds(row.actorIds,old.actorIds)))continue;
    const key=JSON.stringify([...row.actorIds].sort(byId));
    const prior=groups.get(key);
    if(prior)prior.push(row);else groups.set(key,[row]);
  }
  const candidates:Pair[]=[];
  for(const group of groups.values()){
    group.sort((a,b)=>b.tick-a.tick||byId(a.sourceEventId,b.sourceEventId));
    const [later]=group,earlier=group.find(row=>row.tick<later.tick);
    if(earlier)candidates.push({...stamp(later),kind:'rivalry',actorIds:[...later.actorIds],earlier:stamp(earlier)});
  }
  return newest(candidates);
}
function bountyStory(world:WorldState,sources:Sources,sites:Sites,from:number):Notice|undefined{
  const candidates:Notice[]=[];
  for(const bounty of world.bounties){
    const first=bounty.sponsorSectIds[0],sourceId=`evt-${bounty.issuedTick}-bounty-${bounty.id}`;
    if(bounty.status!=='open'||!first||bounty.issuedTick<from||bounty.id!==`bounty-${bounty.issuedTick}-${bounty.targetCultivatorId}`||
      bounty.reward<=0||bounty.escrow.reduce((n,row)=>n+row.amount,0)!==bounty.reward)continue;
    const source=sources.event(sourceId);
    if(!source||source.category!=='diplomacy'||source.tick!==bounty.issuedTick||source.actorIds.length!==0||!foundSite(sites,source.locationId))continue;
    candidates.push({...sourceOf({...source,locationId:source.locationId}),kind:'bounty',bountyId:bounty.id,
      targetActorId:bounty.targetCultivatorId,sponsorSectId:first,reward:bounty.reward});
  }
  return newest(candidates);
}

/** Native completed turns only: no publication from a prediction, manual poke, or language enrichment. */
export function publishTianjiGazette(before:WorldState,world:WorldState,completedEvents:readonly WorldEvent[]):void{
  if(world.tick!==before.tick+1||world.month!==before.month%12+1||world.year!==before.year+(before.month===12?1:0)||
    world.tianjiGazette?.issues.some(row=>row.tick===world.tick))return;
  const annual=world.month===1&&world.year===before.year+1;
  if(!annual&&!completedEvents.some(event=>event.tick===world.tick&&(event.id.endsWith('-champion')||event.id.includes('-dip-siege-'))))return;
  const sites=uniqueIndex(world.locations),sources=sourceIndex(world,completedEvents),from=Math.max(1,world.tick-TIANJI_GAZETTE_WINDOW);
  const fought=siegeHeadlines(world,sources,sites,from),arenas=arenaStories(world,sources,sites,from);
  const battle=newest(fought.filter(row=>row.tick===world.tick&&completedEvents.some(event=>event.id===row.sourceEventId)));
  const finale=newest(arenas.headlines.filter(row=>row.tick===world.tick&&completedEvents.some(event=>event.id===row.sourceEventId)));
  const trigger:TianjiGazetteTrigger|undefined=battle?'battle':finale?'finale':annual?'year_turn':undefined;
  if(!trigger)return;
  const entries=[battle??finale??newest([...fought,...arenas.headlines]),arenas.upset,pairStory(world,sources,from),bountyStory(world,sources,sites,from)]
    .filter((row):row is TianjiGazetteEntry=>row!==undefined);
  if(!entries.length)return;
  const page:TianjiGazetteIssue={id:tianjiGazetteIssueId(world.tick),tick:world.tick,year:world.year,month:world.month,trigger,entries};
  const newspaper=world.tianjiGazette??(world.tianjiGazette={issues:[]});
  newspaper.issues.push(page);
  if(newspaper.issues.length>TIANJI_GAZETTE_HISTORY)newspaper.issues.splice(0,newspaper.issues.length-TIANJI_GAZETTE_HISTORY);
}
/** Quarterly editors reuse the existing bracket, siege and independently dated rivalry receipts. */
export function collectTabloidLegacyEntries(world:WorldState,from:number,completed:readonly WorldEvent[]):TianjiGazetteEntry[]{
  const sites=uniqueIndex(world.locations),sources=sourceIndex(world,completed);
  const arena=arenaStories(world,sources,sites,from);
  const headline=newest([...siegeHeadlines(world,sources,sites,from),...arena.headlines]);
  const rivalry=pairStory(world,sources,Math.max(1,world.tick-TIANJI_GAZETTE_WINDOW));
  return [headline,arena.upset,rivalry&&rivalry.tick>=from?rivalry:undefined]
    .filter((row):row is Headline|Feature|Pair=>row!==undefined);
}
export interface TianjiGazetteReadScope{currentVisibleSiteIds:ReadonlySet<string>;viewerId?:string|null;throughTick?:number}
export interface TianjiGazetteIssueView {
  id:string;tick:number;year:number;month:number;trigger:TianjiGazetteTrigger;
  entries:{kind:TianjiGazetteEntry['kind'];title:string;text:string;tick:number;year:number;month:number;siteName:string}[];
}
const name=(value:string)=>Array.from(value.replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029<>]/gu,' ').replace(/\s+/gu,' ').trim()).slice(0,64).join('');
const liveLower=(actor:Cultivator|undefined)=>actor?.alive&&actor.hp>0&&actor.positionPlane===undefined;

/** Exact known public venue filtering happens before a view or issue can disclose an entry. */
export function projectTianjiGazette(world:WorldState,scope:TianjiGazetteReadScope,
  journal:readonly TianjiGazetteIssue[]|undefined=world.tianjiGazette?.issues):TianjiGazetteIssueView[]{
  const through=scope.throughTick??world.tick;
  if(!journal?.length||!scope.currentVisibleSiteIds.size||!Number.isSafeInteger(through)||through<1||through>world.tick)return [];
  const actors=uniqueIndex(world.cultivators),sects=uniqueIndex(world.sects),sites=uniqueIndex(world.locations);
  if(scope.viewerId&&!liveLower(actors.get(scope.viewerId)))return [];
  const sources=sourceIndex(world);
  const safe=(proof:TianjiGazetteSource,ceiling:number,battle=false)=>{
    const origin=sources.event(proof.sourceEventId);
    return proof.tick<=ceiling&&scope.currentVisibleSiteIds.has(proof.siteId)&&(battle?tianjiGazetteBattleVenue(sites.get(proof.siteId)):foundSite(sites,proof.siteId))&&
      sources.trusted(proof.sourceEventId)&&(!origin||tianjiGazetteMatchesSource(proof,origin));
  };
  const sieges=uniqueIndex(world.sieges),arenas=uniqueIndex(world.occasions),bounties=uniqueIndex(world.bounties);
  const dramatic=new Map<string,DramaticBondFact|undefined>();
  for(const row of world.dramaticBonds?.facts??[])dramatic.set(row.sourceEventId,dramatic.has(row.sourceEventId)?undefined:row);
  const pairSource=(proof:TianjiGazetteSource,actorIds:readonly string[])=>{
    const samePair=(ids:readonly string[])=>ids.length===2&&ids[0]!==ids[1]&&ids.every(id=>actorIds.includes(id));
    const retained=dramatic.get(proof.sourceEventId);
    if(dramatic.has(proof.sourceEventId)&&(!retained||retained.kind!=='duel'&&retained.kind!=='lethal_duel'||
      !samePair(retained.actorIds)||retained.tick!==proof.tick||retained.siteId!==proof.siteId))return false;
    const raw=sources.hot.get(proof.sourceEventId),archive=sources.archive.get(proof.sourceEventId);
    return (!raw||samePair(raw.actorIds)&&(raw.category==='combat'||raw.category==='death')&&
        raw.duelWinnerId!==undefined&&samePair([raw.duelWinnerId,...raw.actorIds.filter(id=>id!==raw.duelWinnerId)]))&&
      (!archive||samePair(archive.actorIds)&&(archive.category==='combat'||archive.category==='death'));
  };
  const recheck=(entry:TianjiGazetteEntry)=>{
    if(entry.kind==='rivalry')return entry.actorIds[0]!==entry.actorIds[1]&&entry.earlier.tick<entry.tick&&
      pairSource(entry,entry.actorIds)&&pairSource(entry.earlier,entry.actorIds);
    if(entry.kind==='bounty'){
      const row=bounties.get(entry.bountyId),actual=sources.event(entry.sourceEventId);
      return !!row&&row.issuedTick===entry.tick&&row.targetCultivatorId===entry.targetActorId&&row.reward===entry.reward&&
        row.sponsorSectIds[0]===entry.sponsorSectId&&(!actual||actual.category==='diplomacy'&&actual.actorIds.length===0);
    }
    if(entry.kind==='headline'&&entry.story==='siege'){
      const actual=sources.event(entry.sourceEventId);
      const row=sieges.get(entry.siegeId),end=row?.theatre?.terminal;
      return !!row&&row.attackerSectId===entry.attackerSectId&&row.defenderSectId===entry.defenderSectId&&row.destinationId===entry.siteId&&
        !!end?.battlefield&&end.tick===entry.tick&&end.status===entry.outcome&&end.sourceEventId===entry.sourceEventId&&
        (!actual||actual.category==='diplomacy'&&actual.title===(entry.outcome==='victory'?'攻山告捷':'攻山退兵'));
    }
    const occasion=arenas.get(entry.occasionId),arena=occasion?.arena;
    if(!occasion||!arena||occasion.locationId!==entry.siteId)return false;
    if(entry.kind==='headline'){
      const actual=sources.event(entry.sourceEventId);
      return arena.terminal?.eventId===entry.sourceEventId&&arena.terminal.tick===entry.tick&&
        arena.terminal.status==='completed'&&arena.prize?.actorId===entry.winnerId&&occasion.championId===entry.winnerId&&
        (!actual||actual.category==='heavenly'&&exactIds(actual.actorIds,[entry.winnerId]));
    }
    const round=arena.rounds.find(row=>row.round===entry.round);
    return !!round&&round.eventId===entry.sourceEventId&&round.tick===entry.tick&&
      arena.seededIds[entry.winnerSeed-1]===entry.winnerId&&arena.seededIds[entry.opponentSeed-1]===entry.opponentId&&
      entry.winnerSeed>entry.opponentSeed&&round.bouts.some(row=>row.winnerId===entry.winnerId&&
        (row.firstId===entry.winnerId&&row.secondId===entry.opponentId||row.secondId===entry.winnerId&&row.firstId===entry.opponentId));
  };
  const display=(entry:TianjiGazetteEntry):{title:string;text:string}|undefined=>{
    const actor=(id:string)=>name(actors.get(id)?.name??''),sect=(id:string)=>name(sects.get(id)?.name??'');
    switch(entry.kind){
      case 'headline':{
        if(entry.story==='siege'){
          const a=sect(entry.attackerSectId),b=sect(entry.defenderSectId);
          return a&&b?{title:'山门战鼓已歇',text:entry.outcome==='victory'?`${a}终攻破${b}山门防线，战事至此收束。`:
            `${b}守过这一战，${a}的联军未能攻破山门，遂收兵而去。`}:undefined;
        }
        const winner=actor(entry.winnerId);
        return winner?{title:'万众静待，魁首落定',text:`擂台最后一场已有胜负，${winner}凭实战夺得大会魁首。`}:undefined;
      }
      case 'dark_horse':{
        const a=actor(entry.winnerId),b=actor(entry.opponentId);
        return a&&b?{title:'下位签里杀出一匹黑马',text:`原列第${entry.winnerSeed}种子的${a}把第${entry.opponentSeed}种子${b}挑下擂台，签册上那行小字，今夜少不得重抄。`}:undefined;
      }
      case 'rivalry':{
        const [a,b]=entry.actorIds.map(actor);
        return a&&b?{title:'旧剑又遇故人',text:`${a}与${b}曾在两个确有记载的时日交手。剑下胜负有据，个中缘由不作揣测。`}:undefined;
      }
      case 'bounty':{
        const issuer=sect(entry.sponsorSectId),target=actor(entry.targetActorId);
        return issuer&&target?{title:'天机悬榜',text:`${issuer}等已出资悬赏${target}，实载${entry.reward}灵石；此处只记曾经发榜，不据此裁断罪责。`}:undefined;
      }
    }
  };
  const results:TianjiGazetteIssueView[]=[];
  for(let i=journal.length-1;i>=0;i--){
    const issue=journal[i];
    if(issue.tick>through)continue;
    const entries=issue.entries.flatMap(entry=>{
      if(!safe(entry,issue.tick,entry.kind==='headline'&&entry.story==='siege')||!recheck(entry)||
        entry.kind==='rivalry'&&!safe(entry.earlier,issue.tick))return [];
      const copy=display(entry),site=sites.get(entry.siteId);
      return copy&&site?[{...copy,kind:entry.kind,tick:entry.tick,year:entry.year,month:entry.month,siteName:name(site.name)}]:[];
    });
    if(!entries.length||issue.trigger!=='year_turn'&&!entries.some(entry=>entry.kind==='headline'))continue;
    results.push({id:issue.id,tick:issue.tick,year:issue.year,month:issue.month,trigger:issue.trigger,entries});
  }
  return results;
}
