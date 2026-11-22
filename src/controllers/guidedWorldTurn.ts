import {resolveGuidedProtagonistFlightTurn,type GuidedProtagonistFlightTurn} from './guidedProtagonistFlightTurn';
import {resolveGuidedAscensionTurn,type GuidedAscensionTurn} from './guidedAscensionTurn';
import {resolveGuidedCultivationClanTurn,type GuidedCultivationClanTurn} from './guidedCultivationClanTurn';
import {resolveGuidedDaoPathTurn,type GuidedDaoPathTurn} from './guidedDaoPathTurn';
import {resolveGuidedDungeonTurn,type GuidedDungeonTurn} from './guidedDungeonTurn';
import {resolveGuidedHeavenlyAlchemyTurn,type GuidedHeavenlyAlchemyTurn} from './guidedHeavenlyAlchemyTurn';
import {resolveGuidedImmortalAuctionTurn,type GuidedImmortalAuctionTurn} from './guidedImmortalAuctionTurn';
import type {WorldState} from '../types/world';

export type GuidedWorldTurn=GuidedDungeonTurn|GuidedHeavenlyAlchemyTurn|GuidedDaoPathTurn|GuidedImmortalAuctionTurn|GuidedCultivationClanTurn|GuidedAscensionTurn|GuidedProtagonistFlightTurn;

export function resolveGuidedWorldTurn(order:GuidedWorldTurn,world:WorldState,branch:string,revision:number){
  if(!('kind' in order))return resolveGuidedDungeonTurn(order,world,branch,revision);
  switch(order.kind){
    case 'protagonist-flight':return resolveGuidedProtagonistFlightTurn(order,world,branch,revision);
    case 'ascension':return resolveGuidedAscensionTurn(order,world,branch,revision);
    case 'cultivation-clan':return resolveGuidedCultivationClanTurn(order,world,branch,revision);
    case 'dao-path':return resolveGuidedDaoPathTurn(order,world,branch,revision);
    case 'heavenly-alchemy':return resolveGuidedHeavenlyAlchemyTurn(order,world,branch,revision);
    case 'immortal-auction':return resolveGuidedImmortalAuctionTurn(order,world,branch,revision);
  }
}
