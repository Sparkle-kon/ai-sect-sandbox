import type {Cultivator,LocationNode,Sect,WorldState} from '../types/world';
import type {RoguelikeEncounterChoice,RoguelikeEncounterRecord,SectGateTrialStamp} from '../types/roguelikeEncounter';
import {activeAvatar} from './avatarEngine';
import {isScopedExpeditionGate} from './expeditionOmenTerms';
import {activePilgrimageForActor} from './pilgrimageEngine';
import {sparringLocksActor} from './sparringEngine';
import {disasterShelterLocksTravel} from './disasterShelterCheckpoint';
import {ascensionDutyActive} from './ascensionPresence';
import {isSectActive} from './sectActivity';
import {ROGUELIKE_ENCOUNTER_CATALOG} from './roguelikeEncounterCatalog';

type Standstill=(world:WorldState,actor:Cultivator|undefined,siteId:string)=>actor is Cultivator;
function unique<T extends {id:string}>(items:readonly T[],id:string|undefined):T|undefined{
  const exact=items.filter(row=>row.id===id);
  return exact.length===1?exact[0]:undefined;
}

export function isSectGatePublicSite(site:LocationNode|undefined):site is LocationNode{
  return !!site&&!isScopedExpeditionGate(site)&&(site.type==='sect_hq'||site.type==='market'||site.type==='spirit_vein'||
    (site.id==='loc-blood'&&site.type==='abyss'&&site.ownerSectId==='sect-bloodmoon'));
}

export function sectGateNominalReputation(alignment:Sect['alignment'],choice:RoguelikeEncounterChoice):number{
  if(choice==='leave')return 0;
  return alignment==='正道'?(choice==='cautious'?2:1):(choice==='bold'?2:1);
}

export function sectGateReputationDelta(alignment:Sect['alignment'],choice:RoguelikeEncounterChoice,before:number):number{
  return Number.isFinite(before)?Math.max(0,Math.min(100-before,sectGateNominalReputation(alignment,choice))):0;
}

const closing:Record<RoguelikeEncounterChoice,{title:string;description:string}>={
  cautious:{title:'拜山试心：守诺',description:'门前所问，只以本门现行规矩作答。不替旁人应承，也不在山门外另开条件。'},
  bold:{title:'拜山试心：识破',description:'问答到了关节处，没有去接多出来的一句。这里能做的，只按本门现行规矩来。'},
  leave:{title:'拜山试心：离开',description:'只在山门前止了这一问。没有答应什么，也没有留下新的承诺。'},
};
export function sectGateReceiptText(choice?:RoguelikeEncounterChoice):{title:string;description:string}{
  if(choice)return closing[choice];
  const {title,scene:description}=ROGUELIKE_ENCOUNTER_CATALOG['sect-gate'];
  return {title,description};
}

function freeOfOtherDuties(world:WorldState,actor:Cultivator):boolean{
  return !activePilgrimageForActor(world,actor)&&!sparringLocksActor(world,actor)&&!ascensionDutyActive(world,actor)&&
    !disasterShelterLocksTravel(world,actor)&&
    !world.forbiddenDuels?.some(row=>row.attackerId===actor.id||row.defenderId===actor.id);
}
function localAuthority(world:WorldState,actor:Cultivator,originId:string,siteId:string,stationary:Standstill):
  {stamp:SectGateTrialStamp;sect:Sect}|undefined{
  const possessionUntilTick=world.playerAvatar.possessionUntilTick;
  if(actor.locationId!==siteId||originId===siteId||!actor.sectId||activeAvatar(world)!==actor||
    possessionUntilTick===undefined||!Number.isSafeInteger(possessionUntilTick)||possessionUntilTick<=world.tick||
    possessionUntilTick>world.tick+5||
    !stationary(world,actor,siteId)||!freeOfOtherDuties(world,actor))return undefined;
  const origin=unique(world.locations,originId),site=unique(world.locations,siteId),sect=unique(world.sects,actor.sectId);
  if(!isSectGatePublicSite(origin)||!isSectGatePublicSite(site)||!(site.type==='sect_hq'||site.type==='abyss'&&site.id==='loc-blood')||
    !isSectActive(sect)||sect.headquartersId!==site.id||
    site.ownerSectId!==sect.id||!Number.isFinite(sect.reputation))return undefined;
  const leader=unique(world.cultivators,sect.leaderId);
  if(!leader||leader===actor||leader.sectId!==sect.id||leader.sectRank!=='掌门'||
    !stationary(world,leader,site.id)||!freeOfOtherDuties(world,leader))return undefined;
  return {stamp:{sectId:sect.id,leaderId:leader.id,possessionUntilTick},sect};
}

export function openSectGateTrialStamp(world:WorldState,actor:Cultivator,originId:string,stationary:Standstill):
  SectGateTrialStamp|undefined{
  return actor.currentAction==='EXPLORE'?localAuthority(world,actor,originId,actor.locationId,stationary)?.stamp:undefined;
}

export function currentSectGateTrialAuthority(world:WorldState,actor:Cultivator,row:RoguelikeEncounterRecord,stationary:Standstill):
  Sect|undefined{
  const before=row.sectGate;
  if(row.kind!=='sect-gate'||!before||!row.guided||row.witnessId!==undefined||row.openedTick!==world.tick||
    row.status!=='offered'||row.actorId!==actor.id)return undefined;
  const now=localAuthority(world,actor,row.fromSiteId,row.siteId,stationary);
  return now&&now.stamp.sectId===before.sectId&&now.stamp.leaderId===before.leaderId&&
    now.stamp.possessionUntilTick===before.possessionUntilTick?now.sect:undefined;
}
