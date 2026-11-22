export type AscensionMove='start'|'guard'|'advance'|'retreat';
export type AscensionStance=Extract<AscensionMove,'guard'|'advance'>;
export type AscensionWaveNumber=1|2|3;
export type AscensionPhase='warning'|'lightning'|'succeeded'|'failed'|'retreated';
export interface AscensionWave {
  wave:AscensionWaveNumber;tick:number;year:number;month:number;stance:AscensionStance;eventId:string;
  maxHp:number;beforeHp:number;afterHp:number;qiBefore:number;qiPaid:4|8;
}
export interface AscensionTerminal {
  status:'succeeded'|'failed'|'retreated';tick:number;year:number;month:number;eventId:string;
  reason?:'lightning'|'interrupted';
}
export interface AscensionTrial {
  id:string;actorId:string;siteId:string;sectIdBefore:string;
  startedTick:number;startedYear:number;startedMonth:number;
  openingQiPaid:15;phase:AscensionPhase;waves:AscensionWave[];terminal?:AscensionTerminal;
}
export interface AscensionState {trials:AscensionTrial[]}
