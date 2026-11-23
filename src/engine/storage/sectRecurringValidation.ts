import { SECT_RECURRING_PROFILES } from '../../data/sectComedy/recurring';
import {
  SECT_RECURRING_LIMIT, SECT_RECURRING_MEMORY_TEXT, SECT_RECURRING_OUTCOMES, SECT_RECURRING_ROLES, sectRecurringEventId, sectRecurringIdentity,
  type SectRecurringEncounter, type SectRecurringMemory, type SectRecurringRole, type SectRecurringState,
} from '../../types/sectRecurring';
import type { SectManagementState } from '../../types/sectManagement';
import type { Cultivator, WorldEvent, WorldState } from '../../types/world';
import { isChronicleStoryFact } from '../chronicleLead';
import { arr, id, oid, one, optional, structure, tick } from './primitives';

const memoryShape=structure({actorId:id,id});
const encounterShape=structure({
  tick,role:one(...SECT_RECURRING_ROLES),entityId:id,outcome:one(...SECT_RECURRING_OUTCOMES),siteId:oid,sourceEventId:oid,
  memory:optional(memoryShape),recalled:optional(structure({tick,memory:memoryShape})),
  pill:optional(structure({holderId:id,id:one('foundation','golden','barrier'),count:one(1)})),
});
export const sectRecurringShape=structure({
  openedTick:tick,ancestorSiteId:id,catHomeSiteId:id,encounters:arr(SECT_RECURRING_LIMIT,encounterShape),
});

const outcomes:Readonly<Record<SectRecurringRole,ReadonlySet<SectRecurringEncounter['outcome']>>>={
  wang:new Set(['debt_notice','market_remark']),rival:new Set(['comparison']),
  cat:new Set(['cat_sighting','pill_taken']),ancestor:new Set(['ancestor_remark']),
  host:new Set(['host_cue','public_news']),
};

function knownMemory(person:Cultivator|undefined,memory:SectRecurringMemory,at:number,allowedText:readonly string[]):boolean{
  const prefix=`mem-${at}-${memory.actorId}-`;
  if(!person||person.id!==memory.actorId||!memory.id.startsWith(prefix))return false;
  const seq=memory.id.slice(prefix.length);
  if(!/^[1-9]\d*$/u.test(seq)||!Number.isSafeInteger(Number(seq))||Number(seq)>person.memorySequence)return false;
  const retained=[...person.memories,...person.coreMemories].filter(item=>item.id===memory.id);
  return retained.length<=1&&retained.every(item=>item.tick===at&&item.category==='social'&&allowedText.includes(item.content));
}

