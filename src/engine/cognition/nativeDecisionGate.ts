import type { LLMConfig, LLMDecisionPayload } from '../../types/world';
import { ascensionDutyActive } from '../ascensionPresence';
import { availableAscensionActions, activeAscensionForActor } from '../ascensionEngine';
import { availableAutonomousAscensionActions } from './decisionFactsEarly';
import { ascensionCommand, ascensionQuietWait, exactAscensionDecision } from '../ascensionCognition';
import { requestDecisionPrompt } from './requestDecisionPrompt';
import { activeAvatar } from '../avatarEngine';
import { availableFarewellLandingActions } from '../farewellLanding';
import { farewellLandingCommand, exactFarewellLandingDecision } from '../farewellLandingCognition';
import { availableFrontierGorgeActions } from '../frontierGorge';
import { frontierGorgeCommand, exactFrontierGorgeDecision } from '../frontierGorgeCognition';
import { availableFrontierNightHuntActions } from '../frontierNightHunt';
import { frontierNightHuntCommand, exactFrontierNightHuntDecision } from '../frontierNightHuntCognition';
import {
  availableAutonomousCultivationClanActions,
  waitForOwnClanChoice,
  availableAutonomousImmortalAuctionActions,
  currentAuctionAmbushOffer,
  daoPathCommand,
  daoPathSame,
  exactDaoPathDecision,
  availableFrontierProviderActions,
  availableUpperPassageProviderActions,
  availableUpperArrayFieldProviderActions,
  decodeUpperPassage,
  usesHeartDemonTheatre,
  dungeonDecisionOccasion,
  availableDungeonModelOptions,
  dungeonAction,
  sameDungeon,
  exactDungeonDecision,
  availableAutonomousDaoPathActions,
  availableAutonomousHeavenlyAlchemyActions,
  heavenlyAction,
  sameHeavenlyAction,
  exactHeavenlyAlchemyDecision,
} from './decisionFactsLate';
import { frontierCommand, exactFrontierDecision } from '../frontierActions';
import { upperArrayFieldCommand, isUpperArrayFieldAction, exactUpperArrayFieldDecision } from '../upperArrayFieldActions';
import { activeDanxiaMedicineEscort } from '../danxiaMedicineTerms';
import { activeRelocationForActor } from '../relocationEngine';
import { activeEscortForActor } from '../escortEngine';
import { activeCourierForActor, availableCourierHandoffActions } from '../sealedCourierEngine';
import { decodeCourierHandoff, decodeHeartDemonDecision, decodeForbiddenArtDecision, decodeRoguelikeEncounterDecision, decodeDestinyTraitDecision, decodeGrandSiegeHeroDecision } from './privateDecisionDecoders';
import { activeHeartDemon, isHeartDemonGuided } from '../heartDemonEngine';
import { HEART_DEMON_CHOICES } from '../../types/heartDemon';
import { schoolFormDuelForParticipant, availableSchoolFormChoices } from '../schoolFormDuel';
import { schoolFormCommand, exactSchoolFormDecision } from '../schoolFormDuelCognition';
import { forbiddenDuelForParticipant, activeForbiddenDuel, availableForbiddenArtOptions } from '../forbiddenArtEngine';
import { activeRoguelikeEncounter } from '../roguelikeEncounterEngine';
import { roguelikeEncounterChoiceIds } from '../roguelikeEncounterCatalog';
import { activeDestinyTraitOffer } from '../destinyTraitEngine';
import { availableVacantGateActions } from '../vacantGate';
import { vacantGateCommand, exactVacantGateDecision } from '../vacantGateCognition';
import { hasQueuedGrandSiegeHero, availableGrandSiegeHeroActions } from '../grandSiegeTheatreEngine';
import { grandSiegeHeroReservedForPlayer } from './decisionCommands';
import { beastDuelContactForParticipant, availableBeastDuelChoices } from '../beastDuelProtection';
import { beastDuelCommand, exactBeastDuelResponse } from '../beastDuelCognition';
import { availableFurnaceEmergencyActions } from '../furnaceEmergency';
import { furnaceEmergencyCommand, exactFurnaceEmergencyDecision } from '../furnaceEmergencyCognition';
import { availableNightDoorActions } from '../nightDoor';
import { nightDoorCommand, exactNightDoorDecision } from '../nightDoorCognition';
import { availableBanquetSeatActions } from '../banquetSeats';
import { banquetSeatCommand } from '../banquetSeatCognition';
import { availableLastRosterActions } from '../lastRoster';
import { lastRosterCommand } from '../lastRosterCognition';
import { availableBoundaryGapActions } from '../boundaryGap';
import { boundaryGapCommand, exactBoundaryGapDecision } from '../boundaryGapCognition';
import { availableAbandonedQuarterActions } from '../abandonedQuarter';
import { abandonedQuarterCommand, exactAbandonedQuarterDecision } from '../abandonedQuarterCognition';
import { availableBattlefieldAftermathActions } from '../battlefieldAftermath';
import { battlefieldAftermathCommand, exactBattlefieldAftermathDecision } from '../battlefieldAftermathCognition';
import { availableVillageReunionActions } from '../villageReunion';
import { villageReunionCommand, exactVillageReunionDecision } from '../villageReunionCognition';
import { availableWildMigrationActions } from '../wildMigration';
import { wildMigrationCommand, exactWildMigrationDecision } from '../wildMigrationCognition';
import { availableMercyReunionActions } from '../mercyReunion';
import { conditionalMercyChoices, storyMercyCommand, exactStoryMercyDecision } from '../mercyReunionCognition';
import { availablePavilionFireActions } from '../pavilionFire';
import { pavilionFireCommand, exactPavilionFireDecision } from '../pavilionFireCognition';
import { availableWitnessActions } from '../witnessEngine';
import { availableWitnessInquiryActions } from '../witnessInquiry';
import { witnessInquiryCommand, exactWitnessInquiryDecision } from '../witnessInquiryCognition';
import { availableCalamityArrayChoices } from '../calamityArray';
import { calamityArrayCommand, exactCalamityArrayDecision } from '../calamityArrayCognition';
import { availableBattlefieldRevisits } from '../battlefieldRevisit';
import { battlefieldRevisitCommand, exactBattlefieldRevisitDecision } from '../battlefieldRevisitCognition';
import { activeProtagonistFlight, availableProtagonistFlightActions } from '../protagonistFlightEngine';
import { protagonistFlightCommand, exactProtagonistFlightDecision } from '../protagonistFlightCognition';
import { availableCampaignAssemblyActions } from '../campaignAssembly';
import { exactCampaignAssemblyDecision, tagCampaignAssemblyDecision } from '../campaignAssemblyCognition';
import { pilgrimageForkTravelLocked, pilgrimageForkActedThisTick } from '../pilgrimageForkPresence';
import { availablePilgrimageForkActions } from '../pilgrimageFork';
import { pilgrimageForkCommand } from '../pilgrimageForkCognition';
import { activePilgrimageForActor, pilgrimageCheckpoint, availablePilgrimageActions } from '../pilgrimageEngine';
import { waypostMealProviderOptions } from '../waypostMealCognition';
import { availableRouteWarningActions } from '../routeWarningEngine';
import { disasterShelterCheckpoint } from '../disasterShelterCheckpoint';
import { availableBoundaryReliefActions } from '../boundaryReliefEngine';
import { boundaryReliefCheckpoint } from '../boundaryReliefCheckpoint';
import { verifiedHeartDemonChoiceEffect, autonomousExpeditionRescueOptions, canPauseAftermathRescue } from '../heartDemonChoicePolicy';
import { activeOccasionForActor } from '../occasionEngine';
import { cultivationClanCommand, exactCultivationClanDecision } from '../cultivationClanCognition';
import { immortalAuctionCommand, exactImmortalAuctionDecision, auctionAmbushCommand, exactAuctionAmbushDecision } from '../immortalAuctionCognition';
import type { CognitiveRequestOptions, CognitiveSnapshot } from './cognitiveContext';

