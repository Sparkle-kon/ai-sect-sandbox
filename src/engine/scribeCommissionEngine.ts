import type {ChronicleReading,Cultivator,EraHeritageFact,LLMDecisionPayload,LocationNode,ResourceFlowAccount,WorldEvent,WorldState} from '../types/world';
import {
  SCRIBE_COMMISSION_DEPOSIT as DEPOSIT,SCRIBE_COMMISSION_INK as INK,SCRIBE_COMMISSION_WAGE as WAGE,
  SCRIBE_COMMISSION_OFFER_TICKS as OFFER,SCRIBE_COMMISSION_WORK_TICKS as WORK,
  scribeCommissionEventId,scribeCommissionId,scribeManuscriptId,
  type ScribeCommission,type ScribeCommissionManuscriptView,type ScribeCommissionMove,type ScribeCommissionOption,
  type ScribeCommissionVerification,
} from '../types/scribeCommission';
import {doctrineFoundingPhysicallyAt} from './doctrineFoundingEngine';
import {expeditionRescueCheckpoint} from './expeditionRescueCheckpoint';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {flowActor,recordResourceFlow} from './resourceFlowEngine';
import {SETTLEMENT_RELIEF} from './settlementReliefTerms';
import {onLowerPlane} from './upperPassageIsolation';

export type {ScribeCommissionOption} from '../types/scribeCommission';
export {
  SCRIBE_COMMISSION_DEPOSIT,SCRIBE_COMMISSION_INK,SCRIBE_COMMISSION_WAGE,
  SCRIBE_COMMISSION_OFFER_TICKS,SCRIBE_COMMISSION_WORK_TICKS,
} from '../types/scribeCommission';

const people=(world:WorldState,id:string)=>world.cultivators.find(actor=>actor.id===id);
const live=(actor:Cultivator|undefined):actor is Cultivator=>!!actor&&actor.alive&&actor.hp>0&&actor.age>=18;
const isParty=(row:ScribeCommission,id:string)=>row.patronId===id||row.scribeId===id;
const unfinished=(row:ScribeCommission)=>row.status==='offered'||row.status==='accepted'||row.status==='verified';
const last=(row:ScribeCommission)=>row.verification?.tick??row.acceptedTick??row.offeredTick;
const expiry=(row:ScribeCommission)=>row.workExpiresTick??row.offerExpiresTick;
const balance=(row:ScribeCommission)=>row.status==='offered'?0:row.status==='accepted'?DEPOSIT:WAGE;
const activeAt=(row:ScribeCommission,tick:number)=>unfinished(row)&&row.closedTick===undefined&&tick<expiry(row);
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const account=(id:string):ResourceFlowAccount=>({kind:'scribe_commission',id});
const visibility=(row:ScribeCommission)=>({kind:'participants' as const,actorIds:[row.patronId,row.scribeId]});
const currentHub=(world:WorldState,siteId:string):LocationNode|undefined=>world.locations.find(site=>
  site.id===siteId&&!isScopedExpeditionGate(site)&&(site.type==='market'||site.type==='sect_hq'&&world.sects.some(sect=>sect.headquartersId===site.id)));
const here=(world:WorldState,person:Cultivator|undefined,site:string,tick:number):person is Cultivator=>
  live(person)&&onLowerPlane(person)&&doctrineFoundingPhysicallyAt(world,person,site,tick)&&!expeditionRescueCheckpoint(world,person);
const enough=(patron:Cultivator)=>Number.isFinite(patron.spiritStones)&&patron.spiritStones>=DEPOSIT;
const canReceive=(person:Cultivator,n:number)=>Number.isFinite(person.spiritStones)&&person.spiritStones>=0&&person.spiritStones+n<=1_000_000_000;