/** Strict bounded provenance only; a historical row cannot respawn a character or re-apply an effect. */
export function validateSectRecurring(
  world:WorldState,management:SectManagementState,recurring:SectRecurringState|undefined,creditorId:string,
  fail:(field:string)=>never,
):void{
  const identities=sectRecurringIdentity(management.sectId,creditorId);
  const people=new Map(world.cultivators.map(actor=>[actor.id,actor]));
  const locations=new Map(world.locations.map(site=>[site.id,site]));
  const cat=world.spiritBeasts.find(beast=>beast.id===identities.cat);
  const rival=people.get(identities.rival),ancestor=people.get(identities.ancestor);
  const rivalSect=world.sects.find(sect=>sect.id===identities.rivalSectId);
  const rivalSite=locations.get(identities.rivalSiteId);
  if(!recurring){
    if(cat||rival||ancestor||rivalSect||rivalSite)return fail('sectManagement.recurring.origin');
    return;
  }
  const ancestorSite=locations.get(recurring.ancestorSiteId);
  const catHome=locations.get(recurring.catHomeSiteId);
  const host=people.get(identities.host);
  if(recurring.openedTick<=management.foundedTick||recurring.openedTick>world.tick||recurring.openedTick>=(management.growth?.failure?.tick??Infinity)||!cat||!rival||!ancestor||
      !host||!people.get(identities.wang)||!rivalSect||!rivalSite||rivalSite.expeditionOmenId!==undefined||
      !ancestorSite||ancestorSite.expeditionOmenId!==undefined||!catHome||catHome.expeditionOmenId!==undefined||
      cat.homeLocationId!==catHome.id||cat.kind!=='瑞兽'||catHome.id!==ancestorSite.id||people.has(identities.cat)||
      new Set([identities.wang,identities.rival,identities.cat,identities.ancestor,identities.host,management.leaderId]).size!==6)
    return fail('sectManagement.recurring.origin');

  if(world.tick===recurring.openedTick&&
      (rivalSite.type!=='sect_hq'||rivalSite.ownerSectId!==rivalSect.id||rivalSect.headquartersId!==rivalSite.id||rivalSect.leaderId!==rival.id||
        rival.sectId!==rivalSect.id))return fail('sectManagement.recurring.origin');
  const privateIds=new Set(recurring.encounters.map(row=>sectRecurringEventId(row.tick,management.sectId,row.role)));
  const archived=(rows:readonly {id:string}[])=>rows.some(row=>privateIds.has(row.id));
  if(archived(world.chronicleArchive.anchors)||world.chronicleArchive.chapters.some(chapter=>archived(chapter.anchors))||
      world.coldHistory.chapters.some(chapter=>archived(chapter.anchors)))return fail('sectManagement.recurring.publicReceipt');
  const encounterKeys=new Map<string,SectRecurringEncounter>();
  const memoryIds=new Set<string>();
  const key=(role:SectRecurringRole,at:number)=>`${role}:${at}`;
  let priorTick=recurring.openedTick-1,priorRole=-1;
  for(const row of recurring.encounters){
    const order=SECT_RECURRING_ROLES.indexOf(row.role);
    const elapsed=row.tick-recurring.openedTick;
    const {every,offset}=SECT_RECURRING_PROFILES[row.role];
    if(elapsed<0||row.tick>world.tick||row.tick>=(management.growth?.failure?.tick??Infinity)||
        row.tick<priorTick||row.tick===priorTick&&order<=priorRole||
        row.outcome!=='public_news'&&elapsed%every!==offset||
        row.entityId!==identities[row.role]||!outcomes[row.role].has(row.outcome)||
        row.siteId!==undefined&&(!locations.has(row.siteId)||locations.get(row.siteId)?.expeditionOmenId!==undefined))
      return fail('sectManagement.recurring.encounters');
    priorTick=row.tick;priorRole=order;
    if((row.outcome==='pill_taken')!==(row.pill!==undefined)||
        (row.outcome==='public_news')!==(row.sourceEventId!==undefined)||
        (row.role==='wang'||row.role==='rival'||row.role==='host')&&row.siteId!==undefined||
        row.role==='ancestor'&&row.siteId!==undefined&&row.siteId!==recurring.ancestorSiteId||
        row.role==='cat'&&row.siteId===undefined||row.pill&&(!people.has(row.pill.holderId)||
          row.pill.holderId===identities.wang||row.pill.holderId===identities.rival||row.pill.holderId===identities.host||row.pill.holderId===identities.ancestor||
          row.memory!==undefined&&row.memory.actorId!==row.pill.holderId))
      return fail('sectManagement.recurring.references');

    if(row.memory){
      if(row.role!=='cat'&&row.memory.actorId!==row.entityId||
          !knownMemory(people.get(row.memory.actorId),row.memory,row.tick,[SECT_RECURRING_MEMORY_TEXT[row.outcome]])||memoryIds.has(row.memory.id))
        return fail('sectManagement.recurring.memory');
      memoryIds.add(row.memory.id);
    }
    if(row.recalled){
      const {tick,memory}=row.recalled;
      const earlier=encounterKeys.get(key(row.role,tick));
      const oldest=recurring.encounters[0];
      const trimmed=recurring.encounters.length===SECT_RECURRING_LIMIT&&(tick<oldest.tick||
        tick===oldest.tick&&order<SECT_RECURRING_ROLES.indexOf(oldest.role));
      const expectedText=earlier?[SECT_RECURRING_MEMORY_TEXT[earlier.outcome]]:
        [...outcomes[row.role]].map(outcome=>SECT_RECURRING_MEMORY_TEXT[outcome]);
      if(tick<recurring.openedTick||tick>=row.tick||
          row.role!=='cat'&&memory.actorId!==row.entityId||row.memory&&memory.actorId!==row.memory.actorId||
          !knownMemory(people.get(memory.actorId),memory,tick,expectedText)||
          (earlier?earlier.memory?.id!==memory.id||earlier.memory.actorId!==memory.actorId:!trimmed))
        return fail('sectManagement.recurring.recall');
    }
    encounterKeys.set(key(row.role,row.tick),row);

    // A retained raw marker must remain a participant-only native receipt, without false public proof.
    const eventId=sectRecurringEventId(row.tick,management.sectId,row.role);
    const marked=world.events.filter(event=>event.id===eventId);
    const calendar=world.year*12+world.month-(world.tick-row.tick);
    const exactAudience=(event:WorldEvent)=>{
      if(row.role!=='cat')return event.actorIds.length===2&&event.actorIds[0]===row.entityId&&event.actorIds[1]===management.leaderId;
      const witness=row.pill?.holderId??row.memory?.actorId??row.recalled?.memory.actorId;
      if(row.outcome==='cat_sighting'&&event.actorIds.length===2)
        return event.actorIds[0]===identities.ancestor&&event.actorIds[1]===management.leaderId&&
          (witness===undefined||witness===identities.ancestor);
      return event.actorIds.length===1&&people.has(event.actorIds[0])&&(witness===undefined||event.actorIds[0]===witness);
    };
    if(marked.length>1||row.tick===world.tick&&!marked.length&&
        (world.events.length<120||world.events.some(event=>event.tick<row.tick))||
        marked.some(event=>event.tick!==row.tick||event.year*12+event.month!==calendar||event.category!=='diplomacy'||
          event.witnessScope!=='participants'||event.locationId!==undefined||!exactAudience(event)))
      return fail('sectManagement.recurring.receipt');
    if(row.role==='cat'){
      const month=world.resourceFlow.months.find(entry=>entry.tick===row.tick);
      const flow=month?.entries.filter(entry=>entry.refId===eventId&&entry.reason==='recurring_cat_pill_eaten')??[];
      const pill=row.pill;
      if(flow.length>1||flow.length&&!pill||
          pill&&month&&flow.length===0&&month.totalEntries===month.entries.length||
          pill&&flow.some(entry=>entry.kind!=='consumption'||entry.mechanism!=='sect_economy'||
            entry.tick!==row.tick||entry.good!==pill.id||entry.amount!==pill.count||
            entry.from.kind!=='actor'||entry.from.id!==pill.holderId||
            entry.visibility.kind!=='participants'||entry.visibility.actorIds.length!==1||entry.visibility.actorIds[0]!==pill.holderId))
        return fail('sectManagement.recurring.pillReceipt');
    }
    const source=row.sourceEventId;
    if(source!==undefined){
      const raw=world.events.filter(event=>event.id===source);
      if(!source.startsWith('evt-')||source===eventId||raw.length>1||raw.some(event=>event.tick!==row.tick||
          event.year*12+event.month!==calendar||event.category==='death'||!isChronicleStoryFact(event,row.tick)))
        return fail('sectManagement.recurring.source');
    }
  }
}
