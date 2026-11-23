import type {Cultivator,LLMDecisionPayload,WorldEvent,WorldState} from '../types/world';
import type {ApprenticeshipReunionCase,ApprenticeshipReunionMove,ApprenticeshipReunionOption,ApprenticeshipReunionView} from '../types/apprenticeshipReunion';
import {apprenticeshipPhysicallyAt} from './apprenticeshipPresence';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {availableMentorshipActions,resolveMentorshipAction} from './mentorshipEngine';
import {availableSparringActions,resolveSparringAction,SPARRING_QI_COST} from './sparringEngine';
export type {ApprenticeshipReunionMove,ApprenticeshipReunionOption,ApprenticeshipReunionView} from '../types/apprenticeshipReunion';

const REPLY=2, REUNION=18, CHOOSE=5;
const exact=<T>(rows:readonly T[],accept:(row:T)=>boolean)=>{let one:T|undefined;for(const row of rows)if(accept(row)){if(one!==undefined)return;one=row;}return one;};
const person=(world:WorldState,id:string)=>exact(world.cultivators,row=>row.id===id);
const venue=(world:WorldState,id:string)=>{const place=exact(world.locations,row=>row.id===id);return place&&
  (place.type==='market'||place.type==='sect_hq'||world.sects.some(row=>row.headquartersId===place.id))&&
  !isScopedExpeditionGate(place)?place:undefined;};
const parties=(row:ApprenticeshipReunionCase)=>[row.studentId,row.mentorId];
const idAt=(tick:number,studentId:string,mentorId:string)=>`apprenticeship-reunion-${tick}-${studentId}--${mentorId}`;
const eventId=(row:ApprenticeshipReunionCase,move:ApprenticeshipReunionMove,tick:number)=>`evt-${row.id}-${move}-${tick}`;
const clock=(world:WorldState,tick:number)=>{const x=world.year*12+world.month-1-(world.tick-tick);return{year:Math.floor(x/12),month:x%12+1};};
const date=(world:WorldState,event:WorldEvent,tick:number)=>{const d=clock(world,tick);return event.tick===tick&&event.year===d.year&&event.month===d.month;};
const canonical=(world:WorldState,actor:Cultivator)=>person(world,actor.id)===actor&&actor.alive&&actor.hp>0&&actor.positionPlane===undefined;
const paired=(world:WorldState,row:ApprenticeshipReunionCase,place:string,tick:number)=>!!venue(world,place)&&
  parties(row).every(id=>{const actor=person(world,id);return !!actor&&canonical(world,actor)&&apprenticeshipPhysicallyAt(world,actor,place,tick);});
type Line={title:string;description:string};
const words:Record<ApprenticeshipReunionMove,Line>={
  ask:{title:'弟子独自开口求教',description:'求教是本人所请，未算拜师，也没有传下功法。'},
  refuse:{title:'被请教者亲口谢绝',description:'被请教的人亲自谢绝；没有把沉默或期限到了说成拒绝。'},
  teach:{title:'重逢后愿意亲授',description:'这回确实另发了传法邀约；还得由弟子自作答复。'},
  accept_teaching:{title:'本人同意并实受传授',description:'真正的传法已按本人的同意完成，不用从过去那次谢绝推断今日心意。'},
  public_spar:{title:'提出一轮友好公开切磋',description:'只发起邀约。对方还没有同意，更没有交手。'},
  accept_spar:{title:'亲自同意公开友好练习',description:'本人同意；两人还得各自准备齐全，才有实际一轮。'},
  part:{title:'各自从相逢处道别',description:'本人道别，没有决定他人的路，也没有强添师承或胜负。'},
};
const publicWords={title:'两人确实完成一轮友好切磋',description:'两人分别确认并实际各耗三点灵气，完成一轮友好练习；不计胜负，也未造成气血伤害。'};
const publicId=(sparringId:string,tick:number)=>`evt-${sparringId}-${tick}-reunion-public-practice`;
export const isPrivateApprenticeshipReunionEvent=(event:Pick<WorldEvent,'id'|'witnessScope'>)=>
  event.witnessScope==='participants'&&event.id.startsWith('evt-apprenticeship-reunion-');