export function scribeCommissionHistoricalHub(world:WorldState,siteId:string,tick:number):boolean{
  return !!currentHub(world,siteId)||world.relocations.abandonedSites.some(row=>row.originId===siteId&&row.tick>=tick&&
    (row.originalType==='sect_hq'||row.originalType==='market'));
}
function publicEvidence(world:WorldState,fact:EraHeritageFact):boolean{
  const source=fact.source;
  if(source.tick!==fact.tick||fact.tick<1||!fact.firsthandIds.length)return false;
  const names=source.kind==='duel'?source.participantIds:[source.actorId];
  if(source.kind==='duel'){
    if(names.length!==2||names[0]===names[1]||!names.includes(source.winnerId)||
      !['duel','kill'].some(suffix=>source.sourceEventId===`evt-${fact.tick}-${names[0]}-${suffix}`))return false;
  }else if(source.stones!==SETTLEMENT_RELIEF.stones||source.herbs!==SETTLEMENT_RELIEF.jade_leaf||
    source.sourceEventId!==`evt-settlement-${fact.tick}-relief-${source.settlementId}-${source.actorId}`||
    !world.settlements.villages.some(row=>row.id===source.settlementId&&row.locationId===source.locationId))return false;
  const hot=world.events.filter(row=>row.id===source.sourceEventId);
  return hot.length<=1&&hot.every(row=>row.witnessScope!=='participants'&&row.tick===fact.tick&&row.year===fact.year&&row.month===fact.month&&
    row.locationId===source.locationId&&row.actorIds.length===names.length&&names.every((id,i)=>row.actorIds[i]===id)&&
    (source.kind==='duel'?row.duelWinnerId===source.winnerId&&row.category===(row.id.endsWith('-kill')?'death':'combat'):
      row.category==='diplomacy'));
}
export function scribeCommissionFact(world:WorldState,sourceEventId:string,siteId:string,beforeTick:number):EraHeritageFact|undefined{
  const rows=world.eraHeritage?.facts.filter(row=>row.source.sourceEventId===sourceEventId)??[];
  const fact=rows[0];
  return rows.length===1&&fact.tick<beforeTick&&fact.source.locationId===siteId&&publicEvidence(world,fact)?fact:undefined;
}
const claimValue=(reading:ChronicleReading)=>reading.kind==='duel'?reading.winnerId:reading.delivery;
export function scribeCommissionVerification(world:WorldState,row:ScribeCommission,tick:number):ScribeCommissionVerification|undefined{
  const fact=scribeCommissionFact(world,row.sourceEventId,row.siteId,row.offeredTick);
  if(!fact||fact.tick!==row.sourceTick)return undefined;
  const readings=fact.retellings.filter(claim=>claim.sourceEventId===row.sourceEventId&&claim.tick>=fact.tick&&claim.tick<tick&&
      claim.reading.kind===fact.source.kind).sort((a,b)=>a.tick-b.tick||compare(a.id,b.id));
  const first=readings[0],other=first&&readings.find(claim=>claim.authorId!==first.authorId&&claimValue(claim.reading)!==claimValue(first.reading));
  const correction=fact.correction;
  const correctionId=other&&correction&&correction.tick<tick&&correction.tick>other.tick&&
    correction.sourceEventId===row.sourceEventId&&correction.reading.kind===fact.source.kind&&
    claimValue(correction.reading)===(fact.source.kind==='duel'?fact.source.winnerId:'full_supplies')&&
    correction.contestedRetellingIds.includes(first.id)&&correction.contestedRetellingIds.includes(other.id)?correction.id:undefined;
  return {tick,inkPaid:INK,retellingIds:other?[first.id,other.id]:[],...(correctionId?{correctionId}:{})};
}
export function sameScribeCommissionVerification(a:ScribeCommissionVerification|undefined,b:ScribeCommissionVerification|undefined):boolean{
  return !!a&&!!b&&a.tick===b.tick&&a.inkPaid===b.inkPaid&&a.correctionId===b.correctionId&&
    a.retellingIds.length===b.retellingIds.length&&a.retellingIds.every((id,i)=>id===b.retellingIds[i]);
}

const reply=(row:ScribeCommission,scribeCommissionMove:Exclude<ScribeCommissionMove,'offer'>):ScribeCommissionOption=>
  ({action:'SCRIBE_COMMISSION',scribeCommissionMove,targetScribeCommissionId:row.id});
