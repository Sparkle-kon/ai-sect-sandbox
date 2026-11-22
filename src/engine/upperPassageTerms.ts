export const UPPER_PASSAGE_PATH=['loc-vein-north','realm-passage-lower-step','realm-passage-upper-step','realm-upper-gate','realm-upper-array','realm-upper-council'] as const;
export type UpperPassageNodeId=typeof UPPER_PASSAGE_PATH[number];
export type UpperPassageMove='enter'|'advance'|'turnback'|'read'|'petition';
export type UpperPositionPlane='threshold'|'upper';
export const UPPER_PASSAGE_FEE=8;
export const UPPER_PASSAGE_STANDARD_PETITION=10;
export const UPPER_PASSAGE_RELIEF_PETITION=4;
export const UPPER_PASSAGE_NODE_NAMES:Readonly<Record<UpperPassageNodeId,string>>={
 'loc-vein-north':'寒玉井边','realm-passage-lower-step':'下界门槛','realm-passage-upper-step':'界隙石阶',
 'realm-upper-gate':'上界天门台','realm-upper-array':'上界观阵庭','realm-upper-council':'上界议事廊',
};
export type UpperPassageDirection='outbound'|'inbound';
export interface UpperPassageStep {
 tick:number;nodeId:UpperPassageNodeId;direction:UpperPassageDirection;crossingOpeningId?:string;
}
export interface UpperPassageLossProof {plotId:string;sampleTick:number;fieldDeficit:number;harvestedTick:number;yield:0|1}
export interface UpperPassageReading {
 tick:number;openingId:string;wellProjectId:string;veinId:'north-cold-water';siteId:'loc-vein-north';loss?:UpperPassageLossProof;
}
export interface UpperPassagePetition {tick:number;paidStones:4|10;outcome:'lower_relief'|'ordinary';readingTick:number}
export interface UpperPassageJourney {
 id:string;actorId:string;openingId:string;wellProjectId:string;enteredTick:number;paidStones:8;
 direction:UpperPassageDirection;steps:UpperPassageStep[];returnedTick?:number;deceasedTick?:number;
 reading?:UpperPassageReading;petition?:UpperPassagePetition;
}
export interface UpperPassageState {version:1;journeys:UpperPassageJourney[];upperReserve:number}
export const upperPassageId=(tick:number,actorId:string):string=>`upper-passage-${tick}-${actorId}`;
export const upperPassageIndex=(nodeId:string):number=>UPPER_PASSAGE_PATH.findIndex(node=>node===nodeId);
export function upperPassagePlane(nodeId:UpperPassageNodeId):UpperPositionPlane|undefined{
 const i=upperPassageIndex(nodeId);return i>2?'upper':i>0?'threshold':undefined;
}
export const upperPassageThroat=(from:number,to:number):boolean=>Math.min(from,to)===1&&Math.max(from,to)===2;
