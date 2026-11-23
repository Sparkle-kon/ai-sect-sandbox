export const SECT_RECURRING_ROLES=['wang','rival','cat','ancestor','host'] as const;
export type SectRecurringRole=typeof SECT_RECURRING_ROLES[number];
export const SECT_RECURRING_OUTCOMES=['debt_notice','market_remark','comparison','cat_sighting','pill_taken','ancestor_remark','host_cue','public_news'] as const;
export type SectRecurringOutcome=typeof SECT_RECURRING_OUTCOMES[number];
export const SECT_RECURRING_LIMIT=24;

export interface SectRecurringMemory {readonly actorId:string;readonly id:string}
export interface SectRecurringEncounter {
  readonly tick:number;
  readonly role:SectRecurringRole;
  readonly entityId:string;
  readonly outcome:SectRecurringOutcome;
  readonly siteId?:string;
  readonly sourceEventId?:string;
  readonly memory?:SectRecurringMemory;
  readonly recalled?:{readonly tick:number;readonly memory:SectRecurringMemory};
  readonly pill?:{readonly holderId:string;readonly id:'foundation'|'golden'|'barrier';readonly count:1};
}
export interface SectRecurringState {
  readonly openedTick:number;
  readonly ancestorSiteId:string;
  readonly catHomeSiteId:string;
  readonly encounters:readonly SectRecurringEncounter[];
}

/** Stable linkage to actual native bodies; a title or a replacement namesake is never a match. */
export function sectRecurringIdentity(sectId:string,creditorId:string){
  return {
    wang:creditorId,rival:`${sectId}-rival-person`,cat:`${sectId}-pill-cat`,
    ancestor:`${sectId}-backhill-ancestor`,host:'elder-tianji-1',
    rivalSectId:`${sectId}-rival-sect`,rivalSiteId:`${sectId}-rival-site`,
  } as const;
}

export const sectRecurringEventId=(tick:number,sectId:string,role:SectRecurringRole):string=>`evt-${tick}-${sectId}-guest-${role}`;

export const SECT_RECURRING_MEMORY_TEXT:Readonly<Record<SectRecurringOutcome,string>>={
  debt_notice:'记下一回宗门欠款提醒。',market_remark:'写过一回坊市闲话。',
  comparison:'曾与邻宗对照名望。',cat_sighting:'见过一回在近处停留的偷丹灵猫。',
  pill_taken:'亲眼见那只灵猫取走袖中一枚丹药。',ancestor_remark:'曾给邻近宗门留过一封短笺。',
  host_cue:'给同一间宗门留过一回开场词。',public_news:'曾点评过一桩知晓的公开见闻。',
};
