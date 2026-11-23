import type { Cultivator, LLMDecisionPayload, WorldState } from '../../types/world';
import { activeAvatar } from '../avatarEngine';
import { availableDaoPathActions, type DaoPathOption } from '../daoPathEngine';
import { DAO_PATHS } from '../daoPathTerms';
import { daoPathTurnLocked, daoPathDecision } from '../cognition/decisionFactsLate';
import { projectGuidedForbiddenDuel, queueGuidedForbiddenArt } from '../forbiddenArtEngine';
import { availableApprenticeshipReunionActions } from '../apprenticeshipReunion';
import { apprenticeshipReunionCommand } from '../apprenticeshipReunionCognition';
import { availableMercyReunionActions } from '../mercyReunion';
import { storyMercyCommand } from '../mercyReunionCognition';
import { availableVillageReunionActions } from '../villageReunion';
import { villageReunionCommand } from '../villageReunionCognition';
import { availableBattlefieldAftermathActions } from '../battlefieldAftermath';
import { battlefieldAftermathCommand } from '../battlefieldAftermathCognition';
import { availableBellWatchActions } from '../bellWatch';
import { directorKnownReachableSites, seedPublicCampaignTravel } from './nudgeIntegrations';
import type { ConsequenceTag, HighlightCandidate, HighlightKind, HighlightSource } from './highlight';
import type { DirectorNudge } from './nudge';

type NativeOption = {id:string; label:string; consequences:readonly ConsequenceTag[]; command:LLMDecisionPayload};
interface NativeMenu extends Omit<HighlightCandidate,'options'> { options: readonly NativeOption[] }
type NativeProbe = (world:WorldState,actor:Cultivator,tick:number)=>readonly NativeMenu[];

const monologue = '且由我来选这一回。';
const available=(world:WorldState,actor:Cultivator)=>{
  const host=activeAvatar(world);
  return actor.alive && actor.hp>0 && actor.positionPlane===undefined && (!host||host===actor) &&
    world.cultivators.filter(row=>row.id===actor.id).length===1 && world.cultivators.includes(actor);
};
const currentMenu=(kind:HighlightKind,sourceId:string,actor:Cultivator,baseWeight:number,title:string,teaser:string,
  options:readonly NativeOption[]):NativeMenu=>({
  kind,sourceId,actorId:actor.id,siteId:actor.locationId,baseWeight,title,teaser,options,
});
const expose=(menu:NativeMenu):HighlightCandidate=>({...menu,options:menu.options.map(({id,label,consequences})=>({id,label,consequences}))});
const same=(a:HighlightCandidate,b:HighlightCandidate)=>a.kind===b.kind&&a.sourceId===b.sourceId&&a.actorId===b.actorId&&a.siteId===b.siteId;
function nativeSource(kind:HighlightKind,menus:NativeProbe,seed?:HighlightSource['seed'],nextMonth?:true):HighlightSource {
  return {
    kind,
    probe: (world,actor,tick=world.tick+(nextMonth?1:0)) => available(world,actor)?menus(world,actor,tick).map(expose):[],
    decision(world,actor,candidate,optionId,tick=world.tick+(nextMonth?1:0)) {
      if(!available(world,actor))return;
      return menus(world,actor,tick).find(menu=>same(menu,candidate))?.options.find(option=>option.id===optionId)?.command;
    },
    ...(seed?{seed}:{}),...(nextMonth?{nextMonth}:{}),
  };
}

function daoLabel({targetDaoPathId,daoPathMove}:DaoPathOption):string {
  const {name,intent}=DAO_PATHS[targetDaoPathId];
  switch(daoPathMove){
    case 'choose': return `自此修习${name}`;
    case 'practice': return `精修${name}`;
    case 'ready': return `蓄势待发：${intent}`;
    case 'cancel': return '散去旧招的蓄势';
  }
}

export const daoPathHighlightSource=nativeSource('dao_path',(world,actor)=>{
  if(daoPathTurnLocked(actor,world))return [];
  const choices=availableDaoPathActions(actor,world);
  if(choices.length<2)return [];
  const path=actor.daoPath;
  const stage=path?`${path.pathId}-${path.practices.length}-${path.ready?'ready':'empty'}`:'first';
  return [currentMenu('dao_path',`dao-${actor.id}-${stage}`,actor,66,
    path?`再问${DAO_PATHS[path.pathId].name}`:'问道之初',
    path?'一式已有根底。今后用在何处，还在你这一念。':'面前不止一路。今日择定，往后的功夫便有了去处。',
    choices.map(option=>({id:`${option.daoPathMove}:${option.targetDaoPathId}`,label:daoLabel(option),
      consequences:['technique'],command:daoPathDecision(option)})))];
});

