import type { NativeDuelRolls } from '../types/forbiddenArt';
import type { SchoolFormDuelChoice, SchoolFormDuelContact } from '../types/schoolFormDuel';
import type { Cultivator, WorldEvent, WorldState } from '../types/world';
import { taughtSwordProof, validStoredTaughtSwordPractice } from './taughtSwordForm';
import { doctrineFoundingPhysicallyAt } from './doctrineFoundingEngine';

export const SCHOOL_FORM_QI = 10;
const TTL = 2;
const prefix = 'school-form-';
const privatePrefix = 'evt-school-form-private-';
const publicPrefix = 'evt-school-form-stroke-';
const strokeTitle = '回刃实落';
const strokeDescription = '一道回锋确在交锋里落下。';
const unique = <T>(values:readonly T[], predicate:(item:T)=>boolean) => {
  const matches = values.filter(predicate);
  return matches.length === 1 ? matches[0] : undefined;
};
const actor = (world:WorldState,id:string) => unique(world.cultivators,row=>row.id===id);
const idFor = (tick:number,attacker:string,defender:string) => `${prefix}${tick}-${attacker}-${defender}`;

export function schoolFormDuelForParticipant(world:WorldState, body:Cultivator) {
  return unique(world.schoolFormDuels??[],row=>row.attackerId===body.id||row.defenderId===body.id);
}

function canonicalContact(world:WorldState, contact:SchoolFormDuelContact) {
  if (contact.id!==idFor(contact.openedTick,contact.attackerId,contact.defenderId) ||
    world.tick<contact.openedTick || world.tick>contact.openedTick+TTL) return undefined;
  const learner=actor(world,contact.attackerId),mentor=actor(world,contact.defenderId);
  if (!learner || !mentor || learner===mentor || learner.locationId!==contact.siteId || mentor.locationId!==contact.siteId ||
    schoolFormDuelForParticipant(world,learner)!==contact || schoolFormDuelForParticipant(world,mentor)!==contact) return undefined;
  if (!exactPrivateScene(world,'noticed',contact.id,learner.id,contact.siteId,contact.openedTick)) return undefined;
  const proof=taughtSwordProof(world,learner,mentor);
  if (!proof || proof.tuitionId!==contact.lessonId || proof.practiceTick!==contact.practiceTick ||
    proof.practiceTick>=contact.openedTick) return undefined;
  return {learner,mentor,proof};
}

export function openSchoolFormDuel(world:WorldState,learner:Cultivator,mentor:Cultivator,rolls:NativeDuelRolls) {
  if (schoolFormDuelForParticipant(world,learner)||schoolFormDuelForParticipant(world,mentor) ||
    rolls.length!==4||rolls.some(roll=>!Number.isFinite(roll)||roll<0||roll>=1)) return undefined;
  const proof=taughtSwordProof(world,learner,mentor);
  if (!proof || proof.practiceTick>=world.tick) return undefined;
  const contact:SchoolFormDuelContact={id:idFor(world.tick,learner.id,mentor.id),attackerId:learner.id,defenderId:mentor.id,
    lessonId:proof.tuitionId,practiceTick:proof.practiceTick,siteId:learner.locationId,openedTick:world.tick,
    rolls:[...rolls]};
  world.schoolFormDuels=[...(world.schoolFormDuels??[]),contact];
  return contact;
}

export function deadSchoolFormContacts(world:WorldState) {
  if (!world.schoolFormDuels?.length) return;
  const keep=world.schoolFormDuels.filter(contact=>canonicalContact(world,contact));
  if (keep.length) world.schoolFormDuels=keep;
  else delete world.schoolFormDuels;
}

export function closeSchoolFormDuel(world:WorldState,contact:SchoolFormDuelContact) {
  const keep=world.schoolFormDuels?.filter(row=>row!==contact);
  if (keep?.length) world.schoolFormDuels=keep;
  else delete world.schoolFormDuels;
}

