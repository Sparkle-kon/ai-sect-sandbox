import type { GrandSiegeRound } from '../src/types/grandSiege';
import type { SectSiege } from '../src/types/world';
import { availableCampaignAssemblyActions } from '../src/engine/campaignAssembly';
import { currentEventIds, enteredEpisodeIds, type StoryAuditProbe, type StoryAuditTurn } from './storyTriggerAuditTerms';

function matchingRoundIds(turn:StoryAuditTurn,pick:(row:GrandSiegeRound)=>boolean):string[]{
  const {after,events}=turn;
  const current=new Map(events.filter(event=>event.tick===after.tick&&event.witnessScope===undefined).map(event=>[event.id,event]));
  return after.sieges.flatMap(siege=>(siege.theatre?.rounds??[]).filter(round=>{
    const event=current.get(round.sourceEventId);
    return round.tick===after.tick&&siege.theatre?.arrivedTick!==undefined&&siege.theatre.arrivedTick<round.tick&&
      round.sourceEventId===`evt-${round.tick}-dip-${siege.id}`&&event?.locationId===siege.destinationId&&pick(round);
  }).map(round=>round.sourceEventId));
}

function currentEvent(turn:StoryAuditTurn,id:string){
  return turn.events.find(event=>event.tick===turn.after.tick&&event.id===id);
}
function enteredUpperPassage(turn:StoryAuditTurn):string[]{
  return enteredEpisodeIds(turn.before.upperPassage?.journeys??[],turn.after.upperPassage?.journeys??[],row=>row.id)
    .filter(id=>currentEvent(turn,`evt-${id}-enter-${turn.after.tick}`)!==undefined);
}
function paidCalamities(turn:StoryAuditTurn):string[]{
  const paid=currentEventIds(turn,/^evt-calamity-array-paid-/u);
  return turn.after.mapHazards
    .filter(hazard=>paid.some(eventId=>eventId.startsWith(`evt-calamity-array-paid-${hazard.id}-`)&&eventId.endsWith(`-${turn.after.tick}`)))
    .map(hazard=>`${hazard.id}:${turn.after.tick}`);
}
function actualCampaignOpportunities(turn:StoryAuditTurn):string[]{
  const {after}=turn;
  const arrived=after.sieges.filter((siege):siege is SectSiege=>
    siege.status==='sieging'&&siege.theatre?.arrivedTick===after.tick&&
    currentEvent(turn,`evt-${after.tick}-dip-${siege.id}`)?.locationId===siege.destinationId);
  if(!arrived.length)return [];
  const eligible=new Set<string>();
  for(const actor of after.cultivators){
    if(!actor.alive||actor.hp<=0||!arrived.some(siege=>actor.locationId===siege.destinationId||siege.participantIds.includes(actor.id)))continue;
    for(const option of availableCampaignAssemblyActions(actor,after,after.tick+1))
      if(arrived.some(siege=>siege.id===option.siegeId))eligible.add(option.siegeId);
    if(eligible.size===arrived.length)break;
  }
  return [...eligible];
}

