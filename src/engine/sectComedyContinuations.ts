import {findSectComedyTemplate} from '../data/sectComedy';
import {COMEDY_SEQUELS} from '../data/sectComedy/scenes/continuations';
import type {SectComedyChoiceCommand,SectComedyPending,SectComicAppliedEffect} from '../types/sectComedy';
import type {Cultivator,WorldEvent,WorldState} from '../types/world';
import {directorKnownReachableSites,directorSiteIsSafe} from './director/nudgeIntegrations';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {recordAuxiliaryActionEvent} from './recordAuxiliaryActionEvent';
import {activeBellWatchForActor} from './bellWatchPresence';
import {isRetiredFromService} from './serviceRetirementEngine';
import {sameGeneratedWorld} from './worldIdentity';
import {noteTerrainVisit} from './terrainEngine';
import {planComedyEffects} from './sectComedyEffects';
import {comedyIdentity,comedyRecurringIds,comedyFollowUpEventId,comedyFollowUpKey} from './sectComedyTerms';

function managedHome(world:WorldState){
  const m=world.sectManagement,sect=world.sects.find(sect=>sect.id===m?.sectId);
  const site=world.locations.find(site=>site.id===m?.homeSiteId&&site.ownerSectId===m.sectId&&site.type==='sect_hq');
  const leader=world.cultivators.find(actor=>actor.id===m?.leaderId&&actor.sectId===m.sectId);
  if(!m||m.growth?.failure||!sect||sect.inactiveSinceTick!==undefined||sect.leaderId!==leader?.id||
    !site||!leader||!directorSiteIsSafe(world,site)||!isGrandSiegeFighterPresent(world,leader,site.id))return;
  return {m,sect,site,leader};
}
type Home=NonNullable<ReturnType<typeof managedHome>>;
function visit(world:WorldState,home:Home,row:Extract<SectComedyPending,{kind:'visit'}>):string|undefined{
  const entity=comedyRecurringIds(world)?.[row.npc];
  if(!entity)return;
  if(row.npc==='cat'){
    const cat=world.spiritBeasts.find(beast=>beast.id===entity);
    if(!cat?.alive||cat.hp<=0||(home.m.comedy?.catBond?.shooedTick??-3)+2>world.tick||cat.tamedBy&&cat.locationId!==home.site.id)return;
    const from=world.locations.find(site=>site.id===cat.locationId);
    if(!from||!directorSiteIsSafe(world,from))return;
    cat.locationId=home.site.id;
    cat.nextActionTick=Math.max(cat.nextActionTick,world.tick+1);
    return entity;
  }
  const actor=world.cultivators.find(person=>person.id===entity);
  if(!actor||isRetiredFromService(actor)||activeBellWatchForActor(world,actor)||
    world.playerAvatar.possessedId===entity&&(world.playerAvatar.possessionUntilTick??0)>world.tick||
    !isGrandSiegeFighterPresent(world,actor,actor.locationId)||
    actor.locationId!==home.site.id&&!directorKnownReachableSites(world,actor).some(site=>site.id===home.site.id))return;
  actor.locationId=home.site.id;
  noteTerrainVisit(world,actor);
  return entity;
}
function marker(world:WorldState,home:Home,row:SectComedyPending,choice=false):WorldEvent{
  const guest=row.kind==='visit'&&row.npc!=='cat'?row.arrival?.visitorId:undefined;
  return {id:comedyFollowUpEventId(home.m.sectId,row,choice),tick:world.tick,year:world.year,month:world.month,
    actorIds:guest?[home.leader.id,guest]:[home.leader.id],locationId:home.site.id,witnessScope:'participants',category:'diplomacy',
    title:choice?'山门回了话':row.kind==='visit'?'旧事引来访客':'一封来信',
    description:choice?'掌门对旧事拿了主意。':row.kind==='visit'?'访客到山门说起旧事。':'山门收到了前事的回音。'};
}

function sequelAvailable(world:WorldState,home:Home,id:string){
  if(!Object.hasOwn(COMEDY_SEQUELS,id))return false;
  const required=COMEDY_SEQUELS[id].requiredRecruit;
  if(!required)return true;
  const actor=world.cultivators.find(row=>row.id===comedyIdentity(home.m.sectId,'recruit',required));
  return !!actor&&actor.sectId===home.m.sectId&&isGrandSiegeFighterPresent(world,actor,home.site.id);
}

export function settleSectComedyContinuations(world:WorldState,prev:WorldState):WorldEvent[]{
  const m=world.sectManagement,previous=m?.comedy?.pending;
  if(!m?.comedy||!previous?.length||world.tick!==prev.tick+1||!sameGeneratedWorld(world,prev))return [];
  const home=managedHome(world),events:WorldEvent[]=[],pending:SectComedyPending[]=[];
  const seen=new Set<string>();
  for(const row of previous){
    if(row.arrival){
      if(world.tick-(row.arrival.choice?.tick??row.arrival.tick)<12)pending.push(row);
      continue;
    }
    if(row.dueTick>world.tick){pending.push(row);continue;}
    if(world.tick-row.dueTick>4)continue;
    if(!home||events.length>=3||row.kind==='visit'&&seen.has(row.npc)){pending.push(row);continue;}
    if(row.kind==='sequel'&&!sequelAvailable(world,home,row.templateId)){pending.push(row);continue;}
    const visitorId=row.kind==='visit'?visit(world,home,row):undefined;
    if(row.kind==='visit'&&!visitorId){pending.push(row);continue;}
    if(row.kind==='visit')seen.add(row.npc);
    const arrived={...row,arrival:{tick:world.tick,...(visitorId?{visitorId}:{})}};
    pending.push(arrived);
    events.push(marker(world,home,arrived));
  }
  const {pending:_,...notebook}=m.comedy;
  m.comedy={...notebook,...(pending.length?{pending}:{})};
  return events;
}

