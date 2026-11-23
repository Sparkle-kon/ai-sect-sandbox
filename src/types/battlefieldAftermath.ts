export type BattlefieldAftermathMove='remain'|'return'|'offer_care'|'accept_care';
export type BattlefieldAftermathOption={action:'BATTLEFIELD_AFTERMATH';targetBattlefieldAftermathId:string}&(
  {battlefieldAftermathMove:'remain';targetLocationId?:never;targetCultivatorId?:never}|
  {battlefieldAftermathMove:'return';targetLocationId:string;targetCultivatorId?:never}|
  {battlefieldAftermathMove:'offer_care'|'accept_care';targetCultivatorId:string;targetLocationId?:never});
export interface BattlefieldAftermathApproach {actorId:string;defenderSectId:string;siteId:string;tick:number;fromSiteId:string}
export interface BattlefieldAftermathCase {
  id:string;siegeId:string;siteId:string;actorId:string;terminalTick:number;terminalEventId:string;
  leftTick?:number;
  approach?:{tick:number;fromSiteId:string};
  decision?:{move:BattlefieldAftermathMove;tick:number;targetLocationId?:string;targetCultivatorId?:string;healedHp?:number};
}
export interface BattlefieldAftermathState {approaches:BattlefieldAftermathApproach[];cases:BattlefieldAftermathCase[]}
export interface BattlefieldAftermathView {siteName:string;siteId?:string;options:readonly BattlefieldAftermathOption[];receipt?:{title:string;description:string}}