function receipt(world:WorldState,row:ApprenticeshipReunionCase,move:ApprenticeshipReunionMove,tick=world.tick):WorldEvent{
  return {id:eventId(row,move,tick),tick,...clock(world,tick),category:'diplomacy',witnessScope:'participants',
    locationId:move==='ask'||move==='refuse'?row.askSiteId:row.reunion!.siteId,actorIds:parties(row),...words[move]};
}
function matches(world:WorldState,row:ApprenticeshipReunionCase,move:ApprenticeshipReunionMove,event:WorldEvent,tick:number){
  const expected=receipt(world,row,move,tick);
  return event.id===expected.id&&date(world,event,tick)&&event.category===expected.category&&event.witnessScope===expected.witnessScope&&
    event.locationId===expected.locationId&&event.title===expected.title&&event.description===expected.description&&event.actorIds.length===2&&
    event.actorIds.every((id,index)=>id===expected.actorIds[index]);
}
function hasReceipt(world:WorldState,row:ApprenticeshipReunionCase,move:ApprenticeshipReunionMove,tick:number){
  const event=exact(world.events,event=>event.id===eventId(row,move,tick));
  return !!event&&matches(world,row,move,event,tick);
}
const hasTeach=(world:WorldState,mentor:Cultivator,student:Cultivator)=>availableMentorshipActions(mentor,world)
  .some(row=>row.action==='TEACH'&&row.targetCultivatorId===student.id);
function quietProof(world:WorldState,row:ApprenticeshipReunionCase,source:WorldEvent){
  const site=row.reunion?.siteId,first=person(world,source.actorIds[0]??''),second=person(world,source.actorIds[1]??'');
  return !!site&&source.tick>row.reunion!.tick&&source.tick<=world.tick&&date(world,source,source.tick)&&
    source.id===`evt-${source.tick}-${source.actorIds[0]}-social`&&source.locationId===site&&source.category==='diplomacy'&&
    source.witnessScope===undefined&&source.actorIds.length===2&&new Set(source.actorIds).size===2&&
    source.actorIds.every(id=>parties(row).includes(id))&&!!first&&!!second&&source.title===`${first.name}与${second.name}坐而论道`;
}
export function recordApprenticeshipReunionMovement(world:WorldState,actor:Cultivator,fromSiteId:string):void{
  if(actor.currentAction!=='EXPLORE'||fromSiteId===actor.locationId||!canonical(world,actor)||!venue(world,actor.locationId))return;
  for(const row of world.apprenticeshipReunions?.cases??[]){
    if(!parties(row).includes(actor.id)||row.refusedTick===undefined||world.tick<=row.refusedTick||
      world.tick-row.refusedTick>REUNION||row.reunion||!hasReceipt(world,row,'refuse',row.refusedTick))continue;
    const other=person(world,actor.id===row.studentId?row.mentorId:row.studentId);
    if(!other||!canonical(world,other))continue;
    if(!row.departure&&fromSiteId===row.askSiteId&&other.locationId===row.askSiteId&&actor.locationId!==row.askSiteId){
      row.departure={tick:world.tick,actorId:actor.id,toSiteId:actor.locationId};
    }else if(row.departure&&world.tick>row.departure.tick&&actor.id!==row.departure.actorId&&fromSiteId===row.askSiteId&&
      actor.locationId===row.departure.toSiteId&&other.locationId===actor.locationId&&paired(world,row,actor.locationId,world.tick)){
      row.reunion={tick:world.tick,actorId:actor.id,siteId:actor.locationId};
    }
  }
}
export function recordApprenticeshipReunionQuiet(world:WorldState,event:WorldEvent):void{
  for(const row of world.apprenticeshipReunions?.cases??[]){
    if(!row.quiet&&row.reunion&&row.refusedTick!==undefined&&world.tick-row.refusedTick<=REUNION&&event.tick===world.tick&&
      quietProof(world,row,event)&&paired(world,row,row.reunion.siteId,world.tick)){
      row.quiet={tick:world.tick,eventId:event.id};
    }
  }
}
const option=(row:ApprenticeshipReunionCase,move:Exclude<ApprenticeshipReunionMove,'ask'>):ApprenticeshipReunionOption=>
  ({action:'APPRENTICESHIP_REUNION',targetApprenticeshipReunionId:row.id,apprenticeshipReunionMove:move});