function handledDecision(decision: Promise<LLMDecisionPayload | undefined> | undefined) {
  return { handled: true, decision } as const;
}

/** Only branches that never claimed the request may continue into ordinary cognition. */
export function quoteNativeDecision(
  { cultivator, world, requestTick }: CognitiveSnapshot,
  config: LLMConfig,
  options: CognitiveRequestOptions,
) {
  const inAscension = ascensionDutyActive(world, cultivator);
  const potential = cultivator.realm === '渡劫' && cultivator.realmStage === 9 && cultivator.positionPlane === undefined
    ? availableAscensionActions(cultivator, world, requestTick) : [];
  if (inAscension || potential.some(row => row.ascensionMove === 'start')) {
    if (requestTick !== world.tick + 1) return handledDecision(undefined);
    const allowed = availableAutonomousAscensionActions(cultivator, world, requestTick);
    if (!allowed.length) return handledDecision(undefined);
    const actualSite = cultivator.locationId;
    const originalTrial = activeAscensionForActor(world, cultivator);
    const menu = allowed.map(ascensionCommand);
    const prompt = '只原样复制一项已核天关许可。每次只处置当月这一重。' +
      '不能填写别人、地点、波次、伤害、灵气、境界、独白、是否幸存或预报结果。许可：' +
      JSON.stringify(inAscension ? menu : [...menu, { chosenAction: 'REST' }]);
    return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, parsed => {
      if (requestTick !== world.tick + 1 || cultivator.locationId !== actualSite || activeAvatar(world) === cultivator ||
          activeAscensionForActor(world, cultivator) !== originalTrial) return undefined;
      if (!inAscension && parsed?.chosenAction === 'REST' && Object.hasOwn(parsed, 'chosenAction') && Object.keys(parsed).length === 1)
        return ascensionQuietWait();
      if (!exactAscensionDecision(parsed, allowed)) return undefined;
      return exactAscensionDecision(parsed, availableAutonomousAscensionActions(cultivator, world, requestTick));
    }, 165));
  }
  if(cultivator.positionPlane==='frontier'){
    const lamps=availableFarewellLandingActions(cultivator,world,requestTick);
    if(lamps.length){
      if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
      return handledDecision(requestDecisionPrompt(config,requestTick,options,
        '只原样抄写本人可行的一项泊岸作别。不要填写亡者私语、灵验、舟船、花费或结局：'+JSON.stringify(lamps.map(farewellLandingCommand)),
        parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactFarewellLandingDecision(parsed,lamps)
          ?exactFarewellLandingDecision(parsed,availableFarewellLandingActions(cultivator,world,requestTick)):undefined,155));
    }
    const gorge=availableFrontierGorgeActions(cultivator,world,requestTick);
    if(gorge.length){
      if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
      return handledDecision(requestDecisionPrompt(config,requestTick,options,
        '只原样抄写当下核准的一项峡口行止。不补远处路线、天气预报、到达或结局：'+JSON.stringify(gorge.map(frontierGorgeCommand)),
        parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactFrontierGorgeDecision(parsed,gorge)
          ?exactFrontierGorgeDecision(parsed,availableFrontierGorgeActions(cultivator,world,requestTick)):undefined,155));
    }
    const hunt=availableFrontierNightHuntActions(cultivator,world,requestTick);
    if(hunt.length){
      if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
      const menu=hunt.map(frontierNightHuntCommand);
      return handledDecision(requestDecisionPrompt(config,requestTick,options,
        '只原样抄写本人此刻可做的一项雪岭行止。不要填写妖兽、足迹位置、气候预报、伤势、奖励或结局。许可：'+JSON.stringify(menu),
        parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactFrontierNightHuntDecision(parsed,hunt)
          ?exactFrontierNightHuntDecision(parsed,availableFrontierNightHuntActions(cultivator,world,requestTick)):undefined,155));
    }
    const exact=availableFrontierProviderActions(cultivator,world,requestTick);
    if(!exact.length)return handledDecision(undefined);
    const prompt=`本人实到另图 ${cultivator.locationId}。只复制一条原生许可，或返回 REST。不要填写资金、数量、货物、住户、天气或结果；只返回 JSON。许可：${JSON.stringify(exact.map(frontierCommand))}`;
    return handledDecision(requestDecisionPrompt(config,requestTick,options,prompt,parsed=>{
      if(parsed.chosenAction==='REST'&&Object.keys(parsed).every(key=>key==='chosenAction'||key==='innerMonologue'))
        return {chosenAction:'REST',innerMonologue:'留在已到地点。'};
      return exactFrontierDecision(parsed,exact);
    },220));
  }
  if(cultivator.positionPlane!==undefined){
    const exact=availableUpperPassageProviderActions(cultivator,world,requestTick);
    const arrayField=availableUpperArrayFieldProviderActions(cultivator,world,requestTick);
    if(!exact.length&&!arrayField.length)return handledDecision(undefined);
    const choices=exact.map(({action,upperPassageMove,targetUpperPassageNodeId})=>
      ({chosenAction:action,upperPassageMove,targetUpperPassageNodeId}));
    const prompt=`本人实到独立界路节点 ${cultivator.locationId}。只有这些界路选项，或原地 REST。
    原样复制动作和同一节点；不填钱、物、其他身份、下界旧址或结果；只返回 JSON。当前许可：${JSON.stringify(choices)}${arrayField.length?`。阵原仅可原样复制本人在场的这些动作：${JSON.stringify(arrayField.map(upperArrayFieldCommand))}。`:''}`;
    return handledDecision(requestDecisionPrompt(config,requestTick,options,prompt,parsed=>isUpperArrayFieldAction(parsed.chosenAction)?
      exactUpperArrayFieldDecision(parsed,arrayField):decodeUpperPassage(parsed,exact,true),arrayField.length?240:160));
  }
  if(activeDanxiaMedicineEscort(world,cultivator)||activeRelocationForActor(world,cultivator)||
    activeEscortForActor(world,cultivator))return handledDecision(undefined);
  if (activeCourierForActor(world, cultivator)) {
    // No general context is composed for an active carrier at a real post. This is one fair-scheduled request, not a second call.
    if (requestTick !== world.tick + 1) return handledDecision(undefined);
    const handoffs = availableCourierHandoffActions(cultivator, world, requestTick)
      .filter(({ courierHandoffMove }) => courierHandoffMove === 'offer');
    if (!handoffs.length) return handledDecision(undefined);
    const ids = handoffs.map(({ targetDispatchId, targetCourierId }) => ({ targetDispatchId, targetCourierId }));
    const prompt = `你只能在已核的停站提议一次转接。只返回 JSON：chosenAction=COURIER_HANDOFF，courierHandoffMove=offer，` +
      `从许可中成对照抄 targetDispatchId 和 targetCourierId。不要填写路段、地点、地址、封信内容、费用或他人身份。` +
      `选项：${JSON.stringify(ids)}`;
    return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, (payload) => decodeCourierHandoff(payload, handoffs), 150));
  }

  if (usesHeartDemonTheatre(cultivator)) {
    const frame = activeHeartDemon(world, cultivator);
    const exactTrialId = cultivator.tribulation?.id;
    if (!frame || !exactTrialId || frame.queued || isHeartDemonGuided(world, cultivator, frame) ||
        requestTick !== world.tick + 1) return handledDecision(undefined);
    const candidates = HEART_DEMON_CHOICES.map(heartDemonChoice => ({
      chosenAction: 'FACE_TRIBULATION', targetHeartTrialId: exactTrialId, heartDemonChoice,
    }));
    const prompt = '眼前只是心魔幻象。sever 斩断牵念；wrath 以怒相抗；face 承认而不追随。' +
      `只原样复制下列一个完整 JSON 对象；不填写独白、人物、证据、应劫姿态、数值或结果。许可：${JSON.stringify(candidates)}`;
    return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, parsed =>
      requestTick === world.tick + 1 && cultivator.tribulation?.id === exactTrialId &&
      activeHeartDemon(world, cultivator) === frame && !frame.queued && !isHeartDemonGuided(world, cultivator, frame)
        ? decodeHeartDemonDecision(parsed, exactTrialId) : undefined, 150));
  }

  const schoolForm = schoolFormDuelForParticipant(world,cultivator);
  if (schoolForm) {
    if (requestTick!==world.tick+1 || schoolForm.attackerId!==cultivator.id || activeAvatar(world)===cultivator) return handledDecision(undefined);
    const choices=availableSchoolFormChoices(world,schoolForm);
    if (!choices.length) return handledDecision(undefined);
    const menu=choices.map(choice=>schoolFormCommand(schoolForm.id,choice));
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '只可如实选择眼前是否回剑，或亲自撤回本次挑战。原样抄写一个许可，不写师承、独白、伤势或结果：'+JSON.stringify(menu),
      parsed=>requestTick===world.tick+1&&schoolFormDuelForParticipant(world,cultivator)===schoolForm&&
        activeAvatar(world)!==cultivator&&exactSchoolFormDecision(parsed,schoolForm.id,choices)
        ?exactSchoolFormDecision(parsed,schoolForm.id,availableSchoolFormChoices(world,schoolForm)):undefined,145));
  }

  const suspended = forbiddenDuelForParticipant(world, cultivator);
  if (suspended) {
    // Only the already threatened owner acts; the counterpart is held by the same actual contact.
    const contact = activeForbiddenDuel(world, cultivator);
    if (contact !== suspended || contact.guided || contact.queued || requestTick !== world.tick + 1) return handledDecision(undefined);
    const exactId = contact.id;
    const choices = availableForbiddenArtOptions(world, contact).map(option => option.choice);
    if (!choices.some(choice => choice !== 'decline')) return handledDecision(undefined);
    const menu = choices.map(forbiddenArtChoice => ({
      chosenAction: 'FORBIDDEN_ART', targetForbiddenDuelId: exactId, forbiddenArtChoice,
    }));
    const prompt = '眼下真实的斗法已经接触。可以按常法继续（decline），或选一项当下确已可用的禁术。' +
      `只原样复制下列一个完整 JSON 对象；不得补充人物、地点、独白、代价、出手数值或胜负。许可：${JSON.stringify(menu)}`;
    return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, parsed => {
      if (requestTick !== world.tick + 1 || contact.id !== exactId || activeForbiddenDuel(world, cultivator) !== contact ||
          contact.guided || contact.queued) return undefined;
      const current = availableForbiddenArtOptions(world, contact).map(option => option.choice);
      if (current.length !== choices.length || current.some((choice, index) => choice !== choices[index])) return undefined;
      return decodeForbiddenArtDecision(parsed, exactId, choices);
    }, 160));
  }

  const encounter = activeRoguelikeEncounter(world, cultivator);
  if (encounter) {
    // This exact choice replaces the usual prompt and consumes only the existing fair Decision slot.
    // Never send player-owned choices or reopen the menu after this opportunity's real next turn.
    if (encounter.kind === 'sect-gate' || encounter.guided || encounter.openedTick !== world.tick || requestTick !== world.tick + 1) return handledDecision(undefined);
    const allowed = roguelikeEncounterChoiceIds(encounter.kind);
    if (!allowed.length) return handledDecision(undefined);
    const candidates = allowed.map(roguelikeEncounterChoice => ({
      chosenAction: 'ROGUELIKE_ENCOUNTER', targetRoguelikeEncounterId: encounter.id, roguelikeEncounterChoice,
    }));
    const prompt = `实际到达后眼前的奇遇：${encounter.kind}。cautious 谨慎试探，bold 冒险深入，leave 不参与。
` +
      `只原样复制下列一个完整 JSON 对象；不补充独白、人物、地点、收益、代价或结果。许可：${JSON.stringify(candidates)}`;
    return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, parsed =>
      requestTick === world.tick + 1 && activeRoguelikeEncounter(world, cultivator) === encounter && !encounter.guided
        ? decodeRoguelikeEncounterDecision(parsed, encounter.id, allowed) : undefined, 160));
  }

  const destiny = activeDestinyTraitOffer(world, cultivator);
  if (destiny) {
    // A deliberately held body reserves its own live offer; the regular prompt must not replace this choice.
    if (requestTick !== world.tick + 1 || activeAvatar(world) === cultivator) return handledDecision(undefined);
    const submittedMenu = { id: destiny.id, options: [...destiny.options] };
    const candidates = submittedMenu.options.map(destinyTraitChoice => ({
      chosenAction: 'AWAKEN_DESTINY', targetDestinyOfferId: submittedMenu.id, destinyTraitChoice,
    }));
    const prompt = '本人的真实破境已留下一项待择天命。只原样复制下列一个完整 JSON 对象；' +
      `不补充独白、人物、境界、数值、功效或结果。许可：${JSON.stringify(candidates)}`;
    return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, parsed =>
      requestTick === world.tick + 1 && activeDestinyTraitOffer(world, cultivator) === destiny &&
      activeAvatar(world) !== cultivator && destiny.id === submittedMenu.id &&
      destiny.options.length === submittedMenu.options.length &&
      destiny.options.every((choice, index) => choice === submittedMenu.options[index])
        ? decodeDestinyTraitDecision(parsed, submittedMenu) : undefined, 160));
  }

  const vacantGate=availableVacantGateActions(cultivator,world,requestTick);
  if(vacantGate.length){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '山门同月确有失守之虞。只原样抄写本人可做的一项；不填旁人同意、继任、阵力、花费或胜负：'+JSON.stringify(vacantGate.map(vacantGateCommand)),
      parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactVacantGateDecision(parsed,vacantGate)
        ?exactVacantGateDecision(parsed,availableVacantGateActions(cultivator,world,requestTick)):undefined,160));
  }
  if (hasQueuedGrandSiegeHero(world, cultivator)) return handledDecision(undefined);
  const hero = availableGrandSiegeHeroActions(cultivator, world);
  if (hero.length) {
    // This is the actor's own tactical menu for an already arrived real siege, not a battle forecast.
    const exactId = hero[0].targetGrandSiegeId;
    const candidates = world.sieges.filter(row => row.id === exactId);
    const exact = candidates[0];
    if (candidates.length !== 1 || exact.theatre?.queued || hero.some(row => row.targetGrandSiegeId !== exactId) ||
        requestTick !== world.tick + 1 || grandSiegeHeroReservedForPlayer(world, exactId)) return handledDecision(undefined);
    const moves = hero.map(row => row.grandSiegeHeroMove);
    if (moves.length !== 2 || new Set(moves).size !== 2 || !moves.includes('hold')) return handledDecision(undefined);
    const menu = moves.map(grandSiegeHeroMove => ({ chosenAction: 'GRAND_SIEGE_HERO',
      targetGrandSiegeId: exactId, grandSiegeHeroMove }));
    const prompt = '本宗阵前出现实机，只可用当下许可支援或按兵（hold）。只原样复制下列一个完整 JSON 对象；' +
      `不填写人物、位置、独白、伤势、境界、代价、阵力、战果或其他字段。许可：${JSON.stringify(menu)}`;
    return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, parsed => {
      if (requestTick !== world.tick + 1 || !world.sieges.includes(exact) || exact.theatre?.queued ||
          grandSiegeHeroReservedForPlayer(world, exactId)) return undefined;
      const current = availableGrandSiegeHeroActions(cultivator, world);
      if (current.length !== moves.length || current.some((row, index) =>
        row.targetGrandSiegeId !== exactId || row.grandSiegeHeroMove !== moves[index])) return undefined;
      return decodeGrandSiegeHeroDecision(parsed, exactId, moves);
    }, 160));
  }

  const beastContact=beastDuelContactForParticipant(world,cultivator);
  if(beastContact){
    if(beastContact.ownerId!==cultivator.id||beastContact.guided||requestTick!==world.tick+1)return handledDecision(undefined);
    const choices=availableBeastDuelChoices(world,cultivator);
    if(!choices.length)return handledDecision(undefined);
    const menu=choices.map(choice=>beastDuelCommand(beastContact.id,choice));
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '只原样复制眼前的一项灵兽行止。不可填写独白、伤势、生死、契约解除结果或别的去处：'+JSON.stringify(menu),
      parsed=>beastDuelContactForParticipant(world,cultivator)===beastContact&&requestTick===world.tick+1?
        exactBeastDuelResponse(parsed,beastContact.id,availableBeastDuelChoices(world,cultivator)):undefined,160));
  }

  const furnaceEmergency=availableFurnaceEmergencyActions(cultivator,world,requestTick);
  if(furnaceEmergency.length){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '只原样抄写本人确在现场的护炉、撤出、求援或应援许可。求援不等于应允，应允不等于抵达。不得填写伤亡、炉损、路线、物资或他人决定：'+JSON.stringify(furnaceEmergency.map(furnaceEmergencyCommand)),
      parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactFurnaceEmergencyDecision(parsed,furnaceEmergency)
        ?exactFurnaceEmergencyDecision(parsed,availableFurnaceEmergencyActions(cultivator,world,requestTick)):undefined,160));
  }
  const door=availableNightDoorActions(cultivator,world,requestTick);
  if(door.length){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '只原样抄本人确在驿舍门前的一项许可。不把疑似旧识当作真实身份；不替对方答应，不填写住进、脚步、他人姓名或最后结果：'+JSON.stringify(door.map(nightDoorCommand)),
      parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactNightDoorDecision(parsed,door)
        ?exactNightDoorDecision(parsed,availableNightDoorActions(cultivator,world,requestTick)):undefined,160));
  }
  const banquet=requestTick===world.tick+1&&activeAvatar(world)!==cultivator?
    availableBanquetSeatActions(cultivator,world,requestTick):[];
  const banquetGuide=banquet.length?'若选择赴宴，只原样抄本人真正受邀的一项许可。不安排他人、不伪写到达或对谈：'+
    JSON.stringify(banquet.map(banquetSeatCommand)):'';
  const afterSect=requestTick===world.tick+1&&activeAvatar(world)!==cultivator?
    availableLastRosterActions(cultivator,world,requestTick):[];
  const afterSectGuide=afterSect.length?'可另选本人确属旧宗终末名册、实际所在才有的一项去向。不代旁人选择、不得填继任或新职位：'+
    JSON.stringify(afterSect.map(lastRosterCommand)):'';
  const gap=availableBoundaryGapActions(cultivator,world,requestTick);
  if(gap.length){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '只原样抄写本人确在缺岗现场的一项应对。不要填写来者到达、他人同意、守备身份、伤亡或丢失州域：'+JSON.stringify(gap.map(boundaryGapCommand)),
      parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactBoundaryGapDecision(parsed,gap)
        ?exactBoundaryGapDecision(parsed,availableBoundaryGapActions(cultivator,world,requestTick)):undefined,160));
  }
  const ruin=availableAbandonedQuarterActions(cultivator,world,requestTick);
  if(ruin.length){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '逐字抄写一项本人确在迁空旧村才有的行动。不能指定旧人口、财物、亲缘、迁徙或见闻结果：'+JSON.stringify(ruin.map(abandonedQuarterCommand)),
      parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactAbandonedQuarterDecision(parsed,ruin)
        ?exactAbandonedQuarterDecision(parsed,availableAbandonedQuarterActions(cultivator,world,requestTick)):undefined,160));
  }
  const aftermath=availableBattlefieldAftermathActions(cultivator,world,requestTick);
  if(aftermath.length){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '仅复制一项同一场已经结算的冲突后的本人合法回应。不填写新的战功、伤势、花费、他人决定或未走路线：'+JSON.stringify(aftermath.map(battlefieldAftermathCommand)),
      parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactBattlefieldAftermathDecision(parsed,aftermath)
        ?exactBattlefieldAftermathDecision(parsed,availableBattlefieldAftermathActions(cultivator,world,requestTick)):undefined,160));
  }
  const village=availableVillageReunionActions(cultivator,world,requestTick);
  if(village.length){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '只原样抄写本人当下可做的一项同村旧事回应；不填写姓氏、亲缘、同窗、承诺、灵石数或旁人立场：'+JSON.stringify(village.map(villageReunionCommand)),
      parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactVillageReunionDecision(parsed,village)
        ?exactVillageReunionDecision(parsed,availableVillageReunionActions(cultivator,world,requestTick)):undefined,160));
  }
  const migration=availableWildMigrationActions(cultivator,world,requestTick);
  if(migration.length){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '只原样抄写本人可做的一项山兽借道应对；不填远处身影、兽名、行迹、伤害、花费或效验：'+JSON.stringify(migration.map(wildMigrationCommand)),
      parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactWildMigrationDecision(parsed,migration)
        ?exactWildMigrationDecision(parsed,availableWildMigrationActions(cultivator,world,requestTick)):undefined,160));
  }
  const quoteMercy=()=>[...availableMercyReunionActions(cultivator,world,requestTick),
    ...conditionalMercyChoices(world,cultivator,requestTick)];
  const mercy=quoteMercy();
  if(mercy.length){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '只抄写一项当下授权动作。收锋必须由实战结算，护送须另一人亲自接受。不填伤害、胜负、恩仇或表态：'+
        JSON.stringify(mercy.map(storyMercyCommand)),
      parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactStoryMercyDecision(parsed,mercy)
        ?exactStoryMercyDecision(parsed,quoteMercy()):undefined,165));
  }
  const fire=availablePavilionFireActions(cultivator,world,requestTick);
  if(fire.length){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '只原样抄写本人此刻能做的一项火中行止，不填卷名、路、人物、伤势或结果：'+JSON.stringify(fire.map(pavilionFireCommand)),
      parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactPavilionFireDecision(parsed,fire)
        ?exactPavilionFireDecision(parsed,availablePavilionFireActions(cultivator,world,requestTick)):undefined,160));
  }
  const inquiries=availableWitnessActions(cultivator,world,false).length?[]:
    availableWitnessInquiryActions(cultivator,world,requestTick);
  if(inquiries.length){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    const menu=inquiries.map(witnessInquiryCommand);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '只原样复制当前可做的一个查问。不准填写证词、情节、名誉变化、裁决或任何额外字段：'+JSON.stringify(menu),
      parsed=>requestTick===world.tick+1&&activeAvatar(world)!==cultivator&&exactWitnessInquiryDecision(parsed,inquiries)
        ?exactWitnessInquiryDecision(parsed,availableWitnessInquiryActions(cultivator,world,requestTick)):undefined,160));
  }
  const wards = availableCalamityArrayChoices(world, cultivator, requestTick);
  if (wards.length) {
    if (requestTick !== world.tick + 1 || activeAvatar(world) === cultivator) return handledDecision(undefined);
    const menu = wards.map(calamityArrayCommand);
    return handledDecision(requestDecisionPrompt(config, requestTick, options,
      '只原样复制一项本人守阵的许可。不替他宗应允，不可填写独白、代价、伤势、获救或结局：' + JSON.stringify(menu),
      parsed => requestTick === world.tick + 1 && activeAvatar(world) !== cultivator &&
        exactCalamityArrayDecision(parsed, wards)
        ? exactCalamityArrayDecision(parsed, availableCalamityArrayChoices(world, cultivator, requestTick)) : undefined, 160));
  }
  const battlefield=availableBattlefieldRevisits(world,cultivator,requestTick);
  if(battlefield.length){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    const menu=battlefield.map(battlefieldRevisitCommand);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '只原样复制本次重访旧战场的一项现有许可。不可填写独白、结果、代价或新人物：'+JSON.stringify(menu),
      parsed=>activeAvatar(world)===cultivator||requestTick!==world.tick+1?undefined:
        exactBattlefieldRevisitDecision(parsed,availableBattlefieldRevisits(world,cultivator,requestTick)),160));
  }

  const flight=activeProtagonistFlight(world,cultivator);
  if(flight){
    if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return handledDecision(undefined);
    const flightMenu=availableProtagonistFlightActions(cultivator,world,requestTick);
    if(!flightMenu.length)return handledDecision(undefined);
    const prompt=`你只决定这一次真实逃亡的下一步。若同行人已确认，仍只按实际许可行动。
逐字复制一个 JSON 命令：${JSON.stringify(flightMenu.map(protagonistFlightCommand))}
不要编写地名、坐标、行程、伤势结果或替同路人应允。只返回 JSON。`;
    return handledDecision(requestDecisionPrompt(config,requestTick,options,prompt,parsed=>{
      if(requestTick!==world.tick+1||activeAvatar(world)===cultivator||
         activeProtagonistFlight(world,cultivator)!==flight||!exactProtagonistFlightDecision(parsed,flightMenu))return undefined;
      return exactProtagonistFlightDecision(parsed,availableProtagonistFlightActions(cultivator,world,requestTick));
    },160));
  }
  const campaign=availableCampaignAssemblyActions(cultivator,world,requestTick).filter(row=>row.kind!=='guard');
  if(campaign.length){
    if(activeAvatar(world)===cultivator||requestTick!==world.tick+1)return handledDecision(undefined);
    return handledDecision(requestDecisionPrompt(config,requestTick,options,
      '仅原样复制这一战本人获准的一项命令。提出议和不等于另一宗答应，赴阵不等于已经到场。不可填写战果、人物、身份或伤势：'+
        JSON.stringify(campaign.map(row=>row.command)),
      parsed=>{
        if(requestTick!==world.tick+1||activeAvatar(world)===cultivator)return undefined;
        const offered=exactCampaignAssemblyDecision(parsed,campaign);
        if(!offered)return undefined;
        const current=availableCampaignAssemblyActions(cultivator,world,requestTick).filter(row=>row.kind!=='guard'&&
          campaign.some(first=>first.siegeId===row.siegeId&&first.kind===row.kind&&exactCampaignAssemblyDecision(row.command,[first])));
        const exact=exactCampaignAssemblyDecision(parsed,current);
        return exact&&tagCampaignAssemblyDecision(exact,current);
      },160));
  }
  if(pilgrimageForkTravelLocked(world,cultivator)||pilgrimageForkActedThisTick(world,cultivator))return handledDecision(undefined);
  const forkOptions=activeAvatar(world)===cultivator?[]:availablePilgrimageForkActions(cultivator,world,requestTick);
  const forkGuide=forkOptions.length?'只复制本人确在同路岔站的一项分路选择，不填同行者同意、花费、路线或到达：'+
    JSON.stringify(forkOptions.map(pilgrimageForkCommand)):'';
  const activeVow = activePilgrimageForActor(world, cultivator);
  const onPilgrimagePath = activeVow && Boolean(pilgrimageCheckpoint(world, cultivator));
  const mealOptions = onPilgrimagePath ? waypostMealProviderOptions(cultivator, world, requestTick) : [];
  const pilgrimageOptions = availablePilgrimageActions(cultivator, world, true, requestTick);
  const routeWarningOptions = (onPilgrimagePath ? [] : availableRouteWarningActions(cultivator, world, requestTick))
    .map(({ routeWarningMove, targetRouteWarningId, targetRouteObservationId }) =>
      ({ routeWarningMove, targetRouteWarningId, targetRouteObservationId }));
  const routeWarningGuide = `驿路警示只在真实停站时复制已有许可：post 只填本人一次亲历的 targetRouteObservationId；corroborate 同填另一趟独立见闻和现有警示编号；retract 只填本人警示的 targetRouteWarningId。不能填路线、坐标、地名、灾害、期限或新事实；没有许可不得编造。选项：${JSON.stringify(routeWarningOptions)}`;
  if (onPilgrimagePath && !pilgrimageOptions.length && !mealOptions.length) return handledDecision(undefined);
  if(disasterShelterCheckpoint(world,cultivator))return handledDecision(undefined);
  const boundaryReliefOptions = availableBoundaryReliefActions(cultivator, world, requestTick);
  const boundaryReliefOnly = Boolean(boundaryReliefCheckpoint(world, cultivator));
  if (boundaryReliefOnly && !boundaryReliefOptions.length) return handledDecision(undefined);
  const rescueEffect=verifiedHeartDemonChoiceEffect(world,cultivator,requestTick);
  const rescueOptions=autonomousExpeditionRescueOptions(cultivator,world,requestTick);
  const rescuePause=rescueEffect&&canPauseAftermathRescue(cultivator,world,requestTick);
  const dungeon = dungeonDecisionOccasion(cultivator, world, requestTick);
  if (dungeon && !rescueOptions.length) {
    const dungeonOptions = availableDungeonModelOptions(cultivator, world, requestTick);
    if (!dungeonOptions.length) return handledDecision(undefined);
    const menu = dungeonOptions.map(dungeonAction);
    const prompt = '你已实际参与此秘境。只原样复制一个现地允许的 JSON 动作，不填独白、地点推断、伤势、消耗、道具或结果。许可：' +
      JSON.stringify(menu);
    return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, parsed => {
      if (dungeonDecisionOccasion(cultivator, world, requestTick) !== dungeon) return undefined;
      const current = availableDungeonModelOptions(cultivator, world, requestTick);
      if (current.length !== menu.length || current.some((row, i) => !sameDungeon(dungeonAction(row), menu[i]))) return undefined;
      return exactDungeonDecision(parsed, current);
    }, 180));
  }
  const rescueOnly = activeOccasionForActor(world, cultivator)?.kind === 'expedition' || world.expeditionRescues.requests.some((row) =>
    row.status === 'extracting' && (row.explorerId === cultivator.id || row.rescuerId === cultivator.id));
  if (rescueOnly && !rescueOptions.length) return handledDecision(undefined);
  if (!activeVow && !boundaryReliefOnly && !rescueOnly && requestTick === world.tick + 1) {
    const family = availableAutonomousCultivationClanActions(cultivator, world, requestTick);
    if (family.length) {
      const originalSite = cultivator.locationId;
      const menu = family.map(cultivationClanCommand);
      const prompt = '这只关于本人的独立选择，任何一项都不代别人表示同意。' +
        '原样复制一个许可的 JSON 对象；不愿决定可选 REST。不写独白、亲密叙述、孕育、后人、灵根、人物设定或未来结果。许可：' +
        JSON.stringify([...menu, { chosenAction: 'REST' }]);
      return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, parsed => {
        if (requestTick !== world.tick + 1 || cultivator.locationId !== originalSite || activeAvatar(world) === cultivator) return undefined;
        if (parsed?.chosenAction === 'REST' && Object.hasOwn(parsed, 'chosenAction') && Object.keys(parsed).length === 1)
          return waitForOwnClanChoice();
        if (!exactCultivationClanDecision(parsed, family)) return undefined;
        return exactCultivationClanDecision(parsed, availableAutonomousCultivationClanActions(cultivator, world, requestTick));
      }, 170));
    }
    const auction = availableAutonomousImmortalAuctionActions(cultivator, world, requestTick);
    if (auction.length) {
      const originalSite = cultivator.locationId;
      const menu = auction.map(immortalAuctionCommand);
      const prompt = '只准原样复制眼前许可的一项万宝会动作；出价必须保留给定的报价轮次和精确额。' +
        '不填其他人物、身份、钱袋、托管、预报、独白或结果。许可：' + JSON.stringify(menu);
      return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, parsed => {
        if (requestTick !== world.tick + 1 || cultivator.locationId !== originalSite ||
            !exactImmortalAuctionDecision(parsed, auction)) return undefined;
        return exactImmortalAuctionDecision(parsed, availableAutonomousImmortalAuctionActions(cultivator, world, requestTick));
      }, 160));
    }
    const ambush = currentAuctionAmbushOffer(cultivator, world);
    if (ambush) {
      const pursuit = auctionAmbushCommand(ambush);
      const still = { chosenAction: 'REST' as const };
      const prompt = '若愿意在实到之处对眼前已有确证的对方交手，原样复制斗法；否则选 REST。' +
        '不要写战果、位置推断、战利品、独白或其他字段。许可：' + JSON.stringify([pursuit, still]);
      return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, parsed => {
        if (requestTick !== world.tick + 1) return undefined;
        if (parsed?.chosenAction === 'REST' && Object.keys(parsed).length === 1) return {
          chosenAction: 'REST', innerMonologue: '不在此时起争。',
        };
        if (!exactAuctionAmbushDecision(parsed, ambush)) return undefined;
        return exactAuctionAmbushDecision(parsed, currentAuctionAmbushOffer(cultivator, world));
      }, 140));
    }
    const paths = availableAutonomousDaoPathActions(cultivator, world, requestTick);
    if (paths.length) {
      const originalSite = cultivator.locationId;
      const menu = paths.map(daoPathCommand);
      const prompt = '只原样复制一项确实允许的个人道途行动。只能选定道途、实地勤修或预备一式；' +
        '不报交手、收获、伤害、颜色、资源数、身份、场景、独白或结果。许可：' + JSON.stringify(menu);
      return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, parsed => {
        if (requestTick !== world.tick + 1 || cultivator.locationId !== originalSite) return undefined;
        const current = availableAutonomousDaoPathActions(cultivator, world, requestTick);
        if (current.length !== menu.length || current.some((row, i) => !daoPathSame(daoPathCommand(row), menu[i]))) return undefined;
        return exactDaoPathDecision(parsed, current);
      }, 150));
    }
    const rituals = availableAutonomousHeavenlyAlchemyActions(cultivator, world, requestTick);
    if (rituals.length) {
      const originalSite = cultivator.locationId;
      const menu = rituals.map(heavenlyAction);
      const prompt = '仅在本人实物和实际许可内择定火候，或原样选本人已有的一枚丹。只原样复制一完整 JSON 对象，' +
        '不得添加独白、目标人物、品质预测、功效、数额或炼制结果。许可：' + JSON.stringify(menu);
      return handledDecision(requestDecisionPrompt(config, requestTick, options, prompt, parsed => {
        if (requestTick !== world.tick + 1 || cultivator.locationId !== originalSite) return undefined;
        const current = availableAutonomousHeavenlyAlchemyActions(cultivator, world, requestTick);
        if (current.length !== menu.length || current.some((row, i) => !sameHeavenlyAction(heavenlyAction(row), menu[i]))) return undefined;
        return exactHeavenlyAlchemyDecision(parsed, current);
      }, 160));
    }
  }
  return {
    handled: false,
    quotes: {
      activeVow, rescueOnly, boundaryReliefOnly, boundaryReliefOptions, rescueOptions, rescuePause, onPilgrimagePath,
      pilgrimageOptions, forkGuide, mealOptions, routeWarningOptions, routeWarningGuide, banquetGuide, afterSectGuide,
      afterSect, banquet, forkOptions, rescueEffect,
    },
  } as const;
}

export type NativeDecisionContinuation = Extract<ReturnType<typeof quoteNativeDecision>, { handled: false }>['quotes'];