export function availableScribeCommissionActions(actor:Cultivator,world:WorldState,tick=world.tick):ScribeCommissionOption[]{
  const site=actor.locationId, facts=world.eraHeritage?.facts;
  if((tick!==world.tick&&tick!==world.tick+1)||people(world,actor.id)!==actor||!facts?.length||
      !currentHub(world,site)||!here(world,actor,site,tick))return [];
  const rows=world.scribeCommissions?.commissions??[],open=rows.filter(row=>activeAt(row,tick));
  if(rows.some(row=>(row.patronId===actor.id&&row.offeredTick===tick)||
      (row.scribeId===actor.id&&(row.acceptedTick===tick||row.verification?.tick===tick||row.manuscript?.tick===tick||
        row.status==='declined'&&row.closedTick===tick))||(row.patronId===actor.id&&row.status==='withdrawn'&&row.closedTick===tick)))return [];
  const row=open.find(row=>isParty(row,actor.id));
  if(row){
    if(row.siteId!==site||last(row)>=tick)return [];
    const patron=people(world,row.patronId),scribe=people(world,row.scribeId);
    const expected=balance(row);
    if(!patron||!scribe||row.escrowStones!==expected||row.refundedStones!==0)return [];
    const options:ScribeCommissionOption[]=canReceive(patron,expected)?[reply(row,actor===patron?'withdraw':'decline')]:[];
    if(actor!==scribe||!here(world,patron,site,tick))return options;
    const fact=scribeCommissionFact(world,row.sourceEventId,site,row.offeredTick);
    if(fact?.tick!==row.sourceTick)return options;
    if(row.status==='offered'&&enough(patron))options.push(reply(row,'accept'));
    if(row.status==='accepted'&&scribeCommissionVerification(world,row,tick))options.push(reply(row,'verify'));
    if(row.status==='verified'&&row.verification&&canReceive(scribe,WAGE)&&
      sameScribeCommissionVerification(scribeCommissionVerification(world,row,row.verification.tick),row.verification))
      options.push(reply(row,'deliver'));
    return options;
  }
  if(!enough(actor)||(world.scribeCommissions?.nextId??1)>100_000)return [];
  const reserved=new Set(open.flatMap(row=>[row.patronId,row.scribeId]));
  const scribes=world.cultivators.filter(person=>person!==actor&&people(world,person.id)===person&&!reserved.has(person.id)&&here(world,person,site,tick))
    .sort((a,b)=>compare(a.id,b.id)).slice(0,2);
  if(!scribes.length)return [];
  const sources=facts.filter(fact=>fact.source.locationId===site&&fact.tick<tick&&publicEvidence(world,fact))
    .sort((a,b)=>b.tick-a.tick||compare(a.source.sourceEventId,b.source.sourceEventId)).slice(0,3);
  return sources.flatMap(fact=>scribes.map(scribe=>({action:'SCRIBE_COMMISSION',scribeCommissionMove:'offer',
    targetCultivatorId:scribe.id,targetChronicleSourceId:fact.source.sourceEventId})));
}

function scene(world:WorldState,row:ScribeCommission,phase:ScribeCommissionMove|'expired'|'unavailable',title:string,description:string):WorldEvent{
  return {id:scribeCommissionEventId(row.id,world.tick,phase),tick:world.tick,year:world.year,month:world.month,
    locationId:row.siteId,actorIds:[row.patronId,row.scribeId],witnessScope:'participants',category:'diplomacy',title,description};
}
function refund(world:WorldState,row:ScribeCommission,patron:Cultivator,status:'expired'|'unavailable'|'declined'|'withdrawn'){
  const amount=row.escrowStones;
  if(amount){
    patron.spiritStones+=amount;
    recordResourceFlow(world,{kind:'transfer',reason:'scribe_refund',mechanism:'scribe_commission',good:'stone',amount,
      from:account(row.id),to:flowActor(row.patronId),refId:row.id,visibility:visibility(row)});
  }
  row.status=status;row.escrowStones=0;row.refundedStones=amount;row.closedTick=world.tick;
  return amount;
}
function exact(payload:LLMDecisionPayload,option:ScribeCommissionOption):boolean{
  const keys=option.scribeCommissionMove==='offer'?['targetCultivatorId','targetChronicleSourceId']:['targetScribeCommissionId'];
  return option.scribeCommissionMove===payload.scribeCommissionMove&&
    Object.keys(payload).every(key=>['chosenAction','innerMonologue','scribeCommissionMove',...keys].includes(key))&&
    option.targetCultivatorId===payload.targetCultivatorId&&option.targetChronicleSourceId===payload.targetChronicleSourceId&&
    option.targetScribeCommissionId===payload.targetScribeCommissionId;
}

