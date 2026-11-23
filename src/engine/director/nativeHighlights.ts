import type {Cultivator,LLMDecisionPayload,LocationNode,WorldEvent,WorldState} from '../../types/world';
import type {HeartDemonChoice} from '../../types/heartDemon';
import type {DungeonMove} from '../../types/expeditionDungeon';
import type {ConsequenceTag,HighlightCandidate,HighlightOptionPreview,HighlightSource} from './highlight';
import {activeHeartDemon,isHeartDemonGuided,queueGuidedHeartDemonChoice} from '../heartDemonEngine';
import {availableOccasionJoins,joinOccasion} from '../occasionEngine';
import {availableDungeonMoves} from '../expeditionDungeonEngine';
import {directorDungeonOmenViable} from '../expeditionOmenEngine';
import {availableImmortalAuctionActions,resolveImmortalAuctionAction} from '../immortalAuctionEngine';
import type {ImmortalAuctionOption} from '../immortalAuctionEngine';
import {IMMORTAL_AUCTION_SITE,immortalAuctionOpening} from '../immortalAuctionTerms';
import {recordAuxiliaryActionEvent} from '../recordAuxiliaryActionEvent';
import {directorKnownReachableSites,directorSiteIsSafe} from './nudgeIntegrations';
import {ALCHEMY_RECIPES} from '../alchemyCatalog';

const single=<T extends {id:string}>(rows:readonly T[],id:string):T|undefined=>{
  const candidates=rows.filter(row=>row.id===id);
  return candidates.length===1?candidates[0]:undefined;
};
const body=(world:WorldState,actor:Cultivator)=>single(world.cultivators,actor.id)===actor&&
  actor.alive&&actor.hp>0&&actor.positionPlane===undefined;
const futureBody=(world:WorldState,actor:Cultivator,tick:number)=>body(world,actor)&&
  !(tick===world.tick+1&&world.month===12&&actor.age+1>=actor.lifespan);
const preview=(id:string,label:string,consequences:readonly ConsequenceTag[]):HighlightOptionPreview=>({id,label,consequences});
const keepEvent=(world:WorldState,event:WorldEvent|null):boolean=>{
  if(!event)return false;
  recordAuxiliaryActionEvent(world,event);
  return true;
};
function nearestSite(world:WorldState,actor:Cultivator,eligible:(site:LocationNode)=>boolean){
  if(!body(world,actor))return undefined;
  const origin=single(world.locations,actor.locationId);
  if(!origin)return undefined;
  if(eligible(origin)&&directorSiteIsSafe(world,origin))return origin;
  return directorKnownReachableSites(world,actor).find(eligible);
}

const heartOptions=[
  preview('face','直面过往，求一线清明',['breakthrough','injury']),
  preview('sever','割舍执念，轻身过劫',['breakthrough','injury']),
  preview('wrath','借杀意冲关，任它反噬',['breakthrough','injury','death_risk']),
];
export const isDirectorHeartChoice=(id:string):id is HeartDemonChoice=>id==='face'||id==='sever'||id==='wrath';
export const heartDemonHighlightSource:HighlightSource={
  kind:'heart_demon', nextMonth:true,
  probe(world,actor){
    const frame=body(world,actor)&&activeHeartDemon(world,actor);
    if(!frame||frame.queued||frame.releasedTick!==undefined ||
      !isHeartDemonGuided(world,actor,frame) && actor.tribulation?.heartGuide) return [];
    return [{kind:'heart_demon',sourceId:frame.id,siteId:frame.siteId,actorId:actor.id,baseWeight:97,
      title:'心魔问道',teaser:'最后一道雷声已远，幻境里却还有一声叩问。如何答它，由你自决。',options:heartOptions}];
  },
  decision(world,actor,candidate,optionId){
    const trial=actor.tribulation, frame=activeHeartDemon(world,actor);
    if(!trial||!frame||trial.heartGuide||(frame.openedTick!==world.tick && frame.openedTick!==world.tick-1)||
      frame.id!==candidate.sourceId||!isDirectorHeartChoice(optionId))return;
    return {chosenAction:'FACE_TRIBULATION', targetHeartTrialId:trial.id, heartDemonChoice:optionId,
      innerMonologue:'这一回，要亲自回答它。'};
  },
  choose(world,actor,candidate,optionId){
    const frame=activeHeartDemon(world,actor),trial=actor.tribulation;
    if(!frame||!trial||frame.id!==candidate.sourceId||!isDirectorHeartChoice(optionId))return false;
    const next=queueGuidedHeartDemonChoice(world,actor.id,trial.id,optionId);
    const queued=single(next.cultivators,actor.id)?.tribulation?.heartDemon?.queued;
    if(next===world||!queued)return false;
    frame.queued=queued;
    return true;
  },
};

