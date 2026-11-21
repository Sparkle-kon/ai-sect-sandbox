import type {Cultivator, HerbId, LLMDecisionPayload, OrdinaryAction, OrdinaryActionEvidence, WorldEvent} from '../types/world';

const ACTIONS:ReadonlySet<string>=new Set(['REST','CULTIVATE','SOCIALIZE','EXPLORE','GATHER_HERBS']);
const HERBS:ReadonlySet<string>=new Set(['jade_leaf','earth_root','star_bloom','shadow_moss']);
const knownAction=(value:unknown):value is OrdinaryAction=>typeof value==='string'&&ACTIONS.has(value);
const knownHerb=(value:unknown):value is HerbId=>typeof value==='string'&&HERBS.has(value);
const tickValid=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=1;

export function isOrdinaryActionEvidence(value:unknown,throughTick=Number.MAX_SAFE_INTEGER):value is OrdinaryActionEvidence {
  if(!value||typeof value!=='object'||Array.isArray(value)||!tickValid(throughTick))return false;
  const data=value as Record<string,unknown>;
  return Object.keys(data).length===3&&Object.hasOwn(data,'action')&&Object.hasOwn(data,'tick')&&Object.hasOwn(data,'streak')&&
    knownAction(data.action)&&tickValid(data.tick)&&data.tick<=throughTick&&
    (data.streak===1||data.streak===2||data.streak===3)&&data.streak<=data.tick;
}

interface OrdinaryPreBase {
  readonly actorId:string;
  readonly siteId:string;
}
export type OrdinaryActionObservation=OrdinaryPreBase&(
  | {readonly action:'REST';readonly hp:number;readonly toxicity:number}
  | {readonly action:'CULTIVATE';readonly hp:number;readonly qi:number;readonly mastery:number}
  | {readonly action:'EXPLORE';readonly requestedId?:string}
  | {readonly action:'SOCIALIZE';readonly requestedId?:string}
  | {readonly action:'GATHER_HERBS';readonly herb:HerbId;readonly priorAmount:number}
);

/** Capture only the local scalars required to prove one actually attempted ordinary action. */
export function snapshotOrdinaryAction(actor:Cultivator,decision:LLMDecisionPayload):OrdinaryActionObservation|undefined {
  const {chosenAction}=decision;
  if(!knownAction(chosenAction)||!actor.alive||actor.hp<=0)return;
  const base={actorId:actor.id,siteId:actor.locationId};
  if(chosenAction==='REST')return {...base,action:chosenAction,hp:actor.hp,toxicity:actor.pillToxicity};
  if(chosenAction==='CULTIVATE')return {...base,action:chosenAction,hp:actor.hp,qi:actor.qiProgress,mastery:actor.techniqueMastery};
  if(chosenAction==='EXPLORE')return {...base,action:chosenAction,requestedId:decision.targetLocationId};
  if(chosenAction==='SOCIALIZE')return {...base,action:chosenAction,requestedId:decision.targetCultivatorId};
  if(knownHerb(decision.targetHerbId))return {...base,action:chosenAction,herb:decision.targetHerbId,priorAmount:actor.herbs[decision.targetHerbId]};
}
export interface OrdinaryActionApplication {
  readonly applied:boolean;
  readonly avatar:boolean;
  readonly event?:WorldEvent|null;
}

function actualOrdinaryEffect(actor:Cultivator,tick:number,observation:OrdinaryActionObservation,event?:WorldEvent|null):boolean {
  switch(observation.action){
    case 'REST':
      return actor.locationId===observation.siteId&&(actor.hp>observation.hp||actor.pillToxicity<observation.toxicity);
    case 'CULTIVATE':
      return actor.locationId===observation.siteId&&(actor.hp>observation.hp||actor.qiProgress>observation.qi||
        actor.techniqueMastery>observation.mastery);
    case 'EXPLORE':
      return actor.locationId!==observation.siteId&&(observation.requestedId===undefined||actor.locationId===observation.requestedId);
    case 'SOCIALIZE':
      return !!event&&event.id===`evt-${tick}-${actor.id}-social`&&event.tick===tick&&event.category==='diplomacy'&&
        actor.locationId===observation.siteId&&event.locationId===observation.siteId&&event.actorIds.length===2&&
        event.actorIds[0]===actor.id&&event.actorIds[1]!==actor.id&&
        (observation.requestedId===undefined||event.actorIds[1]===observation.requestedId);
    case 'GATHER_HERBS':
      return !!event&&event.id===`evt-${tick}-${actor.id}-alchemy`&&event.tick===tick&&event.category==='breakthrough'&&
        actor.locationId===observation.siteId&&event.locationId===observation.siteId&&event.actorIds.length===1&&event.actorIds[0]===actor.id&&actor.herbs[observation.herb]>observation.priorAmount;
  }
}

/** Only the completed native dispatcher should call this, after the chosen actor's actual effect. */
export function recordOrdinaryActionEvidence(actor:Cultivator,tick:number,decision:LLMDecisionPayload,
  before:OrdinaryActionObservation|undefined,application:OrdinaryActionApplication):boolean {
  if(!application.applied||application.avatar||!before||!tickValid(tick)||!actor.alive||actor.hp<=0||
    before.actorId!==actor.id||before.action!==decision.chosenAction||actor.currentAction!==before.action||
    !actualOrdinaryEffect(actor,tick,before,application.event))return false;
  const previous=actor.ordinaryActionEvidence;
  if(isOrdinaryActionEvidence(previous)&&previous.tick>=tick)return false;
  const streak=previous&&isOrdinaryActionEvidence(previous,tick)&&previous.tick===tick-1&&previous.action===before.action?
    previous.streak===1?2:3:1;
  actor.ordinaryActionEvidence={action:before.action,tick,streak};
  return true;
}

/** Only immediately preceding proof affects choice; old or absent data cannot imply repetition. */
export function ordinaryActionAttention(actor:Cultivator,executionTick:number):{last?:OrdinaryAction;run:number} {
  const evidence=actor.ordinaryActionEvidence;
  return tickValid(executionTick)&&isOrdinaryActionEvidence(evidence,executionTick-1)&&evidence.tick===executionTick-1?
    {last:evidence.action,run:evidence.streak}:{run:0};
}
