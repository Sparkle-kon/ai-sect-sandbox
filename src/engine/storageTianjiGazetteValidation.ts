import {TIANJI_TABLOID_SPEAKERS,tianjiTabloidIssueId,type TianjiGazetteSource} from '../types/tianjiGazette';
import {SECT_PLAYER_CHAT_POST_LIMIT,sectPlayerChatPostId} from '../types/sectPlayerChat';
import type { ChronicleAnchor, WorldEvent, WorldState } from '../types/world';
import {isChronicleStoryFact} from './chronicleLead';
import {SECT_CHALLENGE_PUBLIC_TITLE} from './sectChallengeProof';
import {isSectLiveSourceId} from './sectLiveSources';
import {resolveTabloidChallenge,resolveTabloidEmbarrassment} from './tianjiTabloidProof';
import {isTabloidAdvertisementProven,isTabloidHotspotProven} from './tianjiTabloidSocial';
import { DRAMATIC_BOND_FACTS_MAX } from './dramaticBondTerms';
import { TIANJI_GAZETTE_WINDOW,tianjiGazetteBattleVenue,tianjiGazetteIssueId,tianjiGazetteMatchesSource,tianjiGazetteVenue } from './tianjiGazetteTerms';

type Fail=(path:string)=>never;
const path='tianjiGazette';
const calendar=(row:{year:number;month:number})=>12*row.year+row.month;
const order={headline:0,dark_horse:1,rivalry:2,bounty:3} as const;
const publicBondEvent=/^evt-([1-9]\d*)-(.+)-(duel|kill)$/u;
const samePair=(a:readonly string[],b:readonly string[])=>a.length===2&&a[0]!==a[1]&&b.length===2&&
  a.every(actor=>b.includes(actor));
const dateMatches=(a:TianjiGazetteSource,b:{tick:number;year:number;month:number})=>
  a.tick===b.tick&&a.year===b.year&&a.month===b.month;

