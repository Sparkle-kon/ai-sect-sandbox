import { takeDirectorHighlightDecision } from '../director/directorHighlights';
import type { Cultivator, DecisionTraceCandidate, LLMDecisionPayload, WorldEvent } from '../../types/world';
import type { TickActionPorts, WorldTickContext } from './tickContext';
import { onLowerPlane } from '../upperPassageIsolation';
import { dropInheritance } from '../techniqueEngine';
import { recordFrontierDeath } from '../frontierMovementEngine';
import { recordUpperPassageDeath } from '../upperPassageEngine';
import { witnessEvent } from '../rumorEngine';
import { ascensionDutyActive } from '../ascensionPresence';
import { isProviderPersonaDecision, availableAutonomousAscensionActions, utilityAscensionDecision, computeHeuristicDecision } from '../llmBrain';
import { exactAscensionDecision, ascensionQuietWait } from '../ascensionCognition';
import { availableAscensionActions } from '../ascensionEngine';
import { rememberReplayDecision, recordDecisionTrace } from '../decisionTraceEngine';
import { renewRegionalProtectionAfterEvent } from '../regionalSimulationEngine';
import { activeAvatar } from '../avatarEngine';
import { exactFarewellLandingDecision } from '../farewellLandingCognition';
import { availableFarewellLandingActions, isPrivateFarewellLandingEvent } from '../farewellLanding';
import { exactFrontierGorgeDecision } from '../frontierGorgeCognition';
import { availableFrontierGorgeActions, isPrivateFrontierGorgeEvent } from '../frontierGorge';
import { exactFrontierNightHuntDecision } from '../frontierNightHuntCognition';
import { availableFrontierNightHuntActions, isPrivateFrontierNightHuntEvent } from '../frontierNightHunt';
import { isFrontierAction } from '../frontierActions';
import { isUpperArrayFieldAction } from '../upperArrayFieldActions';
import { isTribulationActive } from '../tribulationEngine';
import { activeDanxiaMedicineEscort, danxiaMedicineActedThisTick } from '../danxiaMedicineTerms';
import { activeCourierForActor, courierActedThisTick, courierHandoffMayOfferNow } from '../sealedCourierEngine';
import { activeEscortForActor } from '../escortEngine';
import { activeRelocationForActor } from '../relocationEngine';
import { mercyReunionAidActed, mercyReunionAidPendingHold } from '../mercyReunion';
import { schoolFormDuelForParticipant, availableSchoolFormChoices, closeSchoolFormDuel, schoolFormCounterPayment, schoolFormPrivateEvent, schoolFormActualStroke } from '../schoolFormDuel';
import { exactSchoolFormDecision, schoolFormCommand } from '../schoolFormDuelCognition';
import { captureWitnessedPersonalScene } from '../witnessedPersonalStory';
import { captureDramaticBondFact } from '../dramaticBondEngine';
import { beastDuelContactForParticipant, prepareBeastDuelResolution, settleBeastWithdraw, consumeBeastDuelContact, openBeastDuelContact, openBeastDuelEvent } from '../beastDuelProtection';
import { forbiddenDuelForParticipant, prepareForbiddenDuelResolution, consumeForbiddenDuelContact } from '../forbiddenArtEngine';
import { measureNativeDuel } from '../nativeDuelRules';
import { previewDaoDuelIntents } from '../daoPathEngine';
import { previewSectArrayDamage } from '../sectEconomyEngine';
import { activeSiegeForActor } from '../diplomacyEngine';
import { activeOccasionForActor } from '../occasionEngine';
import { activeRoguelikeEncounter } from '../roguelikeEncounterEngine';
import { activeDestinyTraitOffer } from '../destinyTraitEngine';
import { pendingRingAudienceExecution, finishRingAudienceExecution, RING_AUDIENCE_TABOO_TECHNIQUE } from '../ringAudienceEngine';

