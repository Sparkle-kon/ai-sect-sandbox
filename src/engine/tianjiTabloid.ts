import {
  TIANJI_TABLOID_HISTORY,tianjiTabloidIssueId,type TianjiGazetteSource,type TianjiTabloidIssue,
} from '../types/tianjiGazette';
import {starterSectIdentity} from '../types/sectManagement';
import type {WorldEvent,WorldState} from '../types/world';
import {matchSectChallengeResult} from './sectChallengeProof';
import {collectTabloidLegacyEntries,projectTianjiGazette,type TianjiGazetteReadScope} from './tianjiGazetteEngine';
import {resolveTabloidChallenge,resolveTabloidEmbarrassment} from './tianjiTabloidProof';
import {collectTabloidSocial,isTabloidHotspotProven,isTabloidAdvertisementProven} from './tianjiTabloidSocial';

const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
function canonicalManagement(world:WorldState):boolean{
  const state=world.sectManagement;
  if(!state)return false;
  const origin=starterSectIdentity(world.random.seed,state.starterId,state.draw);
  return state.sectId===origin.sectId&&state.leaderId===origin.leaderId&&state.homeSiteId===origin.homeSiteId;
}
function recentPublic(world:WorldState,from:number,completed:readonly WorldEvent[]):WorldEvent[]{
  const hot=new Map<string,WorldEvent|undefined>();
  for(const event of world.events)hot.set(event.id,hot.has(event.id)?undefined:event);
  const closing=new Map<string,WorldEvent|undefined>();
  for(const event of completed)closing.set(event.id,closing.has(event.id)?undefined:event);
  return [...hot.values()].filter((event):event is WorldEvent=>!!event&&event.witnessScope===undefined&&
    event.tick>=from&&event.tick<=world.tick&&
    (!closing.has(event.id)||closing.get(event.id)===event)).sort((a,b)=>b.tick-a.tick||order(a.id,b.id));
}
function source(event:WorldEvent):TianjiGazetteSource|undefined{
  const {id,locationId,tick,year,month}=event;
  return locationId?{sourceEventId:id,tick,year,month,siteId:locationId}:undefined;
}

/** Print once when a genuine quarter closes. Types record facts/attribution, never player/model prose. */
export function publishTianjiTabloid(before:WorldState,world:WorldState,completed:readonly WorldEvent[]):void{
  if(!canonicalManagement(world)||!world.sectManagement||world.tick<1||world.tick!==before.tick+1||
    world.month!==before.month%12+1||world.year!==before.year+Number(before.month===12)||world.month%3!==0||
    world.tianjiGazette?.quarterlies?.some(row=>row.tick===world.tick))return;
  const from=Math.max(1,world.sectManagement.foundedTick+1,world.tick-2),through=world.tick;
  const recent=recentPublic(world,from,completed);
  const challenge=recent.flatMap(event=>{
    const result=matchSectChallengeResult(world,event),proof=source(event);
    if(!result||!proof)return [];
    const row={...proof,challengeId:result.id};
    return resolveTabloidChallenge(world,row)?[row]:[];
  })[0];
  const embarrassment=recent.flatMap(event=>{
    const proof=source(event);
    if(!proof||event.actorIds.length!==1||!event.id.includes('-alchemy-burst-'))return [];
    const row={...proof,actorId:event.actorIds[0]};
    return resolveTabloidEmbarrassment(world,row)?[row]:[];
  })[0];
  const {hotspot,advertisement}=collectTabloidSocial(world,from,through);
  const issue:TianjiTabloidIssue={id:tianjiTabloidIssueId(through),tick:through,year:world.year,month:world.month,
    legacyEntries:collectTabloidLegacyEntries(world,from,completed),...(challenge?{challenge}:{}),
    ...(embarrassment?{embarrassment}:{}),...(hotspot?{hotTopic:hotspot}:{}),...(advertisement?{advertisement}:{})};
  const ledger=world.tianjiGazette??(world.tianjiGazette={issues:[]});
  ledger.quarterlies=[...(ledger.quarterlies??[]),issue].slice(-TIANJI_TABLOID_HISTORY);
}