export function resolveScribeCommissionAction(world:WorldState,actor:Cultivator,payload:LLMDecisionPayload):WorldEvent|null{
  if(payload.chosenAction!=='SCRIBE_COMMISSION')return null;
  const choice=availableScribeCommissionActions(actor,world).find(option=>exact(payload,option));
  if(!choice)return null;
  const tick=world.tick;
  if(choice.scribeCommissionMove==='offer'){
    const proof=scribeCommissionFact(world,choice.targetChronicleSourceId,actor.locationId,tick);
    if(!proof)return null;
    const state=world.scribeCommissions??={version:1,nextId:1,commissions:[]};
    const row:ScribeCommission={id:scribeCommissionId(state.nextId++),patronId:actor.id,scribeId:choice.targetCultivatorId,
      siteId:actor.locationId,sourceEventId:choice.targetChronicleSourceId,sourceTick:proof.tick,offeredTick:tick,offerExpiresTick:tick+OFFER,
      status:'offered',escrowStones:0,refundedStones:0};
    state.commissions.push(row);
    return scene(world,row,'offer','有人请抄一桩有据旧事','只议原址旧事，尚未收一枚灵石，也未写成新卷。');
  }
  const row=world.scribeCommissions?.commissions.find(row=>row.id===choice.targetScribeCommissionId);
  const patron=row&&people(world,row.patronId);
  if(!row||!patron)return null;
  const from=account(row.id), common={mechanism:'scribe_commission' as const,good:'stone' as const,refId:row.id,visibility:visibility(row)};
  if(choice.scribeCommissionMove==='accept'){
    patron.spiritStones-=DEPOSIT;row.escrowStones=DEPOSIT;row.status='accepted';row.acceptedTick=tick;row.workExpiresTick=tick+WORK;
    recordResourceFlow(world,{...common,kind:'transfer',reason:'scribe_deposit',amount:DEPOSIT,from:flowActor(patron.id),to:from});
    return scene(world,row,'accept','掌卷人当面接下这笔委写','原委托人实托八枚灵石。未抄校、未交卷，不先给工钱。');
  }
  if(choice.scribeCommissionMove==='verify'){
    const proof=scribeCommissionVerification(world,row,tick);
    if(!proof)return null;
    row.escrowStones-=INK;row.status='verified';row.verification=proof;
    recordResourceFlow(world,{...common,kind:'consumption',reason:'scribe_ink',amount:INK,from});
    return scene(world,row,'verify','掌卷人循原据抄校','实用两枚灵石备墨。若原有异说，一并记下，不抹去前卷。');
  }
  if(choice.scribeCommissionMove==='deliver'){
    const evidence=row.verification&&scribeCommissionVerification(world,row,row.verification.tick);
    if(!sameScribeCommissionVerification(evidence,row.verification))return null;
    row.escrowStones=0;row.status='delivered';row.closedTick=tick;
    row.manuscript={id:scribeManuscriptId(row.id),tick,wagePaid:WAGE};
    actor.spiritStones+=WAGE;
    recordResourceFlow(world,{...common,kind:'transfer',reason:'scribe_wage',amount:WAGE,from,to:flowActor(actor.id)});
    return scene(world,row,'deliver','原卷当面交到委托人手中','原件有出处，异说和原有勘误仍在；交卷后掌卷人才实收六枚灵石。');
  }
  const declined=choice.scribeCommissionMove==='decline';
  const amount=refund(world,row,patron,declined?'declined':'withdrawn');
  return scene(world,row,choice.scribeCommissionMove,declined?'掌卷人谢绝委写':'委托人收回委写',
    amount?`照原托管退回${amount}枚未耗灵石；未交卷，不付工钱。`:'未曾托款，无款可退；未交卷。');
}

