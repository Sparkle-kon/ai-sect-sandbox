import type {HeartDemonAftermath} from '../types/heartDemon';

export const HEART_DEMON_AFTERMATH_MONTHS=6;
export const heartDemonRecoveryEventId=(trialId:string,tick:number)=>`evt-dao-heart-mending-${trialId}-${tick}`;
export const isHeartDemonRecoveryEvent=(id:string)=>id.startsWith('evt-dao-heart-mending-');
export const heartDemonRecoveryQi=(row:Pick<HeartDemonAftermath,'choice'|'outcome'>):number=>
  ({sever:8,wrath:12,face:4}[row.choice])+(row.outcome==='failed'?4:0);
