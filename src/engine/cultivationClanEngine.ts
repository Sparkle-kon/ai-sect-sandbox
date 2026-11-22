import type {ClanMove,CultivationClanChild,CultivationUnion} from '../types/cultivationClan';
import type {Cultivator,LLMDecisionPayload,LocationNode,WorldEvent,WorldState} from '../types/world';
import {activeDanxiaMedicineEscort} from './danxiaMedicineTerms';
import {boundaryReliefCheckpoint} from './boundaryReliefCheckpoint';
import {disasterShelterLocksTravel} from './disasterShelterCheckpoint';
import {activeEscortForActor} from './escortEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {activePilgrimageForActor} from './pilgrimageEngine';
import {activeRelocationForActor} from './relocationEngine';
import {activeCourierForActor} from './sealedCourierEngine';
import {sparringLocksActor} from './sparringEngine';
import {noteTerrainVisit} from './terrainEngine';
import {CLAN_ADULT_AGE,CLAN_BIRTH_EARNED_MONTHS,CLAN_CEREMONY_QI,CLAN_MATURITY_TICKS,CLAN_REPLY_TICKS,
  clanChildActorId,clanChildInborn,clanEventId} from './cultivationClanTerms';

type Side=Extract<ClanMove,'propose'>;
export type CultivationClanOption={action:'CULTIVATION_CLAN'}&(
  |{clanMove:Side;targetCultivatorId:string;targetCultivationUnionId?:never}
  |{clanMove:Exclude<ClanMove,Side>;targetCultivationUnionId:string;targetCultivatorId?:never});
export type ClanOption=CultivationClanOption;
const canonical=<T extends {id:string}>(rows:readonly T[],id:string)=>{
  let result:T|undefined;
  for(const row of rows){if(row.id!==id)continue;if(result)return undefined;result=row;}
  return result;
};
const liveAdult=(actor:Cultivator|undefined):actor is Cultivator=>
  !!actor&&actor.alive&&actor.hp>0&&actor.age>=CLAN_ADULT_AGE&&actor.positionPlane===undefined;
const clanSite=(site:LocationNode|undefined):site is LocationNode=>!!site&&!isScopedExpeditionGate(site)&&
  site.type!=='secret_realm'&&site.type!=='abyss';
