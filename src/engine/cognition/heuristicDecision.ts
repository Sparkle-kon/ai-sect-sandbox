// Extracted from the native decision flow; evaluation order belongs to the enclosing Utility pipeline.
import { Cultivator, WorldState, LLMDecisionPayload } from '../../types/world';
import { actorFallbackRandom } from '../worldRandom';
import { ascensionQuietWait } from '../ascensionCognition';
import { ascensionDutyActive } from '../ascensionPresence';
import { activeAvatar } from '../avatarEngine';
import { availableFarewellLandingActions } from '../farewellLanding';
import { exactFarewellLandingDecision, farewellLandingCommand } from '../farewellLandingCognition';
import { availableFrontierGorgeActions } from '../frontierGorge';
import { exactFrontierGorgeDecision, frontierGorgeCommand } from '../frontierGorgeCognition';
import { availableFrontierNightHuntActions, projectFrontierNightHunt } from '../frontierNightHunt';
import { exactFrontierNightHuntDecision, frontierNightHuntCommand } from '../frontierNightHuntCognition';
import { frontierCommand } from '../frontierActions';
import { upperArrayFieldCommand } from '../upperArrayFieldActions';
import { utilityUpperPassageDecision } from '../upperPassageEngine';
import { activeCourierForActor, courierActedThisTick, availableCourierActions, availableCourierHandoffActions, courierCheckpoint } from '../sealedCourierEngine';
import { activeEscortForActor } from '../escortEngine';
import { activeDanxiaMedicineEscort, danxiaMedicineActedThisTick } from '../danxiaMedicineTerms';
import { activeRelocationForActor } from '../relocationEngine';
import { isTribulationActive, recommendedTribulationStance } from '../tribulationEngine';
import { forbiddenDuelForParticipant, chooseForbiddenArtDecision } from '../forbiddenArtEngine';
import { chooseRoguelikeEncounterDecision } from '../roguelikeEncounterEngine';
import { chooseDestinyTraitDecision } from '../destinyTraitEngine';
import { availableVacantGateActions } from '../vacantGate';
import { exactVacantGateDecision, vacantGateCommand } from '../vacantGateCognition';
import { chooseGrandSiegeHeroDecision } from '../grandSiegeTheatreEngine';
import { utilityMarketFreightDecision } from '../marketFreightCognition';
import { utilityDisasterShelterDecision } from '../disasterShelterCognition';
import { availableBoundaryReliefActions } from '../boundaryReliefEngine';
import { furnaceEmergencyCrossingLocked, availableFurnaceEmergencyActions } from '../furnaceEmergency';
import { exactFurnaceEmergencyDecision, furnaceEmergencyCommand } from '../furnaceEmergencyCognition';
import { activeBellWatchForActor, availableBellWatchActions, bellWatchActedThisTick } from '../bellWatch';
import { availableNightDoorActions } from '../nightDoor';
import { exactNightDoorDecision, nightDoorCommand } from '../nightDoorCognition';
import { availableBanquetSeatActions } from '../banquetSeats';
import { exactBanquetSeatDecision, banquetSeatCommand } from '../banquetSeatCognition';
import { availableLastRosterActions } from '../lastRoster';
import { exactLastRosterDecision, lastRosterCommand } from '../lastRosterCognition';
import { availableBoundaryGapActions } from '../boundaryGap';
import { exactBoundaryGapDecision, boundaryGapCommand } from '../boundaryGapCognition';
import { availableAbandonedQuarterActions } from '../abandonedQuarter';
import { exactAbandonedQuarterDecision, abandonedQuarterCommand } from '../abandonedQuarterCognition';
import { activeProtagonistFlight, availableProtagonistFlightActions } from '../protagonistFlightEngine';
import { utilityProtagonistFlightDecision } from '../protagonistFlightCognition';
import { pilgrimageForkTravelLocked, pilgrimageForkActedThisTick } from '../pilgrimageForkPresence';
import { activePilgrimageForActor, availablePilgrimageActions, pilgrimageCheckpoint } from '../pilgrimageEngine';
import { utilityWaypostMealDecision } from '../waypostMealCognition';
import { SPARRING_QI_COST, availableSparringActions, sparringLocksActor } from '../sparringEngine';
import { availableFormationActions } from '../formationNetworkEngine';
import { availableInfirmaryActions, infirmaryCapacity } from '../infirmaryEngine';
import { availableObservatoryActions } from '../fieldObservatoryEngine';
import { availableApprenticeCohortActions } from '../apprenticeCohortEngine';
import { availableGuardianActions } from '../householdEngine';
import { isRetiredFromService, availableServiceRetirementActions } from '../serviceRetirementEngine';
import { availableTerrainRecoveryActions } from '../terrainSuccessionEngine';
import { SEASON_REVIEW_WINDOW, availableSeasonReviewActions } from '../seasonReviewEngine';
import { canInvestigateExpeditionOmen,directorExpeditionRegistration } from '../expeditionOmenEngine';
import { availableShortShiftActions } from '../shortShiftEngine';
import { availableMentorTransferActions } from '../mentorTransferEngine';
import { availableSeasonalHousingActions, seasonalHousingTravelTarget } from '../seasonalHousingEngine';
import { CARE_FOLLOWUP_NEED_THRESHOLD } from '../careFollowupTerms';
import { availableCareFollowupActions, shouldVolunteerCareFollowup } from '../careFollowupEngine';
import { availablePavilionLoanActions } from '../pavilionLoanEngine';
import { availableSectStipendActions } from '../sectStipendEngine';
import { ALIGNED_WEATHER_SOURCE_MAX_AGE, ALIGNED_WEATHER_OFFER_TICKS } from '../alignedWeatherTerms';
import { availableAlignedWeatherActions } from '../alignedWeatherEngine';
import { availableOathArbitrationActions } from '../oathArbitrationEngine';
import { availableRoadActions } from '../roadEngine';
import { availableVillageGranaryActions } from '../villageGranaryEngine';
import { availableVillageSupplyActions } from '../villageSupplyEngine';
import { availableProbationActions, probationReliefTargets } from '../probationEngine';
import { availableSettlementActions } from '../settlementEngine';
import { knownMapLocations } from '../terrainEngine';
import { availableRelicExhibitActions } from '../relicExhibitEngine';
import { availableVillageCensusActions } from '../villageCensusEngine';
import { availableFurnaceSafetyActions } from '../furnaceSafetyEngine';
import { availableDamageAssuranceActions } from '../damageAssuranceEngine';
import { heldFurnaceReservation, availableFurnaceReservationActions } from '../furnaceReservationEngine';
import { availableWorkshopActions, availableWorkshopReleaseActions, availableWorkshopCapacityActions } from '../workshopEngine';
import { availableAlchemy } from '../alchemyEngine';
import { availableArtifactActions } from '../artifactEngine';
import { availableRelicActions } from '../relicEngine';
import { utilityCraftTrainingDecision } from '../craftTrainingCognition';
import { utilityWorkshopEstateDecision } from '../workshopEstateCognition';
import { utilityScribeCommissionDecision } from '../scribeCommissionCognition';
import { availableToolLoanActions } from '../toolLoanEngine';
import { availableSharedCommonsActions } from '../sharedCommonsEngine';
import { availableTerritorialLeaseActions } from '../territorialLeaseEngine';
import { availableVillageWorksActions } from '../villageWorksEngine';
import { availableHabitatActions } from '../habitatEngine';
import { boundaryReliefCheckpoint } from '../boundaryReliefCheckpoint';
import { disasterShelterCheckpoint } from '../disasterShelterCheckpoint';
import { availableCalamityArrayChoices } from '../calamityArray';
import { exactCalamityArrayDecision, calamityArrayCommand } from '../calamityArrayCognition';
import { utilityBattlefieldAftermathDecision } from '../battlefieldAftermathCognition';
import { availableVillageReunionActions } from '../villageReunion';
import { exactVillageReunionDecision, villageReunionCommand } from '../villageReunionCognition';
import { availableWildMigrationActions } from '../wildMigration';
import { exactWildMigrationDecision, wildMigrationCommand } from '../wildMigrationCognition';
import { availableMercyReunionActions } from '../mercyReunion';
import { exactStoryMercyDecision, storyMercyCommand } from '../mercyReunionCognition';
import { availablePavilionFireActions } from '../pavilionFire';
import { exactPavilionFireDecision, pavilionFireCommand } from '../pavilionFireCognition';
import { utilityAscensionDecision, utilityExpeditionRescueDecision } from './decisionFactsEarly';
import { availableFrontierProviderActions, availableUpperArrayFieldProviderActions, holdsUpperPassageBody, upperPassageDecision, upperPassageRest, utilityCourierHandoffOffer, utilityHeartDemonDecision, dungeonDecisionOccasion, utilityDungeonDecision, utilityRouteWarning, PAIRED_OBSERVATORY_INTERVAL, PAIRED_OBSERVATORY_DAY, pairedObservatoryStation, preferredWorkshopWork, chooseLinkedToolConsent, urgentOrdinaryRefuge, urgentOrdinaryRecovery } from './decisionFactsLate';
import { grandSiegeHeroReservedForPlayer, toMentorTransferDecision, toHousingDecision, possessedForWorkshopRelease, workshopReleaseDecision } from './decisionCommands';
import { availableStorytellerActions } from '../storytellerDirector';
import { utilityPublicWitnessInquiry } from '../witnessInquiryCognition';
import { exactStorytellerDecision, storytellerCommand } from './storytellerDecision';
import { bellWatchCommand, exactBellWatchDecision } from './bellWatchDecision';
import { completeHeuristicDecision, utilityDoctrineFoundingDecision } from './heuristicDecisionTail';