function forbiddenOptions(world:WorldState,actor:Cultivator){
  if(!available(world,actor)||activeAvatar(world)!==actor)return undefined;
  const living=projectGuidedForbiddenDuel(world);
  return living?.contact.ownerId===actor.id&&!living.contact.queued&&living.options.length>=2?living:undefined;
}
export const forbiddenArtHighlightSource:HighlightSource={
  kind:'forbidden_art',
  probe(world,actor){
    const view=forbiddenOptions(world,actor);
    if(!view)return [];
    return [{
      kind:'forbidden_art', sourceId:view.contact.id, actorId:actor.id, siteId:view.contact.siteId,
      baseWeight:96, title:'器灵一念', teaser:'兵锋已压至眼前。器灵在刃上作响，要不要应它？',
      options:view.options.map(({choice,name,cost})=>({
        id:choice,label:name,consequences:choice==='decline'?[]:
          [...(cost.hp>0?['injury'] as const:[]),...(cost.lifespan>0?['lifespan'] as const:[]),
            ...(cost.durability>0?['item'] as const:[]),'death_risk'],
      })),
    }];
  },
  choose(world,actor,candidate,optionId){
    const view=forbiddenOptions(world,actor);
    const option=view?.options.find(row=>row.choice===optionId);
    if(!view||!option||candidate.kind!=='forbidden_art'||view.contact.id!==candidate.sourceId||
      view.contact.siteId!==candidate.siteId||actor.id!==candidate.actorId)return false;
    const next=queueGuidedForbiddenArt(world,actor.id,view.contact.id,option.choice);
    if(next===world)return false;
    // The native queue stores only the exact player's choice. The duel still settles next month.
    world.forbiddenDuels=next.forbiddenDuels;
    return true;
  },
};

const apprenticeshipPreview={
  teach:{label:'再伸手，传他一式',consequences:['sequel']},
  accept_teaching:{label:'收下这回指点',consequences:['technique','bond']},
  public_spar:{label:'邀他到众人面前过招',consequences:['sequel']},
  accept_spar:{label:'应下这一场切磋',consequences:['sequel']},
  part:{label:'这回只道一声珍重',consequences:[]},
} satisfies Record<string,{label:string;consequences:readonly ConsequenceTag[]}>;
const mercyPreview={
  stand_down:{label:'收剑，不续旧怨',consequences:['bond']},
  aid:{label:'问他愿否同行避险',consequences:['sequel']},
  accept_aid:{label:'应下他这一程',consequences:['bond']},
  challenge:{label:'拔剑，把旧账当面算清',consequences:['injury','death_risk']},
} satisfies Record<string,{label:string;consequences:readonly ConsequenceTag[]}>;
const villagePreview={
  remember:{label:'同他说一件旧事',consequences:[]},
  part:{label:'到此别过',consequences:[]},
  offer:{label:'赠一枚灵石，替故人解眼前的难',consequences:['sequel']},
  accept:{label:'接下乡亲的这份情',consequences:['sequel']},
} satisfies Record<string,{label:string;consequences:readonly ConsequenceTag[]}>;

function bondMenus(world:WorldState,actor:Cultivator,tick:number): NativeMenu[] {
  const menus:NativeMenu[]=[];
  const lessons=availableApprenticeshipReunionActions(actor,world,tick);
  const apprenticeshipId=lessons[0]?.targetApprenticeshipReunionId;
  if(apprenticeshipId&&lessons.length>=2)menus.push(currentMenu('bond_reunion',apprenticeshipId,actor,85,'旧师门前',
    '上一回没拜成的师，今日又站到眼前。这一遭，倒还可以另作打算。',
    lessons.flatMap(option=>{
      const move=option.apprenticeshipReunionMove;
      if(move==='ask'||move==='refuse'||option.targetApprenticeshipReunionId!==apprenticeshipId)return [];
      return [{id:move,...apprenticeshipPreview[move],command:{...apprenticeshipReunionCommand(option),innerMonologue:monologue}}];
    })));
  const reunions=availableMercyReunionActions(actor,world,tick);
  for(const id of new Set(reunions.map(option=>option.targetMercyReunionId))){
    const options=reunions.filter(option=>option.targetMercyReunionId===id);
    if(options.length<2)continue;
    menus.push(currentMenu('bond_reunion',id,actor,91,'剑未出鞘',
      '从前他收过一剑。此刻故人站在面前，手却还没碰剑柄。',
      options.map(option=>({id:option.mercyReunionMove,...mercyPreview[option.mercyReunionMove],
        command:{...storyMercyCommand(option),innerMonologue:monologue}}))));
  }
  const classmates=availableVillageReunionActions(actor,world,tick);
  const villageId=classmates[0]?.targetVillageReunionId;
  if(villageId&&classmates.length>=2)menus.push(currentMenu('bond_reunion',villageId,actor,77,'乡音未改',
    '各走山门好些年，听见他说话，才认出是从前一同长大的人。',
    classmates.filter(option=>option.targetVillageReunionId===villageId).map(option=>({
      id:option.villageReunionMove,...villagePreview[option.villageReunionMove],
      command:{...villageReunionCommand(option),innerMonologue:monologue},
    }))));
  return menus;
}