export function availableApprenticeshipReunionActions(actor:Cultivator,world:WorldState,tick=world.tick+1):ApprenticeshipReunionOption[]{
  if((tick!==world.tick&&tick!==world.tick+1)||!canonical(world,actor)||!venue(world,actor.locationId))return [];
  const cases=world.apprenticeshipReunions?.cases??[];
  for(const row of cases){
    if(!parties(row).includes(actor.id)||row.farewell)continue;
    if(row.refusedTick===undefined){
      if(actor.id===row.mentorId&&tick>row.askTick&&tick-row.askTick<=REPLY&&paired(world,row,row.askSiteId,tick)&&
        hasReceipt(world,row,'ask',row.askTick))return [option(row,'refuse')];
      continue;
    }
    const {quiet,reunion}=row;
    if(!quiet||!reunion||tick<=quiet.tick||tick-quiet.tick>CHOOSE)continue;
    const source=exact(world.events,event=>event.id===quiet.eventId);
    if(!source||!quietProof(world,row,source))continue;
    const mentor=person(world,row.mentorId),student=person(world,row.studentId);
    if(!mentor||!student||!canonical(world,mentor)||!canonical(world,student)||
      mentor.locationId!==reunion.siteId||student.locationId!==reunion.siteId)continue;
    if(row.sparring){
      if(row.sparring.actorId===actor.id||tick<=row.sparring.tick||row.sparring.acceptedTick!==undefined)continue;
      return availableSparringActions(actor,world,false,tick).some(choice=>choice.sparringMove==='accept'&&
        choice.targetSparringId===row.sparring?.sparringId)?[option(row,'accept_spar')]:[];
    }
    if(!paired(world,row,reunion.siteId,tick))continue;
    if(row.teaching){
      if(actor.id!==row.studentId||tick<=row.teaching.tick||row.teaching.acceptedTick!==undefined)continue;
      return availableMentorshipActions(actor,world,false).some(choice=>choice.action==='ACCEPT_TUITION'&&
        choice.targetTuitionId===row.teaching?.tuitionId)?[option(row,'accept_teaching')]:[];
    }
    const out=[option(row,'part')];
    if(actor===mentor&&hasTeach(world,mentor,student))out.push(option(row,'teach'));
    const other=actor===mentor?student:mentor;
    if(availableSparringActions(actor,world,true,tick).some(choice=>choice.sparringMove==='offer'&&
      choice.sparringRounds===1&&choice.targetCultivatorId===other.id))out.push(option(row,'public_spar'));
    return out;
  }
  if(!actor.sectId||actor.techniqueMastery>90||world.mentorship.lineage.some(row=>row.studentId===actor.id)||
    !apprenticeshipPhysicallyAt(world,actor,actor.locationId,tick))return [];
  return world.cultivators.filter(mentor=>mentor.id!==actor.id&&mentor.techniqueMastery>=55&&
    mentor.sectId===actor.sectId&&mentor.locationId===actor.locationId&&canonical(world,mentor)&&
    apprenticeshipPhysicallyAt(world,mentor,actor.locationId,tick)&&hasTeach(world,mentor,actor)&&
    !cases.some(row=>row.studentId===actor.id&&row.mentorId===mentor.id)).slice(0,3).map(mentor=>
      ({action:'APPRENTICESHIP_REUNION',apprenticeshipReunionMove:'ask',targetCultivatorId:mentor.id}));
}
export function resolveApprenticeshipReunionAction(world:WorldState,actor:Cultivator,decision:LLMDecisionPayload,rng:()=>number):WorldEvent[]{
  if(decision.chosenAction!=='APPRENTICESHIP_REUNION'||Object.keys(decision).some(key=>
    !['chosenAction','innerMonologue','apprenticeshipReunionMove','targetApprenticeshipReunionId','targetCultivatorId'].includes(key)))return [];
  const native=availableApprenticeshipReunionActions(actor,world,world.tick).find(row=>
    row.apprenticeshipReunionMove===decision.apprenticeshipReunionMove&&row.targetCultivatorId===decision.targetCultivatorId&&
    row.targetApprenticeshipReunionId===decision.targetApprenticeshipReunionId);
  if(!native)return [];
  const move=native.apprenticeshipReunionMove;
  if(move==='ask'){
    const row={id:idAt(world.tick,actor.id,native.targetCultivatorId),studentId:actor.id,mentorId:native.targetCultivatorId,
      askTick:world.tick,askSiteId:actor.locationId};
    (world.apprenticeshipReunions??={cases:[]}).cases.push(row);
    actor.currentAction='APPRENTICESHIP_REUNION';return [receipt(world,row,move)];
  }
  const row=exact(world.apprenticeshipReunions?.cases??[],row=>row.id===native.targetApprenticeshipReunionId);
  if(!row)return [];
  const events:WorldEvent[]=[];
  if(move==='refuse')row.refusedTick=world.tick;
  if(move==='part')row.farewell={tick:world.tick,actorId:actor.id};
  if(move==='teach'||move==='accept_teaching'){
    const step=resolveMentorshipAction(world,actor,move==='teach'?
      {chosenAction:'TEACH',targetCultivatorId:row.studentId,innerMonologue:''}:
      {chosenAction:'ACCEPT_TUITION',targetTuitionId:row.teaching!.tuitionId,innerMonologue:''},rng);
    if(!step)return [];
    if(move==='teach')row.teaching={tick:world.tick,tuitionId:`tuition-${world.tick}-${row.mentorId}-${row.studentId}`};
    else row.teaching!.acceptedTick=world.tick;
    events.push(step);
  }
  if(move==='public_spar'||move==='accept_spar'){
    const next=world.sparring.nextId;
    const step=resolveSparringAction(world,actor,move==='public_spar'?
      {chosenAction:'SPARRING',sparringMove:'offer',targetCultivatorId:actor.id===row.mentorId?row.studentId:row.mentorId,
        sparringRounds:1,innerMonologue:''}:
      {chosenAction:'SPARRING',sparringMove:'accept',targetSparringId:row.sparring!.sparringId,innerMonologue:''});
    if(!step)return [];
    if(move==='public_spar')row.sparring={tick:world.tick,actorId:actor.id,sparringId:`sparring-${next}`};
    else row.sparring!.acceptedTick=world.tick;
    events.push(step);
  }
  actor.currentAction='APPRENTICESHIP_REUNION';
  events.push(receipt(world,row,move));return events;
}