export function advanceScribeCommissions(world:WorldState):WorldEvent[]{
  const events:WorldEvent[]=[];
  for(const row of world.scribeCommissions?.commissions??[]){
    if(!unfinished(row)||row.closedTick!==undefined||row.refundedStones!==0||row.escrowStones!==balance(row))continue;
    const patron=people(world,row.patronId),scribe=people(world,row.scribeId);
    if(!patron||!scribe)continue;
    // Native mortality closes custody before the ordinary estate pass. A dated expiry wins if both happen this month.
    const departed=!patron.alive&&patron.hp===0?patron:!scribe.alive&&scribe.hp===0?scribe:undefined;
    const expired=world.tick>=expiry(row);
    if(!expired&&!departed)continue;
    const status=expired?'expired':'unavailable';
    const amount=refund(world,row,patron,status);
    if(status==='unavailable'&&departed)row.unavailableActorId=departed.id;
    events.push(scene(world,row,status,status==='expired'?'旧事委写过期未交':'原订人已不在世',
      amount?`原托管尚余${amount}枚灵石，已退原委托人名下；没有给未交稿的工钱。`:'未曾托款，无款可退；未交卷。'));
  }
  return events;
}
export function visibleScribeCommissions(world:WorldState,actor?:Cultivator):ScribeCommission[]{
  return live(actor)&&people(world,actor.id)===actor?(world.scribeCommissions?.commissions??[])
    .filter(row=>isParty(row,actor.id)&&row.offeredTick<=world.tick).map(row=>structuredClone(row)):[];
}
const knownName=(world:WorldState,id:string)=>(people(world,id)?.name??'署名未详').replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu,' ').slice(0,40);
const claimText=(world:WorldState,reading:ChronicleReading)=>reading.kind==='duel'?`记作${knownName(world,reading.winnerId)}获胜`:
  reading.delivery==='full_supplies'?'记作实物足额交付':'记作未实付';
export function projectScribeCommissionManuscript(world:WorldState,viewer:Cultivator|undefined,id:string):ScribeCommissionManuscriptView|undefined{
  if(!live(viewer)||people(world,viewer.id)!==viewer)return undefined;
  const row=world.scribeCommissions?.commissions.find(row=>row.id===id&&isParty(row,viewer.id)&&row.status==='delivered');
  if(!row?.manuscript||row.manuscript.tick>world.tick||!row.verification)return undefined;
  const fact=scribeCommissionFact(world,row.sourceEventId,row.siteId,row.offeredTick);
  const proof=fact&&scribeCommissionVerification(world,row,row.verification.tick);
  if(!fact||!proof||!sameScribeCommissionVerification(proof,row.verification))return undefined;
  const source=fact.source;
  const sourceTitle=source.kind==='duel'?'斗法原据':'赈济原据';
  const body=source.kind==='duel'?
    `${knownName(world,source.participantIds[0])}与${knownName(world,source.participantIds[1])}当场斗法。胜负既分，原卷记下得胜的是${knownName(world,source.winnerId)}。`:
    `坊中赈济开账，${knownName(world,source.actorId)}交出${source.stones}枚灵石和${source.herbs}份玉叶，一应都已入账。`;
  const [a,b]=proof.retellingIds.map(id=>fact.retellings.find(claim=>claim.id===id));
  const witness=(claim:NonNullable<typeof a>)=>`${knownName(world,claim.authorId)}：${claimText(world,claim.reading)}`;
  return {title:source.kind==='duel'?'掌卷抄本 · 斗法':'掌卷抄本 · 赈济',sourceTitle,body,
    ...(a&&b?{disagreement:{witnessA:witness(a),witnessB:witness(b)}}:{}),
    ...(proof.correctionId&&fact.correction?{correction:`有据勘误：${claimText(world,fact.correction.reading)}；原署名异说照录。`}:{})};
}