export function availableSchoolFormChoices(world:WorldState,contact:SchoolFormDuelContact):SchoolFormDuelChoice[] {
  const current=canonicalContact(world,contact);
  return !current ? [] : current.learner.qiProgress >= SCHOOL_FORM_QI ? ['counter','stop'] : ['stop'];
}

export function schoolFormDuelView(world:WorldState,viewer:Cultivator) {
  const contact=schoolFormDuelForParticipant(world,viewer);
  const here=contact&&canonicalContact(world,contact);
  if (!contact||here?.learner!==viewer) return undefined;
  const site=unique(world.locations,row=>row.id===contact.siteId);
  if (!site) return undefined;
  return {contactId:contact.id,actorName:viewer.name,opponentName:here.mentor.name,siteName:site.name,
    options:availableSchoolFormChoices(world,contact)};
}

const words={
    noticed:['手随旧式一滞','来锋未落，你认出了那路亲领又练过的剑式。是还剑，还是收回自己的挑战？'],
    counter:['还了一式','照着真正习过的旧路回剑，实耗十点灵气；胜负仍由交锋决定。'],
    stop:['剑锋收回','你亲自撤回这次挑战。对方没有替你点头，也未因此受伤。'],
} as const;
function exactPrivateScene(world:WorldState,phase:'noticed'|'counter'|'stop',contactId:string,
  actorId:string,siteId:string,at:number) {
  const receipt=unique(world.events,row=>row.id===`${privatePrefix}${phase}-${contactId}`);
  return receipt?.tick===at&&world.year*12+world.month-(receipt.year*12+receipt.month)===world.tick-at&&
    receipt.title===words[phase][0]&&receipt.description===words[phase][1]&&receipt.locationId===siteId&&
    receipt.actorIds[0]===actorId&&receipt.actorIds.length===(phase==='stop'?2:1)&&
    receipt.category==='combat'&&isPrivateSchoolFormEvent(receipt)?receipt:undefined;
}

export function schoolFormPrivateEvent(world:WorldState,contact:SchoolFormDuelContact,
  phase:'noticed'|'counter'|'stop'):WorldEvent{
  return {id:`${privatePrefix}${phase}-${contact.id}`,tick:world.tick,year:world.year,month:world.month,
    title:words[phase][0],description:words[phase][1],category:'combat',
    actorIds:phase==='stop'?[contact.attackerId,contact.defenderId]:[contact.attackerId],
    locationId:contact.siteId,witnessScope:'participants'};
}

export function isPrivateSchoolFormEvent(event:WorldEvent) {
  return event.witnessScope==='participants'&&event.id.startsWith(privatePrefix);
}

const paidInTurn = new WeakSet<SchoolFormDuelContact>();
export function schoolFormCounterPayment(world:WorldState,contact:SchoolFormDuelContact) {
  const current=canonicalContact(world,contact);
  if (!current || paidInTurn.has(contact) || current.learner.qiProgress<SCHOOL_FORM_QI || world.tick<=contact.openedTick) return undefined;
  paidInTurn.add(contact);
  current.learner.qiProgress-=SCHOOL_FORM_QI;
  return {ownerId:current.learner.id,scoreMultiplier:1.15,incomingMultiplier:1};
}

export function schoolFormActualStroke(world:WorldState,contact:SchoolFormDuelContact,duel:WorldEvent):WorldEvent|undefined {
  if (duel.tick!==world.tick || duel.locationId!==contact.siteId || duel.witnessScope!==undefined ||
    !duel.duelWinnerId || duel.actorIds[0]!==contact.attackerId || duel.actorIds[1]!==contact.defenderId ||
    !duel.damage?.some(hit=>hit.cultivatorId===contact.defenderId&&hit.amount>0)) return undefined;
  return {...date(world), id:`${publicPrefix}${duel.id}`, title:strokeTitle,description:strokeDescription,
    category:'combat',actorIds:[contact.attackerId,contact.defenderId],locationId:contact.siteId};
}
const date=(world:WorldState)=>({tick:world.tick,year:world.year,month:world.month});