function actualRound(world:WorldState,row:ApprenticeshipReunionCase,source:WorldEvent){
  const p=row.sparring;
  if(!p||p.acceptedTick===undefined||!row.reunion)return false;
  const native=exact(world.sparring.agreements,item=>item.id===p.sparringId);
  const round=native?.rounds[0];
  return native?.status==='completed'&&native.roundsPlanned===1&&native.rounds.length===1&&native.acceptedTick===p.acceptedTick&&
    native.closedTick===source.tick&&round?.tick===source.tick&&source.tick>p.acceptedTick&&round.members.length===2&&
    round.members.every((member,index)=>member.qiSpent===SPARRING_QI_COST&&member.actorId===[native.proposerId,native.partnerId][index])&&
    source.id===`evt-${p.sparringId}-${source.tick}-round-1`&&date(world,source,source.tick)&&source.category==='diplomacy'&&
    source.title==='同契切磋如约收场'&&source.witnessScope==='participants'&&source.locationId===row.reunion.siteId&&
    source.actorIds.length===2&&source.actorIds[0]===p.actorId&&source.actorIds[1]===native.partnerId&&native.proposerId===p.actorId;
}
function publicSummary(world:WorldState,row:ApprenticeshipReunionCase,tick:number):WorldEvent{
  return {id:publicId(row.sparring!.sparringId,tick),tick,...clock(world,tick),category:'diplomacy',actorIds:parties(row),
    locationId:row.reunion!.siteId,...publicWords};
}
export function recordApprenticeshipReunionRounds(world:WorldState,events:readonly WorldEvent[]):WorldEvent[]{
  const published:WorldEvent[]=[];
  for(const row of world.apprenticeshipReunions?.cases??[]){
    const p=row.sparring;
    if(!p||p.acceptedTick===undefined||p.completedTick!==undefined)continue;
    const source=exact(events,event=>event.id===`evt-${p.sparringId}-${world.tick}-round-1`);
    if(!source||!actualRound(world,row,source))continue;
    const summary=publicSummary(world,row,world.tick);
    if(world.events.some(event=>event.id===summary.id)||events.some(event=>event.id===summary.id))continue;
    p.completedTick=world.tick;p.eventId=summary.id;published.push(summary);
  }
  return published;
}
export function projectApprenticeshipReunion(world:WorldState,actor:Cultivator):ApprenticeshipReunionView|undefined{
  if(!canonical(world,actor))return;
  const options=availableApprenticeshipReunionActions(actor,world),site=venue(world,actor.locationId);
  if(!site)return;
  let context:ApprenticeshipReunionView['past'];
  for(const row of [...world.apprenticeshipReunions?.cases??[]].reverse()){
    if(!parties(row).includes(actor.id))continue;
    const quiet=row.quiet&&exact(world.events,event=>event.id===row.quiet?.eventId);
    const past=quiet&&row.reunion?.siteId===site.id&&quietProof(world,row,quiet)&&row.refusedTick!==undefined&&
      hasReceipt(world,row,'refuse',row.refusedTick)?
      {title:'先前亲口谢绝，今日已另有一席话',description:'先前确有本人谢绝。后来两人各自到达此处，平静交谈，未替谁定下接下来的路。'}:undefined;
    if(past&&options.some(option=>option.targetApprenticeshipReunionId===row.id))context=past;
    const phases:[ApprenticeshipReunionMove,number|undefined][]=[
      ['ask',row.askTick],['refuse',row.refusedTick],['teach',row.teaching?.tick],['accept_teaching',row.teaching?.acceptedTick],
      ['public_spar',row.sparring?.tick],['accept_spar',row.sparring?.acceptedTick],['part',row.farewell?.tick],
    ];
    const owned=phases.find(([move,tick])=>tick===world.tick&&hasReceipt(world,row,move,tick)&&
      ((move==='ask'||move==='refuse')?row.askSiteId:row.reunion?.siteId)===site.id);
    if(owned)return {siteId:site.id,siteName:site.name,options,receipt:words[owned[0]],...(past?{past}:{})};
    if(row.sparring?.completedTick===world.tick&&row.reunion?.siteId===site.id){
      const event=exact(world.events,event=>event.id===row.sparring?.eventId);
      if(event&&samePublic(world,row,event))return {siteId:site.id,siteName:site.name,options,receipt:publicWords,...(past?{past}:{})};
    }
  }
  if(options.length)return {siteId:site.id,siteName:site.name,options,...(context?{past:context}:{})};
}
function samePublic(world:WorldState,row:ApprenticeshipReunionCase,event:WorldEvent){
  const tick=row.sparring!.completedTick!,expected=publicSummary(world,row,tick);
  return event.id===expected.id&&date(world,event,tick)&&event.witnessScope===undefined&&event.category===expected.category&&
    event.locationId===expected.locationId&&event.title===expected.title&&event.description===expected.description&&
    event.actorIds.length===2&&event.actorIds.every((id,index)=>id===expected.actorIds[index]);
}

