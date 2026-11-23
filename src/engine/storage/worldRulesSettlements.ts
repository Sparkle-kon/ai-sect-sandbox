import type { Rule } from './primitives';
import { LEASE_DEPOSIT, LEASE_QUOTA } from '../territorialLeaseEngine';
import { FORMATION_BUFFER_CAP, FORMATION_RECEIPT_LIMIT } from '../formationNetworkEngine';
import { DANXIA_MEDICINE_MAX_STEPS } from '../danxiaMedicineTerms';
import { INFIRMARY_DETOX_MAX } from '../infirmaryEngine';
import { CHRONICLE_ERRATA_MAX_RETELLINGS } from '../chronicleErrataEngine';
import { DISASTER_SHELTER_HISTORY, DISASTER_SHELTER_MAX_OPEN, DISASTER_SHELTER_MAX_PATH } from '../disasterShelterCheckpoint';
import { PILGRIMAGE_LEG_COST, PILGRIMAGE_RELIEF_HP, PILGRIMAGE_ACTIVE_TICKS, PILGRIMAGE_CAMP_RECOVERY_HP } from '../pilgrimageEngine';
import { SECT_CREDIT_PAYMENT_MAX } from '../sectCreditEngine';
import { SANCTUARY_KARMA_PENALTY } from '../sanctuaryEngine';
import { RESEARCH_DEPOSIT, RESEARCH_WORK_COST } from '../researchEngine';
import { ANNOTATION_MAX_BOOKMARKS, ANNOTATION_MAX_TITLE_CHARS, ANNOTATION_MAX_NOTES, ANNOTATION_MAX_NOTE_CHARS } from '../annotationState';
import { SETTLEMENT_RELIEF } from '../settlementEngine';
import { isBuiltinScenarioOrigin } from '../highDramaPresetTerms';
import { FRONTIER_REGIONS, FRONTIER_ANCHOR_IDS, FRONTIER_SITE_IDS } from '../frontierTerms';
import { validateFrontierProductionShape } from '../frontierProductionValidation';
import { validateFrontierPortLocalShape } from '../frontierPortLocalValidation';
import { validateFrontierDrylandLocalShape } from '../frontierDrylandLocalValidation';
import { validateFrontierDrylandTradeShape } from '../frontierDrylandTradeTerms';
import { structure, num, arr, SAVE_COLLECTION_LIMIT, id, one, tick, optional, otick, oid, count, ids, wealth, strings, otext, text, bool, fail } from './primitives';
import { villageSupplyHazard, doctrineAmount, errataSourceFact, chronicleReading, disasterShelterParty, disasterShelterIndex, waypostVisit, waypostPoint, eventCategory, noteTarget, marketFreightTerms, technique, editionKind, relicSet, doctrineTheme, locationKind, facilityLevels, portTrade, flowSerial, frontierCargo } from './schemaFields';