function local(world:WorldState,actor:Cultivator,siteId=actor.locationId):boolean{
  return liveAdult(actor)&&actor.locationId===siteId&&actor.tribulation?.stage!=='lightning'&&actor.tribulation?.stage!=='heart_demon'&&
    !world.forbiddenDuels?.some(row=>row.attackerId===actor.id||row.defenderId===actor.id)&&
    !world.sieges.some(row=>(row.status==='marching'||row.status==='sieging')&&row.participantIds.includes(actor.id))&&
    !world.occasions.some(row=>(row.status==='registration'||row.status==='running')&&row.participantIds.includes(actor.id)&&
      !row.dungeon?.members.some(member=>member.actorId===actor.id&&member.leftTick!==undefined)&&
      !world.expeditionRescues.requests.some(rescue=>rescue.occasionId===row.id&&rescue.arrivedIds?.includes(actor.id)))&&
    !activeDanxiaMedicineEscort(world,actor)&&!activeEscortForActor(world,actor)&&!activePilgrimageForActor(world,actor)&&
    !activeRelocationForActor(world,actor)&&!activeCourierForActor(world,actor)&&!disasterShelterLocksTravel(world,actor)&&
    !expeditionRescueCheckpoint(world,actor)&&!boundaryReliefCheckpoint(world,actor)&&!sparringLocksActor(world,actor);
}
const rightDay=(sent:number,tick:number)=>tick>sent&&tick<=sent+CLAN_REPLY_TICKS;
function lineageOf(world:WorldState,actor:Cultivator):CultivationClanChild|undefined{
  const proof=actor.clanHeritage,child=proof&&canonical(world.cultivationClans?.children??[],proof.childId);
  return child&&child.maturedTick!==undefined&&clanChildActorId(child.id)===actor.id&&child.clanId===proof?.clanId?child:undefined;
}
function bygoneParents(world:WorldState,actorId:string):Set<string>{
  const edges=new Map<string,readonly [string,string]>();
  for(const child of world.cultivationClans?.children??[])if(child.maturedTick!==undefined)edges.set(clanChildActorId(child.id),child.parentIds);
  const ancestors=new Set<string>();
  const stack=[actorId];
  while(stack.length){
    const id=stack.pop();
    if(!id||ancestors.has(id))continue;
    ancestors.add(id);
    for(const parent of edges.get(id)??[])if(!ancestors.has(parent))stack.push(parent);
  }
  return ancestors;
}
function occupied(world:WorldState,unions:readonly CultivationUnion[],who:string){
  return unions.some(union=>{
    const other=union.parents.find(id=>id!==who);
    const partner=other&&canonical(world.cultivators,other);
    return union.parents.includes(who)&&(union.status==='proposed'||union.status==='accepted'||union.status==='bonded')&&
      !!partner&&partner.alive&&partner.hp>0;
  });
}
const acted=(rows:readonly CultivationUnion[],id:string,tick:number)=>rows.some(row=>{
  const [first,second]=row.parents,plan=row.plan;
  return first===id&&row.proposedTick===tick||second===id&&(row.acceptedTick===tick||row.status==='refused'&&row.closedTick===tick)||
    row.ceremony?.actorId===id&&row.ceremony.tick===tick||row.ceremonyOffer?.actorId===id&&row.ceremonyOffer.tick===tick||
    plan?.offeredBy===id&&plan.offeredTick===tick||plan?.acceptedBy===id&&plan.acceptedTick===tick||
    plan?.status==='declined'&&plan.closedTick===tick&&plan.offeredBy!==id&&row.parents.includes(id);
});
const action='CULTIVATION_CLAN' as const;
export function availableCultivationClanActions(actor:Cultivator,world:WorldState,executionTick=world.tick):CultivationClanOption[]{
  if(executionTick!==world.tick&&executionTick!==world.tick+1||canonical(world.cultivators,actor.id)!==actor||
    !clanSite(canonical(world.locations,actor.locationId))||!local(world,actor))return [];
  const unions=world.cultivationClans?.unions??[];
  if(acted(unions,actor.id,executionTick))return [];
  const options:CultivationClanOption[]=[];
  for(const union of unions){
    if(!union.parents.includes(actor.id)||actor.locationId!==union.siteId)continue;
    const other=canonical(world.cultivators,union.parents[0]===actor.id?union.parents[1]:union.parents[0]);
    if(!other||!local(world,other,union.siteId))continue;
    const option=(clanMove:Exclude<ClanMove,Side>)=>({action,clanMove,targetCultivationUnionId:union.id});
    if(union.status==='proposed'&&union.parents[1]===actor.id&&rightDay(union.proposedTick,executionTick)){
      options.push(option('accept'),option('refuse'));
    }
    if(union.status==='accepted'&&union.acceptedTick!==undefined&&executionTick>union.acceptedTick){
      const prior=union.ceremonyOffer;
      if(!prior||executionTick>prior.tick+CLAN_REPLY_TICKS)options.push(option('ceremony_offer'));
      else if(prior.actorId!==actor.id&&rightDay(prior.tick,executionTick)&&actor.qiProgress>=CLAN_CEREMONY_QI&&
        other.qiProgress>=CLAN_CEREMONY_QI)options.push(option('ceremony'));
    }
    if(union.status==='bonded'&&union.ceremony&&executionTick>union.ceremony.tick){
      const plan=union.plan;
      if(!plan)options.push(option('family_offer'));
      else if(plan.status==='offered'&&plan.offeredBy!==actor.id&&rightDay(plan.offeredTick,executionTick)){
        options.push(option('family_accept'),option('family_refuse'));
      }
    }
  }
  if(!occupied(world,unions,actor.id)){
    const ancestors=bygoneParents(world,actor.id);
    for(const other of world.cultivators){
      if(other.id===actor.id||other.locationId!==actor.locationId||!local(world,other)||canonical(world.cultivators,other.id)!==other||
        occupied(world,unions,other.id))continue;
      if([...bygoneParents(world,other.id)].some(id=>ancestors.has(id)))continue;
      options.push({action,clanMove:'propose',targetCultivatorId:other.id});
    }
  }
  return options;
}
const fields:ReadonlySet<string>=new Set(['chosenAction','clanMove','innerMonologue','targetCultivationUnionId','targetCultivatorId']);
const prose:Record<ClanMove,readonly [string,string]>={
  propose:['灯下相问','一人亲自递问，尚无对方同意之证。'],
  accept:['原约两相允','原先受邀的修士亲自应约；大典尚未举行。'],
  refuse:['谢却此约','受邀修士亲自谢绝，此后不作已结道侣记。'],
  ceremony_offer:['备礼入坛','一方在原处提出大典，须另一人日后到场亲自应礼。'],
  ceremony:['两心同证，道侣礼成','两位修士各出八点灵气，在实地共行周天。礼成之后，始以道侣相称。'],
  family_offer:['灯下议立家','一方提出共立家族；另一方仍可谢绝，未作有后之记。'],
  family_accept:['共守家愿','双方各自同意立家，后续只按真实同处的月份纪实。'],
  family_refuse:['暂不议家','另一方明白谢绝立家，本次不入候生之册。'],
};
function event(world:WorldState,row:CultivationUnion,move:ClanMove|'birth'|'mature'|'lost'|'expired',title:string,description:string,
  actorIds:string[],publicSource=false):WorldEvent{
  return {id:clanEventId(world.tick,row.id,move),tick:world.tick,year:world.year,month:world.month,
    title,description,category:move==='mature'?'breakthrough':'diplomacy',actorIds,
    locationId:row.siteId,...(publicSource?{}:{witnessScope:'participants' as const})};
}
export function resolveCultivationClanAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!==action||Object.keys(decision).some(key=>!fields.has(key)))return null;
  const option=availableCultivationClanActions(actor,world).find(row=>row.clanMove===decision.clanMove&&
    row.targetCultivatorId===decision.targetCultivatorId&&row.targetCultivationUnionId===decision.targetCultivationUnionId);
  if(!option)return null;
  const move=option.clanMove,tick=world.tick;
  const [title,text]=prose[move];
  if(option.clanMove==='propose'){
    const other=canonical(world.cultivators,option.targetCultivatorId);
    if(!other)return null;
    const state=world.cultivationClans??(world.cultivationClans={nextId:1,unions:[],children:[]});
    const serial=state.nextId++,ancestors=[...new Set([lineageOf(world,actor)?.clanId,lineageOf(world,other)?.clanId]
      .filter((id):id is string=>id!==undefined))].sort();
    const union:CultivationUnion={id:`clan-union-${serial}`,clanId:ancestors.length===1?ancestors[0]:`clan-line-${serial}`,
      ...(ancestors.length>1?{ancestorClanIds:ancestors}:{}),parents:[actor.id,other.id],siteId:actor.locationId,
      proposedTick:tick,status:'proposed'};
    state.unions.push(union);
    return event(world,union,move,title,text,[actor.id,other.id]);
  }
  const union=canonical(world.cultivationClans?.unions??[],option.targetCultivationUnionId);
  const otherId=union?.parents.find(id=>id!==actor.id),other=otherId&&canonical(world.cultivators,otherId);
  if(!union||!other)return null;
  if(move==='accept'){union.status='accepted';union.acceptedTick=tick;}
  else if(move==='refuse'){union.status='refused';union.closedTick=tick;}
  else if(move==='ceremony_offer'){union.ceremonyOffer={actorId:actor.id,tick};}
  else if(move==='ceremony'){
    actor.qiProgress-=CLAN_CEREMONY_QI;other.qiProgress-=CLAN_CEREMONY_QI;
    union.ceremony={actorId:actor.id,tick,qiPaidEach:CLAN_CEREMONY_QI};
    union.status='bonded';
  }else if(move==='family_offer'){union.plan={offeredBy:actor.id,offeredTick:tick,status:'offered',earnedTicks:[]};}
  else if(move==='family_accept'&&union.plan){
    union.plan.status='expecting';union.plan.acceptedBy=actor.id;union.plan.acceptedTick=tick;
  }else if(move==='family_refuse'&&union.plan){union.plan.status='declined';union.plan.closedTick=tick;}
  else return null;
  return event(world,union,move,title,text,[actor.id,other.id],move==='ceremony');
}
function matureBody(child:CultivationClanChild):Cultivator{
  const root=child.roots[0],maxHp=120+(child.innateTrait==='steadfast_vessel'?12:0);
  return {id:clanChildActorId(child.id),name:child.name,gender:child.gender,title:'世家初修',sectId:'',sectRank:'外门弟子',
    clanHeritage:{childId:child.id,clanId:child.clanId,roots:[...child.roots],innateTrait:child.innateTrait},
    contribution:0,transgressions:0,realm:'练气',realmStage:1,qiProgress:child.innateTrait==='clear_meridians'?6:0,
    hp:maxHp,maxHp,combatPower:100,age:CLAN_ADULT_AGE,lifespan:120,personality:'苟道',locationId:child.siteId,spiritStones:0,karma:0,
    currentAction:'REST',innerMonologue:'前路且从第一步修起。',secretGoal:'立稳修行根基',spiritRoot:root,
    technique:{name:'入门吐纳诀',spiritRoot:root},techniqueMastery:child.innateTrait==='keen_insight'?4:0,
    herbs:{jade_leaf:0,earth_root:0,star_bloom:0,shadow_moss:0},pills:{foundation:0,golden:0,barrier:0,heart_poison:0},
    pillToxicity:0,exploredTileIds:[],artifacts:[],memories:[],coreMemories:[],memorySequence:0,reflections:[],rumors:[],alive:true};
}
export function advanceCultivationClans(world:WorldState):WorldEvent[]{
  const state=world.cultivationClans;
  if(!state)return [];
  const events:WorldEvent[]=[];
  for(const union of state.unions){
    if(union.status==='proposed'&&world.tick>union.proposedTick+CLAN_REPLY_TICKS){
      union.status='expired';union.closedTick=world.tick;
      events.push(event(world,union,'expired','初约已过','此前邀约逾期，未自动替任何人同意。',[...union.parents]));
    }
    const plan=union.plan;
    if(plan?.status!=='expecting'||plan.acceptedTick===undefined||world.tick<=plan.acceptedTick||
      plan.earnedTicks.at(-1)===world.tick)continue;
    const a=canonical(world.cultivators,union.parents[0]),b=canonical(world.cultivators,union.parents[1]);
    if(!a||!b||!a.alive||!b.alive||a.hp<=0||b.hp<=0){
      plan.status='lost';plan.closedTick=world.tick;
      events.push(event(world,union,'lost','立家愿止','原先的两位当事人已经无法同守此愿，没有记作新生。',[...union.parents]));
      continue;
    }
    if(!clanSite(canonical(world.locations,union.siteId))||!local(world,a,union.siteId)||!local(world,b,union.siteId))continue;
    plan.earnedTicks.push(world.tick);
    if(plan.earnedTicks.length<CLAN_BIRTH_EARNED_MONTHS)continue;
    const childId=`clan-child-${union.id}`,parentRoots:[Cultivator['spiritRoot'],Cultivator['spiritRoot']]=[a.spiritRoot,b.spiritRoot];
    const record:CultivationClanChild={id:childId,clanId:union.clanId,unionId:union.id,parentIds:[...union.parents],siteId:union.siteId,
      birthTick:world.tick,maturesAtTick:world.tick+CLAN_MATURITY_TICKS,parentRoots,...clanChildInborn(world.random.seed,childId,parentRoots)};
    plan.status='born';plan.closedTick=world.tick;plan.childId=childId;
    state.children.push(record);
    events.push(event(world,union,'birth','家灯添一盏','旧愿已守足实月，族中确有新生；此时仍不是可行动的修士。',[...union.parents]));
  }
  for(const child of state.children){
    if(child.maturedTick!==undefined||world.tick<child.maturesAtTick||!clanSite(canonical(world.locations,child.siteId))||
      world.cultivators.some(row=>row.id===clanChildActorId(child.id)))continue;
    const union=canonical(state.unions,child.unionId);
    if(!union)continue;
    const actor=matureBody(child);
    child.maturedTick=world.tick;
    world.cultivators.push(actor);
    noteTerrainVisit(world,actor);
    events.push(event(world,union,'mature','家门后辈踏入仙途','真正长成后，以独立未入宗的新修身份行世。',[actor.id],true));
  }
  return events;
}
export function cultivationClanActionApplied(world:WorldState,actorId:string,option:CultivationClanOption):boolean{
  const rows=world.cultivationClans?.unions??[];
  const union=option.clanMove==='propose'?rows.find(row=>row.proposedTick===world.tick&&row.parents[0]===actorId&&
    row.parents[1]===option.targetCultivatorId):canonical(rows,option.targetCultivationUnionId);
  if(!union)return false;
  const key=clanEventId(world.tick,union.id,option.clanMove);
  const receipt=canonical(world.events,key);
  return receipt?.tick===world.tick&&receipt.actorIds[0]===actorId;
}
export interface CultivationClanView {
  actorId:string;
  options:CultivationClanOption[];
  unions:{id:string;clanId:string;parents:[string,string];names:[string,string];siteName:string;status:CultivationUnion['status'];
    own:boolean;ceremony?:CultivationUnion['ceremony'];ceremonyOffer?:CultivationUnion['ceremonyOffer'];plan?:CultivationUnion['plan'];children:CultivationClanChild[]}[];
}
export function projectCultivationClans(world:WorldState,viewer:Cultivator|undefined):CultivationClanView|undefined{
  if(!liveAdult(viewer)||canonical(world.cultivators,viewer.id)!==viewer)return undefined;
  const state=world.cultivationClans,knownLineage=lineageOf(world,viewer);
  const options=availableCultivationClanActions(viewer,world,world.tick+1);
  const unions:CultivationClanView['unions']=(state?.unions??[]).flatMap(row=>{
    const own=row.parents.includes(viewer.id),lineage=knownLineage?.unionId===row.id;
    const site=canonical(world.locations,row.siteId);
    if(!clanSite(site)||!own&&!lineage&&(row.status!=='bonded'||!row.ceremony||!local(world,viewer,row.siteId)))return [];
    const a=canonical(world.cultivators,row.parents[0]),b=canonical(world.cultivators,row.parents[1]);
    if(!a||!b)return [];
    const children=own||lineage?(state?.children??[]).filter(child=>child.unionId===row.id).map(child=>structuredClone(child)):[];
    return [{id:row.id,clanId:row.clanId,parents:[...row.parents],names:[a.name,b.name],siteName:site.name,status:row.status,own,
      ...(row.ceremony?{ceremony:{...row.ceremony}}:{}),...(row.ceremonyOffer&&own?{ceremonyOffer:{...row.ceremonyOffer}}:{}),
      ...(row.plan&&own?{plan:structuredClone(row.plan)}:{}),children}];
  });
  return !options.length&&!unions.length?undefined:{actorId:viewer.id,options,unions};
}
