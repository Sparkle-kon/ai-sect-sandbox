import type {Cultivator,LLMDecisionPayload,LocationNode,ResourceFlowAccount,WorldEvent,WorldState} from '../types/world';
import {
  CRAFT_TRAINING_OFFER_TICKS as OFFER,CRAFT_TRAINING_WORK_TICKS as WORK,
  craftTrainingArtifactId,craftTrainingBlankId,craftTrainingEventId,craftTrainingId,
  type CraftTrainingMove,type CraftTrainingOption,type CraftTrainingPhase,type CraftTrainingProject,type CraftTrainingStage,
} from '../types/craftTraining';
import {ARTIFACT_RULES} from './artifactEngine';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {canUseFurnace,claimFurnaceUse} from './furnaceReservationEngine';
import {activeRelocationForSect} from './relocationEngine';
import {flowActor,recordResourceFlow} from './resourceFlowEngine';
import {onLowerPlane} from './upperPassageIsolation';
import {WORKSHOP_CAPACITY,workshopGradeForScore} from './workshopEngine';

export type {CraftTrainingOption} from '../types/craftTraining';
export {CRAFT_TRAINING_OFFER_TICKS,CRAFT_TRAINING_WORK_TICKS} from '../types/craftTraining';
const rule=ARTIFACT_RULES['法器'];
export function craftTrainingCosts(){
  const stones=rule.stones,blankStones=Math.ceil(stones/2);
  return {stones,roots:2,blankStones,finishStones:stones-blankStones};
}
export function craftTrainingGradeScore(masteryBefore:number,furnaceGrade:number,rootMatched:boolean,strained:boolean):number{
  return Math.max(0,Math.min(100,30+Math.floor(masteryBefore/2)+10*(furnaceGrade-rule.grade)+
    (rootMatched?8:0)-(strained?10:0)));
}
const person=(world:WorldState,id:string)=>world.cultivators.find(row=>row.id===id);
const alive=(actor:Cultivator|undefined):actor is Cultivator=>!!actor&&actor.alive&&actor.hp>0;
const live=(row:CraftTrainingProject)=>row.status==='offered'||row.status==='funded'||row.status==='blank';
const deadline=(row:CraftTrainingProject)=>row.workExpiresTick??row.offerExpiresTick;
const party=(row:CraftTrainingProject,id:string)=>row.keeperId===id||row.traineeIds.includes(id);
const scope=(row:CraftTrainingProject)=>({kind:'participants' as const,actorIds:[row.keeperId,...row.traineeIds]});
const vault=(id:string):ResourceFlowAccount=>({kind:'craft_training',id});
const siteAt=(world:WorldState,id:string)=>world.locations.find(site=>site.id===id);
const sameSite=(world:WorldState,actor:Cultivator|undefined,site:LocationNode,tick:number):actor is Cultivator=>
  alive(actor)&&onLowerPlane(actor)&&doctrineFoundingPhysicallyAt(world,actor,site.id,tick)&&!expeditionRescueCheckpoint(world,actor);
const qualified=(world:WorldState,actor:Cultivator|undefined,site:LocationNode,tick:number):actor is Cultivator=>
  sameSite(world,actor,site,tick)&&site.furnaceGrade>=rule.grade&&Number.isFinite(actor.techniqueMastery)&&
  actor.techniqueMastery>=rule.mastery&&actor.techniqueMastery<=100;
function legalWorkshop(world:WorldState,siteId:string,sectId:string){
  const site=siteAt(world,siteId),sect=world.sects.find(row=>row.id===sectId);
  return site?.type==='sect_hq'&&site.ownerSectId===sectId&&site.furnaceGrade>=rule.grade&&
    sect?.headquartersId===siteId&&!activeRelocationForSect(world,sect.id)?{site,sect}:undefined;
}
function keeperFor(world:WorldState,siteId:string,sectId:string,id:string,tick:number){
  const workshop=legalWorkshop(world,siteId,sectId),keeper=person(world,id);
  return workshop?.sect.leaderId===id&&sameSite(world,keeper,workshop.site,tick)&&keeper.sectId===sectId?{...workshop,keeper}:undefined;
}
function canSponsor(keeper:Cultivator){
  const c=craftTrainingCosts();
  return Number.isFinite(keeper.spiritStones)&&keeper.spiritStones>=c.stones&&Number.isSafeInteger(keeper.herbs.earth_root)&&
    keeper.herbs.earth_root>=c.roots;
}
function hasRemainder(row:CraftTrainingProject){
  const c=craftTrainingCosts();
  const stones=row.status==='offered'?0:row.status==='funded'?c.stones:c.finishStones;
  const roots=row.status==='offered'?0:row.status==='funded'?c.roots:1;
  return row.escrowStones===stones&&row.escrowRoots===roots&&!row.refundedStones&&!row.refundedRoots&&row.closedTick===undefined;
}
const hasItem=(world:WorldState,id:string)=>world.cultivators.some(actor=>actor.artifacts.some(item=>item.id===id))||
  world.estates.entries.some(estate=>estate.holdings.artifacts.some(item=>item.id===id)||estate.distributed.artifactIds.includes(id))||
  world.toolLoans.loans.some(row=>row.custody?.id===id)||world.artifactSalvages.receipts.some(row=>row.artifactId===id);