export const worldRulesSettlements: Record<string, Rule> = {
  households:structure({nextId:num(1,100_000_000,true),
    groups:arr(SAVE_COLLECTION_LIMIT,structure({id,originSettlementId:id,branch:one('first','second'),createdTick:tick,
      presences:arr(SAVE_COLLECTION_LIMIT,structure({settlementId:id,adults:tick,juvenileCohorts:arr(200,structure({bornTick:tick,count:tick})),
        adultAgeCohorts:optional(arr(72,structure({bornTick:tick,count:tick}))),
        births:tick,matured:tick,migratedIn:tick,migratedOut:tick,deaths:tick}))})),
    members:arr(SAVE_COLLECTION_LIMIT,structure({volunteerId:id,knownBornTick:otick,householdId:id,settlementId:id,registeredTick:tick,
      status:one('resident','recruited','retired','deceased'),recruitedId:oid,settledTick:otick})),
    guardianships:arr(SAVE_COLLECTION_LIMIT,structure({id,householdId:id,guardianId:id,wardId:id,openedTick:tick,expiresTick:tick,
      status:one('offered','active','declined','expired','renounced','ended'),acceptedTick:otick,settledTick:otick,
      endReason:optional(one('declined','expiry','renounced','death'))}))}),
  seasonalHousing:structure({nextId:num(1,100_000_000,true),claims:arr(SAVE_COLLECTION_LIMIT,structure({
    id,householdId:id,hostId:id,guestId:id,settlementId:id,siteId:id,shelterProjectId:id,offeredTick:tick,expiresTick:tick,
    seasonStartTick:tick,seasonEndTick:tick,status:one('offered','reserved','occupied','moved_out','closed'),acceptedTick:otick,
    arriveByTick:otick,arrival:optional(structure({tick,fromSiteId:id,toSiteId:id})),checkedInTick:otick,departure:optional(structure({tick,fromSiteId:id,toSiteId:id})),
    endedTick:otick,hazard:optional(villageSupplyHazard),reason:optional(one('guest_declined','guest_withdrew','host_revoked',
      'offer_expired','season_ended','party_unavailable','shelter_unavailable','unsafe_shelter','route_interrupted','no_spare_room')),
  }))}),
  territorialLeases:structure({nextId:num(1,100_000_000,true),leases:arr(SAVE_COLLECTION_LIMIT,structure({
    id,ownerSectId:id,lesseeSectId:id,siteId:id,ownerSignerId:id,lesseeSignerId:id,openedTick:tick,offerExpiresTick:tick,
    status:one('offered','active','closed','declined','expired'),startsTick:otick,endsTick:otick,settledTick:otick,
    endReason:optional(one('expiry','title_change','surrender')),escrow:num(0,LEASE_DEPOSIT,true),rentPaid:num(0,LEASE_DEPOSIT,true),
    refunded:num(0,LEASE_DEPOSIT,true),usedUnits:num(0,LEASE_QUOTA,true),receipts:arr(LEASE_QUOTA + LEASE_DEPOSIT,structure({
      tick,kind:one('harvest','refund'),amount:num(1,LEASE_DEPOSIT,true),actorId:oid,
      herbId:optional(one('jade_leaf','earth_root','star_bloom','shadow_moss')),units:optional(num(1,2,true))
    }))
  }))}),
  formations:structure({nextId:num(1,100_000_000,true),links:arr(SAVE_COLLECTION_LIMIT,structure({
    id,sectAId:id,sectBId:id,siteAId:id,siteBId:id,proposerId:id,recipientLeaderId:id,proposerSectId:id,
    openedTick:tick,offerExpiresTick:tick,steps:num(1,160,true),status:one('offered','active','broken','ended','declined','expired'),
    openedPaymentEach:count,fundedTick:otick,settledTick:otick,endReason:optional(one('site_lost','hostility')),
    heldA:num(0,FORMATION_BUFFER_CAP,true),heldB:num(0,FORMATION_BUFFER_CAP,true),sentTotal:doctrineAmount,deliveredTotal:doctrineAmount,transmissionLoss:doctrineAmount,
    drawnTotal:doctrineAmount,dissipatedTotal:doctrineAmount,repairTotal:doctrineAmount,lastDispatchTick:otick,lastDrawTick:otick,
    lastRepairTick:otick,brokenTick:otick,receipts:arr(FORMATION_RECEIPT_LIMIT,structure({tick,
      kind:one('dispatch','overload','draw','repair','dissipate'),actorId:oid,fromSiteId:oid,toSiteId:oid,
      sent:optional(count),delivered:optional(count),lost:optional(count),drawn:optional(count),stonesSpent:optional(count),dissipated:optional(count)}))
  }))}),
  danxiaReviews:structure({reviews:arr(SAVE_COLLECTION_LIMIT,structure({
    id,shortageId:id,commitmentId:oid,discipleId:id,patientId:id,householdId:id,volunteerId:id,settlementId:id,
    source:structure({outcome:one('delivered','unfulfilled','observed','no_commitment'),finalTick:tick,deliveredLeaves:one(0,2)}),
    openedTick:tick,expiresTick:tick,status:one('open','proposed','renewed','switched','refused','no_agreement'),
    proposal:optional(structure({kind:one('renew','switch'),representativeId:id,sectId:id,proposedTick:tick,
      relief:optional(structure({id,tick,siteId:id,stones:one(12),herbs:one(2)}))})),
    decision:optional(structure({tick,actorId:oid,reason:one('signed','refused','declined','expired')})),
  }))}),
  danxiaMedicine:structure({commitments:arr(SAVE_COLLECTION_LIMIT,structure({
    id,shortageId:id,sourceCaseId:id,appointmentId:id,discipleId:id,patientId:id,householdId:id,volunteerId:id,
    settlementId:id,originId:id,destinationId:id,escortId:oid,choice:one('observe','retain','offer_ship'),startedTick:tick,offerUntilTick:tick,
    status:one('observed','retained','offered','in_transit','arrived','returning','recoverable','brewed','brew_failed','received','recovered','lost'),
    escrow:one(0,2),reservedTick:otick,acceptedTick:otick,departedTick:otick,arrivedTick:otick,receiveUntilTick:otick,
    path:optional(arr(DANXIA_MEDICINE_MAX_STEPS+1,structure({x:num(0,1000),y:num(0,600)}))),
    pathIndex:optional(num(0,DANXIA_MEDICINE_MAX_STEPS,true)),lastMovedTick:otick,returnStartedTick:otick,returnedTick:otick,
    disposition:optional(structure({tick,reason:one('offer_expired','escort_declined','recipient_declined','recipient_missed',
      'title_lost','disciple_lost','route_lost','escort_lost')})),
    hazard:optional(villageSupplyHazard),
    settlement:optional(structure({tick,kind:one('observed','brewed','brew_failed','received','recovered','lost'),actorId:id,artifactEventId:oid})),
  }))}),
  danxiaShortages:structure({cases:arr(SAVE_COLLECTION_LIMIT,structure({
    id,siteId:id,openedTick:tick,discipleId:id,patientId:id,settlementId:id,householdId:id,volunteerId:id,
    appointmentId:id,sourceCaseId:id,demandIds:ids,requiredLeaves:num(1,SAVE_COLLECTION_LIMIT,true),availableLeaves:count,
    regrowth:structure({tick,siteId:id,kind:one('霜息'),intensity:num(0,1),before:count,grown:one(0),capacity:count}),
    status:one('open','closed'),resolution:optional(structure({tick,reason:one('adequate_stock','commitment_ended','authority_lost'),
      requiredLeaves:num(0,SAVE_COLLECTION_LIMIT,true),availableLeaves:count})),
  }))}),
  careFollowups:structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),appointments:arr(SAVE_COLLECTION_LIMIT,structure({
    id,sourceCaseId:id,sourceShiftId:id,sourceGuardId:id,dischargedTick:tick,patientId:id,sectId:id,siteId:id,scheduledTick:tick,dueTick:tick,expiresTick:tick,
    status:one('scheduled','attended','closed','withdrawn'),settledTick:otick,
    closure:optional(one('patient_absent','patient_ineligible','no_need','staff_unavailable','supplies_unavailable','bed_unavailable','not_confirmed')),
    receipt:optional(structure({tick,guardId:id,shiftId:id,stonesSpent:one(6),herbsSpent:one(1),maxHpAtVisit:num(1,1_000_000_000),hpRestored:wealth,toxicityRemoved:count})),
  }))}),
  infirmaries:structure({nextId:num(1,100_000_000,true),
    shifts:arr(SAVE_COLLECTION_LIMIT,structure({id,guardId:id,sectId:id,siteId:id,startedTick:tick,expiresTick:tick,lastServedTick:otick,
      lastWithheld:optional(structure({tick,duty:one('observatory','cohort')}))})),
    cases:arr(SAVE_COLLECTION_LIMIT,structure({id,patientId:id,sectId:id,siteId:id,queuedTick:tick,expiresTick:tick,
      status:one('waiting','treated','refused','closed'),settledTick:otick,reason:optional(one('expiry','ineligible','recovered','refused')),
      receipt:optional(structure({guardId:id,shiftId:id,tick,stonesSpent:count,herbsSpent:count,
        handoff:optional(structure({fromShiftId:id,duty:one('observatory','cohort')})),
        maxHpAtVisit:optional(num(1,1_000_000_000)),hpRestored:num(Number.MIN_VALUE,1_000_000_000),toxicityRemoved:num(0,INFIRMARY_DETOX_MAX)}))}))}),
  habitats:structure({nextId:num(1,100_000_000,true),
    stewardships:arr(SAVE_COLLECTION_LIMIT,structure({id,siteId:id,sponsorSectId:id,stewardId:id,restoredTick:tick,expiresTick:tick,
      endedTick:otick,endReason:optional(one('expiry','site_lost'))})),
    releases:arr(SAVE_COLLECTION_LIMIT,structure({id,beastId:id,formerOwnerId:id,siteId:id,releasedTick:tick,earliestSurveyTick:tick,
      deadlineTick:tick,status:one('monitoring','sighted','unconfirmed'),
      observation:optional(structure({observerId:id,tick,hp:num(Number.MIN_VALUE,1_000_000)})),settledTick:otick}))}),
  chronicleErrata:structure({nextId:num(1,100_000_000,true),
    sources:arr(SAVE_COLLECTION_LIMIT,errataSourceFact),
    retellings:arr(SAVE_COLLECTION_LIMIT,structure({id,sourceEventId:id,authorId:id,tick,reading:chronicleReading})),
    corrections:arr(SAVE_COLLECTION_LIMIT,structure({id,sourceEventId:id,editorId:id,tick,reading:chronicleReading,
      contestedRetellingIds:arr(CHRONICLE_ERRATA_MAX_RETELLINGS,id)}))}),
  disasterShelter:optional(structure({nextId:num(1,Number.MAX_SAFE_INTEGER,true),
    cases:arr(120+DISASTER_SHELTER_HISTORY+2*DISASTER_SHELTER_MAX_OPEN,structure({
      id,host:disasterShelterParty,guest:disasterShelterParty,shelterProjectId:id,agreementId:id,deliveredTick:tick,
      disasterRecordId:id,disasterTick:tick,hazard:villageSupplyHazard,path:arr(DISASTER_SHELTER_MAX_PATH,id),
      offeredTick:tick,expiresTick:tick,status:one('offered','reserved','outbound','occupied','returning','returned',
        'declined','withdrawn','expired','stranded','lost'),
      pathIndex:disasterShelterIndex,steps:arr(2*(DISASTER_SHELTER_MAX_PATH-1),structure({
        tick,pathIndex:disasterShelterIndex,tileId:id,direction:one('outbound','return'),
      })),
      acceptedTick:otick,departedTick:otick,arrivedTick:otick,returnRequestedTick:otick,returnDepartedTick:otick,
      returnedTick:otick,closedTick:otick,closeReason:optional(one('declined','withdrawn','expired','party_unavailable','site_unavailable')),
    })),
  })),
  waypostMeals:optional(structure({version:one(1),nextId:num(1,Number.MAX_SAFE_INTEGER,true),
    meals:arr(SAVE_COLLECTION_LIMIT,structure({
      id,hostId:id,guestId:id,hostVisit:waypostVisit,guestVisit:waypostVisit,tileId:id,point:waypostPoint,
      offeredTick:tick,expiresTick:tick,status:one('offered','served','declined','withdrawn','missed','expired'),
      escrowLeaves:one(0,1),spentLeaves:one(0,1),returnedLeaves:one(0,1),closedTick:otick,
      recovery:optional(arr(2,structure({actorId:id,beforeHp:num(Number.MIN_VALUE,1_000_000_000),
        afterHp:num(Number.MIN_VALUE,1_000_000_000),maxHp:num(Number.MIN_VALUE,1_000_000_000)}))),
    })),
  })),
  pilgrimages:structure({nextId:num(1,100_000_000,true),journeys:arr(SAVE_COLLECTION_LIMIT,structure({
    id,organizerId:id,companionId:id,stopIds:arr(3,id),stopsVisited:arr(3,structure({locationId:id,tick})),
    status:one('proposed','active','completed','declined','expired','withdrawn','interrupted'),
    proposedTick:tick,offerExpiresTick:tick,startedTick:otick,expiresTick:otick,settledTick:otick,
    reason:optional(one('declined','offer_expiry','journey_expiry','withdrawn','lost_site','member_missing')),
    legIndex:num(0,2,true),path:arr(6402,structure({x:num(0,1000),y:num(0,600)})),
    pathIndex:num(0,6401,true),lastMovedTick:otick,spentByEach:num(0,2 * PILGRIMAGE_LEG_COST,true),
    aid:arr(4,structure({tick,giverId:id,receiverId:id,locationId:id,hpRestored:num(Number.MIN_VALUE,PILGRIMAGE_RELIEF_HP)})),
    waypostMealWitnesses:optional(arr(2*PILGRIMAGE_ACTIVE_TICKS,structure({
      mealId:id,offeredTick:tick,legIndex:one(0,1),pathIndex:num(1,6400,true),reachedTick:tick,tileId:id,point:waypostPoint,
    }))),
    camps:optional(arr(2,structure({legIndex:one(0,1),pathIndex:num(1,6400,true),tileId:id,
      point:structure({x:num(0,1000),y:num(0,600)}),openedTick:tick,payerId:id,
      status:one('pitched','resumed','dismantled','expired','interrupted'),closedTick:otick,
      recovery:optional(arr(2,structure({actorId:id,hp:num(Number.MIN_VALUE,PILGRIMAGE_CAMP_RECOVERY_HP)})))}))),
  }))}),
  credit:structure({nextId:num(1,100_000_000,true),
    loans:arr(SAVE_COLLECTION_LIMIT,structure({id,lenderSectId:id,borrowerSectId:id,lenderSignerId:id,borrowerSignerId:id,
      openedTick:tick,offerExpiresTick:tick,status:one('offered','active','paid','defaulted','declined','expired'),
      principal:doctrineAmount,fundedTick:otick,dueTick:otick,collectionUntilTick:otick,settledTick:otick,
      paidTotal:doctrineAmount,writtenOff:doctrineAmount,lastCollectionTick:otick,
      receipts:arr(SAVE_COLLECTION_LIMIT,structure({tick,kind:one('voluntary','collection'),amount:num(1,SECT_CREDIT_PAYMENT_MAX,true)}))})),
    restrictions:arr(SAVE_COLLECTION_LIMIT,structure({sectId:id,untilTick:tick}))}),
  sanctuary:structure({nextId:num(1,100_000_000,true),
    charters:arr(SAVE_COLLECTION_LIMIT,structure({id,siteId:id,sponsorSectId:id,founderId:id,openedTick:tick,
      expiresTick:tick,status:one('active','ended'),shieldHp:doctrineAmount,maxShieldHp:doctrineAmount,
      stonesSpent:doctrineAmount,endedTick:otick,endReason:optional(one('expiry','site_lost')),lastRepairTick:otick})),
    passes:arr(SAVE_COLLECTION_LIMIT,structure({id,charterId:id,actorId:id,issuedTick:tick,expiresTick:tick,status:one('active','ended'),
      endedTick:otick,endReason:optional(one('expiry','charter_ended','surrendered','violation','ineligible'))})),
    incidents:arr(SAVE_COLLECTION_LIMIT,structure({id,charterId:id,tick,aggressorId:id,visitorId:id,
      kind:one('blocked','exhausted','forfeited'),shieldSpent:doctrineAmount,karmaPenalty:num(0,SANCTUARY_KARMA_PENALTY),sourceEventId:id}))}),
  research:structure({nextId:num(1,100_000_000,true),projects:arr(SAVE_COLLECTION_LIMIT,structure({id,sectId:id,topic:one('qi_foundation','warding'),
    proposerId:id,locationId:id,startedTick:tick,deadlineTick:tick,status:one('open','completed','expired'),
    contributors:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,joinedTick:tick,lastWorkedTick:otick,workTurns:num(0,RESEARCH_DEPOSIT.earthRoots / RESEARCH_WORK_COST.earthRoots,true),
      escrow:structure({stones:doctrineAmount,earthRoots:count}),spent:structure({stones:doctrineAmount,earthRoots:count}),
      withdrawnTick:otick,withdrawReason:optional(one('injury','assignment','relocation','hardship','ineligible'))})),
    discoveryTechniqueId:oid,discoveryLocationId:oid,settledTick:otick}))}),
  ceasefires:structure({nextId:num(1,100_000_000,true),agreements:arr(SAVE_COLLECTION_LIMIT,structure({id,
    proposerSectId:id,targetSectId:id,proposerId:id,targetLeaderId:id,openedTick:tick,offerExpiresTick:tick,
    status:one('offered','active','declined','expired','fulfilled','breached'),signedTick:otick,endsTick:otick,
    terms:structure({duration:num(1,100,true),bondPerSide:doctrineAmount,aidAmount:doctrineAmount,aidPayerSectId:id,aidRecipientSectId:id}),
    escrow:structure({proposerBond:doctrineAmount,targetBond:doctrineAmount,aid:doctrineAmount}),aidReleasedTick:otick,
    withdrawnSiegeIds:ids,breach:optional(structure({offenderSectId:id,tick,kind:one('renounced','hostile_damage'),
      forfeitedBond:doctrineAmount,eventId:oid})),settledTick:otick}))}),
  annotations:structure({nextId:num(1,100_000_000,true),
    bookmarks:arr(ANNOTATION_MAX_BOOKMARKS,structure({id,eventId:id,eventTick:tick,createdTick:tick,title:strings(ANNOTATION_MAX_TITLE_CHARS,1),category:eventCategory,locationId:oid})),
    notes:arr(ANNOTATION_MAX_NOTES,structure({id,createdTick:tick,updatedTick:tick,text:strings(ANNOTATION_MAX_NOTE_CHARS,1),target:noteTarget}))}),
  escorts:structure({
    contracts:arr(SAVE_COLLECTION_LIMIT,structure({id,shipmentId:id,clientId:id,escortId:oid,originId:id,destinationId:id,
      status:one('offered','active','delivered','failed','expired'),offeredTick:tick,expiresTick:tick,acceptedTick:otick,holdAppliedTick:otick,
      feeEscrow:doctrineAmount,feePaid:doctrineAmount,feeRefunded:doctrineAmount,rationsEscrow:count,rationsSpent:count,rationsReturned:count,
      path:arr(6402,structure({x:num(0,1000),y:num(0,600)})),pathIndex:num(0,6402,true),stride:num(0,6402,true),lastAdvancedTick:otick,
      lastCrossedTileIds:ids,arrivedTick:otick,usedReportIds:ids,detours:arr(2,structure({tick,reportId:id,extraSteps:count})),
      settledTick:otick,reason:otext,freight:optional(marketFreightTerms)})),
    reports:arr(SAVE_COLLECTION_LIMIT,structure({id,contractId:id,reporterId:id,observedTick:tick,hazardId:id,tileId:id,expiresTick:tick}))}),
  competitionReviews:structure({
    proofs:arr(SAVE_COLLECTION_LIMIT,structure({
      id,seasonId:id,sourceId:id,tick,locationId:id,actorId:id,rule:one('public_relief','tournament_champion'),
      settlementId:oid,stones:optional(num(SETTLEMENT_RELIEF.stones,SETTLEMENT_RELIEF.stones,true)),
      herbs:optional(num(SETTLEMENT_RELIEF.jade_leaf,SETTLEMENT_RELIEF.jade_leaf,true)),
      occasionId:oid,championRound:otick,competitiveWinRound:otick,opponentId:oid
    })),
    cases:arr(SAVE_COLLECTION_LIMIT,structure({
      id,seasonId:id,scoreId:id,proofId:id,applicantId:id,openedTick:tick,
      status:one('pending','confirmed','corrected','inconclusive'),closedTick:otick
    })),
    corrections:arr(SAVE_COLLECTION_LIMIT,structure({
      scoreId:id,proofId:id,seasonId:id,previousActorId:id,newActorId:oid,points:count,tick,
      reason:one('wrong_recipient','recipient_ineligible','duplicate_source')
    })),
    honorChanges:arr(SAVE_COLLECTION_LIMIT,structure({originalHonorId:id,seasonId:id,previousActorId:id,newActorId:oid,score:optional(wealth),tick}))
  }),
  competitions:structure({
    optOutActorIds:ids,
    seasons:arr(8,structure({id,year:tick,openedTick:tick,closedTick:otick,status:one('open','settled')})),
    entries:arr(SAVE_COLLECTION_LIMIT,structure({seasonId:id,actorId:id,joinedTick:tick,withdrawnTick:otick})),
    scores:arr(SAVE_COLLECTION_LIMIT,structure({id,seasonId:id,actorId:id,sourceId:id,tick,
      rule:one('tournament_win','tournament_champion','major_breakthrough','public_relief'),points:num(1,20,true),locationId:id})),
    honors:arr(SAVE_COLLECTION_LIMIT,structure({id,seasonId:id,actorId:id,place:one(1),score:num(1,100_000_000,true),awardedTick:tick,title:text}))}),
  scriptures:structure({
    originals:arr(SAVE_COLLECTION_LIMIT,structure({id,technique,firstSeenTick:tick,source:one('authored','pavilion','inheritance'),
      sourceLocationId:oid,sourceSectId:oid})),
    editions:arr(SAVE_COLLECTION_LIMIT,structure({id,originalId:id,authorId:id,kind:editionKind,createdTick:tick,
      locationId:id,parentEditionId:oid,evidence:optional(structure({kind:one('pavilion','inheritance','author_manuscript'),
        locationId:id,sectId:oid}))}))}),
  relics:structure({fragments:arr(SAVE_COLLECTION_LIMIT,structure({id,setId:relicSet,slot:one('frame','core'),
    source:structure({kind:one('wild_cache','expedition'),locationId:id,tick,eventId:oid,occasionId:oid}),
    holder:structure({kind:one('site','actor','estate','consumed'),id})}))}),
  reincarnation:structure({
    cases:arr(SAVE_COLLECTION_LIMIT,structure({id,deceasedId:id,deathEventId:id,deathTick:tick,expiresTick:tick,
      status:one('awaiting_birth','reserved','volunteer','recruited','expired'),settlementId:oid,birthTick:otick,
      birthSlot:optional(count),maturesTick:otick,volunteerId:oid,newActorId:oid,resolvedTick:otick})),
    echoes:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,theme:doctrineTheme,confidence:one('faint','uncertain'),
      receivedTick:tick,status:one('unconsidered','considered','dismissed'),resolvedTick:otick}))}),
  relocations:structure({nextId:num(1,100_000_000,true),
    plans:arr(SAVE_COLLECTION_LIMIT,structure({id,sectId:id,originId:id,destinationId:id,status:one('voting','in_transit','settled','aborted'),
      openedTick:tick,deadlineTick:tick,proposerId:id,voterIds:ids,votes:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,tick,approve:bool})),
      garrisonIds:ids,path:arr(6402,structure({x:num(0,1000),y:num(0,600)})),pathIndex:num(0,6402,true),
      stoneCost:doctrineAmount,earthCost:count,custody:structure({stones:wealth,pavilion:arr(350,technique)}),spent:bool,
      departedTick:otick,settledTick:otick,lastAdvancedTick:otick,reason:otext})),
    abandonedSites:arr(SAVE_COLLECTION_LIMIT,structure({id,planId:id,sectId:id,originId:id,destinationId:id,tick,
      originalType:locationKind,facilities:facilityLevels,arrayHp:wealth,arrayMaxHp:wealth}))}),
  scenarioOrigin:optional(structure({version:one(1,2,3),ruleset:one(1),id:strings(100,1),endTick:num(1,120,true)})),
  builtinScenarioOrigin:optional((value,path)=>{if(!isBuiltinScenarioOrigin(value))fail(path);}),
  frontier:optional(structure({version:one(1),
    visits:arr(SAVE_COLLECTION_LIMIT,structure({id,actorId:id,regionId:one(...FRONTIER_REGIONS),
      anchorId:one(...FRONTIER_ANCHOR_IDS),enteredTick:tick,paidStones:one(8),paidRoots:one(1),
      steps:arr(SAVE_COLLECTION_LIMIT,structure({tick,siteId:one(...FRONTIER_SITE_IDS)})),exitedTick:otick,deceasedTick:otick})),
    residences:arr(SAVE_COLLECTION_LIMIT,structure({id,actorId:id,regionId:one(...FRONTIER_REGIONS),
      homeSiteId:one('frontier-north-home','frontier-south-home','frontier-east-home','frontier-west-home','frontier-ridge-home'),visitId:id,settledTick:tick,paidStones:one(4),paidRoots:one(1)})),
    nightHunt:optional(structure({
      beast:structure({id:one('frontier-north-snow-fox'),siteId:one('frontier-north-lee-mid'),introducedTick:tick,hp:wealth,alive:bool}),
      traces:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,visitId:id,tick,siteId:one('frontier-north-lee-mid'),
        weatherKind:one('平息','灵潮','罡风','霜息'),intensity:num(0,1),found:bool})),
      receipts:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,visitId:id,tick,siteId:one('frontier-north-lee-mid'),
        move:one('trace','wait'),outcome:one('found','obscured','quiet','contact'),paidQi:wealth,damage:wealth,beastDamage:wealth,traceTick:otick})),
    })),
    production:optional((value,path)=>validateFrontierProductionShape(value,path,fail)),
    port:optional((value,path)=>{
      validateFrontierPortLocalShape(value,path,fail);
      const embedded=(value as {trade?:unknown}).trade;
      if(embedded!==undefined)portTrade(embedded,`${path}.trade`);
    }),
    drylands:optional((value,path)=>{
      validateFrontierDrylandLocalShape(value,path,fail);
      const embedded=(value as {trade?:unknown}).trade;
      if(embedded!==undefined)validateFrontierDrylandTradeShape(embedded,`${path}.trade`,fail);
    }),
    trade:optional(structure({nextId:flowSerial,lastAdvancedTick:otick,agreements:arr(SAVE_COLLECTION_LIMIT,structure({
      id,northActorId:id,southActorId:id,offeredTick:tick,status:one('offered','accepted','returning','exchanged','expired','returned'),
      acceptedTick:otick,returnsTick:otick,closedTick:otick,north:optional(frontierCargo),south:optional(frontierCargo),
    }))})),
  })),
  northGateRenewal:optional(structure({version:one(1),hearing:structure({
    id,openedTick:tick,expiresTick:tick,
    source:structure({siteId:one('loc-vein-north'),settlementId:id,charterId:id,wellProjectId:id,openingId:id,
      freightId:id,freightClosedTick:tick,passageTick:tick,passageTileId:id}),
    endorsement:optional(structure({actorId:id,householdId:id,volunteerId:id,recruitedTick:tick,signedTick:tick})),
    outcome:optional((value,path)=>{
      const row=value as {kind?:unknown}|null;
      if(row?.kind==='failed')return structure({kind:one('failed'),closedTick:tick})(value,path);
      return structure({kind:one('reopened'),stance:one('reuse','sect','accord'),actorId:id,sectId:id,
        openedTick:tick,openingId:id,paidStones:one(40,48,64),borrowedUnits:one(0,3,9),granaryRoots:one(0,1)})(value,path);
    }),
  })})),
};