function bondSeed(world:WorldState,focus:Cultivator):DirectorNudge|undefined{
  if(!available(world,focus))return;
  const steer=(peerId:string,origin:string,expiresTick:number):DirectorNudge|undefined=>{
    const matches=world.cultivators.filter(actor=>actor.id===peerId);
    if(matches.length!==1)return;
    const [peer]=matches;
    if(!peer.alive||peer.hp<=0||peer.positionPlane!==undefined||peer.locationId!==origin||
      activeAvatar(world)===peer||!directorKnownReachableSites(world,peer).some(site=>site.id===focus.locationId))return;
    return {kind:'travel_bias',actorId:peer.id,targetSiteId:focus.locationId,weight:35,
      expiresTick:Math.min(world.tick+6,expiresTick),reason:'bond_reunion'};
  };
  // Only a retained earlier refusal and a later real departure can justify this particular return.
  // Do not move either person here or assume the target will agree to any later invitation.
  for(const row of [...world.apprenticeshipReunions?.cases??[]].sort((a,b)=>b.askTick-a.askTick||(a.id<b.id?-1:a.id>b.id?1:0))){
    if(row.refusedTick===undefined||world.tick-row.refusedTick>=18||row.reunion||row.farewell||
      row.departure?.actorId!==focus.id||row.departure.toSiteId!==focus.locationId)continue;
    const source=world.events.filter(event=>event.id===`evt-${row.id}-refuse-${row.refusedTick}`);
    if(source.length!==1||source[0].tick!==row.refusedTick||source[0].witnessScope!=='participants'||
      source[0].category!=='diplomacy'||source[0].locationId!==row.askSiteId||
      source[0].actorIds.length!==2||source[0].actorIds[0]!==row.studentId||source[0].actorIds[1]!==row.mentorId)continue;
    const companionId=focus.id===row.mentorId?row.studentId:row.mentorId;
    const nudge=steer(companionId,row.askSiteId,row.refusedTick+18);
    if(nudge)return nudge;
  }
  // A documented spared opponent can meet again, but the director cannot invent the duel,
  // knowledge of an unseen site, or the whereabouts of an arriving partner.
  for(const row of [...world.mercyReunions?.cases??[]].sort((a,b)=>b.sparedTick-a.sparedTick||(a.id<b.id?-1:a.id>b.id?1:0))){
    if(row.outcome||row.reunion||row.departure?.actorId!==focus.id||row.departure.toSiteId!==focus.locationId||
      ![row.victorId,row.sparedId].includes(focus.id))continue;
    const original=world.events.filter(event=>event.id===row.sourceEventId);
    const left=world.events.filter(event=>event.id===`evt-${row.departure?.tick}-${row.id}-departure`);
    if(original.length!==1||left.length!==1||original[0].duelWinnerId!==row.victorId||
      original[0].category!=='combat'||original[0].actorIds[1]!==row.sparedId||
      left[0].category!=='intrigue'||left[0].witnessScope!=='participants'||left[0].locationId!==focus.locationId)continue;
    const peer=focus.id===row.victorId?row.sparedId:row.victorId;
    const nudge=steer(peer,row.siteId,world.tick+6);
    if(nudge)return nudge;
  }
  return undefined;
}
export const bondReunionHighlightSource=nativeSource('bond_reunion',bondMenus,bondSeed,true);

const aftermathPreview={
  remain:{label:'留在阵边过夜',consequences:[]},
  return:{label:'沿来路回去',consequences:[]},
  offer_care:{label:'开口问他可愿疗伤',consequences:['sequel']},
  accept_care:{label:'请同袍替我疗伤',consequences:['injury']},
} satisfies Record<string,{label:string;consequences:readonly ConsequenceTag[]}>;

export const sequelHighlightSource=nativeSource('sequel',(world,actor,tick)=>{
  const out:NativeMenu[]=[];
  const bell=availableBellWatchActions(actor,world,tick);
  const bellId=bell[0]?.targetBellWatchId;
  if(bellId&&bell.length>=2)out.push(currentMenu('sequel',bellId,actor,82,'山钟停了一夜',
    '听钟的时辰已过。平安信该怎么送出去，还得你亲自拿定主意。',
    bell.filter(option=>option.targetBellWatchId===bellId).map(option=>({
      id:option.bellWatchMove,label:option.bellWatchMove==='inspect'?'提灯去看钟梁':'循旧山路挨门报信',
      consequences:['sequel'],command:{...option,innerMonologue:monologue},
    }))));
  const aftermath=availableBattlefieldAftermathActions(actor,world,tick);
  const aftermathId=aftermath[0]?.targetBattlefieldAftermathId;
  if(aftermathId&&aftermath.length>=2)out.push(currentMenu('sequel',aftermathId,actor,78,'阵火熄了以后',
    '战声停了，阵痕还在。今夜留守，还是照拂眼前这位伤者？',
    aftermath.filter(option=>option.targetBattlefieldAftermathId===aftermathId).map(option=>({
      id:option.battlefieldAftermathMove,...aftermathPreview[option.battlefieldAftermathMove],
      command:{...battlefieldAftermathCommand(option),innerMonologue:monologue},
    }))));
  return out;
},seedPublicCampaignTravel,true);

export const SECONDARY_HIGHLIGHT_SOURCES: readonly HighlightSource[] = [
  daoPathHighlightSource, forbiddenArtHighlightSource, bondReunionHighlightSource, sequelHighlightSource,
];
