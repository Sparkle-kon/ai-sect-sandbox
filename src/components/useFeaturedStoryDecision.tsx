import {useEffect,useState} from 'react';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {activeAvatar} from '../engine/avatarEngine';
import {activeDestinyTraitOffer,resolveGuidedDestinyTrait} from '../engine/destinyTraitEngine';
import {activeRoguelikeEncounter,resolveGuidedRoguelikeChoice} from '../engine/roguelikeEncounterEngine';
import type {DestinyTraitId} from '../types/destinyTrait';
import type {RoguelikeEncounterChoice} from '../types/roguelikeEncounter';
import {DestinyTraitCard} from './DestinyTraitCard';
import {RoguelikeEncounterCard} from './RoguelikeEncounterCard';

type Simulation=ReturnType<typeof useWorldSimulationController>;
export function useFeaturedStoryDecision(simulation:Simulation){
  const [dismissedEncounter,setDismissedEncounter]=useState<string>();
  const [chosenTrait,setChosenTrait]=useState<string>();
  const {world,preview,viewScopeKey,timeline,history,authority,saveContextVersion,browsing,stepInFlight,
    fastForwardRun,campaignGuard,updateWorld,isRunning,setIsRunning,isStepping,fastForwardLocked}=simulation;
  const actor=!preview?activeAvatar(world):undefined;
  const currentEncounter=actor&&activeRoguelikeEncounter(world,actor);
  const encounter=actor&&(currentEncounter?.guided?currentEncounter:
    world.roguelikeEncounters?.slice().reverse().find(record=>record.guided&&record.actorId===actor.id&&
      record.status==='resolved'&&record.resolvedTick===world.tick&&record.siteId===actor.locationId));
  const encounterScope=encounter&&`${viewScopeKey}:${encounter.id}`;
  const encounterPending=encounter?.status==='offered';
  const at=encounter&&world.locations.find(loc=>loc.id===encounter.siteId);
  const witness=encounter?.witnessId?world.cultivators.find(peer=>peer.id===encounter.witnessId&&
    peer.alive&&peer.locationId===encounter.siteId):undefined;

  const traitOffer=actor&&activeDestinyTraitOffer(world,actor);
  const traitReceipt=actor?.destinyTraits?.earned.find(row=>row.actorId===actor.id&&row.chosenTick===world.tick&&
    `${viewScopeKey}:${row.id}`===chosenTrait);
  const revision=saveContextVersion.current;
  const pending=Boolean(encounterPending||traitOffer);
  const busy=isStepping||fastForwardLocked;
  useEffect(()=>{if(pending&&isRunning)setIsRunning(false);},[pending,isRunning,setIsRunning]);

  const stillCurrent=()=>authority.current===world&&history.current===timeline&&saveContextVersion.current===revision&&
    !browsing.current&&!stepInFlight.current&&!fastForwardRun.current&&!campaignGuard.current&&activeAvatar(world)===actor;
  const chooseEncounter=(choice:RoguelikeEncounterChoice)=>{
    if(!encounterPending||!encounter||!stillCurrent())return;
    updateWorld(current=>current===world?resolveGuidedRoguelikeChoice(current,encounter.id,choice):current);
  };
  const encounterCard=encounter&&actor&&at&&encounterScope!==dismissedEncounter?
    <RoguelikeEncounterCard key={encounterScope} encounter={encounter} actorName={actor.name} siteName={at.name}
      witnessName={witness?.name} busy={busy} onChoose={chooseEncounter} onContinue={()=>setDismissedEncounter(encounterScope)}/>:undefined;
  const chooseTrait=(trait:DestinyTraitId)=>{
    if(encounterCard||!actor||!traitOffer?.options.includes(trait)||!stillCurrent()||activeDestinyTraitOffer(world,actor)!==traitOffer)return;
    const changed=updateWorld(current=>current===world?resolveGuidedDestinyTrait(current,traitOffer.id,trait):current);
    if(changed!==world)setChosenTrait(`${viewScopeKey}:${traitOffer.id}`);
  };
  const traitCard=actor&&(traitOffer?
    <DestinyTraitCard key={`${viewScopeKey}:${traitOffer.id}`} offer={traitOffer} actorName={actor.name} busy={busy} onChoose={chooseTrait}/>:
    traitReceipt?<DestinyTraitCard key={chosenTrait} awakening={traitReceipt} actorName={actor.name} busy={busy}
      onContinue={()=>setChosenTrait(undefined)}/>:undefined);
  return {card:encounterCard??traitCard,pending};
}