function context(world:WorldState,speaker:Cultivator,siteId:string,templateId:string){
  return {tick:world.tick,templateId,siteId,speakerId:speaker.id,source:{phase:'ambient' as const,presence:'home' as const}};
}
function selection(world:WorldState,command:SectComedyChoiceCommand){
  const home=managedHome(world),pending=home?.m.comedy?.pending;
  if(!home||!pending)return;
  const row=pending.find(row=>comedyFollowUpKey(row)===command.id);
  if(row?.kind!=='sequel'||!row.arrival||row.arrival.choice||world.tick-row.arrival.tick>=12)return;
  const scene=COMEDY_SEQUELS[row.templateId],choice=scene?.choices.find(item=>item.id===command.choiceId);
  if(!choice||!sequelAvailable(world,home,row.templateId)||!world.events.some(event=>event.id===comedyFollowUpEventId(home.m.sectId,row,false)&&
    event.tick===row.arrival?.tick&&event.locationId===home.site.id&&event.witnessScope==='participants'))return;
  const effectPlan=planComedyEffects(world,context(world,home.leader,home.site.id,row.templateId),choice.effects,comedyFollowUpEventId(home.m.sectId,row,true));
  return effectPlan?{home,pending,row,choice,effectPlan}:undefined;
}

export function applySectComedyChoice(world:WorldState,command:SectComedyChoiceCommand):boolean{
  const picked=selection(world,command),notebook=picked?.home.m.comedy;
  const arrival=picked?.row.arrival;
  if(!picked||!notebook||!arrival)return false;
  const {home,row,choice,pending,effectPlan}=picked;
  effectPlan.commit();
  const updated={...row,arrival:{...arrival,choice:{id:choice.id,tick:world.tick,effects:effectPlan.applied}}};
  home.m.comedy={...notebook,pending:pending.map(item=>item===row?updated:item)};
  recordAuxiliaryActionEvent(world,marker(world,home,row,true));
  return true;
}

const guestNames={wang:'王掌柜',rival:'赵掌门',cat:'偷丹灵猫',ancestor:'后山老祖',host:'天机阁主播'};
const visitVoices={
  wang:(incident:string)=>`听说上回${incident}，我这回空着手来，只带了一张嘴。茶不用另算吧？`,
  rival:(incident:string)=>`上回${incident}，我门下念叨了好几日。今日来看一眼，省得他们把我也编进去。`,
  cat:(incident:string)=>`听说你们上回${incident}。灵猫绕着装过好东西的篮子嗅了一圈，拣了个有日头的地方坐下。`,
  ancestor:(incident:string)=>`上回${incident}，我在后山都听见了。你且坐着，我也就这一句话。`,
  host:(incident:string)=>`上回${incident}，说书摊追着问下一折。在下特地来看看，你家门槛还经不经得起走。`,
};
interface ContinuationView {
  readonly id:string;readonly title:string;readonly line:string;readonly resolved?:string;
  readonly choices:readonly {readonly id:string;readonly label:string;readonly available:boolean}[];
  readonly effects?:readonly SectComicAppliedEffect[];
}
export function projectSectComedyContinuations(world:WorldState){
  const m=world.sectManagement;
  return (m?.comedy?.pending??[]).flatMap<ContinuationView>(row=>{
    if(!m||!row.arrival||row.arrival.tick>world.tick)return [];
    const author=findSectComedyTemplate(row.originTemplateId)?.effects[row.effectIndex];
    const actor=world.cultivators.find(actor=>actor.id===row.speakerId);
    if(!actor)return [];
    const id=comedyFollowUpKey(row);
    if(row.kind==='visit'){
      if(row.arrival.tick!==world.tick||author?.kind!=='visit')return [];
      const incident=`${actor.name}${author.reason}`;
      return [{id,title:`${guestNames[row.npc]}到了山门`,line:visitVoices[row.npc](incident),choices:[],resolved:undefined}];
    }
    const scene=COMEDY_SEQUELS[row.templateId];
    if(!scene)return [];
    const existing=row.arrival.choice;
    const resolved=existing&&scene.choices.find(choice=>choice.id===existing.id)?.response;
    if(existing&&existing.tick!==world.tick)return [];
    return [{id,title:scene.title,line:scene.line,choices:scene.choices.map(choice=>({id:choice.id,label:choice.label,
      available:!existing&&!!selection(world,{id,choiceId:choice.id})})),resolved,effects:existing?.effects}];
  });
}