export function runEarlyActorAction(
  cultivator: Cultivator,
  { nextState, prevState, rng, newEvents, regionalTurn, finishedDuelActors, avatarOrder, precomputedDecisions, recordDecisionEffect, traceOptions }: WorldTickContext,
  { closeInterruptedTrial, applyCultivatorBrainDecision, settleNativeDuel }: TickActionPorts,
): 'handled' | 'ordinary' {
  if (!cultivator.alive || cultivator.positionPlane === 'immortal') return 'handled';

  // Age increment every 12 months
  if (nextState.month === 1) {
    cultivator.age += 1;
    if (cultivator.age >= cultivator.lifespan) {
      cultivator.alive = false;
      cultivator.hp = 0;
      closeInterruptedTrial(cultivator, nextState.tick);
      const below = onLowerPlane(cultivator);
      if(below) dropInheritance(cultivator, nextState);
      else if(cultivator.positionPlane==='frontier')recordFrontierDeath(nextState,cultivator);
      else recordUpperPassageDeath(nextState,cultivator);
      const death: WorldEvent = {
        id: below ? `evt-${nextState.tick}-${cultivator.id}-oldage` :
          `evt-${cultivator.positionPlane==='frontier'?'frontier':'upper-passage'}-${nextState.tick}-${cultivator.id}-oldage`,
        tick: nextState.tick,
        year: nextState.year,
        month: nextState.month,
        title: `寿元耗尽：${cultivator.name}坐化陨落`,
        description: below ? `${cultivator.name}未能突破更高境界，大限将至，于洞府中安然坐化。` : '此人已到实际寿限；财物仍与本人的原处记录同存。',
        category: 'death',
        actorIds: [cultivator.id],
        ...(below ? {locationId:cultivator.locationId} : {witnessScope:'participants' as const}),
      };
      newEvents.push(death);
      witnessEvent(nextState, death);
      return 'handled';
    }
  }

  if (avatarOrder?.actorId !== cultivator.id && !ascensionDutyActive(nextState, cultivator) &&
      !isTribulationActive(cultivator) && !finishedDuelActors.has(cultivator.id)) {
    const directed = takeDirectorHighlightDecision(nextState, cultivator);
    if (directed) {
      const publish = (event: WorldEvent) => {
        newEvents.push(event);
        if (event.witnessScope === undefined) witnessEvent(nextState, event);
        renewRegionalProtectionAfterEvent(regionalTurn);
      };
      const event = applyCultivatorBrainDecision(nextState,cultivator,directed.decision,rng,undefined,publish,directed.decision);
      if (event) {
        publish(event);
        directed.row.resolutionTick = nextState.tick;
        directed.row.resolutionEventId = event.id;
        if (precomputedDecisions?.[cultivator.id]) recordDecisionEffect?.(cultivator.id,false);
        traceOptions?.onActor?.(cultivator.id,[],true);
        if (traceOptions?.captureTrace !== false) recordDecisionTrace(nextState,cultivator.id,[],directed.decision,'avatar',true);
        return 'handled';
      }
    }
  }

  if (ascensionDutyActive(nextState, cultivator)) {
    const supplied = precomputedDecisions && Object.hasOwn(precomputedDecisions, cultivator.id)
      ? precomputedDecisions[cultivator.id] : undefined;
    const explicit = avatarOrder?.actorId === cultivator.id && avatarOrder.decision.chosenAction === 'ASCENSION' ?
      avatarOrder.decision : undefined;
    const requested = explicit ?? supplied;
    const provider = !explicit && Boolean(supplied && (traceOptions?.modelActors?.has(cultivator.id) || isProviderPersonaDecision(supplied)));
    const earlier = provider ? prevState.cultivators.find(actor => actor.id === cultivator.id) : undefined;
    const originallyOffered = !provider || earlier && exactAscensionDecision(requested,
      availableAutonomousAscensionActions(earlier, prevState, nextState.tick), true);
    const accepted = originallyOffered ? exactAscensionDecision(requested, provider
      ? availableAutonomousAscensionActions(cultivator, nextState)
      : availableAscensionActions(cultivator, nextState), true) : undefined;
    const native = accepted ?? utilityAscensionDecision(cultivator, nextState);
    const recorded = native ?? ascensionQuietWait();
    if (traceOptions?.tape) rememberReplayDecision(traceOptions.tape, cultivator.id, recorded, 0, false, false, false, nextState);
    const event = native && applyCultivatorBrainDecision(nextState, cultivator, native, rng, undefined, undefined, explicit,
      provider && Boolean(accepted));
    if (event) {
      newEvents.push(event);
      witnessEvent(nextState, event);
      renewRegionalProtectionAfterEvent(regionalTurn);
    } else {
      cultivator.currentAction = 'ASCENSION';
      cultivator.innerMonologue = recorded.innerMonologue;
    }
    if (supplied) recordDecisionEffect?.(cultivator.id, !explicit && Boolean(accepted && event));
    traceOptions?.onActor?.(cultivator.id, [], Boolean(event));
    if (traceOptions?.captureTrace !== false) recordDecisionTrace(nextState, cultivator.id, [], recorded,
      explicit ? 'avatar' : provider && accepted ? 'model' : 'utility', Boolean(event));
    return 'handled';
  }

  if(!onLowerPlane(cultivator)){
    const supplied=precomputedDecisions&&Object.hasOwn(precomputedDecisions,cultivator.id)?precomputedDecisions[cultivator.id]:undefined;
    const explicit=avatarOrder?.actorId===cultivator.id?avatarOrder.decision:undefined;
    let decisionDraws=0;
    const fromModel=Boolean(!explicit&&supplied&&traceOptions?.modelActors?.has(cultivator.id));
    let requested=explicit??supplied;
    if(fromModel&&requested?.chosenAction==='FAREWELL_LANDING'){
      const earlier=prevState.cultivators.find(actor=>actor.id===cultivator.id);
      if(!earlier||activeAvatar(prevState)===earlier||!exactFarewellLandingDecision(requested,
        availableFarewellLandingActions(earlier,prevState,nextState.tick),true))requested=undefined;
    }
    if(fromModel&&requested?.chosenAction==='FRONTIER_GORGE'){
      const earlier=prevState.cultivators.find(actor=>actor.id===cultivator.id);
      if(!earlier||activeAvatar(prevState)===earlier||!exactFrontierGorgeDecision(requested,
        availableFrontierGorgeActions(earlier,prevState,nextState.tick),true))requested=undefined;
    }
    if(fromModel&&requested?.chosenAction==='FRONTIER_NIGHT_HUNT'){
      const earlier=prevState.cultivators.find(actor=>actor.id===cultivator.id);
      if(!earlier||activeAvatar(prevState)===earlier||!exactFrontierNightHuntDecision(requested,
        availableFrontierNightHuntActions(earlier,prevState,nextState.tick),true))requested=undefined;
    }
    const decision=requested??computeHeuristicDecision(cultivator,nextState,()=>{decisionDraws++;return rng();});
    if((explicit||supplied)&&traceOptions?.replayDraws){
      const draws=traceOptions.replayDraws[cultivator.id]??0;
      for(let step=0;step<Math.min(64,draws);step++)rng();
    }
    const capture=traceOptions?.captureTrace!==false;
    const candidates:DecisionTraceCandidate[]=[]; // no lower trace state crosses the plane
    if(traceOptions?.tape)rememberReplayDecision(traceOptions.tape,cultivator.id,decision,decisionDraws);
    const result=applyCultivatorBrainDecision(nextState,cultivator,decision,rng,undefined,event=>{
      newEvents.push(event);witnessEvent(nextState,event);
    },explicit,Boolean(fromModel&&requested));
    const applied=(decision.chosenAction==='UPPER_PASSAGE'||decision.chosenAction==='FRONTIER_NIGHT_HUNT'||decision.chosenAction==='FRONTIER_GORGE'||decision.chosenAction==='FAREWELL_LANDING'||
      isFrontierAction(decision.chosenAction)||isUpperArrayFieldAction(decision.chosenAction))&&result!==null;
    if(supplied)recordDecisionEffect?.(cultivator.id,!explicit&&requested===supplied&&applied);
    traceOptions?.onActor?.(cultivator.id,candidates,applied);
    if(capture)recordDecisionTrace(nextState,cultivator.id,candidates,decision,explicit?'avatar':
      supplied&&traceOptions?.modelActors?.has(cultivator.id)?'model':'utility',applied);
    if(result){newEvents.push(result);if(decision.chosenAction!=='FRONTIER_GORGE'&&!isPrivateFrontierNightHuntEvent(result)&&!isPrivateFrontierGorgeEvent(result)&&!isPrivateFarewellLandingEvent(result))witnessEvent(nextState,result);}
    return 'handled';
  }

  if(!isTribulationActive(cultivator)&&(activeDanxiaMedicineEscort(nextState,cultivator)||danxiaMedicineActedThisTick(nextState,cultivator))){
    cultivator.currentAction='DANXIA_MEDICINE';
    cultivator.innerMonologue='沿原路实际护送或折返；无本人签收不得宣告已交。';
    return 'handled';
  }
  if (activeCourierForActor(nextState, cultivator) || courierActedThisTick(nextState, cultivator)) {
    const supplied = precomputedDecisions && Object.hasOwn(precomputedDecisions, cultivator.id) ? precomputedDecisions[cultivator.id] : undefined;
    const allowedHandoff = courierHandoffMayOfferNow(nextState, cultivator);
    if (allowedHandoff || supplied?.chosenAction === 'COURIER_HANDOFF') {
      const decision = supplied ?? computeHeuristicDecision(cultivator, nextState, rng);
      if (decision.chosenAction === 'COURIER_HANDOFF' && decision.courierHandoffMove === 'offer') {
        const event = allowedHandoff ? applyCultivatorBrainDecision(nextState, cultivator, decision, rng) : null;
        const applied = event !== null;
        if (traceOptions?.tape) rememberReplayDecision(traceOptions.tape, cultivator.id, decision, 0);
        if (supplied) recordDecisionEffect?.(cultivator.id, applied);
        traceOptions?.onActor?.(cultivator.id, [], applied);
        if (traceOptions?.captureTrace !== false) recordDecisionTrace(nextState, cultivator.id, [], decision,
          traceOptions?.modelActors?.has(cultivator.id) ? 'model' : 'utility', applied);
        if (event) {
          newEvents.push(event);
          witnessEvent(nextState, event);
          renewRegionalProtectionAfterEvent(regionalTurn);
          return 'handled';
        }
      } else if (supplied && traceOptions?.tape) {
        rememberReplayDecision(traceOptions.tape, cultivator.id, decision, 0);
      }
    }
    cultivator.currentAction = 'SEALED_COURIER';
    cultivator.innerMonologue = '沿实际关口投递或折返，本轮不另作行动。';
    return 'handled';
  }

  if (activeEscortForActor(nextState, cultivator)) {
    cultivator.currentAction = 'ESCORT';
    cultivator.innerMonologue = '正沿实路护送客户货物，不能另作行动。';
    return 'handled';
  }

  if (activeRelocationForActor(nextState, cultivator)) {
    cultivator.currentAction = 'RELOCATE';
    cultivator.innerMonologue = '山门迁徙尚在途中，须领护送之责。';
    return 'handled';
  }

  if(finishedDuelActors.has(cultivator.id)||mercyReunionAidActed(nextState,cultivator))return 'handled';
  if(mercyReunionAidPendingHold(nextState,cultivator)){
    cultivator.currentAction='MERCY_REUNION';
    cultivator.innerMonologue='先前提议护这一程，如今仍只在原处等对方自己应下。';
    return 'handled';
  }
  const school=schoolFormDuelForParticipant(nextState,cultivator);
  if(school){
    if(school.attackerId!==cultivator.id||school.openedTick>=nextState.tick)return 'handled';
    const defender=nextState.cultivators.find(row=>row.id===school.defenderId);
    const options=availableSchoolFormChoices(nextState,school);
    if(!defender||!options.length){closeSchoolFormDuel(nextState,school);return 'handled';}
    const supplied=precomputedDecisions?.[cultivator.id];
    const directed=avatarOrder?.actorId===cultivator.id?avatarOrder.decision:undefined;
    const fromModel=Boolean(!directed&&traceOptions?.modelActors?.has(cultivator.id));
    const earlier=prevState.cultivators.find(row=>row.id===cultivator.id);
    const before=earlier&&schoolFormDuelForParticipant(prevState,earlier);
    const requested=before?.id===school.id&&(!fromModel||activeAvatar(prevState)!==earlier)
      ?exactSchoolFormDecision(directed??supplied,school.id,availableSchoolFormChoices(prevState,before),true):undefined;
    const accepted=requested&&exactSchoolFormDecision(requested,school.id,options,true);
    // The possessed learner can wait one month; never invent a player answer at expiry.
    if(!accepted&&activeAvatar(nextState)===cultivator&&nextState.tick===school.openedTick+1)return 'handled';
    const fallback=activeAvatar(nextState)===cultivator?undefined:
      options.includes('counter')&&cultivator.hp>=cultivator.maxHp*.45&&
      (cultivator.personality==='狂傲'||cultivator.personality==='嗜血'||cultivator.personality==='刚正')?'counter':'stop';
    const choice=accepted?.schoolFormChoice??fallback;
    const settled=choice?exactSchoolFormDecision(schoolFormCommand(school.id,choice),school.id,options):undefined;
    const modifier=choice==='counter'?schoolFormCounterPayment(nextState,school):undefined;
    closeSchoolFormDuel(nextState,school);
    finishedDuelActors.add(cultivator.id);finishedDuelActors.add(defender.id);
    if(settled){cultivator.currentAction='SCHOOL_FORM_DUEL';cultivator.innerMonologue=settled.innerMonologue;}
    if(choice==='stop'){
      newEvents.push(schoolFormPrivateEvent(nextState,school,'stop'));
    }else{
      if(modifier)newEvents.push(schoolFormPrivateEvent(nextState,school,'counter'));
      const publish=(event:WorldEvent)=>{newEvents.push(event);witnessEvent(nextState,event);};
      const duel=settleNativeDuel(nextState,cultivator,defender,settled??{chosenAction:'DUEL',innerMonologue:'只按眼下刃势。'},
        school.rolls,undefined,publish,undefined,undefined,modifier);
      captureWitnessedPersonalScene(nextState,duel);captureDramaticBondFact(nextState,duel);
      publish(duel);
      const actual=modifier&&schoolFormActualStroke(nextState,school,duel);
      if(actual)newEvents.push(actual);
      renewRegionalProtectionAfterEvent(regionalTurn);
    }
    if(settled&&traceOptions?.tape)rememberReplayDecision(traceOptions.tape,cultivator.id,settled,0);
    if(supplied)recordDecisionEffect?.(cultivator.id,Boolean(accepted&&fromModel));
    if(settled&&traceOptions?.captureTrace!==false)
      recordDecisionTrace(nextState,cultivator.id,[],settled,directed?'avatar':accepted&&fromModel?'model':'utility',true);
    return 'handled';
  }
  const beastContact=beastDuelContactForParticipant(nextState,cultivator);
  if(beastContact){
    cultivator.currentAction='BEAST_DUEL_RESPONSE';
    cultivator.innerMonologue='这一刃尚未落定，不在此时另行动作。';
    if(beastContact.attackerId!==cultivator.id||beastContact.openedTick>=nextState.tick)return 'handled';
    const defender=nextState.cultivators.find(actor=>actor.id===beastContact.defenderId);
    if(!defender)return 'handled';
    const owner=beastContact.ownerId===cultivator.id?cultivator:defender;
    const offered=precomputedDecisions?.[owner.id];
    const modelInput=Boolean(offered&&(traceOptions?.modelActors?.has(owner.id)||traceOptions?.replayDraws));
    const response=prepareBeastDuelResolution(nextState,beastContact,offered,modelInput);
    if(!response)return 'handled';
    const published=(event:WorldEvent)=>{newEvents.push(event);witnessEvent(nextState,event);};
    if(response.choice==='withdraw'){
      const retreat=response.destinationId&&settleBeastWithdraw(nextState,beastContact,response.destinationId);
      if(!retreat)return 'handled';
      published(retreat);
    }
    finishedDuelActors.add(cultivator.id);finishedDuelActors.add(defender.id);
    const settled:LLMDecisionPayload={chosenAction:'BEAST_DUEL_RESPONSE',targetBeastDuelId:beastContact.id,
      beastDuelChoice:response.choice,
      ...(response.destinationId?{targetLocationId:response.destinationId}:{}),innerMonologue:'依这一刃实际行止。'};
    const event=settleNativeDuel(nextState,cultivator,defender,settled,beastContact.rolls,undefined,published,undefined,
      response.choice==='guard'?beastContact:undefined);
    consumeBeastDuelContact(nextState,beastContact);
    captureWitnessedPersonalScene(nextState,event);
    captureDramaticBondFact(nextState,event);
    published(event);
    renewRegionalProtectionAfterEvent(regionalTurn);
    const modelUsed=Boolean(modelInput&&offered?.chosenAction==='BEAST_DUEL_RESPONSE'&&
      offered.targetBeastDuelId===beastContact.id&&response.choice===offered.beastDuelChoice&&response.destinationId===offered.targetLocationId);
    if(traceOptions?.tape)rememberReplayDecision(traceOptions.tape,owner.id,settled,0);
    recordDecisionEffect?.(owner.id,modelUsed);
    traceOptions?.onActor?.(owner.id,[],true);
    if(traceOptions?.captureTrace!==false)recordDecisionTrace(nextState,owner.id,[],settled,
      beastContact.guided?'avatar':modelUsed?'model':'utility',true);
    return 'handled';
  }
  const contact=nextState.forbiddenDuels?.length?forbiddenDuelForParticipant(nextState,cultivator):undefined;
  if(contact){
    cultivator.currentAction='FORBIDDEN_ART';
    cultivator.innerMonologue='刃势未歇，此番交锋尚未落定。';
    if(contact.attackerId!==cultivator.id||contact.openedTick>=nextState.tick)return 'handled';
    const defender=nextState.cultivators.find(actor=>actor.id===contact.defenderId);
    const owner=contact.ownerId===cultivator.id?cultivator:defender;
    if(!defender||!owner)return 'handled';
    const offered=precomputedDecisions&&Object.hasOwn(precomputedDecisions,owner.id)?precomputedDecisions[owner.id]:undefined;
    const modelInput=Boolean(offered&&(traceOptions?.modelActors?.has(owner.id)||traceOptions?.replayForbiddenModelActors?.has(owner.id)));
    const response=prepareForbiddenDuelResolution(nextState,contact,offered,modelInput);
    if(response.kind!=='ready')return 'handled';
    const activation=consumeForbiddenDuelContact(nextState,contact,response.choice,response.origin)??
      consumeForbiddenDuelContact(nextState,contact,'decline','utility');
    if(!activation)return 'handled';
    const settled:LLMDecisionPayload={chosenAction:'FORBIDDEN_ART',targetForbiddenDuelId:contact.id,
      forbiddenArtChoice:activation.choice,innerMonologue:'只在眼前实有的刃下落定此念。'};
    if(traceOptions?.tape)rememberReplayDecision(traceOptions.tape,owner.id,settled,0,false,activation.origin==='model');
    finishedDuelActors.add(cultivator.id);finishedDuelActors.add(defender.id);
    const publish=(event:WorldEvent)=>{newEvents.push(event);witnessEvent(nextState,event);};
    if(activation.choice==='decline'){
      const threat=measureNativeDuel(nextState,cultivator,defender,contact.rolls,undefined,previewDaoDuelIntents(nextState,cultivator,defender));
      if(threat.loser===owner&&owner.hp<.25*owner.maxHp&&
        previewSectArrayDamage(nextState,threat.loser,threat.winner,threat.hitLoser)>=owner.hp){
        const nextContact=openBeastDuelContact(nextState,cultivator,defender,owner,contact.rolls);
        if(nextContact){publish(openBeastDuelEvent(nextState,nextContact));return 'handled';}
      }
    }
    const event=settleNativeDuel(nextState,cultivator,defender,settled,contact.rolls,undefined,publish,{contact,activation});
    captureWitnessedPersonalScene(nextState,event);
    captureDramaticBondFact(nextState,event);
    publish(event);
    renewRegionalProtectionAfterEvent(regionalTurn);
    if(recordDecisionEffect&&offered)recordDecisionEffect(owner.id,activation.origin==='model'||!modelInput&&
      activation.origin==='utility'&&offered.chosenAction==='FORBIDDEN_ART'&&offered.targetForbiddenDuelId===contact.id&&
      offered.forbiddenArtChoice===activation.choice);
    traceOptions?.onActor?.(owner.id,[],true);
    if(traceOptions?.captureTrace!==false)recordDecisionTrace(nextState,owner.id,[],settled,
      activation.origin==='player'?'avatar':activation.origin,true);
    return 'handled';
  }

  const audience=nextState.playerAvatar.audience&&!isTribulationActive(cultivator)&&!activeSiegeForActor(nextState,cultivator)&&
    !activeOccasionForActor(nextState,cultivator)&&avatarOrder?.actorId!==cultivator.id&&
    !activeRoguelikeEncounter(nextState,cultivator)&&!activeDestinyTraitOffer(nextState,cultivator)
    ?pendingRingAudienceExecution(nextState,cultivator):undefined;
  if(audience?.aim==='challenge_master'&&audience.leaderId){
    const duel=applyCultivatorBrainDecision(nextState,cultivator,{chosenAction:'DUEL',targetCultivatorId:audience.leaderId,
      innerMonologue:'只与真正眼前的掌门当面分说。'},rng,undefined,
      event=>{newEvents.push(event);witnessEvent(nextState,event);});
    if(duel){
      if(duel.duelWinnerId&&duel.actorIds[1]===audience.leaderId)finishRingAudienceExecution(nextState,audience,duel,'confronted');
      captureWitnessedPersonalScene(nextState,duel);captureDramaticBondFact(nextState,duel);
      newEvents.push(duel);witnessEvent(nextState,duel);
      renewRegionalProtectionAfterEvent(regionalTurn);
      if(precomputedDecisions&&Object.hasOwn(precomputedDecisions,cultivator.id))recordDecisionEffect?.(cultivator.id,false);
      return 'handled';
    }
  }else if(audience&&audience.aim!=='challenge_master'){
    const effect=audience.aim==='leave_sect'?'left':'learned';
    if(effect==='left'){
      cultivator.sectId='';cultivator.sectRank='外门弟子';cultivator.contribution=0;
      delete cultivator.guardAssignment;
    }else{
      cultivator.qiProgress-=10;
      cultivator.technique={id:RING_AUDIENCE_TABOO_TECHNIQUE,name:'藏锋逆息诀',spiritRoot:cultivator.spiritRoot};
      cultivator.techniqueMastery=10;
    }
    cultivator.currentAction='AUDIENCE_PLEDGE';
    const execution:WorldEvent={id:`evt-${nextState.tick}-${cultivator.id}-audience-${effect}`,tick:nextState.tick,year:nextState.year,month:nextState.month,
      title:effect==='left'?'离山立身':'禁诀入门',description:effect==='left'?'已亲自卸下门中名籍，此刻仍在原处。':'实耗十点灵气，已学藏锋逆息诀的入门一式。',
      category:effect==='left'?'diplomacy':'breakthrough',actorIds:[cultivator.id],locationId:cultivator.locationId,witnessScope:'participants'};
    finishRingAudienceExecution(nextState,audience,execution,effect);
    newEvents.push(execution);
    if(precomputedDecisions&&Object.hasOwn(precomputedDecisions,cultivator.id))recordDecisionEffect?.(cultivator.id,false);
    return 'handled';
  }
  return 'ordinary';
}
