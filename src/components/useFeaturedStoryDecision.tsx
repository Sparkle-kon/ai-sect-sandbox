import {useEffect,useState} from 'react';
import type {useWorldSimulationController} from '../controllers/useWorldSimulationController';
import {activeAvatar} from '../engine/avatarEngine';
import {projectGuidedHeartDemon,queueGuidedHeartDemonChoice,releaseGuidedHeartDemon} from '../engine/heartDemonEngine';
import type {WorldState} from '../types/world';
import type {HeartDemonChoice} from '../types/heartDemon';
import {HeartDemonTrialTheatre} from './HeartDemonTrialTheatre';
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
  const [dismissedHeart,setDismissedHeart]=useState<string>();
  const [releaseReceipt,setReleaseReceipt]=useState<{world:WorldState;scopeKey:string;
    view:NonNullable<ReturnType<typeof projectGuidedHeartDemon>>}>();
  const {world,preview,viewScopeKey,timeline,history,authority,saveContextVersion,browsing,stepInFlight,
    fastForwardRun,campaignGuard,updateWorld,isRunning,setIsRunning,isStepping,fastForwardLocked}=simulation;
  const actor=!preview?activeAvatar(world):undefined;
  // Trial protection comes from its own once-captured lease, never the ordinary avatar slot.
  const nativeHeart=!preview?projectGuidedHeartDemon(world):undefined;
  const heart=nativeHeart??(!preview&&releaseReceipt?.world===world&&releaseReceipt.scopeKey===viewScopeKey?releaseReceipt.view:undefined);
  const heartScope=heart&&`${viewScopeKey}:${heart.trialId}:${heart.frame.id}`;
  const heartPending=!!heart&&!heart.frame.result&&heart.frame.releasedTick===undefined&&heart.frame.cancelledTick===undefined;
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
  const pending=Boolean(heartPending||encounterPending||traitOffer);
  const busy=isStepping||fastForwardLocked;
  useEffect(()=>{if(pending&&isRunning)setIsRunning(false);},[pending,isRunning,setIsRunning]);

  const exactFrame=()=>authority.current===world&&history.current===timeline&&saveContextVersion.current===revision&&
    !browsing.current&&!stepInFlight.current&&!fastForwardRun.current&&!campaignGuard.current;
  const stillCurrent=()=>exactFrame()&&activeAvatar(world)===actor;
  const exactHeart=()=>{
    if(!heart||!heartPending||!exactFrame())return false;
    const current=projectGuidedHeartDemon(authority.current);
    return current?.actorId===heart.actorId&&current.trialId===heart.trialId&&current.frame.id===heart.frame.id&&
      current.frame.openedTick===heart.frame.openedTick&&current.frame.finalWaveEventId===heart.frame.finalWaveEventId&&
      current.frame.queued?.choice===heart.frame.queued?.choice&&current.frame.queued?.queuedTick===heart.frame.queued?.queuedTick&&
      current.frame.releasedTick===undefined&&current.frame.cancelledTick===undefined&&!current.frame.result;
  };
  const chooseHeart=(choice:HeartDemonChoice)=>{
    if(!heart||heart.frame.queued||!exactHeart())return false;
    return updateWorld(current=>current===world
      ?queueGuidedHeartDemonChoice(current,heart.actorId,heart.trialId,choice):current)!==world;
  };
  const releaseHeart=()=>{
    if(!heart||heart.frame.queued||!exactHeart())return false;
    const changed=updateWorld(current=>current===world?releaseGuidedHeartDemon(current,heart.actorId,heart.trialId):current);
    if(changed===world)return false;
    const trial=changed.cultivators.find(peer=>peer.id===heart.actorId)?.tribulation,frame=trial?.heartDemon;
    if(trial?.id===heart.trialId&&frame?.id===heart.frame.id&&frame.releasedTick===changed.tick)
      setReleaseReceipt({world:changed,scopeKey:viewScopeKey,view:{...heart,frame}});
    return true;
  };
  const advanceHeart=()=>{
    if(!heart?.frame.queued||!exactHeart())return false;
    void simulation.handleStepTick();
    return true;
  };
  const heartCard=heart&&heartScope!==dismissedHeart?
    <HeartDemonTrialTheatre key={heartScope} frame={heart.frame} actorName={heart.actorName} likenessName={heart.likenessName}
      busy={busy} onChoose={chooseHeart} onRelease={releaseHeart} onAdvance={advanceHeart}
      onContinue={()=>{setDismissedHeart(heartScope);setReleaseReceipt(undefined);}}/>:undefined;
  const chooseEncounter=(choice:RoguelikeEncounterChoice)=>{
    if(heartCard||!encounterPending||!encounter||!stillCurrent())return;
    updateWorld(current=>current===world?resolveGuidedRoguelikeChoice(current,encounter.id,choice):current);
  };
  const encounterCard=encounter&&actor&&at&&encounterScope!==dismissedEncounter?
    <RoguelikeEncounterCard key={encounterScope} encounter={encounter} actorName={actor.name} siteName={at.name}
      witnessName={witness?.name} busy={busy} onChoose={chooseEncounter} onContinue={()=>setDismissedEncounter(encounterScope)}/>:undefined;
  const chooseTrait=(trait:DestinyTraitId)=>{
    if(heartCard||encounterCard||!actor||!traitOffer?.options.includes(trait)||!stillCurrent()||activeDestinyTraitOffer(world,actor)!==traitOffer)return;
    const changed=updateWorld(current=>current===world?resolveGuidedDestinyTrait(current,traitOffer.id,trait):current);
    if(changed!==world)setChosenTrait(`${viewScopeKey}:${traitOffer.id}`);
  };
  const traitCard=actor&&(traitOffer?
    <DestinyTraitCard key={`${viewScopeKey}:${traitOffer.id}`} offer={traitOffer} actorName={actor.name} busy={busy} onChoose={chooseTrait}/>:
    traitReceipt?<DestinyTraitCard key={chosenTrait} awakening={traitReceipt} actorName={actor.name} busy={busy}
      onContinue={()=>setChosenTrait(undefined)}/>:undefined);
  return {card:heartCard??encounterCard??traitCard,pending};
}
