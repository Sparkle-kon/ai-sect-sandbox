export const CRAFT_TRAINING_OFFER_TICKS=4;
export const CRAFT_TRAINING_WORK_TICKS=6;

export type CraftTrainingMove='offer'|'join'|'decline'|'blank'|'finish'|'withdraw';
export type CraftTrainingStatus='offered'|'funded'|'blank'|'completed'|'failed'|'declined'|'withdrawn'|'expired'|'unavailable';
export type CraftTrainingOption={action:'CRAFT_TRAINING'}&(
  {craftTrainingMove:'offer';targetCultivatorId:string;targetCraftTraineeId:string;targetCraftTrainingId?:never}|
  {craftTrainingMove:Exclude<CraftTrainingMove,'offer'>;targetCraftTrainingId:string;targetCultivatorId?:never;targetCraftTraineeId?:never}
);
export interface CraftTrainingStage {
  tick:number;
  actorId:string;
  stonesUsed:number;
  rootsUsed:1;
  slot:1|2|3;
  masteryBefore:number;
  masteryAfter:number;
}
export interface CraftTrainingBlank extends CraftTrainingStage {id:string}
export interface CraftTrainingFinish extends CraftTrainingStage {
  blankId:string;
  furnaceGrade:number;
  rootMatched:boolean;
  strained:boolean;
  qualityScore:number;
  grade:'failed'|'standard'|'fine';
  artifactId?:string;
}
export interface CraftTrainingOrigin {
  projectId:string;
  blankId:string;
  siteId:string;
  keeperId:string;
  firstTraineeId:string;
  secondTraineeId:string;
  blankTick:number;
  finishedTick:number;
}
export interface CraftTrainingProject {
  id:string;
  siteId:string;
  sectId:string;
  keeperId:string;
  traineeIds:[string,string];
  offeredTick:number;
  offerExpiresTick:number;
  status:CraftTrainingStatus;
  firstJoinedTick?:number;
  secondJoinedTick?:number;
  fundedTick?:number;
  workExpiresTick?:number;
  closedTick?:number;
  closedById?:string;
  unavailableReason?:'keeper'|'site'|'trainee';
  escrowStones:number;
  escrowRoots:number;
  refundedStones:number;
  refundedRoots:number;
  blank?:CraftTrainingBlank;
  finish?:CraftTrainingFinish;
}
export interface CraftTrainingState {version:1;nextId:number;projects:CraftTrainingProject[]}
export const craftTrainingId=(serial:number)=>`craft-training-${serial}`;
export const craftTrainingBlankId=(id:string)=>`craft-training-blank-${id}`;
export const craftTrainingArtifactId=(id:string)=>`craft-training-artifact-${id}`;
export type CraftTrainingPhase='offer'|'join-first'|'join-second'|'blank'|'finish'|'declined'|'withdrawn'|'expired'|'unavailable';
export const craftTrainingEventId=(id:string,tick:number,phase:CraftTrainingPhase)=>`evt-${id}-${tick}-${phase}`;
