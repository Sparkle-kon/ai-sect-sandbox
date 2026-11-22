import { resolveGuidedFrontierGorgeTurn, type GuidedFrontierGorgeTurn } from './guidedFrontierGorgeTurn';
import { resolveGuidedPavilionFireTurn, type GuidedPavilionFireTurn } from './guidedPavilionFireTurn';
import { resolveGuidedCampaignAssemblyTurn, type GuidedCampaignAssemblyTurn } from './guidedCampaignAssemblyTurn';
import { resolveGuidedWitnessInquiryTurn, type GuidedWitnessInquiryTurn } from './guidedWitnessInquiryTurn';
import { resolveGuidedFrontierNightHuntTurn, type GuidedFrontierNightHuntTurn } from './guidedFrontierNightHuntTurn';
import { resolveGuidedSchoolFormDuelTurn, type GuidedSchoolFormDuelTurn } from './guidedSchoolFormDuelTurn';
import { resolveGuidedCalamityArrayTurn, type GuidedCalamityArrayTurn } from './guidedCalamityArrayTurn';
import {resolveGuidedBattlefieldRevisitTurn,type GuidedBattlefieldRevisitTurn} from './guidedBattlefieldRevisitTurn';
import {resolveGuidedHeartDemonRecoveryTurn,type GuidedHeartDemonRecoveryTurn} from './guidedHeartDemonRecoveryTurn';
import {resolveGuidedProtagonistFlightTurn,type GuidedProtagonistFlightTurn} from './guidedProtagonistFlightTurn';
import {resolveGuidedAscensionTurn,type GuidedAscensionTurn} from './guidedAscensionTurn';
import {resolveGuidedCultivationClanTurn,type GuidedCultivationClanTurn} from './guidedCultivationClanTurn';
import {resolveGuidedDaoPathTurn,type GuidedDaoPathTurn} from './guidedDaoPathTurn';
import {resolveGuidedDungeonTurn,type GuidedDungeonTurn} from './guidedDungeonTurn';
import {resolveGuidedHeavenlyAlchemyTurn,type GuidedHeavenlyAlchemyTurn} from './guidedHeavenlyAlchemyTurn';
import {resolveGuidedImmortalAuctionTurn,type GuidedImmortalAuctionTurn} from './guidedImmortalAuctionTurn';
import type {WorldState} from '../types/world';

export type GuidedWorldTurn=GuidedDungeonTurn|GuidedHeavenlyAlchemyTurn|GuidedDaoPathTurn|GuidedImmortalAuctionTurn|GuidedCultivationClanTurn|GuidedAscensionTurn|GuidedProtagonistFlightTurn|GuidedHeartDemonRecoveryTurn|GuidedBattlefieldRevisitTurn|GuidedCalamityArrayTurn|GuidedSchoolFormDuelTurn|GuidedFrontierNightHuntTurn|GuidedWitnessInquiryTurn|GuidedCampaignAssemblyTurn|GuidedPavilionFireTurn|GuidedFrontierGorgeTurn;

export function resolveGuidedWorldTurn(order:GuidedWorldTurn,world:WorldState,branch:string,revision:number){
  if(!('kind' in order))return resolveGuidedDungeonTurn(order,world,branch,revision);
  switch(order.kind){
    case 'frontier-gorge':return resolveGuidedFrontierGorgeTurn(order,world,branch,revision);
    case 'pavilion-fire':return resolveGuidedPavilionFireTurn(order,world,branch,revision);
    case 'campaign-assembly':return resolveGuidedCampaignAssemblyTurn(order,world,branch,revision);
    case 'witness-inquiry':return resolveGuidedWitnessInquiryTurn(order,world,branch,revision);
    case 'frontier-night-hunt':return resolveGuidedFrontierNightHuntTurn(order,world,branch,revision);
    case 'school-form-duel':return resolveGuidedSchoolFormDuelTurn(order,world,branch,revision);
    case 'calamity-array':return resolveGuidedCalamityArrayTurn(order,world,branch,revision);
    case 'battlefield-revisit':return resolveGuidedBattlefieldRevisitTurn(order,world,branch,revision);
    case 'heart-demon-recovery':return resolveGuidedHeartDemonRecoveryTurn(order,world,branch,revision);
    case 'protagonist-flight':return resolveGuidedProtagonistFlightTurn(order,world,branch,revision);
    case 'ascension':return resolveGuidedAscensionTurn(order,world,branch,revision);
    case 'cultivation-clan':return resolveGuidedCultivationClanTurn(order,world,branch,revision);
    case 'dao-path':return resolveGuidedDaoPathTurn(order,world,branch,revision);
    case 'heavenly-alchemy':return resolveGuidedHeavenlyAlchemyTurn(order,world,branch,revision);
    case 'immortal-auction':return resolveGuidedImmortalAuctionTurn(order,world,branch,revision);
  }
}