export function projectSchoolFormStrokes(world:WorldState) {
  const output:{actorId:string;opponentId:string;siteId:string}[]=[];
  for (const row of world.events) {
    if (row.tick!==world.tick||row.year!==world.year||row.month!==world.month||row.title!==strokeTitle ||
      row.description!==strokeDescription||row.witnessScope!==undefined||row.category!=='combat'||
      row.actorIds.length!==2||!row.locationId||!row.id.startsWith(publicPrefix)||
      unique(world.events,event=>event.id===row.id)!==row) continue;
    const duel=unique(world.events,event=>event.id===row.id.slice(publicPrefix.length));
    const [actorId,opponentId]=row.actorIds;
    if (!duel||duel.tick!==row.tick||duel.year!==row.year||duel.month!==row.month||duel.locationId!==row.locationId||
      duel.witnessScope!==undefined||!duel.duelWinnerId||duel.actorIds[0]!==actorId||duel.actorIds[1]!==opponentId||
      !duel.damage?.some(hit=>hit.cultivatorId===opponentId&&hit.amount>0)) continue;
    if (![1,2].some(delta=>exactPrivateScene(world,'counter',idFor(row.tick-delta,actorId,opponentId),
      actorId,row.locationId??'',row.tick))) continue;
    const first=actor(world,actorId),second=actor(world,opponentId);
    if (!first||!second||!doctrineFoundingPhysicallyAt(world,first,row.locationId,world.tick)) continue;
    const witnessedDeath = !second.alive&&second.hp===0&&second.locationId===row.locationId&&
      duel.category==='death'&&duel.duelWinnerId===actorId;
    if (!witnessedDeath&&!doctrineFoundingPhysicallyAt(world,second,row.locationId,world.tick)) continue;
    output.push({actorId,opponentId,siteId:row.locationId});
  }
  return output;
}

/** Saves reject structurally forged lineage and duplicated contact participants before any resumption. */
export function validateSchoolFormDuelSave(world:WorldState,fail:(path:string)=>never) {
  for (const offer of world.mentorship.offers)
    if (offer.swordPractice && !validStoredTaughtSwordPractice(world,offer))
      fail('mentorship.offers.swordPractice');
  const involved=new Set<string>();
  for(const contact of world.schoolFormDuels??[]){
    const offer=unique(world.mentorship.offers,row=>row.id===contact.lessonId);
    if(involved.has(contact.attackerId)||involved.has(contact.defenderId)||contact.attackerId===contact.defenderId||
      !actor(world,contact.attackerId)||!actor(world,contact.defenderId)||!world.locations.some(site=>site.id===contact.siteId)||
      !offer?.swordPractice||offer.studentId!==contact.attackerId||offer.mentorId!==contact.defenderId||
      offer.swordPractice.tick!==contact.practiceTick||contact.practiceTick>=contact.openedTick||
      contact.openedTick>world.tick||contact.openedTick+TTL<world.tick||contact.rolls.length!==4||contact.rolls.some(roll=>roll>=1)||
      contact.id!==idFor(contact.openedTick,contact.attackerId,contact.defenderId)||
      !exactPrivateScene(world,'noticed',contact.id,contact.attackerId,contact.siteId,contact.openedTick))fail('schoolFormDuels');
    involved.add(contact.attackerId);involved.add(contact.defenderId);
  }
}

export function schoolFormStoryReceipt(world:WorldState,actorId:string,contactId:string,choice:SchoolFormDuelChoice){
  const receipt=unique(world.events,row=>row.id===`${privatePrefix}${choice}-${contactId}`);
  if (!receipt?.locationId||!exactPrivateScene(world,choice,contactId,actorId,receipt.locationId,world.tick)) return undefined;
  return {title:receipt.title,description:receipt.description};
}