export function validateApprenticeshipReunionSave(world:WorldState,fail:(path:string)=>never):void{
  const state=world.apprenticeshipReunions;
  if(!state)return;
  if(!state.cases.length)fail('apprenticeshipReunions.empty');
  const hot=(tick:number)=>world.events.length<120||world.events.some(event=>event.tick<tick);
  const stamp=(tick:number)=>tick>=1&&tick<=world.tick&&Number.isSafeInteger(tick);
  const ids=new Set<string>(),witnessed=new Set<string>(),pairs=new Set<string>();
  function source(id:string,tick:number,agrees:(event:WorldEvent)=>boolean){
    const raw=world.events.filter(event=>event.id===id);
    if(raw.length>1||!raw.length&&hot(tick)||raw[0]&&!agrees(raw[0]))fail('apprenticeshipReunions.source');
  }
  for(const row of state.cases){
    const pair=JSON.stringify(parties(row));
    if(ids.has(row.id)||pairs.has(pair)||row.id!==idAt(row.askTick,row.studentId,row.mentorId)||!stamp(row.askTick)||
      row.studentId===row.mentorId||parties(row).some(id=>!person(world,id))||!venue(world,row.askSiteId))
      fail('apprenticeshipReunions.ask');
    ids.add(row.id);pairs.add(pair);
    const privateSource=(move:ApprenticeshipReunionMove,tick:number)=>{
      if(!stamp(tick))fail('apprenticeshipReunions.date');
      const id=eventId(row,move,tick);source(id,tick,event=>matches(world,row,move,event,tick));witnessed.add(id);
    };
    privateSource('ask',row.askTick);
    if(row.refusedTick!==undefined){
      if(row.refusedTick<=row.askTick||row.refusedTick-row.askTick>REPLY)fail('apprenticeshipReunions.refuse');
      privateSource('refuse',row.refusedTick);
    }
    if(row.departure){
      const d=row.departure;
      if(row.refusedTick===undefined||!stamp(d.tick)||d.tick<=row.refusedTick||d.tick-row.refusedTick>REUNION||
        !parties(row).includes(d.actorId)||d.toSiteId===row.askSiteId||!venue(world,d.toSiteId))fail('apprenticeshipReunions.departure');
    }
    if(row.reunion){
      const r=row.reunion;
      if(!row.departure||row.refusedTick===undefined||!stamp(r.tick)||r.tick<=row.departure.tick||r.tick-row.refusedTick>REUNION||
        r.actorId===row.departure.actorId||!parties(row).includes(r.actorId)||r.siteId!==row.departure.toSiteId)
        fail('apprenticeshipReunions.reunion');
    }
    if(row.quiet){
      const q=row.quiet;
      if(!row.reunion||row.refusedTick===undefined||!stamp(q.tick)||q.tick<=row.reunion.tick||q.tick-row.refusedTick>REUNION||
        !parties(row).some(id=>q.eventId===`evt-${q.tick}-${id}-social`))fail('apprenticeshipReunions.quiet');
      source(q.eventId,q.tick,event=>quietProof(world,row,event));
    }
    if(Number(!!row.sparring)+Number(!!row.teaching)+Number(!!row.farewell)>1)fail('apprenticeshipReunions.branch');
    const timely=(tick:number)=>!!row.quiet&&stamp(tick)&&tick>row.quiet.tick&&tick-row.quiet.tick<=CHOOSE;
    if(row.farewell){
      if(!timely(row.farewell.tick)||!parties(row).includes(row.farewell.actorId))fail('apprenticeshipReunions.part');
      privateSource('part',row.farewell.tick);
    }
    if(row.teaching){
      const t=row.teaching,offer=exact(world.mentorship.offers,offer=>offer.id===t.tuitionId);
      if(!timely(t.tick)||t.tuitionId!==`tuition-${t.tick}-${row.mentorId}-${row.studentId}`||
        !offer&&hot(t.acceptedTick??t.tick)||offer&&(offer.mentorId!==row.mentorId||offer.studentId!==row.studentId||offer.createdTick!==t.tick))
        fail('apprenticeshipReunions.teach');
      privateSource('teach',t.tick);
      if(t.acceptedTick!==undefined){
        if(!timely(t.acceptedTick)||t.acceptedTick<=t.tick||offer&&(offer.status!=='accepted'||offer.resolvedTick!==t.acceptedTick))
          fail('apprenticeshipReunions.acceptTeaching');
        privateSource('accept_teaching',t.acceptedTick);
      }
    }
    if(row.sparring){
      const p=row.sparring,native=exact(world.sparring.agreements,agreement=>agreement.id===p.sparringId);
      if(!timely(p.tick)||!/^sparring-[1-9]\d*$/.test(p.sparringId)||!parties(row).includes(p.actorId)||
        !native&&hot(p.completedTick??p.acceptedTick??p.tick)||native&&(native.siteId!==row.reunion?.siteId||
          native.offeredTick!==p.tick||native.roundsPlanned!==1||native.proposerId!==p.actorId||
          native.partnerId!==parties(row).find(id=>id!==p.actorId)))fail('apprenticeshipReunions.sparring');
      privateSource('public_spar',p.tick);
      if(p.acceptedTick!==undefined){
        if(!timely(p.acceptedTick)||p.acceptedTick<=p.tick||native&&native.acceptedTick!==p.acceptedTick)
          fail('apprenticeshipReunions.acceptSpar');
        privateSource('accept_spar',p.acceptedTick);
      }
      if(p.completedTick!==undefined){
        if(p.acceptedTick===undefined||!stamp(p.completedTick)||p.completedTick<=p.acceptedTick||
          p.eventId!==publicId(p.sparringId,p.completedTick))fail('apprenticeshipReunions.publicRound');
        source(p.eventId,p.completedTick,event=>samePublic(world,row,event));witnessed.add(p.eventId);
        if(native)source(`evt-${p.sparringId}-${p.completedTick}-round-1`,p.completedTick,event=>actualRound(world,row,event));
      }else if(p.eventId!==undefined)fail('apprenticeshipReunions.publicRound');
    }
  }
  for(const event of world.events)if((event.id.startsWith('evt-apprenticeship-reunion-')||event.id.endsWith('-reunion-public-practice'))&&
    !witnessed.has(event.id))fail('apprenticeshipReunions.orphan');
}
