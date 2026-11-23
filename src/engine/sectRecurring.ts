import {SECT_RECURRING_PROFILES,SECT_RECURRING_RECALL,SECT_RECURRING_VOICES} from '../data/sectComedy/recurring';
import type {Cultivator,WorldEvent,WorldState} from '../types/world';
import {starterSectIdentity} from '../types/sectManagement';
import {SECT_RECURRING_LIMIT,SECT_RECURRING_MEMORY_TEXT as memoryText,sectRecurringEventId,sectRecurringIdentity,type SectRecurringEncounter,type SectRecurringOutcome} from '../types/sectRecurring';
import {isChronicleStoryFact} from './chronicleLead';
import {directorSiteIsSafe} from './director/nudgeIntegrations';
import {isGrandSiegeFighterPresent} from './grandSiegePresence';
import {activeBellWatchForActor} from './bellWatchPresence';
import {recallMemories,recordMemory} from './memoryEngine';
import {sameGeneratedWorld} from './worldIdentity';
import {isRetiredFromService} from './serviceRetirementEngine';
import {flowActor,recordResourceFlow} from './resourceFlowEngine';

const pills=['foundation','golden','barrier'] as const;
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
const living=(person:Cultivator)=>person.alive&&person.hp>0&&person.positionPlane===undefined&&!isRetiredFromService(person);
function unique<T extends {id:string}>(rows:readonly T[],id:string):T|undefined{
  const matches=rows.filter(row=>row.id===id);
  return matches.length===1?matches[0]:undefined;
}

type Meeting=Pick<SectRecurringEncounter,'role'|'entityId'|'outcome'|'siteId'|'sourceEventId'|'pill'>;