function actualFinishGrade(actor:Cultivator,site:LocationNode){
  const {furnaceGrade}=site,rootMatched=actor.spiritRoot===site.spiritRoot,strained=actor.hp<actor.maxHp/2;
  const qualityScore=craftTrainingGradeScore(actor.techniqueMastery,furnaceGrade,rootMatched,strained);
  return {furnaceGrade,rootMatched,strained,qualityScore,grade:workshopGradeForScore(qualityScore)};
}
const reply=(row:CraftTrainingProject,craftTrainingMove:Exclude<CraftTrainingMove,'offer'>):CraftTrainingOption=>
  ({action:'CRAFT_TRAINING',craftTrainingMove,targetCraftTrainingId:row.id});
function realBlank(row:CraftTrainingProject){
  const blank=row.blank;
  return blank&&blank.id===craftTrainingBlankId(row.id)&&blank.actorId===row.traineeIds[0]&&blank.tick>(row.fundedTick??Infinity)&&
    blank.stonesUsed===craftTrainingCosts().blankStones&&blank.rootsUsed===1&&
    blank.masteryAfter===Math.min(100,blank.masteryBefore+1)?blank:undefined;
}

export function availableCraftTrainingActions(actor:Cultivator,world:WorldState,tick=world.tick):CraftTrainingOption[]{
  if((tick!==world.tick&&tick!==world.tick+1)||person(world,actor.id)!==actor||!alive(actor))return [];
  const rows=world.craftTraining?.projects??[];
  if(rows.some(row=>row.keeperId===actor.id&&row.offeredTick===tick||
    row.traineeIds[0]===actor.id&&row.firstJoinedTick===tick||row.traineeIds[1]===actor.id&&row.secondJoinedTick===tick||
    row.blank?.actorId===actor.id&&row.blank.tick===tick||row.finish?.actorId===actor.id&&row.finish.tick===tick||
    row.closedById===actor.id&&row.closedTick===tick))return [];
  const open=rows.filter(row=>live(row)&&tick<deadline(row));
  const row=open.find(row=>party(row,actor.id));
  if(row){
    const site=siteAt(world,row.siteId);
    if(!site||!sameSite(world,actor,site,tick)||tick<=row.offeredTick||!hasRemainder(row))return [];
    const authority=keeperFor(world,row.siteId,row.sectId,row.keeperId,tick);
    if(actor.id===row.keeperId)return authority?[reply(row,'withdraw')]:[];
    const options=[reply(row,'decline')];
    if(!authority||!qualified(world,actor,site,tick))return options;
    if(row.status==='offered'){
      const first=actor.id===row.traineeIds[0],own=first?row.firstJoinedTick:row.secondJoinedTick;
      const other=first?row.secondJoinedTick:row.firstJoinedTick;
      const peer=person(world,row.traineeIds[first?1:0]);
      if(own===undefined&&(other===undefined||qualified(world,peer,site,tick)&&canSponsor(authority.keeper)))options.push(reply(row,'join'));
    }else if(row.status==='funded'&&actor.id===row.traineeIds[0]&&tick>(row.fundedTick??Infinity)&&!row.blank&&
      canUseFurnace(world,actor,site.id,'forge',undefined,tick))options.push(reply(row,'blank'));
    else if(row.status==='blank'&&actor.id===row.traineeIds[1]&&!row.finish){
      const blank=realBlank(row);
      const possible=actualFinishGrade(actor,site);
      if(blank&&tick>blank.tick&&canUseFurnace(world,actor,site.id,'forge',undefined,tick)&&
        (possible.grade==='failed'||authority.keeper.artifacts.length<WORKSHOP_CAPACITY&&!hasItem(world,craftTrainingArtifactId(row.id))))
        options.push(reply(row,'finish'));
    }
    return options;
  }
  const authority=keeperFor(world,actor.locationId,actor.sectId,actor.id,tick);
  if(!authority||!canSponsor(actor)||(world.craftTraining?.nextId??1)>100_000||open.some(row=>row.siteId===authority.site.id))return [];
  const reserved=new Set(open.flatMap(row=>[row.keeperId,...row.traineeIds]));
  const candidates=world.cultivators.filter(other=>other.id!==actor.id&&!reserved.has(other.id)&&qualified(world,other,authority.site,tick))
    .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).slice(0,4);
  return candidates.flatMap((first):CraftTrainingOption[]=>candidates.filter(second=>second.id!==first.id).map(second=>({
    action:'CRAFT_TRAINING',craftTrainingMove:'offer',targetCultivatorId:first.id,targetCraftTraineeId:second.id,
  })));
}

