import type { Cultivator, DanxiaMedicineCommitment, MapPoint, ResourceFlowAccount, WorldState } from '../types/world';

export const DANXIA_MEDICINE_LEAVES = 2;
export const DANXIA_MEDICINE_OFFER_TICKS = 3;
export const DANXIA_MEDICINE_ACK_TICKS = 3;
export const DANXIA_MEDICINE_STRIDE = 3;
export const DANXIA_MEDICINE_MAX_STEPS = 24;
export const danxiaMedicineId = (shortageId:string) => `danxia-medicine-${shortageId}`;
export const flowDanxiaMedicine = (id:string):ResourceFlowAccount => ({kind:'danxia_medicine',id});
export const danxiaMedicineParties = (row:DanxiaMedicineCommitment): string[] =>
  [row.discipleId,row.patientId,...(row.escortId?[row.escortId]:[])];

/** Still responsible for real movement; no teleport after a lost package. */
export function activeDanxiaMedicineEscort(world:WorldState,actor:Cultivator):DanxiaMedicineCommitment|undefined {
  if(!actor.alive||actor.hp<=0)return undefined;
  return world.danxiaMedicine.commitments.find(row=>row.escortId===actor.id&&row.acceptedTick!==undefined&&
    (row.status==='in_transit'||row.status==='arrived'||row.status==='returning'||
     row.status==='lost'&&row.returnedTick===undefined&&row.returnStartedTick!==undefined));
}
export function danxiaMedicineActedThisTick(world:WorldState,actor:Cultivator):boolean {
  return world.danxiaMedicine.commitments.some(row=>row.escortId===actor.id&&row.lastMovedTick===world.tick);
}
export function danxiaMedicineCheckpoint(world:WorldState,actor:Cultivator):MapPoint|undefined {
  const row=activeDanxiaMedicineEscort(world,actor);
  const point=row?.path?.[row.pathIndex??-1];
  return point?{...point}:undefined;
}