export function settleSectRecurringMonth(world:WorldState,prevWorld:WorldState,publicEvents:readonly WorldEvent[]=[]):WorldEvent[]{
  const m=world.sectManagement,state=m?.recurring;
  if(!m||!state||!prevWorld.sectManagement||world.tick!==prevWorld.tick+1||
     !sameGeneratedWorld(world,prevWorld)||m.growth?.failure||state.openedTick>world.tick)return [];
  const sect=unique(world.sects,m.sectId),leader=unique(world.cultivators,m.leaderId);
  if(!sect||sect.leaderId!==m.leaderId||!leader||!living(leader)||leader.sectId!==m.sectId)return [];
  const sectId=m.sectId,head=leader;
  const ids=sectRecurringIdentity(sectId,starterSectIdentity(world.random.seed,m.starterId,m.draw).creditorId);
  const history=state.encounters;
  const elapsed=world.tick-state.openedTick;
  const available=(role:Meeting['role'])=>!history.some(row=>row.tick===world.tick&&row.role===role);
  const due=(role:Meeting['role'])=>{const {every,offset}=SECT_RECURRING_PROFILES[role];return elapsed%every===offset;};
  const rows:SectRecurringEncounter[]=[];
  const events:WorldEvent[]=[];
  const recentlyKnown = new Map<string,ReturnType<typeof recallMemories>>();
  function retain(candidate:Meeting,person:Cultivator,receiver:Cultivator=head){
    let memoryOwner=recentlyKnown.get(person.id);
    if(!memoryOwner){
      memoryOwner=recallMemories(person,world.tick,44);
      recentlyKnown.set(person.id,memoryOwner);
    }
    const previous=history.filter(old=>old.role===candidate.role&&old.tick<world.tick&&
      old.memory?.actorId===person.id&&memoryOwner.some(memory=>memory.id===old.memory?.id&&memory.tick===old.tick&&
        memory.content===memoryText[old.outcome])).at(-1);
    recordMemory(person,world.tick,memoryText[candidate.outcome],7,'social',candidate.outcome==='pill_taken'?-2:2);
    const memoryId=`mem-${world.tick}-${person.id}-${person.memorySequence}`;
    const remembered=person.memories.some(memory=>memory.id===memoryId);
    rows.push({...candidate,tick:world.tick,...(remembered?{memory:{actorId:person.id,id:memoryId}}:{}),
      ...(previous?.memory?{recalled:{tick:previous.tick,memory:{...previous.memory}}}:{})});
    events.push({id:sectRecurringEventId(world.tick,sectId,candidate.role),tick:world.tick,year:world.year,month:world.month,
      title:'宗门来客小记',description:'今月留下一则宗门见闻。',
      actorIds:person.id===receiver.id?[person.id]:[person.id,receiver.id],category:'diplomacy',witnessScope:'participants'});
  }

  const wang=unique(world.cultivators,ids.wang);
  if(available('wang')&&wang&&living(wang))retain({role:'wang',entityId:wang.id,
    outcome:m.debt?.creditorId===wang.id&&m.debt.principal>0?'debt_notice':'market_remark'},wang);
  const rival=unique(world.cultivators,ids.rival),rivalSect=unique(world.sects,ids.rivalSectId);
  if(available('rival')&&due('rival')&&rival&&living(rival)&&rival.sectId===rivalSect?.id&&rivalSect.leaderId===rival.id)
    retain({role:'rival',entityId:rival.id,outcome:'comparison'},rival);

  const ancestor=unique(world.cultivators,ids.ancestor);
  const cat=unique(world.spiritBeasts,ids.cat);
  if(available('cat')&&due('cat')&&cat?.alive&&cat.hp>0&&cat.kind==='瑞兽'&&cat.homeLocationId===state.catHomeSiteId){
    const site=unique(world.locations,cat.locationId);
    if(site&&directorSiteIsSafe(world,site)){
      const present=world.cultivators.filter(person=>person.sectId===m.sectId&&living(person)&&
        isGrandSiegeFighterPresent(world,person,site.id)&&!activeBellWatchForActor(world,person))
        .sort((a,b)=>order(a.id,b.id));
      const holder=!cat.tamedBy?present.find(person=>pills.some(id=>Number.isSafeInteger(person.pills[id])&&person.pills[id]>1)):undefined;
      const pill=holder&&pills.find(id=>Number.isSafeInteger(holder.pills[id])&&holder.pills[id]>1);
      if(holder&&pill){
        holder.pills[pill]-=1;
        recordResourceFlow(world,{kind:'consumption',mechanism:'sect_economy',
          refId:sectRecurringEventId(world.tick,sectId,'cat'),reason:'recurring_cat_pill_eaten',good:pill,amount:1,
          visibility:{kind:'participants',actorIds:[holder.id]},from:flowActor(holder.id)});
        cat.cultivation=Math.min(100,cat.cultivation+1);
        retain({role:'cat',entityId:cat.id,outcome:'pill_taken',siteId:site.id,pill:{holderId:holder.id,id:pill,count:1}},holder,holder);
      }else{
        const witness=present[0]??(ancestor&&living(ancestor)&&isGrandSiegeFighterPresent(world,ancestor,site.id)&&
          !activeBellWatchForActor(world,ancestor)?ancestor:undefined);
        if(witness)retain({role:'cat',entityId:cat.id,outcome:'cat_sighting',siteId:site.id},witness,
          witness.id===ids.ancestor?leader:witness);
      }
    }
  }

  if(available('ancestor')&&due('ancestor')&&ancestor&&living(ancestor)){
    const site=unique(world.locations,state.ancestorSiteId);
    const visit=site&&directorSiteIsSafe(world,site)&&isGrandSiegeFighterPresent(world,ancestor,site.id)&&
      isGrandSiegeFighterPresent(world,leader,site.id)&&!activeBellWatchForActor(world,ancestor)&&!activeBellWatchForActor(world,leader);
    retain({role:'ancestor',entityId:ancestor.id,outcome:'ancestor_remark',...(visit?{siteId:site.id}:{})},ancestor);
  }
  const host=unique(world.cultivators,ids.host);
  if(available('host')&&host&&living(host)&&host.sectId==='sect-tianji'){
    const found=publicEvents.filter(event=>event.tick===world.tick&&event.category!=='death'&&
      isChronicleStoryFact(event,world.tick)&&publicEvents.filter(other=>other.id===event.id).length===1&&(
        event.actorIds.includes(host.id)||!!event.locationId&&!!unique(world.locations,event.locationId)&&
        isGrandSiegeFighterPresent(world,host,event.locationId)&&!activeBellWatchForActor(world,host)))
      .sort((a,b)=>order(a.id,b.id))[0];
    if(found||due('host'))retain({role:'host',entityId:host.id,outcome:found?'public_news':'host_cue',
      ...(found?{sourceEventId:found.id}:{})},host);
  }
  if(rows.length)m.recurring={...state,encounters:[...history,...rows].slice(-SECT_RECURRING_LIMIT)};
  return events;
}