export const tournamentHighlightSource:HighlightSource={
  kind:'tournament',
  probe(world,actor){
    if(!body(world,actor))return [];
    return availableOccasionJoins(actor,world).flatMap(move=>{
      const row=single(world.occasions,move.targetOccasionId);
      if(row?.kind!=='tournament')return [];
      return [{kind:'tournament',sourceId:row.id,siteId:row.locationId,actorId:actor.id,baseWeight:82,
        title:'山门擂鼓',teaser:'诸宗的大旗已挂上擂台。报名，便能凭一身本事争个名次。',
        options:[preview('register','报名登擂，争一个名次',['reputation','injury','sequel']),preview('pass','这回不报名',[])]}];
    });
  },
  seed(world,actor){
    if(world.occasions.some(row=>row.kind==='tournament'&&(row.status==='registration'||row.status==='running')))return;
    const site=nearestSite(world,actor,row=>row.type==='market');
    return site?{kind:'omen_bias',siteId:site.id,reason:'tournament',expiresTick:world.tick+4}:undefined;
  },
  choose(world,actor,candidate,optionId){
    const menu=tournamentHighlightSource.probe(world,actor);
    if(!menu.some(row=>row.sourceId===candidate.sourceId&&row.options.some(option=>option.id===optionId)))return false;
    if(optionId==='pass')return true;
    return keepEvent(world,joinOccasion(world,actor,{chosenAction:'JOIN_OCCASION',targetOccasionId:candidate.sourceId,
      innerMonologue:'要去擂台上试试这一身本事。'}));
  },
};

const dungeonOptions:Record<DungeonMove,HighlightOptionPreview>={
  enter:preview('enter','入洞，踏入星门药园',['sequel']),
  gather:preview('gather','取一株灵药，继续入殿',['item','sequel']),
  break_array:preview('break_array','耗十八点灵气，破阵开路',['sequel']),
  strike:preview('strike','迎战守殿妖王，可能受伤',['injury','sequel']),
  claim:preview('claim','取走藏星古钥与灵石',['item','stones_major']),
  retreat:preview('retreat','沿来路退出秘境',[]),
};
const dungeonRegistrationId=(occasionId:string)=>`${occasionId}-registration`;
function dungeonRegistrations(world:WorldState,actor:Cultivator,tick:number){
  return availableOccasionJoins(actor,world,tick).flatMap(move=>{
    const row=single(world.occasions,move.targetOccasionId);
    return row?.kind==='expedition'&&row.omenId&&row.anchorSiteId?[{move,siteId:row.anchorSiteId}]:[];
  });
}
export const dungeonHighlightSource:HighlightSource={
  kind:'dungeon',
  nextMonth:true,
  probe(world,actor,tick=world.tick){
    if(!futureBody(world,actor,tick))return [];
    const moves=availableDungeonMoves(world,actor,tick);
    const registrations=dungeonRegistrations(world,actor,world.tick).map(({move,siteId}):HighlightCandidate=>({
      kind:'dungeon',sourceId:dungeonRegistrationId(move.targetOccasionId),siteId,actorId:actor.id,baseWeight:90,
      title:'星门启处',teaser:'灵潮退开，眼前露出一道石门。此时报名，还赶得上下一拨入山的人。',
      options:[preview('register','报名探秘，待星门开行',['sequel']),preview('pass','这回留在山外',[])],
    }));
    const steps=[...new Set(moves.map(row=>row.targetOccasionId))].flatMap((sourceId):HighlightCandidate[]=>{
      const occasion=single(world.occasions,sourceId);
      if(!occasion)return [];
      const options=moves.filter(row=>row.targetOccasionId===sourceId).map(row=>dungeonOptions[row.dungeonMove]);
      if(options.length===1&&options[0].id==='enter')options.push(preview('pass','暂不踏过星门',[]));
      return options.length<2?[]:[{kind:'dungeon',sourceId,siteId:occasion.locationId,actorId:actor.id,baseWeight:88,
        title:'星门之内',teaser:'星辉落进石阶深处。再往前，便要拿灵气与这副身躯开路。',options}];
    });
    return [...registrations,...steps];
  },
  seed(world,actor){
    if(world.occasions.some(row=>row.kind==='expedition'&&(row.status==='registration'||row.status==='running')))return;
    const site=nearestSite(world,actor,row=>directorDungeonOmenViable(world,row,world.tick+(row.id===actor.locationId?1:2)));
    return site?{kind:'omen_bias',siteId:site.id,reason:'dungeon',expiresTick:world.tick+6}:undefined;
  },
  choose(world,actor,candidate,optionId){
    if(optionId==='pass')return dungeonHighlightSource.probe(world,actor,world.tick+1)
      .some(row=>row.sourceId===candidate.sourceId&&row.kind===candidate.kind&&row.siteId===candidate.siteId&&
        row.options.some(option=>option.id==='pass'));
    if(optionId!=='register')return false;
    const registration=dungeonRegistrations(world,actor,world.tick).find(({move,siteId})=>
      dungeonRegistrationId(move.targetOccasionId)===candidate.sourceId&&siteId===candidate.siteId);
    return !!registration&&keepEvent(world,joinOccasion(world,actor,{chosenAction:'JOIN_OCCASION',
      targetOccasionId:registration.move.targetOccasionId,innerMonologue:'要赶在星门关闭之前，入山一探。'}));
  },
  decision(world,actor,candidate,optionId,tick=world.tick){
    if(!futureBody(world,actor,tick))return;
    const move=availableDungeonMoves(world,actor,tick).find(row=>row.targetOccasionId===candidate.sourceId&&row.dungeonMove===optionId);
    if(!move)return;
    return {chosenAction:move.action,dungeonMove:move.dungeonMove,targetOccasionId:move.targetOccasionId,
      targetDungeonRoomId:move.targetDungeonRoomId,innerMonologue:'就走眼下这一条路。'};
  },
};