export function validateTianjiGazetteHistory(world:WorldState,fail:Fail):void{
  const state=world.tianjiGazette;
  if(!state)return;
  if(!state.issues.length&&!state.quarterlies?.length)return fail(path+'.issues');
  const issues=[...state.issues.map(issue=>({...issue,quarterly:false as const})),
    ...(state.quarterlies??[]).map(issue=>({...issue,entries:issue.legacyEntries,trigger:undefined,quarterly:true as const}))];
  const ids=new Set(issues.flatMap(issue=>issue.entries.flatMap(entry=>entry.kind==='rivalry'?
    [entry.sourceEventId,entry.earlier.sourceEventId]:[entry.sourceEventId])));
  for(const issue of state.quarterlies??[])
    for(const row of [issue.challenge,issue.embarrassment,issue.hotTopic])if(row)ids.add(row.sourceEventId);
  const hot=new Map<string,WorldEvent[]>(),cold=new Map<string,ChronicleAnchor[]>();
  const append=<T extends {id:string}>(table:Map<string,T[]>,value:T)=>{
    if(!ids.has(value.id))return;
    const matches=table.get(value.id);
    if(matches)matches.push(value);else table.set(value.id,[value]);
  };
  world.events.forEach(row=>append(hot,row));
  world.chronicleArchive.anchors.forEach(row=>append(cold,row));
  for(const branch of [world.chronicleArchive,world.coldHistory])for(const chapter of branch.chapters)
    chapter.anchors.forEach(row=>append(cold,row));
  const oldestHot=world.events.reduce((first,row)=>Math.min(first,row.tick),Infinity);
  const people=new Set(world.cultivators.map(actor=>actor.id)),sects=new Set(world.sects.map(sect=>sect.id));
  const venues=new Map(world.locations.map(row=>[row.id,row]));
  const sieges=new Map(world.sieges.map(row=>[row.id,row]));
  const arenas=new Map(world.occasions.map(row=>[row.id,row]));
  const bounties=new Map(world.bounties.map(row=>[row.id,row]));
  const bonds=world.dramaticBonds?.facts??[];
  const bondBySource=new Map(bonds.map(row=>[row.sourceEventId,row]));

  const proof=(source:TianjiGazetteSource,category:WorldEvent['category'],check:(event:WorldEvent|ChronicleAnchor)=>boolean,battle=false)=>{
    const here=venues.get(source.siteId);
    const original=hot.get(source.sourceEventId),archived=cold.get(source.sourceEventId);
    const exact=(raw:WorldEvent|ChronicleAnchor)=>tianjiGazetteMatchesSource(source,raw)&&raw.category===category&&check(raw);
    if(!(battle?tianjiGazetteBattleVenue(here):tianjiGazetteVenue(here))||source.tick<1||
      source.tick>world.tick||calendar(source)>calendar(world)||source.tick===world.tick&&calendar(source)!==calendar(world)||
      original&&(original.length!==1||!exact(original[0]))||
      archived?.some(row=>!exact(row))||(!original&&(source.tick>oldestHot||source.tick===world.tick&&world.events.length<120)))
      return fail(path+'.source');
  };
  const earlierBonds=(source:TianjiGazetteSource,actorIds:readonly string[])=>{
    const token=publicBondEvent.exec(source.sourceEventId),actual=bondBySource.get(source.sourceEventId);
    if(!token||Number(token[1])!==source.tick||!actorIds.includes(token[2])||
      actual&&((actual.kind!==(token[3]==='kill'?'lethal_duel':'duel'))||
        !dateMatches(source,actual)||actual.siteId!==source.siteId||!samePair(actorIds,actual.actorIds))||
      !actual&&(bonds.length!==DRAMATIC_BOND_FACTS_MAX||source.tick>bonds[0].tick))
      return fail(path+'.rivalry');
    proof(source,token[3]==='kill'?'death':'combat',raw=>raw.actorIds[0]===token[2]&&samePair(raw.actorIds,actorIds));
  };
  let lastTick=0,lastDate=0;
  for(const issue of issues){
    const date=calendar(issue);
    if(!issue.quarterly){
      if(!issue.entries.length||issue.id!==tianjiGazetteIssueId(issue.tick)||issue.tick<=lastTick||issue.tick>world.tick||date<=lastDate||
        date>calendar(world)||issue.tick===world.tick&&date!==calendar(world)||
        issue.trigger==='year_turn'&&issue.month!==1)return fail(path+'.issue');
      lastTick=issue.tick;lastDate=date;
    }
    let lastEntry=-1,triggerProof=false;
    for(const row of issue.entries){
      const position=order[row.kind];
      if(position<=lastEntry||issue.quarterly&&(row.kind==='bounty'||row.tick<issue.tick-2||date-calendar(row)!==issue.tick-row.tick)||row.tick>issue.tick||row.tick<issue.tick-TIANJI_GAZETTE_WINDOW||calendar(row)>date||
        row.tick===issue.tick&&calendar(row)!==date)return fail(path+'.entries');
      lastEntry=position;
      if(row.kind==='headline'&&row.story==='siege'){
        const native=sieges.get(row.siegeId),actual=native?.theatre?.terminal;
        if(!native||native.status!==row.outcome||native.destinationId!==row.siteId||native.attackerSectId!==row.attackerSectId||
          native.defenderSectId!==row.defenderSectId||row.attackerSectId===row.defenderSectId||
          !sects.has(row.attackerSectId)||!sects.has(row.defenderSectId)||!actual?.battlefield||
          !native.theatre?.rounds.length||actual.status!==row.outcome||actual.tick!==row.tick||
          actual.sourceEventId!==row.sourceEventId)return fail(path+'.siege');
        proof(row,'diplomacy',raw=>raw.title===(row.outcome==='victory'?'攻山告捷':'攻山退兵'),true);
        if(issue.trigger==='battle'&&issue.tick===row.tick)triggerProof=true;
      }else if(row.kind==='headline'){
        const native=arenas.get(row.occasionId),arena=native?.arena;
        if(native?.kind!=='tournament'||native.status!=='completed'||native.championId!==row.winnerId||
          native.locationId!==row.siteId||!people.has(row.winnerId)||
          arena?.prize?.actorId!==row.winnerId||arena.prize.tick!==row.tick||arena.terminal?.status!=='completed'||
          arena.terminal.tick!==row.tick||arena.terminal.eventId!==row.sourceEventId)return fail(path+'.finale');
        proof(row,'heavenly',raw=>raw.actorIds.length===1&&raw.actorIds[0]===row.winnerId);
        if(issue.trigger==='finale'&&issue.tick===row.tick)triggerProof=true;
      }else if(row.kind==='dark_horse'){
        const native=arenas.get(row.occasionId),arena=native?.arena;
        const original=arena?.rounds.find(round=>round.round===row.round);
        if(native?.kind!=='tournament'||native.status!=='completed'||native.locationId!==row.siteId||!arena?.prize||
          arena.terminal?.status!=='completed'||arena.terminal.tick>issue.tick||!original||
          original.tick!==row.tick||original.eventId!==row.sourceEventId||
          !people.has(row.winnerId)||!people.has(row.opponentId)||row.winnerId===row.opponentId||
          row.winnerSeed<=row.opponentSeed||arena.seededIds[row.winnerSeed-1]!==row.winnerId||
          arena.seededIds[row.opponentSeed-1]!==row.opponentId||
          !original.bouts.some(bout=>!!bout.secondId&&bout.winnerId===row.winnerId&&
            samePair([bout.firstId,bout.secondId],[row.winnerId,row.opponentId])))return fail(path+'.darkHorse');
        proof(row,'heavenly',()=>true);
      }else if(row.kind==='rivalry'){
        if(row.actorIds.length!==2||row.actorIds[0]===row.actorIds[1]||
          row.actorIds.some(id=>!people.has(id))||row.earlier.tick<issue.tick-TIANJI_GAZETTE_WINDOW||row.earlier.tick>=row.tick||calendar(row.earlier)>=calendar(row)||
          row.sourceEventId===row.earlier.sourceEventId)return fail(path+'.rivalry');
        earlierBonds(row.earlier,row.actorIds);
        earlierBonds(row,row.actorIds);
        if(publicBondEvent.exec(row.sourceEventId)?.[2]!==row.actorIds[0])return fail(path+'.rivalry');
      }else{
        const native=bounties.get(row.bountyId);
        if(!native||row.sourceEventId!==`evt-${row.tick}-bounty-${native.id}`||native.issuedTick!==row.tick||
          native.id!==`bounty-${row.tick}-${row.targetActorId}`||native.targetCultivatorId!==row.targetActorId||
          !people.has(row.targetActorId)||!sects.has(row.sponsorSectId)||native.sponsorSectIds[0]!==row.sponsorSectId||
          row.reward<=0||native.reward!==row.reward||native.settledTick!==undefined&&native.settledTick<=issue.tick||native.status==='open'&&
          native.escrow.reduce((sum,part)=>sum+part.amount,0)!==row.reward)return fail(path+'.bounty');
        proof(row,'diplomacy',raw=>raw.actorIds.length===0&&raw.title.startsWith('天机悬赏：'));
      }
    }
    if(!issue.quarterly&&issue.trigger!=='year_turn'&&!triggerProof)return fail(path+'.trigger');
  }

  if(state.quarterlies&&!state.quarterlies.length)return fail(path+'.quarterlies');
  const managed=world.sectManagement;
  let precedingQuarter=0;
  for(const issue of state.quarterlies??[]){
    const issueDate=calendar(issue),from=issue.tick-2;
    if(!managed||issue.id!==tianjiTabloidIssueId(issue.tick)||issue.tick<=precedingQuarter||
      issue.tick<=managed.foundedTick||issue.tick>world.tick||issue.month%3!==0||
      calendar(world)-issueDate!==world.tick-issue.tick)return fail(path+'.quarterly');
    precedingQuarter=issue.tick;
    const dated=(row:TianjiGazetteSource)=>row.tick>managed.foundedTick&&row.tick>=from&&row.tick<=issue.tick&&
      issueDate-calendar(row)===issue.tick-row.tick&&tianjiGazetteVenue(venues.get(row.siteId));
    const publicProof=(row:TianjiGazetteSource,check:(event:WorldEvent|ChronicleAnchor)=>boolean)=>{
      if(!dated(row))return false;
      const originals=hot.get(row.sourceEventId)??[],archives=cold.get(row.sourceEventId)??[];
      return originals.length<=1&&[...originals,...archives].every(raw=>tianjiGazetteMatchesSource(row,raw)&&
        isChronicleStoryFact(raw,issue.tick)&&check(raw))&&
        (originals.length>0||archives.length>0||row.tick<=oldestHot&&world.events.length>=120);
    };
    if(issue.challenge){
      const row=issue.challenge;
      const original=hot.get(row.sourceEventId)?.[0];
      const challenge=managed.challenges?.history.find(result=>result.id===row.challengeId);
      const key=/^sect-challenge-(inbound|outbound)-(0|[1-9]\d*)$/.exec(row.challengeId);
      if(!key||!Number.isSafeInteger(Number(key[2]))||
        Number(key[2])>row.tick||Number(key[2])<row.tick-4||row.sourceEventId!==`evt-${row.tick}-${row.challengeId}-completed`||
        !publicProof(row,raw=>raw.category==='combat'&&raw.title===SECT_CHALLENGE_PUBLIC_TITLE&&
          raw.actorIds.length===2&&raw.actorIds[0]!==raw.actorIds[1]&&raw.actorIds.every(id=>people.has(id))&&
          (!challenge||raw.actorIds[0]===challenge.challengerId&&raw.actorIds[1]===challenge.defenderId))||
        challenge&&(challenge.outcome!=='completed'||challenge.eventId!==row.sourceEventId||challenge.siteId!==row.siteId||
          challenge.resolvedTick!==row.tick||original&&!resolveTabloidChallenge(world,row))||
        !challenge&&row.tick===world.tick)return fail(path+'.quarterly.challenge');
    }
    if(issue.embarrassment){
      const row=issue.embarrassment;
      if(!people.has(row.actorId)||!isSectLiveSourceId({...row,kind:'furnace',castIds:[row.actorId]})||
        !publicProof(row,raw=>raw.category==='heavenly'&&raw.actorIds.length===1&&raw.actorIds[0]===row.actorId&&
          raw.title.endsWith('炸炉')&&(!('damage' in raw)||raw.damage?.length===1&&raw.damage[0].cultivatorId===row.actorId&&
            Number.isSafeInteger(raw.damage[0].amount)&&raw.damage[0].amount>0&&raw.damage[0].amount<=12))||
        row.tick===world.tick&&!resolveTabloidEmbarrassment(world,row))return fail(path+'.quarterly.embarrassment');
    }
    if(issue.hotTopic){
      const row=issue.hotTopic;
      if(row.speakerIds.length<2||row.speakerIds.length!==Math.min(TIANJI_TABLOID_SPEAKERS,row.speakerCount)||row.speakerIds.some((id,index)=>id===managed.leaderId||!people.has(id)||
        index>0&&id<=row.speakerIds[index-1])||!publicProof(row,()=>true))return fail(path+'.quarterly.hotTopic');
      const proven=isTabloidHotspotProven(world,row,Math.max(from,1),issue.tick);
      // These exact public lines can age out or lose their underlying witnesses. The read model
      // also checks proof, so retaining an old identifier never republishes an unproved quote.
      if(!proven){
        const chats=(managed.chat?.months??[]).filter(month=>month.tick>=Math.max(from,row.tick)&&month.tick<=issue.tick);
        const oldest=managed.chat?.months[0]?.tick??Infinity;
        if(issue.tick===world.tick||(oldest<=Math.max(from,row.tick)&&
          !row.speakerIds.every(id=>chats.some(month=>month.posts.some(post=>post.senderId===id&&
            post.roomId===row.roomId&&post.audience===undefined&&post.about.kind==='public_event'&&
            post.about.eventId===row.sourceEventId&&post.about.eventTick===row.tick)))))
          return fail(path+'.quarterly.hotTopic');
      }
    }
    if(issue.advertisement){
      const row=issue.advertisement;
      if(row.postedTick<Math.max(from,managed.foundedTick)||row.postedTick>issue.tick||row.sectId!==managed.sectId||
        !tianjiGazetteVenue(venues.get(row.siteId))||!sects.has(row.sectId)||
        !Array.from({length:SECT_PLAYER_CHAT_POST_LIMIT},(_,index)=>sectPlayerChatPostId(row.postedTick,index)).includes(row.postId))
        return fail(path+'.quarterly.advertisement');
      const oldest=managed.playerChat?.months[0]?.tick??Infinity;
      if((issue.tick===world.tick||oldest<=row.postedTick)&&!isTabloidAdvertisementProven(world,row))
        return fail(path+'.quarterly.advertisement');
    }
  }
}