const columns=[
  ['headline','头条','本季未有可核实的大事登头版。山门照常开，茶照常煮。'],
  ['embarrassment','丢人榜','没听见哪桩公开失手说得准。空榜也是好消息。'],
  ['dark_horse','黑马','本季未见可核对签位的逆风胜局。'],
  ['rivalry','恩怨','旧话不当新仇；本季暂无两度交手的确据。'],
  ['advertisement','广告位','本季没有经核实的山门告示。'],
] as const;
export interface TianjiTabloidColumnView {
  readonly kind:typeof columns[number][0];
  readonly title:string;
  readonly text:string;
  readonly empty:boolean;
  readonly siteName?:string;
}
export interface TianjiTabloidIssueView {
  readonly id:string;
  readonly tick:number;
  readonly year:number;
  readonly month:number;
  readonly quiet:boolean;
  readonly columns:readonly TianjiTabloidColumnView[];
  readonly hotspot?:{readonly title:string;readonly text:string};
}
type Article={readonly text:string;readonly siteName?:string};
const clean=(value:string)=>Array.from(value.replace(/[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029<>]/gu,' ').replace(/\s+/gu,' ').trim()).slice(0,64).join('');
const label=(rows:readonly {id:string;name:string}[],id:string)=>{
  const found=rows.filter(row=>row.id===id);
  return found.length===1?clean(found[0].name):undefined;
};

export function projectTianjiTabloid(world:WorldState,scope:TianjiGazetteReadScope):readonly TianjiTabloidIssueView[]{
  const through=scope.throughTick??world.tick,issues=world.tianjiGazette?.quarterlies;
  if(!canonicalManagement(world)||!issues?.length||!Number.isSafeInteger(through)||through<1||through>world.tick)return [];
  if(scope.viewerId){
    const viewers=world.cultivators.filter(actor=>actor.id===scope.viewerId);
    if(viewers.length!==1||!viewers[0].alive||viewers[0].hp<=0||viewers[0].positionPlane!==undefined)return [];
  }
  const legacyByIssue=new Map(projectTianjiGazette(world,scope,issues.map(issue=>({...issue,
    // The legacy article reader permits no headline for this analogue; no legacy issue is written.
    trigger:'year_turn',entries:issue.legacyEntries}))).map(issue=>[issue.id,issue.entries]));
  const venue=(siteId:string)=>scope.currentVisibleSiteIds.has(siteId)?label(world.locations,siteId):undefined;
  return issues.filter(issue=>issue.tick<=through).slice().reverse().map(issue=>{
    const articles=new Map<TianjiTabloidColumnView['kind'],Article>();
    for(const article of legacyByIssue.get(issue.id)??[]){
      if(article.kind!=='bounty')articles.set(article.kind,{text:article.text,siteName:article.siteName});
    }
    if(issue.challenge){
      const siteName=venue(issue.challenge.siteId),outcome=siteName&&resolveTabloidChallenge(world,issue.challenge);
      if(outcome){
        const a=label(world.cultivators,outcome.result.challengerId),b=label(world.cultivators,outcome.result.defenderId);
        const winner=label(world.cultivators,outcome.result.winnerId);
        if(a&&b&&winner)articles.set('headline',{siteName,text:`${a}与${b}在公开演武处应帖比试，${winner}胜。此帖只问剑，不记仇。`});
      }
    }
    if(issue.embarrassment){
      const siteName=venue(issue.embarrassment.siteId);
      if(siteName&&resolveTabloidEmbarrassment(world,issue.embarrassment))articles.set('embarrassment',
        {siteName,text:'炉先响了，丹没出炉。本报只记这声响，不拿伤势取笑。'});
    }
    if(issue.advertisement){
      const ad=issue.advertisement,siteName=venue(ad.siteId),sect=siteName&&label(world.sects,ad.sectId);
      if(sect&&isTabloidAdvertisementProven(world,ad))articles.set('advertisement',
        {siteName,text:`${sect}本季曾在九州群张贴招徒告示。旧告示照留，拜师仍须当事人点头。`});
    }
    const topic=issue.hotTopic,from=Math.max(1,(world.sectManagement?.foundedTick??0)+1,issue.tick-2);
    const topicHeadline=topic&&world.events.find(event=>event.id===topic.sourceEventId)?.title;
    const hotspot=topic&&topicHeadline&&venue(topic.siteId)&&isTabloidHotspotProven(world,topic,from,issue.tick)?
      {title:'群聊热议',text:`${topic.roomId==='market'?'坊市群':'九州群'}里，有 ${topic.speakerCount} 位道友谈及「${clean(topicHeadline)}」。这里只记几人说过，不把闲话当实情。`}:undefined;
    return {id:issue.id,tick:issue.tick,year:issue.year,month:issue.month,quiet:articles.size===0&&!hotspot,
      columns:columns.map(([kind,title,emptyText])=>{
        const article=articles.get(kind);
        return {kind,title,text:article?.text??emptyText,siteName:article?.siteName,empty:!article};
      }),...(hotspot?{hotspot}:{})};
  });
}