export interface SectRecurringView {
  readonly role:SectRecurringEncounter['role'];
  readonly outcome:SectRecurringOutcome;
  readonly entityId:string;
  readonly name:string;
  readonly report:string;
  readonly quote?:string;
  readonly recall?:string;
  readonly siteId?:string;
  readonly sourceEventId?:string;
  readonly pill?:SectRecurringEncounter['pill'];
}

export function projectSectRecurring(world:WorldState):readonly SectRecurringView[]{
  const m=world.sectManagement,state=m?.recurring;
  const sect=m&&unique(world.sects,m.sectId);
  if(!state||!m||!sect)return [];
  const ids=sectRecurringIdentity(m.sectId,starterSectIdentity(world.random.seed,m.starterId,m.draw).creditorId);
  return state.encounters.filter(row=>row.tick===world.tick&&row.entityId===ids[row.role]&&
    (row.role==='cat'?!!unique(world.spiritBeasts,row.entityId):!!unique(world.cultivators,row.entityId))).map(row=>{
    const base={role:row.role,outcome:row.outcome,entityId:row.entityId,name:SECT_RECURRING_PROFILES[row.role].label};
    const source=row.sourceEventId&&unique(world.events,row.sourceEventId);
    const news=source&&source.tick===row.tick&&isChronicleStoryFact(source,world.tick)?source:undefined;
    const rival=unique(world.sects,ids.rivalSectId);
    const site=row.siteId&&unique(world.locations,row.siteId);
    const holder=row.pill&&unique(world.cultivators,row.pill.holderId);
    const reportByOutcome:Record<SectRecurringOutcome,string>={
      debt_notice:'王掌柜照例寄来一封催账信。',
      market_remark:'王掌柜递来几句闲话。',
      comparison:rival?`赵掌门来信谈起两宗名声。眼下本宗 ${Math.floor(sect.reputation)}，邻宗 ${Math.floor(rival.reputation)}。`:'赵掌门来信谈了谈两宗的名声。',
      cat_sighting:row.memory?.actorId===ids.ancestor?'后山老祖捎话，说亲眼见那只灵猫在近处停了停。':'有本宗人见那只灵猫在近处停了停。',
      pill_taken:holder?`灵猫从${holder.name}袖中偷走一枚丹药。`:'有本宗人被灵猫偷走一枚丹药。',
      ancestor_remark:site?`掌门在${site.name}见到后山老祖，听了一句闲话。`:'后山老祖留来一封短笺。',
      host_cue:'天机阁寄来一道开场词，这回还没说到哪桩大事。',
      public_news:news?`天机阁捎来一则明面消息：${news.title}。`:'天机阁捎来几句说书词。',
    };
    const lines=SECT_RECURRING_VOICES[row.outcome==='public_news'&&!news?'host_cue':row.outcome];
    const {every}=SECT_RECURRING_PROFILES[row.role];
    const quote=lines[Math.floor((row.tick-state.openedTick)/every)%lines.length];
    const old=row.recalled&&state.encounters.find(candidate=>candidate.role===row.role&&candidate.tick===row.recalled?.tick&&
      candidate.tick<row.tick&&candidate.memory?.id===row.recalled.memory.id&&candidate.memory.actorId===row.recalled.memory.actorId);
    const owner=old?.memory&&unique(world.cultivators,old.memory.actorId);
    const recall=old&&owner&&recallMemories(owner,world.tick,44).some(memory=>memory.id===old.memory?.id&&memory.tick===old.tick&&
      memory.content===memoryText[old.outcome])?SECT_RECURRING_RECALL[old.outcome]:undefined;
    return {...base,report:reportByOutcome[row.outcome],...(quote?{quote}:{}),...(recall?{recall}:{}),
      ...(site?{siteId:site.id}:{}),...(news?{sourceEventId:news.id}:{}),...(row.pill?{pill:{...row.pill}}:{})};
  });
}