/** Count a native admission, not merely an upstream scenario or old log prose. */
export const storyTriggerAuditPhase19_20 = [
  {
    id:'P19-1',title:'主角扶危的三回合逃亡戏',mode:'native',
    evidence:'新增 protagonistFlights 记录：原生追捕、已应允引路和探明离路均经回合末实证；每次开场记一幕，不叠加后三轮。',
    observe:({before,after})=>enteredEpisodeIds(before.protagonistFlights??[],after.protagonistFlights??[],
      row=>row.openedTick<=after.tick?row.id:undefined),
  },
  {
    id:'P19-2',title:'心魔余波与道心自疗',mode:'native',
    evidence:'本月生还者新增 heartDemonAftermath，且完整回合事件含其 resultEventId；一次真实渡心魔记一次，不把平常调息记作余波。',
    observe:turn=>turn.after.cultivators.flatMap(actor=>{
      const row=actor.heartDemonAftermath;
      return row&&row.resolvedTick===turn.after.tick&&currentEvent(turn,row.resultEventId)?.actorIds.includes(actor.id)?[row.trialId]:[];
    }),
  },
  {
    id:'P19-3',title:'万剑来朝的结阵战景',mode:'native',
    evidence:'实际攻山回合的 GrandSiegeRound 与本月精确原始事件同址，且阵力下降、先锋实交或守阵改变伤势；只计有画面依据的回合。',
    observe:turn=>matchingRoundIds(turn,row=>row.wallBefore>row.wallAfter||row.clash!==undefined||row.hero!==undefined),
  },
  {
    id:'P19-4',title:'拜山试心、宗门破局三择',mode:'player-triggered',
    evidence:'本月确有 guided 的 sect-gate 奇遇记录与对应开场事件；附身、到门、掌门在场等均由原规则入场，不把寻常过路当试心。',
    observe:turn=>(turn.after.roguelikeEncounters??[]).flatMap(row=>
      row.kind==='sect-gate'&&row.guided&&row.openedTick===turn.after.tick&&currentEvent(turn,`evt-${row.id}-open`)?[row.id]:[]),
  },
  {
    id:'P19-5',title:'宿缘重逢的主角交接',mode:'native',
    evidence:'新开主角弧同时带真实 predecessorArcId 与 handoff，且当月开始；普通新主角或旧弧续展不算交棒。',
    observe:({before,after})=>enteredEpisodeIds(before.protagonistSuccession.arcs,after.protagonistSuccession.arcs,
      row=>row.handoff&&row.predecessorArcId&&row.openedTick<=after.tick?row.id:undefined),
  },
  {
    id:'P19-6',title:'同一场决战的不同目击视点',mode:'native',
    evidence:'一轮原生攻山来源与当月回合完全一致，同时有实际攻方和守方名册。只计可供双方读取的同场战斗，不计浏览器切视角次数。',
    observe:turn=>matchingRoundIds(turn,row=>row.attackers.length>0&&row.defenders.length>0),
  },
  {
    id:'P19-7',title:'飞升渡口卷轴与入界动画',mode:'native',
    evidence:'实际新增上界旅程且完整回合中有同旅程 enter 原事件。开放入口、切换视图和空进度都不算入界。',
    observe:enteredUpperPassage,
  },
  {
    id:'P19-8',title:'夜宴前厅与私语清晰分场',mode:'native',
    evidence:'实际完成的大比决赛在终局月份产生该场次唯一 hall 来源事件。无宴前后对话的浏览或私下阅读不另计。',
    observe:turn=>turn.after.occasions.flatMap(occasion=>{
      if(occasion.kind!=='tournament'||occasion.arena?.rounds.at(-1)?.tick!==turn.after.tick)return [];
      const hall=currentEvent(turn,`evt-banquet-${occasion.id}-hall-${turn.after.tick}`);
      return hall?.locationId===occasion.locationId?[occasion.id]:[];
    }),
  },
  {
    id:'P19-9',title:'绘景与界面权限边界模块化',mode:'interface',
    evidence:'无独立剧情触发。以 mapMotionIntegration 和 grandSiegeWitnessIntegration 核对画布、键盘与当前参战视角，长局后台不能量 UX。',
  },
  {
    id:'P19-10',title:'故事模式长局回顾与回看返回',mode:'interface',
    evidence:'无独立剧情触发。storyRecapNative 核当前分支真实回顾，storyRecapIntegration 核返回焦点；用户没有点击不计零次剧情。',
  },
  {
    id:'P20-1',title:'同一险境的两条命轨',mode:'interface',
    evidence:'主线回合不会自动分叉。dungeonCounterfactualNative 从真实秘境同源快照运行并验证两条选择，不用普通秘境次数代替玩家并行体验。',
  },
  {
    id:'P20-2',title:'战场残响与归来的幸存者',mode:'native',
    evidence:'本月私有 battlefield-revisit 的实际幸存者返回事件；原生函数已核亲历阵破和重抵实地。结算战斗本身不算重返。',
    observe:turn=>currentEventIds(turn,/^evt-battlefield-revisit-.+-return-[1-9]\d*$/u),
  },
  {
    id:'P20-3',title:'灵兽护主与断契时刻',mode:'native',
    evidence:'真实濒危交锋的 beast-duel open 原事件。不计单纯拥有灵兽、本来无需护主的切磋或遥远灵宠。',
    observe:turn=>currentEventIds(turn,/^evt-beast-duel-.+-open-[1-9]\d*$/u),
  },
  {
    id:'P20-4',title:'青黄两阵的同场守望',mode:'player-triggered',
    evidence:'同一真实灾害、同一月存在 calamity-array-paid 结算事件则记一次守阵；双宗各付费不重复计，不算仅立意或旧瘴灾。',
    observe:paidCalamities,
  },
  {
    id:'P20-5',title:'重走师门旧剑式',mode:'native',
    evidence:'本月紧邻实际交锋产生私有 noticed 原件。师承或练习本身不算，挥剑后的公开剪影不再加一次。',
    observe:turn=>currentEventIds(turn,/^evt-school-form-private-noticed-.+$/u),
  },
  {
    id:'P20-6',title:'异域夜猎与辨认妖迹',mode:'player-triggered',
    evidence:'原生北岭夜猎 trace 命令的实际收据，按当事人月份计；不把大地图上一只异域妖兽当猎事开场。',
    observe:turn=>currentEventIds(turn,/^evt-frontier-night-hunt-[1-9]\d*-.+-trace$/u),
  },
  {
    id:'P20-7',title:'异闻里的三种真相',mode:'native',
    evidence:'实际现场询问见证所得的 witness-inquiry ask 原事件。不计榜文抄录和虚构口供，也不把查阅认成裁断。',
    observe:turn=>currentEventIds(turn,/^evt-witness-inquiry-ask-[1-9]\d*-.+$/u),
  },
  {
    id:'P20-8',title:'诸宗问鼎的誓师剧场',mode:'native',
    evidence:'本月确有演武联军抵达原事件，且至少一个在场候选已有原生改守、议和或赴阵许可。仅宣战、未抵达或无权的队伍不算。',
    observe:actualCampaignOpportunities,
  },
  {
    id:'P20-9',title:'可键盘与单手游玩的临战场景',mode:'interface',
    evidence:'无独立剧情触发。schoolFormDuelCard 验证同一临战卡的历史只读、重复命令、键盘和焦点。普通斗法回合不能证明手机触控。',
  },
  {
    id:'P20-10',title:'新手故事只亮下一件事',mode:'interface',
    evidence:'无独立剧情触发。nextStoryGuidanceNative / nextStoryGuidanceUi 验证现有玩法提示与当月合法动作，不重复计算所提示的大比、秘境或心魔。',
  },
] satisfies readonly StoryAuditProbe[];