function scene(world:WorldState,row:CraftTrainingProject,phase:CraftTrainingPhase,title:string,description:string,workerId?:string):WorldEvent{
  return {id:craftTrainingEventId(row.id,world.tick,phase),tick:world.tick,year:world.year,month:world.month,locationId:row.siteId,
    actorIds:workerId?[workerId]:scope(row).actorIds,witnessScope:'participants',category:'diplomacy',title,description};
}
function refund(world:WorldState,row:CraftTrainingProject,status:'declined'|'withdrawn'|'unavailable'|'expired',
  actorId?:string,reason?:CraftTrainingProject['unavailableReason']):WorldEvent|null{
  const keeper=person(world,row.keeperId);
  if(!keeper||!live(row)||!hasRemainder(row))return null;
  const {escrowStones:stones,escrowRoots:roots}=row;
  keeper.spiritStones+=stones;keeper.herbs.earth_root+=roots;
  const transfer={kind:'transfer' as const,mechanism:'workshop' as const,reason:'craft_training_refund',
    from:vault(row.id),to:flowActor(keeper.id),refId:row.id,visibility:scope(row)};
  if(stones)recordResourceFlow(world,{...transfer,good:'stone',amount:stones});
  if(roots)recordResourceFlow(world,{...transfer,good:'earth_root',amount:roots});
  row.escrowStones=0;row.escrowRoots=0;row.refundedStones=stones;row.refundedRoots=roots;row.status=status;row.closedTick=world.tick;
  if(actorId)row.closedById=actorId;
  if(reason)row.unavailableReason=reason;
  const titles={declined:'徒者谢绝合练',withdrawn:'炉主收回合练',expired:'炉前人约已尽',unavailable:'旧炉与署名人无法再齐'};
  return scene(world,row,status,titles[status],`只退原炉主留存的${stones}枚灵石与${roots}株玄土根。已用的实料和已记的手作不重算。`);
}
function exact(decision:LLMDecisionPayload,option:CraftTrainingOption){
  const keys=option.craftTrainingMove==='offer'?['targetCultivatorId','targetCraftTraineeId']:['targetCraftTrainingId'];
  return option.craftTrainingMove===decision.craftTrainingMove&&
    option.targetCultivatorId===decision.targetCultivatorId&&option.targetCraftTraineeId===decision.targetCraftTraineeId&&
    option.targetCraftTrainingId===decision.targetCraftTrainingId&&Object.keys(decision).every(key=>
      ['chosenAction','innerMonologue','craftTrainingMove',...keys].includes(key));
}
export function resolveCraftTrainingAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload):WorldEvent|null{
  if(decision.chosenAction!=='CRAFT_TRAINING')return null;
  const choice=availableCraftTrainingActions(actor,world).find(option=>exact(decision,option));
  if(!choice)return null;
  const tick=world.tick,c=craftTrainingCosts();
  if(choice.craftTrainingMove==='offer'){
    const state=world.craftTraining??={version:1,nextId:1,projects:[]};
    const row:CraftTrainingProject={id:craftTrainingId(state.nextId++),siteId:actor.locationId,sectId:actor.sectId,keeperId:actor.id,
      traineeIds:[choice.targetCultivatorId,choice.targetCraftTraineeId],offeredTick:tick,offerExpiresTick:tick+OFFER,
      status:'offered',escrowStones:0,escrowRoots:0,refundedStones:0,refundedRoots:0};
    state.projects.push(row);
    return scene(world,row,'offer','炉前点名，待两人各自应允','一人掌坯、一人收焰。只约真工序，未收一枚灵石，也没有器物。');
  }
  const row=world.craftTraining?.projects.find(row=>row.id===choice.targetCraftTrainingId);
  if(!row)return null;
  if(choice.craftTrainingMove==='decline'||choice.craftTrainingMove==='withdraw')
    return refund(world,row,choice.craftTrainingMove==='decline'?'declined':'withdrawn',actor.id);
  const valid=keeperFor(world,row.siteId,row.sectId,row.keeperId,tick);
  if(!valid)return null;
  const {keeper,site}=valid;
  const fields={mechanism:'workshop' as const,refId:row.id,visibility:scope(row)};
  if(choice.craftTrainingMove==='join'){
    const first=actor.id===row.traineeIds[0];
    if(first)row.firstJoinedTick=tick;else row.secondJoinedTick=tick;
    const funded=row.firstJoinedTick!==undefined&&row.secondJoinedTick!==undefined;
    if(funded){
      keeper.spiritStones-=c.stones;keeper.herbs.earth_root-=c.roots;
      row.escrowStones=c.stones;row.escrowRoots=c.roots;row.status='funded';row.fundedTick=tick;row.workExpiresTick=tick+WORK;
      const deposit={...fields,kind:'transfer' as const,reason:'craft_training_deposit',from:flowActor(keeper.id),to:vault(row.id)};
      recordResourceFlow(world,{...deposit,good:'stone',amount:c.stones});
      recordResourceFlow(world,{...deposit,good:'earth_root',amount:c.roots});
    }
    return scene(world,row,first?'join-first':'join-second','一人亲在炉前署名',
      funded?'两名徒者都已亲允。原炉主实封灵石与玄土根，下一月才可动炉。':'只记本人愿做的工序。另一人未允，炉料仍在原人手中。');
  }
  const finishing=choice.craftTrainingMove==='finish',blank=finishing?realBlank(row):undefined;
  if(finishing&&!blank||!claimFurnaceUse(world,actor,site.id,'forge'))return null;
  const use=world.furnaceReservations.uses.at(-1);
  if(!use||use.actorId!==actor.id||use.siteId!==site.id||use.tick!==tick||use.kind!=='forge'||(use.slot!==1&&use.slot!==2&&use.slot!==3))return null;
  const grade=finishing?actualFinishGrade(actor,site):undefined;
  const masteryBefore=actor.techniqueMastery,masteryAfter=grade?.grade==='failed'?masteryBefore:Math.min(100,masteryBefore+1);
  const stage:CraftTrainingStage={actorId:actor.id,tick,stonesUsed:finishing?c.finishStones:c.blankStones,
    rootsUsed:1,slot:use.slot,masteryBefore,masteryAfter};
  row.escrowStones-=stage.stonesUsed;row.escrowRoots-=stage.rootsUsed;
  const useBill={...fields,kind:'consumption' as const,from:vault(row.id)};
  recordResourceFlow(world,{...useBill,reason:'craft_training_fuel',good:'stone',amount:stage.stonesUsed});
  recordResourceFlow(world,{...useBill,reason:'craft_training_material',good:'earth_root',amount:stage.rootsUsed});
  actor.techniqueMastery=masteryAfter;
  if(!grade||!blank){
    row.status='blank';row.blank={id:craftTrainingBlankId(row.id),...stage};
    return scene(world,row,'blank','首名徒者守炉铸坯','实占炉位，实耗一段炉料。只留这一枚原坯，还未成器。',actor.id);
  }
  const passed=grade.grade!=='failed',artifactId=craftTrainingArtifactId(row.id);
  row.status=passed?'completed':'failed';row.closedTick=tick;
  row.finish={blankId:blank.id,...stage,...grade,...(passed?{artifactId}:{})};
  if(passed){
    const durability=grade.grade==='fine'?Math.ceil(rule.durability*1.2):rule.durability;
    keeper.artifacts.push({id:artifactId,name:`${actor.spiritRoot}纹·合练法器`,tier:'法器',spiritRoot:actor.spiritRoot,
      durability,maxDurability:durability,resonance:0,craftTrainingOrigin:{projectId:row.id,blankId:blank.id,
        siteId:site.id,keeperId:keeper.id,firstTraineeId:blank.actorId,secondTraineeId:actor.id,blankTick:blank.tick,finishedTick:tick}});
  }
  return scene(world,row,'finish',passed?'次名徒者接原坯，成器交炉主':'炉焰既尽，这枚原坯未成器',
    passed?'第二人实接同一枚原坯，独占一次炉位。只交一件，两个手作仍各署其人。':'最后一道工序确已耗料，却未验成。无器物、无新增手作长进。',actor.id);
}

export function advanceCraftTraining(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const row of world.craftTraining?.projects??[]){
    if(!live(row))continue;
    const expires=world.tick>=deadline(row),workshop=legalWorkshop(world,row.siteId,row.sectId),keeper=person(world,row.keeperId);
    const reason=!workshop?'site':workshop.sect.leaderId!==row.keeperId||!alive(keeper)||keeper.sectId!==row.sectId?'keeper':
      row.traineeIds.some(id=>!alive(person(world,id)))?'trainee':undefined;
    if(!expires&&!reason)continue;
    const action=refund(world,row,expires?'expired':'unavailable',undefined,expires?undefined:reason);
    if(action)events.push(action);
  }
  return events;
}
export function visibleCraftTraining(world:WorldState,viewer?:Cultivator):CraftTrainingProject[]{
  return alive(viewer)&&person(world,viewer.id)===viewer?(world.craftTraining?.projects??[])
    .filter(row=>row.offeredTick<=world.tick&&party(row,viewer.id)).map(row=>structuredClone(row)):[];
}