export function computeHeuristicDecision(
  cultivator: Cultivator,
  world: WorldState,
  rng: () => number = actorFallbackRandom(world, cultivator.id, world.tick)
): LLMDecisionPayload {
  if (cultivator.positionPlane === 'immortal') return ascensionQuietWait();
  if (ascensionDutyActive(world, cultivator)) return utilityAscensionDecision(cultivator, world) ?? ascensionQuietWait();
  if(cultivator.positionPlane==='frontier'){
    if(activeAvatar(world)!==cultivator){
      const lamps=availableFarewellLandingActions(cultivator,world,world.tick);
      const wantLight=cultivator.personality==='痴情'||cultivator.personality==='刚正';
      const lamp=lamps.find(row=>row.farewellLandingMove===(wantLight?'keep_light':'farewell'))??lamps[0];
      const ownedLamp=lamp&&exactFarewellLandingDecision(farewellLandingCommand(lamp),lamps);
      if(ownedLamp)return ownedLamp;
      const gorge=availableFrontierGorgeActions(cultivator,world,world.tick);
      const choice=(cultivator.hp>=cultivator.maxHp*.55?gorge.find(row=>row.frontierGorgeMove==='detour'):undefined)??
        gorge.find(row=>row.frontierGorgeMove==='wait');
      const exactChoice=choice&&exactFrontierGorgeDecision(frontierGorgeCommand(choice),gorge);
      if(exactChoice)return exactChoice;
      const hunt=availableFrontierNightHuntActions(cultivator,world,world.tick);
      if(hunt.length){
        const before=projectFrontierNightHunt(world,cultivator);
        const stance=cultivator.hp<cultivator.maxHp*.45?'return':before?.observed?'wait':'trace';
        const option=hunt.find(row=>row.frontierNightHuntMove===stance);
        const exact=option&&exactFrontierNightHuntDecision(frontierNightHuntCommand(option),hunt);
        if(exact)return exact;
      }
    }
    // No Utility signature, fee-bearing travel or escrow without an explicit choice.
    const option=availableFrontierProviderActions(cultivator,world).find(row=>row.action==='FRONTIER_PRODUCTION'&&
      (row.frontierProductionMove==='harvest'||row.frontierProductionMove==='draw_tide')||
      row.action==='FRONTIER_PORT'&&row.frontierPortMove==='gather'&&cultivator.herbs.earth_root>=2&&cultivator.hp>cultivator.maxHp/2||
      row.action==='FRONTIER_DRYLAND'&&row.frontierDrylandMove==='draw_water');
    return option?{...frontierCommand(option),innerMonologue:'只料理当月亲到的地物。'}:
      {chosenAction:'REST',innerMonologue:'且在眼前地界歇脚，不替旁人签契。'};
  }
  if(cultivator.positionPlane!==undefined){
    const tangible=availableUpperArrayFieldProviderActions(cultivator,world).find(row=>
      row.action==='UPPER_ARRAY_FIELD_LOCAL'&&row.upperArrayFieldLocalMove==='condense'&&
      cultivator.herbs.earth_root>=2&&cultivator.spiritStones>=8&&cultivator.hp>cultivator.maxHp/2);
    if(tangible)return {...upperArrayFieldCommand(tangible),innerMonologue:'趁尚有地根和气力，在亲到的凝纹墩收实阵材。'};
    const option=holdsUpperPassageBody(world,cultivator)?undefined:utilityUpperPassageDecision(cultivator,world);
    return option?upperPassageDecision(option,'按实到的阶与本人所见行事，不代报进境。'):upperPassageRest();
  }
  if (activeCourierForActor(world, cultivator) || courierActedThisTick(world, cultivator)) {
    return utilityCourierHandoffOffer(cultivator, world) ??
      { chosenAction: 'REST', innerMonologue: '封信由实际关口推进，途中不在旧站另作事务。' };
  }
  if (activeEscortForActor(world, cultivator)) {
    return { chosenAction: 'REST', innerMonologue: '护送沿实际山路进行，途中不接其他事务。' };
  }
  if(activeDanxiaMedicineEscort(world,cultivator)||danxiaMedicineActedThisTick(world,cultivator))
    return {chosenAction:'REST',innerMonologue:'药束沿实路移动，不在旧站接下别事。'};
  if (activeRelocationForActor(world, cultivator)) {
    return { chosenAction: 'REST', innerMonologue: '正随迁宗队列行军，本月不单独行动。' };
  }
  if (isTribulationActive(cultivator)) {
    const heart = utilityHeartDemonDecision(world, cultivator);
    if (heart) return heart;
    const tribulationStance = recommendedTribulationStance(cultivator);
    return {
      chosenAction: 'FACE_TRIBULATION', tribulationStance,
      innerMonologue: tribulationStance === 'focus' ? '抱守道心，不为幻象所动。' : '雷云不散，且运转护身法诀抵挡。',
    };
  }
  const ascent = utilityAscensionDecision(cultivator, world);
  if (ascent) return ascent;
  const contact = forbiddenDuelForParticipant(world, cultivator);
  if (contact) return chooseForbiddenArtDecision(world, cultivator) ??
    { chosenAction: 'REST', innerMonologue: '且待眼前交手依实况分明。' };
  const dungeon = dungeonDecisionOccasion(cultivator, world);
  if (dungeon) return utilityExpeditionRescueDecision(cultivator, world) ?? utilityDungeonDecision(cultivator, world) ??
    { chosenAction: 'REST', innerMonologue: '在实际到达之处停等，不另报进境。' };
  const roguelikeDecision = chooseRoguelikeEncounterDecision(world, cultivator);
  if (roguelikeDecision) return roguelikeDecision;
  const destinyDecision = chooseDestinyTraitDecision(world, cultivator);
  if (destinyDecision) return destinyDecision;
  if(activeAvatar(world)!==cultivator&&world.sieges.some(row=>row.status==='sieging')){
    const choices=availableVacantGateActions(cultivator,world,world.tick);
    const cautious=cultivator.hp<cultivator.maxHp*.55||cultivator.personality==='诡诈';
    const choice=choices.find(row=>row.vacantGateMove===(cautious?'withdraw':'guard'))??choices[0];
    const exact=choice&&exactVacantGateDecision(vacantGateCommand(choice),choices);
    if(exact)return exact;
  }
  const grandSiegeDecision = chooseGrandSiegeHeroDecision(world, cultivator);
  if (grandSiegeDecision?.targetGrandSiegeId &&
      !grandSiegeHeroReservedForPlayer(world, grandSiegeDecision.targetGrandSiegeId)) return grandSiegeDecision;
  const freight=utilityMarketFreightDecision(cultivator,world);
  if(freight)return freight;
  const disasterShelter = utilityDisasterShelterDecision(cultivator,world);
  if(disasterShelter)return disasterShelter;
  const boundaryRow = world.boundaryReliefs.cases.find((row) => row.incomingId === cultivator.id &&
    (row.status === 'offered' || row.status === 'travelling' || row.status === 'returning'));
  if (boundaryRow) {
    const choices = availableBoundaryReliefActions(cultivator, world);
    const fatigued = cultivator.hp < cultivator.maxHp * .65;
    if (boundaryRow.status === 'offered') {
      const move = choices.find(({ boundaryReliefMove }) => boundaryReliefMove === (fatigued ? 'decline' : 'accept'));
      if (move) return { ...move, chosenAction: move.action, innerMonologue: fatigued ?
        '伤势未愈，由本人谢绝，不让同门失去已有岗哨。' : '我愿按实际路线前往；到阵位再换防。' };
    } else {
      // This is an explicit reversal only while the return leg is no longer than the unfinished outward leg.
      const returnCostIsLower = boundaryRow.pathIndex * 2 <= boundaryRow.path.length - 1;
      const withdraw = boundaryRow.status === 'travelling' && fatigued && returnCostIsLower ?
        choices.find(({ boundaryReliefMove }) => boundaryReliefMove === 'withdraw') : undefined;
      if (withdraw) return { ...withdraw, chosenAction: withdraw.action,
        innerMonologue: '伤势累进，在可实走退回时由本人撤回，不虚报已到岗。' };
      return { chosenAction: 'REST', innerMonologue: '换防途中仅按实际关口推进，不在旧站另行办事。' };
    }
  }
  if(activeBellWatchForActor(world,cultivator)||bellWatchActedThisTick(world,cultivator))
    return {chosenAction:'REST',innerMonologue:'先走眼下这段信路。'};
  const bellOptions=availableBellWatchActions(cultivator,world);
  const bellPick=bellOptions.find(row=>row.bellWatchMove===(cultivator.hp >= cultivator.maxHp*.8?'reroute':'inspect'))??bellOptions[0];
  if(bellPick && activeAvatar(world)!==cultivator){
    const founding=utilityDoctrineFoundingDecision(cultivator,world);
    if(founding)return founding;
    const exact=exactBellWatchDecision(bellWatchCommand(bellPick),bellOptions);
    if(exact)return exact;
  }
  if(furnaceEmergencyCrossingLocked(world,cultivator))return {chosenAction:'REST',innerMonologue:'先走自己已应下的那段路。'};
  const emergency = availableFurnaceEmergencyActions(cultivator,world,world.tick);
  if (emergency.length) {
    if (activeAvatar(world)===cultivator) return {chosenAction:'REST',innerMonologue:'炉前这一念，由身在这里的人自己择定。'};
    const preferred=cultivator.hp<cultivator.maxHp*.58?'retreat':
      cultivator.personality==='刚正'||cultivator.personality==='痴情'?'brace':'request_rescue';
    const choice=emergency.find(row=>row.furnaceEmergencyMove==='accept_rescue'&&cultivator.hp>=cultivator.maxHp*.7)??
      emergency.find(row=>row.furnaceEmergencyMove===preferred)??emergency.find(row=>row.furnaceEmergencyMove==='retreat')??
      emergency.find(row=>row.furnaceEmergencyMove==='brace');
    if(choice)return exactFurnaceEmergencyDecision(furnaceEmergencyCommand(choice),emergency)??
      {chosenAction:'REST',innerMonologue:'先留在实处，不捏造援手。'};
    return {chosenAction:'REST',innerMonologue:'未肯应下援手这一问。'};
  }
  const witnessQuestion=utilityPublicWitnessInquiry(world,cultivator);
  if(witnessQuestion)return witnessQuestion;
  const story=world.storyteller;
  if(story?.offer?.actorId===cultivator.id&&story.focusActorId!==cultivator.id&&activeAvatar(world)!==cultivator){
    const options=availableStorytellerActions(cultivator,world);
    const founding=options.length?utilityDoctrineFoundingDecision(cultivator,world):undefined;
    if(founding)return founding;
    const intent=cultivator.hp<cultivator.maxHp*.62?'rest':
      story.offer.storyletId==='storm-watch'?'cultivate':
      cultivator.personality==='逍遥'||cultivator.personality==='狂傲'?'travel':'talk';
    const selected=options.find(row=>row.storytellerMove===intent)??
      options.find(row=>row.storytellerMove==='cultivate')??options[0];
    const exact=selected&&exactStorytellerDecision(storytellerCommand(selected),options);
    if(exact)return exact;
  }
  const door=availableNightDoorActions(cultivator,world,world.tick);
  if(door.length){
    if(activeAvatar(world)===cultivator)return {chosenAction:'REST',innerMonologue:'门前这句话，得由本人亲口说。'};
    const preferences=cultivator.hp<cultivator.maxHp*.50?['shelter','accept','identify','close','cross','escort']:
      cultivator.personality==='诡诈'?['close','identify','accept','cross','shelter','escort']:
      ['identify','shelter','accept','cross','escort','close'];
    const choice=preferences.flatMap(move=>door.find(row=>row.nightDoorMove===move)??[])[0];
    const exact=choice&&exactNightDoorDecision(nightDoorCommand(choice),door);
    if(exact)return exact;
  }
  // Receiving an invitation in the arena does not automatically interrupt later life at home.
  // Utility may respond spontaneously after actually returning to the venue. Explicit and
  // Cognitive invitations can still ask for one lawful trip, with movement independently checked.
  const banquet=availableBanquetSeatActions(cultivator,world,world.tick).filter(option=>
    world.banquetSeats?.tables.some(table=>table.id===option.targetBanquetSeatId&&table.siteId===cultivator.locationId));
  if(banquet.length){
    if(activeAvatar(world)===cultivator)return {chosenAction:'REST',innerMonologue:'邀帖在手；赴不赴这一席，由本人亲定。'};
    const preference=cultivator.hp<cultivator.maxHp*.55||cultivator.personality==='阴险'?'decline':'attend';
    const choice=banquet.find(row=>row.banquetSeatMove===preference)??banquet.find(row=>row.banquetSeatMove==='late')??banquet[0];
    const exact=exactBanquetSeatDecision(banquetSeatCommand(choice),banquet);
    if(exact)return exact;
  }
  const afterSect=availableLastRosterActions(cultivator,world,world.tick);
  if(afterSect.length){
    if(activeAvatar(world)===cultivator)return {chosenAction:'REST',innerMonologue:'各人去向，由自己择。'};
    const preferred=cultivator.hp<cultivator.maxHp*.55||cultivator.personality==='痴情'?'stay':
      cultivator.personality==='逍遥'?'home':'new_gate';
    const choice=afterSect.find(row=>row.lastRosterMove===preferred)??afterSect.find(row=>row.lastRosterMove==='stay');
    const exact=choice&&exactLastRosterDecision(lastRosterCommand(choice),afterSect);
    if(exact)return exact;
  }
  const boundaryGap=availableBoundaryGapActions(cultivator,world,world.tick);
  if(boundaryGap.length){
    if(activeAvatar(world)===cultivator)return {chosenAction:'REST',innerMonologue:'关口这一念，由身在这里的人自己择定。'};
    const stance=cultivator.hp<cultivator.maxHp*.45?'refuse':cultivator.personality==='刚正'?'cover':'stay';
    const choice=boundaryGap.find(row=>row.boundaryGapMove===stance)??
      boundaryGap.find(row=>row.boundaryGapMove==='stay')??boundaryGap[0];
    const exact=exactBoundaryGapDecision(boundaryGapCommand(choice),boundaryGap);
    if(exact)return exact;
  }
  const ruins=availableAbandonedQuarterActions(cultivator,world,world.tick);
  if(ruins.length){
    if(activeAvatar(world)===cultivator)return {chosenAction:'REST',innerMonologue:'在旧村这一月，由亲到的人自己定。'};
    const preference=cultivator.hp<cultivator.maxHp*.5?'leave':cultivator.personality==='痴情'?'stay':'inspect';
    const choice=ruins.find(row=>row.abandonedQuarterMove===preference)??
      ruins.find(row=>row.abandonedQuarterMove==='inspect')??ruins[0];
    const exact=exactAbandonedQuarterDecision(abandonedQuarterCommand(choice),ruins);
    if(exact)return exact;
  }
  const rescue = utilityExpeditionRescueDecision(cultivator, world);
  if (rescue) return rescue;
  if(activeProtagonistFlight(world,cultivator)){
    const flightChoices=availableProtagonistFlightActions(cultivator,world,world.tick);
    if(activeAvatar(world)===cultivator)
      return {chosenAction:'REST',innerMonologue:'等本人择定眼下哪一步，不代走这段山路。'};
    const flightChoice=utilityProtagonistFlightDecision(cultivator,flightChoices);
    return flightChoice??{chosenAction:'REST',innerMonologue:'眼下没有可以实走的一步，先守住所在之处。'};
  }
  if(pilgrimageForkTravelLocked(world,cultivator)||pilgrimageForkActedThisTick(world,cultivator))
    return {chosenAction:'REST',innerMonologue:'已择自己的一段路，等身体走到再说。'};
  const pilgrim = activePilgrimageForActor(world, cultivator);
  const pendingVow = world.pilgrimages.journeys.some((journey) => journey.status === 'proposed' && journey.companionId === cultivator.id);
  if (pilgrim || pendingVow) {
    const tea = pilgrim ? utilityWaypostMealDecision(cultivator, world) : undefined;
    if (tea) return tea;
    const moves = availablePilgrimageActions(cultivator, world, false);
    const worried = cultivator.hp < cultivator.maxHp * .35 || (pendingVow && cultivator.hp < cultivator.maxHp * .65);
    const resume = moves.find(({ pilgrimageMove }) => pilgrimageMove === 'resume');
    const nextCheckpoint = resume ?? moves.find(({ pilgrimageMove }) => pilgrimageMove === 'camp');
    if (nextCheckpoint) return { ...nextCheckpoint, chosenAction: 'PILGRIMAGE', innerMonologue: resume ?
      '按已核实的关口原路接续，不另造站点，也不重付本段费用。' : '同伴受伤或实际行程已耽搁，以实有补给暂宿。' };
    // A companion does not spontaneously dismantle before the organizer can resume in ordinary actor order.
    const settledMove = moves.find(({ pilgrimageMove }) => pilgrimageMove === 'relieve' ||
      (worried ? pilgrimageMove === 'withdraw' || pilgrimageMove === 'decline' : pilgrimageMove === 'accept'));
    if (!settledMove && !worried && pilgrim && !pilgrimageCheckpoint(world, cultivator)) {
      const warning = utilityRouteWarning(cultivator, world);
      if (warning) return warning;
    }
    const move = settledMove ??
      ((!worried && (cultivator.personality === '刚正' || cultivator.personality === '逍遥'))
        ? moves.find(({ pilgrimageMove, targetRoadId }) => pilgrimageMove === 'advance' && targetRoadId !== undefined) : undefined) ??
      moves.find(({ pilgrimageMove }) => pilgrimageMove === 'advance');
    if (move) return { ...move, chosenAction: 'PILGRIMAGE', innerMonologue: '只按同伴应允与实走的路程行事。' };
    if (pilgrim) return { chosenAction: 'REST', innerMonologue: '等同伴沿已知路段前行，到站再作休整。' };
  }
  const actorHasSparring = world.sparring.agreements.some((row) => (row.status === 'offered' || row.status === 'active') &&
    (row.proposerId === cultivator.id || row.partnerId === cultivator.id));
  const mayPractice = world.tick >= 8 && (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 17 === 3 &&
    cultivator.hp >= cultivator.maxHp * .85 && cultivator.qiProgress >= SPARRING_QI_COST &&
    (cultivator.personality === '刚正' || cultivator.personality === '逍遥');
  if (actorHasSparring) {
    const choices = availableSparringActions(cultivator, world, false);
    const fatigued = cultivator.hp < cultivator.maxHp * .7 || cultivator.qiProgress < SPARRING_QI_COST;
    const wouldAccept = !fatigued && cultivator.hp >= cultivator.maxHp * .8 && cultivator.personality !== '嗜血' &&
      cultivator.personality !== '诡诈' && cultivator.personality !== '阴险';
    const move = choices.find(({ sparringMove }) => sparringMove === (fatigued ? 'yield' : 'ready')) ??
      choices.find(({ sparringMove }) => sparringMove === (wouldAccept ? 'accept' : 'decline'));
    if (move) return { ...move, chosenAction: 'SPARRING', innerMonologue: move.sparringMove === 'yield' ?
      '余力不足，当下认输；不再扣练功余力。' : '各自应允，按约切磋；对方未准备就不演算。' };
  }
  if (world.sparring.agreements.length && sparringLocksActor(world, cultivator)) {
    return { chosenAction: 'REST', innerMonologue: '等对方自行应允或喊停，本轮不另作交手。' };
  }
  if (cultivator.qiProgress < 45 && world.formations.links.some((link) =>
    (cultivator.sectId === link.sectAId && cultivator.locationId === link.siteAId && link.heldA > 0) ||
    (cultivator.sectId === link.sectBId && cultivator.locationId === link.siteBId && link.heldB > 0))) {
    const received = availableFormationActions(cultivator, world, false).find(({ formationMove }) => formationMove === 'draw');
    if (received) return { ...received, chosenAction: 'FORMATION_NETWORK', innerMonologue: '本端已经实收灵气，先按账领用。' };
  }
  const clinic = world.sects.find((sect) => sect.id === cultivator.sectId && sect.headquartersId === cultivator.locationId && sect.facilities.alchemy_hall > 0);
  if (clinic && (cultivator.hp <= cultivator.maxHp * .70 || world.infirmaries.cases.some((row) =>
    row.sectId === clinic.id && row.status === 'waiting'))) {
    const choices = availableInfirmaryActions(cultivator, world);
    const offered = choices.find(({ infirmaryMove }) => infirmaryMove === 'accept_handoff') ??
      choices.find(({ infirmaryMove }) => infirmaryMove === 'accept');
    const staff = choices.find(({ infirmaryMove }) => infirmaryMove === 'staff');
    const request = cultivator.hp >= cultivator.maxHp * .20 ? choices.find(({ infirmaryMove }) => infirmaryMove === 'request') : undefined;
    const ownCase = world.infirmaries.cases.find((row) => row.status === 'waiting' && row.patientId === cultivator.id);
    const refuse = ownCase && world.tick - ownCase.queuedTick >= 2 && !infirmaryCapacity(world, clinic.id).available && cultivator.personality === '逍遥'
      ? choices.find(({ infirmaryMove }) => infirmaryMove === 'refuse') : undefined;
    const move = offered ?? staff ?? request ?? refuse;
    if (move) {
      // Do not substitute optional clinic work for a previously signed, actually due personal duty.
      const reading = Object.hasOwn(world.fieldObservatories.byActor, cultivator.id) ?
        availableObservatoryActions(cultivator, world).find(({ observatoryMove }) => observatoryMove === 'measure') : undefined;
      if (reading) return { ...reading, chosenAction: reading.action, innerMonologue: '本人已经出资预约本轮实测，先如期完成。' };
      const dueLesson = cultivator.hp >= cultivator.maxHp * .45 && world.apprenticeCohorts.cohorts.some((row) =>
        row.status === 'offered' && row.lessonTick === world.tick && (row.mentorId === cultivator.id ||
          row.seats.some(({ studentId, status }) => studentId === cultivator.id && status === 'accepted')))
        ? availableApprenticeCohortActions(cultivator, world).find(({ cohortMove }) => cohortMove === 'teach' || cohortMove === 'attend') : undefined;
      if (dueLesson) return { ...dueLesson, chosenAction: dueLesson.action, innerMonologue: '本人已有当轮实授或到课约定，先履行本期共练。' };
      return { chosenAction: 'INFIRMARY', infirmaryMove: move.infirmaryMove, targetInfirmaryCaseId: move.targetInfirmaryCaseId,
        innerMonologue: move.infirmaryMove === 'accept_handoff'
          ? '本人与实际已值守的候补核实交接；我明确同意本轮护诊。' : '是否入院由本人同意，须有当值人、空床和实物。' };
    }
  }
  if (world.couriers.dispatches.some((row) => row.status === 'offered' && row.courierId === cultivator.id)) {
    const acceptance = availableCourierActions(cultivator, world, false).find(({ courierMove }) => courierMove === 'accept');
    if (acceptance) return { ...acceptance, chosenAction: 'SEALED_COURIER', innerMonologue: '自己确认封信、报酬和已知送达点，途中不擅拆。' };
  }
  if (world.households.guardianships.some((row) => row.status === 'offered' && row.wardId === cultivator.id)) {
    const consent = availableGuardianActions(cultivator, world, false).find(({ guardianMove }) => guardianMove === 'accept');
    if (consent) return { ...consent, chosenAction: 'HOUSEHOLD_GUARDIAN', innerMonologue: '照应之约由我本人选择，不更动家户与宗籍。' };
  }
  if (world.tick >= 18 && ((world.tick % 12 === 9 && cultivator.age >= cultivator.lifespan * .9) ||
      (world.tick % 12 === 3 && isRetiredFromService(cultivator) && cultivator.personality === '刚正'))) {
    const service = availableServiceRetirementActions(cultivator, world)[0];
    if (service) return { ...service, chosenAction: 'SECT_SERVICE', innerMonologue: service.serviceMove === 'return'
      ? '我愿恢复公职资格，旧职仍由现任承接。' : '本人愿卸下公职，仍保有宗籍和已有身家。' };
  }

  if (world.tick % 4 === 1 && world.terrainSuccession.cells.length &&
      (cultivator.personality === '刚正' || cultivator.personality === '逍遥')) {
    const work = availableTerrainRecoveryActions(cultivator, world)[0];
    if (work) return { ...work, chosenAction: 'TERRAIN_RECOVERY', innerMonologue: '只修脚下已退灾的实地，付出实物，不抹去永久伤痕。' };
  }
  if (cultivator.personality === '刚正' && world.competitionReviews.proofs.length &&
      world.competitions.seasons.some(({ closedTick }) => closedTick !== undefined && world.tick >= closedTick &&
        world.tick < closedTick + SEASON_REVIEW_WINDOW)) {
    const review = availableSeasonReviewActions(cultivator, world)[0];
    if (review) return { ...review, chosenAction: 'SEASON_REVIEW', innerMonologue: '只请复核有确凿来源的公开计分凭证，封存原账。' };
  }
  const mayFundWeather = world.tick >= 29 && (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 19 === 4 &&
    (cultivator.personality === '刚正' || cultivator.personality === '逍遥');
  const examineOmen=canInvestigateExpeditionOmen(world,cultivator);
  const surveyOptions = mayFundWeather || examineOmen || Object.hasOwn(world.fieldObservatories.byActor, cultivator.id)
    ? availableObservatoryActions(cultivator, world) : [];
  const dueWeather = surveyOptions.find(({ observatoryMove }) => observatoryMove === 'measure');
  if (dueWeather) return { ...dueWeather, chosenAction: 'FIELD_OBSERVATORY', innerMonologue: '如期完成本人先前约定的实测，不以短聘替代。' };
  const shiftChoices = world.shortShifts.shifts.some((row) =>
    (row.status === 'offered' || row.status === 'active') && row.workerId === cultivator.id)
    ? availableShortShiftActions(cultivator, world) : [];
  const acceptedWork = shiftChoices.find(({ shortShiftMove }) => shortShiftMove === 'work');
  if (acceptedWork) return { ...acceptedWork, chosenAction: 'SHORT_SHIFT', innerMonologue: '按自己应允的短聘到场做值，不改变宗籍。' };
  const committedCohort = world.apprenticeCohorts.cohorts.some((row) => row.status === 'offered' &&
    (row.mentorId === cultivator.id || row.seats.some(({ studentId, status }) =>
      studentId === cultivator.id && (status === 'invited' || status === 'accepted'))));
  if (committedCohort) {
    const lessons = availableApprenticeCohortActions(cultivator, world);
    const canTrain = cultivator.hp >= cultivator.maxHp * .45;
    const lesson = canTrain ? lessons.find(({ cohortMove }) => cohortMove === 'teach' || cohortMove === 'attend') : undefined;
    if (lesson) return { ...lesson, chosenAction: lesson.action, innerMonologue: lesson.cohortMove === 'teach'
      ? '按期在场传法，实耗本轮教学时段，不自定出师结果。' : '今日实际到场共练，不把一次出席当作已经出师。' };
    const consent = cultivator.hp >= cultivator.maxHp * .75 &&
      cultivator.personality !== '嗜血' ? lessons.find(({ cohortMove }) => cohortMove === 'accept') : undefined;
    if (consent) return { ...consent, chosenAction: consent.action, innerMonologue: '此法与我正在练的原本一致，我自愿参加一课。' };
    const leave = !canTrain ? lessons.find(({ cohortMove }) => cohortMove === 'leave') : undefined;
    if (leave) return { ...leave, chosenAction: leave.action, innerMonologue: '伤势不宜练习，先按约自愿退出。' };
  }
  const willingTransfer = cultivator.hp >= cultivator.maxHp * .64 && cultivator.personality !== '嗜血';
  const transferRole = world.mentorTransfers.transfers.some(row =>
    (row.status === 'offered' || row.status === 'accepted') && (row.studentId === cultivator.id || row.newMentorId === cultivator.id));
  if (transferRole) {
    const options = availableMentorTransferActions(cultivator,world);
    const owing = options.find(({mentorTransferMove}) => mentorTransferMove === 'teach' || mentorTransferMove === 'attend');
    if (owing) return toMentorTransferDecision(owing,'按本人此前的约定实到，授课结果另行核验。');
    const answer = options.find(({mentorTransferMove}) => mentorTransferMove === (willingTransfer ? 'accept' : 'decline'));
    if (answer) return toMentorTransferDecision(answer,willingTransfer ? '愿与同门续修原功法，另约同堂。' : '此时不宜转接，先谢绝。');
  }
  if (world.seasonalHousing.claims.some(row=>
      (row.status==='offered'||row.status==='reserved')&&row.guestId===cultivator.id)) {
    const lodging = availableSeasonalHousingActions(cultivator,world);
    const registration = lodging.find(({housingMove})=>housingMove==='check_in');
    if (registration) return toHousingDecision(registration,'实际到村后愿照约登记借居，不因此入坊籍。');
    const wantsRoom = cultivator.hp >= cultivator.maxHp*.55 && cultivator.personality!=='嗜血';
    const answer = lodging.find(({housingMove})=>housingMove===(wantsRoom?'accept':'decline'));
    if (answer) return toHousingDecision(answer,wantsRoom?'愿按季暂借一房；仍须亲自实到。':'此季不能赴约，先谢绝。');
    const arrival = seasonalHousingTravelTarget(world,cultivator);
    if (arrival) return {chosenAction:'EXPLORE',targetLocationId:arrival,innerMonologue:'凭已知村路自行赴约，路到方可借居。'};
  }
  const willingFollowup = !cultivator.guardAssignment &&
    (cultivator.hp / Math.max(1, cultivator.maxHp) <= CARE_FOLLOWUP_NEED_THRESHOLD || cultivator.pillToxicity > 0);
  if (willingFollowup && world.careFollowups.appointments.some(({ patientId, status }) => patientId === cultivator.id && status === 'scheduled')) {
    const followup = availableCareFollowupActions(cultivator, world).filter(({ careFollowupMove }) => careFollowupMove === 'attend');
    if (followup.length === 1) return { chosenAction: 'CARE_FOLLOWUP', careFollowupMove: 'attend',
      targetCareFollowupId: followup[0].targetCareFollowupId,
      innerMonologue: '实到原院按约复诊，先由当值人核实眼下所需。' };
  }

  if (!cultivator.guardAssignment && cultivator.hp >= cultivator.maxHp * .75 && world.couriers.dispatches.some(({ handoff }) =>
      handoff?.status === 'offered' && handoff.candidateId === cultivator.id)) {
    const handoffs = availableCourierHandoffActions(cultivator, world).filter(({ courierHandoffMove }) => courierHandoffMove === 'accept');
    if (handoffs.length === 1) return { chosenAction: 'COURIER_HANDOFF', courierHandoffMove: 'accept',
      targetDispatchId: handoffs[0].targetDispatchId, innerMonologue: '本人在实站接递同一封信，不启封，不重作收件回执。' };
  }

  if (shouldVolunteerCareFollowup(world, cultivator) &&
      availableInfirmaryActions(cultivator, world).some(({ infirmaryMove }) => infirmaryMove === 'staff')) {
    return { chosenAction: 'INFIRMARY', infirmaryMove: 'staff',
      innerMonologue: '本院已有仍需复诊的约期。我自愿按常例值守，不保证具体经办。' };
  }

  const hasLoanPavilion = world.sects.some(({ headquartersId, facilities }) =>
    headquartersId === cultivator.locationId && facilities.scripture_pavilion > 0);
  const openPersonalLoan = world.pavilionLoans.loans.some(({ borrowerId, returned }) => borrowerId === cultivator.id && !returned);
  const localReference = hasLoanPavilion && (world.pavilionLoans.copies.some(({ siteId }) => siteId === cultivator.locationId) ||
    world.scriptures.editions.some(({ kind, evidence }) => kind === 'corrected' && evidence?.locationId === cultivator.locationId));
  const pavilionLoans = openPersonalLoan || localReference ? availablePavilionLoanActions(cultivator, world) : [];
  const reading = pavilionLoans.find(({ pavilionLoanMove }) => pavilionLoanMove === 'read');
  if (reading) return { chosenAction: 'PAVILION_LOAN', pavilionLoanMove: 'read', targetPavilionLoanId: reading.targetPavilionLoanId,
    innerMonologue: '只读实借的校订本，所得以真实研读凭据为准。' };
  const returnBook = pavilionLoans.find(({ pavilionLoanMove }) => pavilionLoanMove === 'return');
  if (returnBook) return { chosenAction: 'PAVILION_LOAN', pavilionLoanMove: 'return', targetPavilionLoanId: returnBook.targetPavilionLoanId,
    innerMonologue: '已到原藏经阁，当面将同一册还给当值人。' };

  const leadingAtStipendSite = world.sects.some(({ leaderId, headquartersId }) =>
    leaderId === cultivator.id && headquartersId === cultivator.locationId);
  const willingStipend = !cultivator.guardAssignment && cultivator.hp >= cultivator.maxHp * .65;
  if (willingStipend && (leadingAtStipendSite || isRetiredFromService(cultivator)) &&
      world.sectStipends.stipends.some(({ status, sectId, recipientId }) =>
        (status === 'offered' && recipientId === cultivator.id) ||
        (status === 'active' && leadingAtStipendSite && sectId === cultivator.sectId))) {
    const selected = availableSectStipendActions(cultivator, world).filter(({ stipendMove }) =>
      stipendMove === 'accept' || stipendMove === 'adopt');
    if (selected.length === 1) {
      const choice = selected[0];
      return { chosenAction: 'SECT_STIPEND', stipendMove: choice.stipendMove, targetStipendId: choice.targetStipendId,
        innerMonologue: choice.stipendMove === 'adopt'
          ? '依实认领前任的这项俸养，不改原约，不替本期支用。'
          : '本人自愿领受这项据旧勤列出的俸养，不由此复任。' };
    }
  }

  const ownWeatherRuns = world.fieldObservatories.byActor[cultivator.id]?.runs;
  if (ownWeatherRuns?.some(({ status, targetTick }) => status === 'measured' &&
      targetTick < world.tick && targetTick >= world.tick - ALIGNED_WEATHER_SOURCE_MAX_AGE - ALIGNED_WEATHER_OFFER_TICKS)) {
    const options = availableAlignedWeatherActions(cultivator, world);
    const comparisons = options.filter(({ alignedWeatherMove }) => alignedWeatherMove === 'compare');
    if (comparisons.length === 1) {
      const choice = comparisons[0];
      return { chosenAction: 'ALIGNED_WEATHER', alignedWeatherMove: 'compare', targetAlignedWeatherId: choice.targetAlignedWeatherId,
        targetObservatoryTick: choice.targetObservatoryTick, innerMonologue: '只以自己实测的一份来对读，不把异读判成谁错。' };
    }
    const mayOffer = (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 7 === 4;
    const commonCenter = ownWeatherRuns.find(({ status, openedTick, targetTick, station }) => status === 'measured' &&
      openedTick % PAIRED_OBSERVATORY_INTERVAL === PAIRED_OBSERVATORY_DAY && world.tick === targetTick + 1 && station === undefined);
    if ((mayOffer || commonCenter) && comparisons.length === 0) {
      const offers = options.flatMap((option) => option.alignedWeatherMove === 'offer' ? [option] : []);
      const pairedPeers = commonCenter ? offers.filter((offer) => offer.targetObservatoryTick === commonCenter.openedTick &&
        world.fieldObservatories.byActor[offer.targetCultivatorId]?.runs.some(({ openedTick, locationId, station }) =>
          openedTick === commonCenter.openedTick && locationId === offer.targetLocationId && station?.kind === 'edge')) : [];
      // An actual same-date edge instrument is a plan signal, not a claim about what the peer measured.
      const candidate = pairedPeers.length === 1 ? pairedPeers[0] : mayOffer ? offers.sort((a,b) =>
        b.targetObservatoryTick-a.targetObservatoryTick || (a.targetCultivatorId<b.targetCultivatorId ? -1 : a.targetCultivatorId>b.targetCultivatorId ? 1 : 0))[0]
        : undefined;
      if (candidate) return { chosenAction: 'ALIGNED_WEATHER', alignedWeatherMove: 'offer', targetLocationId: candidate.targetLocationId,
        targetCultivatorId: candidate.targetCultivatorId, targetObservatoryTick: candidate.targetObservatoryTick,
        innerMonologue: '把自己在此实测的一份拿来约核；不揣测对方是否有读数。' };
    }
  }

  const pairStation = pairedObservatoryStation(cultivator, world);
  const observe = surveyOptions.find(({ observatoryMove }) => observatoryMove === 'relay') ??
    ((mayFundWeather||examineOmen) && pairStation === undefined
      ? surveyOptions.find(({ observatoryMove, observatoryStation }) => observatoryMove === 'fund' && observatoryStation === undefined)
      : undefined);
  if (observe) return { ...observe, chosenAction: 'FIELD_OBSERVATORY', innerMonologue: '只记录到场实测；推测另记，转给同伴的仍是当时旧读数。' };
  const arbitrationMarks = world.oathArbitrations;
  if (arbitrationMarks.cases.length || arbitrationMarks.observations.length) {
    const moves = availableOathArbitrationActions(cultivator, world, cultivator.personality === '刚正' || cultivator.personality === '逍遥');
    const priority = ['vote_refund', 'file', 'accept', 'join', 'appoint', 'open'] as const;
    const action = priority.map((move) => moves.find(({ arbitrationMove }) => arbitrationMove === move)).find(Boolean);
    if (action) return { ...action, chosenAction: 'OATH_ARBITRATION', innerMonologue: '核对实际受托的款项和现场亲见；有利害便回避。' };
  }
  const mayCharterRoad = world.tick >= 39 && world.tick % 13 === 5 && cultivator.sectRank === '掌门';
  const mayCareRoad = world.tick % 6 === 4 && world.roads.links.some((road) => !road.closedTick &&
    road.sectId === cultivator.sectId && road.condition < 62);
  if (mayCharterRoad || mayCareRoad) {
    const plans = availableRoadActions(cultivator, world, mayCharterRoad);
    const road = plans.find(({ roadMove }) => roadMove === 'maintain') ??
      plans.find(({ roadMove }) => roadMove === 'patrol') ?? plans.find(({ roadMove }) => roadMove === 'charter');
    if (road) return { ...road, chosenAction: 'ROAD', innerMonologue: '只修真实路段，恪守实付与实际当值；原路线不因驿路收费而封闭。' };
  }
  // Public stock meets an already recorded shortage before anyone spends personal relief supplies.
  if (world.settlements.lastAdvancedTick === world.tick && world.settlements.villages.some((village) =>
      village.locationId === cultivator.locationId && village.lastDisasterTick !== undefined)) {
    const withdrawal = availableVillageGranaryActions(cultivator, world).find(({ granaryMove }) => granaryMove === 'draw');
    if (withdrawal) return { ...withdrawal, chosenAction: withdrawal.action,
      innerMonologue: '先按真实灾困与本地库存支取义仓公粮，留存个人赈济备资。' };
  }

  const willingVillageSupport = !cultivator.guardAssignment && cultivator.hp >= cultivator.maxHp * .75 &&
    (cultivator.personality === '刚正' || cultivator.personality === '逍遥' || cultivator.personality === '苟道');
  if (willingVillageSupport && world.villageSupply.agreements.some(({ status, offeredTick, expiresTick }) =>
    status === 'offered' && offeredTick < world.tick && expiresTick > world.tick)) {
    const accepted = availableVillageSupplyActions(cultivator, world)
      .find(({ villageSupplyMove }) => villageSupplyMove === 'accept');
    if (accepted) return {
      chosenAction: 'VILLAGE_SUPPLY', villageSupplyMove: 'accept', targetVillageSupplyId: accepted.targetVillageSupplyId,
      innerMonologue: '我自愿按本地实存和写明的运费应允；签字后货物还须走完全程。',
    };
  }

  const mayRequestProbation = !cultivator.sectId && world.tick % 5 === 2 &&
    world.probation.expulsions.some(({ actorId, reinstatedTick }) => actorId === cultivator.id && reinstatedTick === undefined);
  if (mayRequestProbation || world.probation.cases.some(({ status }) => status === 'requested' || status === 'active' || status === 'ready')) {
    const choices = availableProbationActions(cultivator, world, mayRequestProbation);
    const commitment = choices.find(({ probationMove }) => probationMove === 'restore') ??
      choices.find(({ probationMove, probationVote }) => probationMove === 'admit' || (probationMove === 'review' && probationVote === 'support')) ??
      (mayRequestProbation ? choices.find(({ probationMove }) => probationMove === 'request') : undefined);
    if (commitment) return { ...commitment, chosenAction: 'PROBATION', innerMonologue: '只按实做的赈济和回避后的复核办理，原处分仍在。' };
    const targets = probationReliefTargets(world, cultivator);
    if (targets.length) {
      const relief = availableSettlementActions(cultivator, world).find(({ action, targetSettlementId }) =>
        action === 'DELIVER_RELIEF' && targets.includes(targetSettlementId));
      if (relief) return { ...relief, chosenAction: 'DELIVER_RELIEF', innerMonologue: '在见习约定的实际村落交付真实救济。' };
      if (cultivator.hp >= cultivator.maxHp * .7 && world.tick % 3 === 2) {
        const known = knownMapLocations(world, cultivator);
        const destination = targets.map((id) => world.settlements.villages.find((village) => village.id === id))
          .find((village) => village && village.locationId !== cultivator.locationId &&
            known.some(({ id }) => id === village.locationId));
        if (destination) return { chosenAction: 'EXPLORE', targetLocationId: destination.locationId, innerMonologue: '沿已知路线到约定村落，再按实际情况赈济。' };
      }
    }
  }
  const mayOfferExhibit = world.tick >= 36 && world.tick % 9 === 4 && cultivator.artifacts.some(({ relicSetId }) => !!relicSetId);
  if (mayOfferExhibit || world.relicExhibits.entries.some((entry) => entry.status === 'offered' && entry.hostLeaderId === cultivator.id)) {
    const choices = availableRelicExhibitActions(cultivator, world, mayOfferExhibit);
    const display = choices.find(({ exhibitMove }) => exhibitMove === 'accept') ??
      (mayOfferExhibit ? choices.find(({ exhibitMove }) => exhibitMove === 'offer') : undefined);
    if (display) return { ...display, chosenAction: 'RELIC_EXHIBIT', innerMonologue: '公展只移交有实据的原件，限期归还，不借展改换产权。' };
  }
  if (world.tick >= 30 && (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 17 === 3 &&
      (cultivator.personality === '刚正' || cultivator.personality === '逍遥')) {
    const census = availableVillageCensusActions(cultivator, world)[0];
    if (census) return { ...census, chosenAction: 'VILLAGE_CENSUS', innerMonologue: '核点实际坊籍，抽到的家户已包含在到场实数。' };
  }
  if (mayPractice) {
    const offer = availableSparringActions(cultivator, world).find(({ sparringMove, sparringRounds }) =>
      sparringMove === 'offer' && sparringRounds === 1);
    if (offer) return { ...offer, chosenAction: 'SPARRING', innerMonologue: '正事办妥，只邀同道自愿练习一轮。' };
  }

  if (cultivator.hp >= cultivator.maxHp * .65 && world.furnaceSafety.cases.some((row) =>
      row.siteId === cultivator.locationId && row.reopenedTick === undefined)) {
    const safety = availableFurnaceSafetyActions(cultivator, world)[0];
    if (safety === undefined || safety.furnaceSafetyMove === 'repair') {
      const assurances = availableDamageAssuranceActions(cultivator, world);
      if (assurances.length === 1) {
        const assurance = assurances[0];
        if (assurance.damageAssuranceMove === 'seal') return { chosenAction: 'DAMAGE_ASSURANCE', damageAssuranceMove: 'seal',
          targetFurnaceSafetyId: assurance.targetFurnaceSafetyId, innerMonologue: '验炉人已查明原损，先把旧账封存，不能写成修好了。' };
        return { chosenAction: 'DAMAGE_ASSURANCE', damageAssuranceMove: 'make_good',
          targetDamageAssuranceId: assurance.targetDamageAssuranceId,
          innerMonologue: '只按本人实际能修的旧损交割；不另许款，也不越过复验开炉。' };
      }
    }
    if (safety) return { chosenAction: safety.action, furnaceSafetyMove: safety.furnaceSafetyMove,
      targetFurnaceSafetyId: safety.targetFurnaceSafetyId, innerMonologue: safety.furnaceSafetyMove === 'inspect' ?
        '待兽潮退去，在现场实付验明炉损，不把核验当修复。' : safety.furnaceSafetyMove === 'repair' ?
        '本地验炉已有实据，现用自己的实物修补，不擅启炉。' : '已按实物和炉况通过复检；本轮仍不开炉。' };
  }
  const workshopState = world.workshops.orders;
  if (cultivator.hp >= cultivator.maxHp * .65) {
    const held = heldFurnaceReservation(world, cultivator);
    if (held) {
      const existingCommission = held.workshopOrderId;
      if (existingCommission) {
        const work = preferredWorkshopWork(availableWorkshopActions(cultivator, world, false), existingCommission);
        const consent = chooseLinkedToolConsent(cultivator, world, work);
        if (consent) return consent;
        if (work) return { ...work, chosenAction: work.action, innerMonologue: '持已分配的炉位完成这份委制工序。' };
      } else {
        const work = availableAlchemy(cultivator, world).find(({ action }) => action === 'BREW_PILL') ??
          availableArtifactActions(cultivator, world).find(({ action }) => action === 'FORGE_ARTIFACT' ||
            action === 'REPAIR_ARTIFACT' || action === 'AWAKEN_ARTIFACT') ??
          availableRelicActions(cultivator, world).find(({ relicMove }) => relicMove === 'assemble');
        if (work) return { ...work, chosenAction: work.action, innerMonologue: '用本轮真实炉位，只按实有材料与工艺开炉。' };
      }
    } else if ((world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 11 === 6) {
      const offers = availableFurnaceReservationActions(cultivator, world).filter(({ furnaceMove }) => furnaceMove === 'reserve');
      if (offers.length) {
        const currentWork = availableWorkshopActions(cultivator, world, false);
        const nextWork = availableWorkshopActions(cultivator, world, false, world.tick + 1);
        const commission = offers.find(({ targetWorkshopId }) => targetWorkshopId !== undefined &&
          !currentWork.some((item) => item.workshopMove === 'work' && item.targetWorkshopId === targetWorkshopId) &&
          nextWork.some((item) => item.workshopMove === 'work' && item.targetWorkshopId === targetWorkshopId));
        const ordinary = (at: number) => availableAlchemy(cultivator, world, at).some(({ action }) => action === 'BREW_PILL') ||
          availableArtifactActions(cultivator, world, at).some(({ action }) => action === 'FORGE_ARTIFACT');
        const request = commission ?? (!ordinary(world.tick) && ordinary(world.tick + 1) ?
          offers.find(({ targetWorkshopId }) => targetWorkshopId === undefined) : undefined);
        if (request) return { ...request, chosenAction: request.action, innerMonologue: '当轮炉位已满，按本地许可为下一轮排位。' };
      }
    }
  }
  if (!cultivator.guardAssignment && !possessedForWorkshopRelease(cultivator, world, world.tick) &&
      workshopState.some((order) => order.status === 'active' &&
      order.siteId === cultivator.locationId && order.quantity === 2 && order.work.length === 2 &&
      (order.makerId === cultivator.id || order.patronId === cultivator.id))) {
    const options = availableWorkshopReleaseActions(cultivator, world);
    // An agreement is voluntary. Do not have the autonomous actor choose between rival contracts.
    const prefersRelease = cultivator.personality !== '嗜血' && cultivator.hp >= cultivator.maxHp * .65;
    const replies = options.filter(({ workshopReleaseMove }) => workshopReleaseMove === (prefersRelease ? 'accept' : 'decline'));
    if (replies.length === 1) {
      return workshopReleaseDecision(replies[0], prefersRelease
        ? '前件归前账，愿与原签人停做余件，只清未耗之物。' : '这封释约，我不应允。仍按原约行事。');
    }
    // The maker who sent the note may wait voluntarily for its one reply month.
    // This is not a lock: an actual instructed work turn can still start the second piece.
    if (workshopState.some((order) => order.status === 'active' && order.makerId === cultivator.id &&
        order.siteId === cultivator.locationId && order.work.length === 2 &&
        order.releaseNegotiations?.some((row) => row.status === 'offered' && row.proposerId === cultivator.id &&
          row.offeredTick < world.tick && world.tick < row.expiresTick))) {
      return { chosenAction: 'REST', innerMonologue: '余件尚未起炉，候原订人一月回信。并非原约已停。' };
    }
    // Do not replace timely production just because one could negotiate after a good delivery.
    const failed = options.filter(({ workshopReleaseMove, targetWorkshopId }) => workshopReleaseMove === 'propose' &&
      workshopState.some((order) => order.id === targetWorkshopId && order.makerId === cultivator.id &&
        order.work[1].artifactId === undefined));
    if (prefersRelease && failed.length === 1) {
      return workshopReleaseDecision(failed[0], '头一件未过验。且问原订人肯不肯停做余件，不擅动款料。');
    }
  }
  const training = utilityCraftTrainingDecision(cultivator, world);
  if (training) return training;
  const estateCraft = utilityWorkshopEstateDecision(cultivator, world);
  if (estateCraft) return estateCraft;
  const scribeDuty = utilityScribeCommissionDecision(cultivator, world);
  if (scribeDuty) return scribeDuty;
  const mayCommission = world.tick >= 28 && (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 13 === 6;
  const hasCapacityCommitment = workshopState.some((order) => order.status === 'active' && order.quantity === 2 &&
    order.work.length === 1 && (order.makerId === cultivator.id || order.patronId === cultivator.id) && order.siteId === cultivator.locationId);
  if (mayCommission || hasCapacityCommitment ||
      workshopState.some((order) => (order.status === 'offered' || order.status === 'active') && order.makerId === cultivator.id)) {
    const orders = availableWorkshopActions(cultivator, world, mayCommission);
    const dueWork = preferredWorkshopWork(orders);
    const consent = chooseLinkedToolConsent(cultivator, world, dueWork);
    if (consent) return consent;
    if (!dueWork && hasCapacityCommitment && cultivator.hp >= cultivator.maxHp * .65) {
      const changes = availableWorkshopCapacityActions(cultivator, world);
      const consent = changes.filter(({ workshopCapacityMove }) => workshopCapacityMove === 'accept');
      const offers = changes.filter(({ workshopCapacityMove }) => workshopCapacityMove === 'offer');
      const choice = consent.length === 1 ? consent[0] : consent.length === 0 && offers.length === 1 ? offers[0] : undefined;
      if (choice) return { chosenAction: 'WORKSHOP_CAPACITY', workshopCapacityMove: choice.workshopCapacityMove,
        targetWorkshopId: choice.targetWorkshopId, innerMonologue: choice.workshopCapacityMove === 'accept'
          ? '由我本人应允释放从未起工的余项，保留已起工的正项。'
          : '开炉无期，且请原委托人自行应允；提议还没有动款。' };
    }
    const work = dueWork ?? orders.find(({ workshopMove }) => workshopMove === 'accept') ??
      (mayCommission ? orders.find(({ workshopMove, workshopQuantity, workshopQualityFloor }) =>
        workshopMove === 'offer' && workshopQuantity === 1 && workshopQualityFloor === 'standard') : undefined);
    if (work) {
      const charteredConsent = work.workshopMove === 'accept' &&
        workshopState.some((order) => order.id === work.targetWorkshopId && order.makerId === cultivator.id && order.institution);
      return { ...work, chosenAction: 'WORKSHOP', innerMonologue: charteredConsent ?
        '我自愿依旧章程接活；若该工坊实际撤并，已耗已付不重算，余资退原委托人。' :
        '各自应允，按工序实耗和实测质量交付，未用料退回。' };
    }
  }
  const mayLendTool = world.tick >= 18 &&
    (world.tick + cultivator.id.charCodeAt(cultivator.id.length - 1)) % 7 === 3 &&
    workshopState.some(({ status, patronId, siteId }) =>
      status === 'active' && patronId === cultivator.id && siteId === cultivator.locationId);
  const hasToolLoanDuty = world.toolLoans.loans.some(({ status, lenderId, borrowerId }) =>
    (status === 'offered' && borrowerId === cultivator.id) || (status === 'awaiting_recovery' && lenderId === cultivator.id));
  if ((mayLendTool || hasToolLoanDuty) && !cultivator.guardAssignment && cultivator.hp >= cultivator.maxHp * .75) {
    const tools = availableToolLoanActions(cultivator, world);
    const reclaim = tools.filter(({ toolLoanMove }) => toolLoanMove === 'reclaim');
    const accept = tools.filter(({ toolLoanMove }) => toolLoanMove === 'accept');
    const due = reclaim.length === 1 ? reclaim[0] : reclaim.length === 0 && accept.length === 1 ? accept[0] : undefined;
    if (due) return { chosenAction: 'TOOL_LOAN', toolLoanMove: due.toolLoanMove, targetToolLoanId: due.targetToolLoanId,
      innerMonologue: due.toolLoanMove === 'reclaim' ? '当面按原器与已核磨损领回，不另取一件。'
        : '我愿照这一份委制的真实借具约定办理，不带走别件。' };
    if (mayLendTool && !reclaim.length && !accept.length) {
      const offers = tools.filter(({ toolLoanMove }) => toolLoanMove === 'offer');
      if (offers.length === 1) return { chosenAction: 'TOOL_LOAN', toolLoanMove: 'offer',
        targetArtifactId: offers[0].targetArtifactId, targetWorkshopId: offers[0].targetWorkshopId,
        innerMonologue: '依这份实托委制提议借出原器，须工匠本人愿意。' };
    }
  }

  const mayOpenCommons = world.tick >= 30 && world.tick % 12 === 8;
  if (mayOpenCommons || world.sharedCommons.pacts.some((pact) => pact.status === 'offered' &&
      pact.parties.some(({ signerId, signedTick }) => signerId === cultivator.id && signedTick === undefined))) {
    const terms = availableSharedCommonsActions(cultivator, world, mayOpenCommons);
    const agreement = terms.find(({ commonsMove }) => commonsMove === 'sign') ??
      (mayOpenCommons ? terms.find(({ commonsMove }) => commonsMove === 'offer') : undefined);
    if (agreement) return { ...agreement, chosenAction: 'SHARED_COMMONS', innerMonologue: '公域仍无主，只按三宗实签、维护实付和现地库存分配当期采额。' };
  }
  const leaseSect = world.sects.find(({ id, leaderId }) => id === cultivator.sectId && leaderId === cultivator.id);
  const mayOfferLease = world.tick >= 22 && world.tick % 10 === 8;
  if (leaseSect && (mayOfferLease || world.territorialLeases.leases.some((lease) =>
    lease.lesseeSectId === leaseSect.id && lease.status === 'offered'))) {
    const options = availableTerritorialLeaseActions(cultivator, world, mayOfferLease);
    const lease = options.find(({ leaseMove }) => leaseMove === 'accept') ??
      (mayOfferLease ? options.find(({ leaseMove }) => leaseMove === 'offer') : undefined);
    if (lease) return { ...lease, chosenAction: 'TERRITORIAL_LEASE', innerMonologue: '只许临时采集，租金按实际取用结算，地权仍归原主。' };
  }
  if (world.tick >= 18 && world.tick % 8 === 2 && cultivator.hp >= cultivator.maxHp * .75 &&
      (cultivator.sectRank === '掌门' || cultivator.sectRank === '长老' || cultivator.sectRank === '太上长老')) {
    const plans = availableVillageWorksActions(cultivator, world);
    const chosen = plans.find(({ villageWorkKind }) => villageWorkKind === 'well') ?? plans[0];
    if (chosen) return { ...chosen, chosenAction: 'VILLAGE_WORKS', innerMonologue: '先实付工料，再等乡人有余力逐轮施工，不把新容量算成人口。' };
  }
  if (world.habitats.releases.some((row) => row.status === 'monitoring' && row.siteId === cultivator.locationId)) {
    const survey = availableHabitatActions(cultivator, world).find(({ habitatMove }) => habitatMove === 'survey');
    if (survey) return { ...survey, chosenAction: 'HABITAT', innerMonologue: '只记录这次亲眼复见，不能用别处传闻代替。' };
  }
  const currentLocation = world.locations.find(
    (l) => l.id === cultivator.locationId
  );
  const coLocatedOthers = world.cultivators.filter(
    (c) =>
      c.alive &&
      c.id !== cultivator.id &&
      c.locationId === cultivator.locationId && !activeBellWatchForActor(world,c) && !activeDanxiaMedicineEscort(world,c) && !activeRelocationForActor(world, c) && !activeEscortForActor(world, c) && !pilgrimageCheckpoint(world, c) && !courierCheckpoint(world, c) && !boundaryReliefCheckpoint(world, c) && !disasterShelterCheckpoint(world,c)
  );

  if (activeAvatar(world) !== cultivator && cultivator.hp >= cultivator.maxHp * .45) {
    const wards = availableCalamityArrayChoices(world, cultivator, world.tick);
    const stance = cultivator.personality === '阴险' ? 'local' : 'joint';
    const ward = wards.find(option => option.calamityArrayStance === stance);
    if (ward) {
      const exact = exactCalamityArrayDecision(calamityArrayCommand(ward), wards);
      if (exact) return exact;
    }
  }
  const personalAftermath=utilityBattlefieldAftermathDecision(world,cultivator);
  if(personalAftermath)return personalAftermath;
  if(activeAvatar(world)!==cultivator&&world.villageReunions?.pairs.length){
    const choices=availableVillageReunionActions(cultivator,world,world.tick);
    // Merely meeting does not interrupt an established ordinary habit. A real pending gift is an independent choice.
    const offered=choices.find(row=>row.villageReunionMove==='accept');
    const exact=offered&&exactVillageReunionDecision(villageReunionCommand(offered),choices);
    if(exact)return exact;
  }
  if(activeAvatar(world)!==cultivator&&world.wildMigrations?.records.length){
    const nearby=availableWildMigrationActions(cultivator,world,world.tick);
    const desired=cultivator.personality==='嗜血'?'drive':cultivator.personality==='诡诈'?'track':'let_pass';
    const local=nearby.find(row=>row.wildMigrationMove===desired)??nearby.find(row=>row.wildMigrationMove==='let_pass');
    const accepted=local&&exactWildMigrationDecision(wildMigrationCommand(local),nearby);
    if(accepted)return accepted;
  }
  if(activeAvatar(world)!==cultivator&&world.mercyReunions?.cases.length){
    const menu=availableMercyReunionActions(cultivator,world,world.tick);
    const choice=menu.find(row=>row.mercyReunionMove==='accept_aid')??
      menu.find(row=>row.mercyReunionMove==='aid'&&(cultivator.personality==='刚正'||cultivator.personality==='逍遥'))??
      menu.find(row=>row.mercyReunionMove==(cultivator.personality==='嗜血'?'challenge':'stand_down'));
    const exact=choice&&exactStoryMercyDecision(storyMercyCommand(choice),menu);
    if(exact)return exact;
  }
  if(activeAvatar(world)!==cultivator&&world.pavilionFires?.cases.length){
    const fire=availablePavilionFireActions(cultivator,world,world.tick);
    const mode=cultivator.hp<cultivator.maxHp*.45?'leave':cultivator.personality==='刚正'?'ward':'salvage';
    const candidate=fire.find(row=>row.pavilionFireMove==='secure')??fire.find(row=>row.pavilionFireMove===mode)??
      fire.find(row=>row.pavilionFireMove==='leave');
    const exact=candidate&&exactPavilionFireDecision(pavilionFireCommand(candidate),fire);
    if(exact)return exact;
  }
  const refuge=urgentOrdinaryRefuge(cultivator,world);
  if(refuge)return refuge;
  const alchemy = availableAlchemy(cultivator, world);
  const urgentRecovery=urgentOrdinaryRecovery(cultivator,world,alchemy);
  if(urgentRecovery)return urgentRecovery;

  // 2. Ready for breakthrough
  if (cultivator.qiProgress >= 92 && (cultivator.realm !== '渡劫' || cultivator.realmStage < 9)) {
    return {
      innerMonologue: `体内灵气已臻圆满（${cultivator.qiProgress}%），天道契机就在眼前，今日便冲击更高境界！`,
      chosenAction: 'BREAKTHROUGH',
      spokenLine: '天地灵气，入我丹田，破！',
    };
  }
  const surveyedGate=directorExpeditionRegistration(world,cultivator);
  if(surveyedGate)return {chosenAction:'JOIN_OCCASION',targetOccasionId:surveyedGate.id,
    innerMonologue:'亲眼见过这道星光，今日愿入门探一探。'};
  return completeHeuristicDecision({
    cultivator,
    world,
    currentLocation,
    rng,
    pavilionLoans,
    alchemy,
    coLocatedOthers,
    shiftChoices,
    willingTransfer,
    willingVillageSupport,
    willingStipend,
    leadingAtStipendSite,
    willingFollowup,
    pairStation
  });
}