function auctionKey(move:ImmortalAuctionOption){
  switch(move.auctionMove){
    case 'consign_artifact':return `artifact:${move.targetAuctionArtifactId}`;
    case 'consign_pill':return `pill:${move.targetAuctionPillId}`;
    default:return move.targetAuctionLotId;
  }
}
const auctionOptionId=(move:ImmortalAuctionOption)=>move.auctionMove==='bid'?`bid-${move.auctionBidStones}`:move.auctionMove;
function auctionMove(world:WorldState,actor:Cultivator,sourceId:string,optionId:string,tick:number){
  return availableImmortalAuctionActions(actor,world,tick).find(row=>auctionKey(row)===sourceId&&auctionOptionId(row)===optionId);
}
function auctionPayload({action,...fields}:ImmortalAuctionOption):LLMDecisionPayload{
  return {chosenAction:action,...fields,innerMonologue:'这件东西值不值得，心里自有一杆秤。'};
}
export const auctionHighlightSource:HighlightSource={
  kind:'auction',
  nextMonth:true,
  probe(world,actor,tick=world.tick){
    if(!body(world,actor))return [];
    const current=availableImmortalAuctionActions(actor,world);
    const next=tick!==world.tick&&futureBody(world,actor,tick)?availableImmortalAuctionActions(actor,world,tick):[];
    const moves=[...current,...next.filter(row=>!current.some(move=>auctionKey(move)===auctionKey(row)&&
      auctionOptionId(move)===auctionOptionId(row)))];
    return [...new Set(moves.map(auctionKey))].flatMap(sourceId=>{
      const options=moves.filter(move=>auctionKey(move)===sourceId);
      const first=options[0],lot=single(world.immortalAuction?.lots??[],sourceId);
      const item=lot?(lot.asset.kind==='artifact'?lot.asset.name:ALCHEMY_RECIPES[lot.asset.pillId].name):
        first.auctionMove==='consign_artifact'?actor.artifacts.find(asset=>asset.id===first.targetAuctionArtifactId)?.name:
        first.auctionMove==='consign_pill'?ALCHEMY_RECIPES[first.targetAuctionPillId].name:undefined;
      if(!item)return [];
      const own=options.map(move=>{
        if(move.auctionMove==='bid')return preview(auctionOptionId(move),`出价 ${move.auctionBidStones} 灵石`,['stones_major','item']);
        if(move.auctionMove==='withdraw')return preview(move.auctionMove,'撤下拍品，取回原物',['item']);
        return preview(move.auctionMove,'把这件宝物交上拍案',['item','stones_major']);
      });
      own.push(preview('pass',first.auctionMove==='withdraw'?'留在拍案，等人出价':
        first.auctionMove==='bid'?'不举牌，让这一件过去':'宝物留在囊中',[]));
      return [{kind:'auction',sourceId,siteId:IMMORTAL_AUCTION_SITE,actorId:actor.id,baseWeight:77,
        title:'万宝大会',teaser:`锣声即将响起，今日案上轮到「${item}」。叫价、收手，都要自己拿主意。`,options:own}];
    });
  },
  seed(world,actor){
    if(![1,2,3].some(ahead=>immortalAuctionOpening(world.tick+ahead)))return;
    const site=nearestSite(world,actor,row=>row.id===IMMORTAL_AUCTION_SITE&&row.type==='market');
    if(site&&actor.locationId!==site.id)return {kind:'travel_bias',actorId:actor.id,targetSiteId:site.id,weight:28,
      reason:'auction',expiresTick:world.tick+3};
  },
  choose(world,actor,candidate,optionId){
    if(optionId==='pass')return auctionHighlightSource.probe(world,actor,world.tick+1)
      .some(row=>row.sourceId===candidate.sourceId&&row.kind===candidate.kind&&row.siteId===candidate.siteId);
    const move=auctionMove(world,actor,candidate.sourceId,optionId,world.tick);
    if(!move||!keepEvent(world,resolveImmortalAuctionAction(world,actor,auctionPayload(move))))return false;
    actor.currentAction='IMMORTAL_AUCTION';
    return true;
  },
  decision(world,actor,candidate,optionId,tick=world.tick){
    if(!futureBody(world,actor,tick)||tick!==world.tick&&auctionMove(world,actor,candidate.sourceId,optionId,world.tick))return;
    const move=auctionMove(world,actor,candidate.sourceId,optionId,tick);
    return move&&auctionPayload(move);
  },
};

export const NATIVE_HIGHLIGHT_SOURCES:readonly HighlightSource[]=[
  heartDemonHighlightSource,tournamentHighlightSource,dungeonHighlightSource,auctionHighlightSource,
];
