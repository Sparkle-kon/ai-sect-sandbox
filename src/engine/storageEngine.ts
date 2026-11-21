import { CHRONICLE_ERRATA_MAX_RETELLINGS, CHRONICLE_ERRATA_WINDOW, createChronicleErrataState } from './chronicleErrataEngine';
import { terrainTileAt } from './terrainEngine';
import { createPilgrimageState, PILGRIMAGE_ACTIVE_TICKS, PILGRIMAGE_LEG_COST, PILGRIMAGE_OFFER_TICKS, PILGRIMAGE_RELIEF_HP } from './pilgrimageEngine';
import { createSectCreditState, SECT_CREDIT_COLLECTION_TICKS, SECT_CREDIT_OFFER_TICKS,
  SECT_CREDIT_PAYMENT_MAX, SECT_CREDIT_PRINCIPAL, SECT_CREDIT_TERM_TICKS } from './sectCreditEngine';
import { createSanctuaryState, SANCTUARY_BLOCK_HP, SANCTUARY_CHARTER_TICKS, SANCTUARY_FOUND_COST,
  SANCTUARY_KARMA_PENALTY, SANCTUARY_MAX_SHIELD, SANCTUARY_PASS_TICKS, SANCTUARY_REPAIR_COST } from './sanctuaryEngine';
import { createResearchState, researchTechniqueId, RESEARCH_DEPOSIT, RESEARCH_PROJECT_TICKS,
  RESEARCH_REQUIRED_RESEARCHERS, RESEARCH_REQUIRED_TURNS, RESEARCH_WORK_COST } from './researchEngine';
import { CEASEFIRE_AID_DELAY, CEASEFIRE_BOND, CEASEFIRE_DURATION, CEASEFIRE_OFFER_TICKS, createCeasefireState } from './ceasefireEngine';
import { ANNOTATION_MAX_BOOKMARKS, ANNOTATION_MAX_NOTES, ANNOTATION_MAX_NOTE_CHARS, ANNOTATION_MAX_TITLE_CHARS, createAnnotationState } from './annotationState';
import { createEscortState, ESCORT_FEE, ESCORT_RATIONS } from './escortEngine';
import { COMPETITION_RULES, createCompetitionState } from './competitionEngine';
import { createScriptureState } from './scriptureEngine';
import { createRelicState } from './relicEngine';
import { createReincarnationState, MORTAL_MATURITY_TICKS } from './reincarnationEngine';
import { createRelocationState } from './relocationEngine';
import { isWorldgenProfileId } from './worldgenProfiles';
import { createDoctrineState } from './doctrineEngine';
import { createSettlementState, SETTLEMENT_RELIEF } from './settlementEngine';
import { OATH_TERMS } from './oathEngine';
import type { WorldgenProfileId, WorldState } from '../types/world';

export const WORLD_SAVE_MAX_BYTES = 8 * 1024 * 1024;
export const WORLD_SAVE_MAX_SLOTS = 12;
const FORMAT = 'ai-sect-sandbox';
const VERSION = 1;
// Variable-size roster ledgers are constrained by the file byte budget, not an NPC-count limit.
const SAVE_COLLECTION_LIMIT = WORLD_SAVE_MAX_BYTES;
type ErrorCode = 'size' | 'json' | 'version' | 'invalid_world' | 'invalid_slot' | 'slot_limit' | 'not_found' | 'storage';
export class WorldSaveError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); this.name = 'WorldSaveError'; }
}

type Validator = (value: unknown, path: string) => void;
type Rule = Validator | { optional: Validator };
const fail = (path: string): never => { throw new WorldSaveError('invalid_world', `无法验证存档字段：${path}`); };
const optional = (value: Validator) => ({ optional: value });
const strings = (max = 9000, min = 0): Validator => (v, path) => {
  if (typeof v !== 'string' || v.length > max || v.length < min) fail(path);
};
const num = (min: number, max: number, integer = false): Validator => (v, path) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isSafeInteger(v))) fail(path);
};
const one = (...values: (string | number)[]): Validator => (v, path) => {
  if (!values.some((entry) => entry === v)) fail(path);
};
const arr = (max: number, rule: Validator): Validator => (v, path) => {
  if (!Array.isArray(v) || v.length > max) return fail(path);
  v.forEach((item, i) => rule(item, `${path}[${i}]`));
};
const structure = (rules: Record<string, Rule>): Validator => (v, path) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(path);
  const rec = v as Record<string, unknown>;
  for (const key of Object.keys(rec)) if (!Object.hasOwn(rules, key)) fail(`${path}.${key}`);
  for (const [key, rule] of Object.entries(rules)) {
    const child = `${path}.${key}`;
    if (typeof rule === 'function') rule(rec[key], child);
    else if (rec[key] !== undefined) rule.optional(rec[key], child);
  }
};
const id = strings(240, 1);
const text = strings();
const bool: Validator = (v, path) => { if (typeof v !== 'boolean') fail(path); };
const tick = num(0, 100_000_000, true);
const unsigned32 = num(0, 0xffffffff, true);
const wealth = num(0, 1_000_000_000);
const percentage = num(0, 100);
const affinity = num(-100, 100);
const count = num(0, 10_000, true);
const month = num(1, 12, true);
const ids = arr(SAVE_COLLECTION_LIMIT, id);
const oid = optional(id), otick = optional(tick), otext = optional(text);
const spirit = one('金','木','水','火','土','雷','暗','天灵根');
const realm = one('练气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫');
const sectRank = one('外门弟子','内门弟子','真传弟子','长老','太上长老','掌门');
const source = one('utility','llm');
const doctrineTheme = one('cultivation','conflict','community','heavenly');
const doctrineAmount = num(0, 1_000_000_000, true);
const eventCategory = one('breakthrough','combat','intrigue','heavenly','death','diplomacy');
const mode = one('avatar','ring');
const intent = one('guide','persuade','deceive','interrogate','recruit');
const vote = one('support','oppose','abstain');
const action = one(...'CULTIVATE BREAKTHROUGH EXPLORE SOCIALIZE DUEL SCHEMING PURSUE_SCHEME AUTHOR_TECHNIQUE STUDY_TECHNIQUE GATHER_HERBS BREW_PILL USE_PILL FORGE_ARTIFACT BIND_ARTIFACT REPAIR_ARTIFACT AWAKEN_ARTIFACT FACE_TRIBULATION AMBUSH_TRIBULATION CHALLENGE_LEADERSHIP PLOT_COUP BUILD_FACILITY DISPATCH_GUARD GUARD_DUTY OFFER_ALLIANCE DECLARE_WAR DEMAND_TRIBUTE LAUNCH_SIEGE JOIN_OCCASION PURSUE_BOUNTY TAME_BEAST TRADE DUAL_CULTIVATE SECT_DIPLOMACY TEACH ACCEPT_TUITION DECLINE_TUITION OFFER_OATH ACCEPT_OATH DECLINE_OATH FULFILL_OATH APPEAL_OATH PLACE_MARKET_BUY PLACE_MARKET_SELL CANCEL_MARKET_ORDER RECRUIT_SETTLER DELIVER_RELIEF FILE_WITNESS_CLAIM ATTEST_WITNESS CHALLENGE_WITNESS NAME_HEIR CLAIM_ESTATE HOLD_MEMORIAL DOCTRINE RELOCATE RECOLLECT RELIC SCRIPTURE RANK_SEASON ESCORT CEASEFIRE RESEARCH SANCTUARY SECT_CREDIT PILGRIMAGE CHRONICLE_ERRATA REST'.split(' '));
const herbs = structure({jade_leaf:count,earth_root:count,star_bloom:count,shadow_moss:count});
const marketGood = one('jade_leaf','earth_root','star_bloom','shadow_moss','foundation','golden','barrier','heart_poison');
const marketQty = num(1,12,true), marketPrice = num(1,500,true);
const pills = structure({foundation:count,golden:count,barrier:count,heart_poison:count});
const technique = structure({id:oid,authorId:oid,createdTick:otick,name:id,spiritRoot:spirit});
const editionKind = one('gloss','misread','corrected');
const relicSet = one('star-balance');
const artifact = structure({relicSetId:optional(relicSet),relicFragmentIds:optional(arr(2,id)),id:oid,tier:optional(one('法器','灵器','法宝','通天灵宝')),durability:optional(wealth),maxDurability:optional(wealth),boundTo:oid,
  soul:optional(structure({name:id,experience:percentage})),resonance:optional(percentage),name:id,spiritRoot:spirit});
const eligibility = { actorId:id,basis:one('nomination','bond','sect'),strength:num(0,10_000) };
const memory = structure({id,tick,content:text,importance:num(1,10),emotionalValence:num(-5,5),decayRate:num(0,10),
  consolidatedAtTick:otick,category:one('cultivation','combat','social','heavenly','whisper')});
const dialogue = structure({kind:one('combat','trade','dual_cultivation','sect_diplomacy'),source,
  turns:arr(24,structure({speakerId:id,speakerName:id,text}))});
const publicFact = {id,tick,year:tick,month,title:text,description:text,category:eventCategory,actorIds:ids,locationId:oid,dialogue:optional(dialogue)};
const anchor = structure(publicFact);
const chronicleReading: Validator = (value, path) => {
  if ((value as {kind?:unknown} | null)?.kind === 'duel') return structure({kind:one('duel'),winnerId:id})(value,path);
  return structure({kind:one('relief'),delivery:one('full_supplies','unfunded')})(value,path);
};
const errataSourceFact: Validator = (value, path) => {
  const common = { sourceEventId:id,tick,locationId:id };
  if ((value as {kind?:unknown} | null)?.kind === 'duel') {
    return structure({...common,kind:one('duel'),participantIds:arr(2,id),winnerId:id})(value,path);
  }
  return structure({...common,kind:one('relief'),actorId:id,settlementId:id,stones:count,herbs:count})(value,path);
};

const proposal: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'war') return structure({kind:one('war'),targetSectId:id})(value,path);
  if (kind === 'expel') return structure({kind:one('expel'),targetCultivatorId:id})(value,path);
  if (kind === 'allocate_pill') return structure({kind:one('allocate_pill'),targetCultivatorId:id,donorId:id})(value,path);
  fail(path);
};

const noteTarget: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'tile') return structure({ kind:one('tile'),tileId:id })(value,path);
  if (kind === 'site') return structure({ kind:one('site'),locationId:id,tileId:id,siteName:strings(ANNOTATION_MAX_TITLE_CHARS,1) })(value,path);
  fail(path);
};
const facilityLevels = structure({qi_array:num(0,3,true),alchemy_hall:num(0,3,true),scripture_pavilion:num(0,3,true),defense_array:num(0,3,true),spirit_mine:num(0,3,true)});
const locationKind = one('sect_hq','spirit_vein','secret_realm','market','abyss');

const shape = structure({
  tick, interventionSequence:tick, year:tick, month,
  random:structure({algorithm:one('mulberry32-v1'),seed:unsigned32,state:unsigned32}),
  sects:arr(48,structure({id,name:id,alignment:one('正道','魔道','中立'),color:strings(80),doctrine:text,reputation:num(-1_000_000,1_000_000),spiritStones:wealth,headquartersId:id,
    pavilion:arr(350,technique),leaderId:oid, arrayHp:wealth,arrayMaxHp:wealth,
    facilities:facilityLevels,
    succession:optional(structure({tick,method:one('election','challenge','coup'),previousLeaderId:oid,leaderId:id,supporterIds:ids})),
    monthlyEconomy:optional(structure({tick,taxes:wealth,mining:wealth,upkeep:wealth,net:num(-1_000_000_000,1_000_000_000)}))})),
  locations:arr(1200,structure({id,name:id,x:num(0,1000),y:num(0,600),type:one('sect_hq','spirit_vein','secret_realm','market','abyss'),spiritRoot:spirit,
    spiritQi:num(0,150),ownerSectId:oid,inheritanceScrolls:arr(350,technique),herbs,herbCapacity:herbs,furnaceGrade:one(0,1,2,3),description:text})),
  cultivators:arr(SAVE_COLLECTION_LIMIT,structure({id,name:id,title:text,sectId:strings(240),sectRank,contribution:wealth,transgressions:percentage,realm,realmStage:num(1,9,true),
    qiProgress:percentage,hp:wealth,maxHp:num(1,1_000_000_000),combatPower:wealth,age:wealth,lifespan:wealth,
    personality:one('刚正','阴险','狂傲','苟道','痴情','嗜血','逍遥','诡诈'),locationId:id,spiritStones:wealth,karma:affinity,currentAction:action,
    innerMonologue:text,secretGoal:text,spiritRoot:spirit,technique,techniqueMastery:percentage,authoredTechnique:optional(technique),
    activeEdition:optional(structure({originalId:id,editionId:id,kind:editionKind})),herbs,pills,pillToxicity:percentage,
    exploredTileIds:ids,artifacts:arr(SAVE_COLLECTION_LIMIT,artifact),memories:arr(160,memory),coreMemories:arr(160,memory),memorySequence:tick,
    reflections:arr(100,structure({id,tick,kind:one('belief','obsession','heart_demon'),theme:one('cultivation','conflict','community','heavenly'),intensity:num(1,10),statement:text,sourceMemoryIds:ids,source})),
    rumors:arr(200,structure({id,subject:text,locationId:oid,originTick:tick,learnedTick:tick,provenance:one('witness','conversation','flying_sword','fabricated'),
      confidence:percentage,hops:count,sourceCultivatorId:oid,originEventId:oid,originSourceCultivatorId:oid,
      witnessScope:optional(one('participants')),lead:optional(bool)})),
    activeScheme:optional(structure({id,kind:one('infiltration','foundation_pill','vengeance','artifact_heist'),title:text,status:one('active','completed','failed'),
      startedTick:tick,finishedTick:otick,stepIndex:count,steps:arr(32,structure({label:text,completedTick:otick})),targetCultivatorId:oid,targetLocationId:oid,artifactName:otext,outcome:otext})),
    tribulation:optional(structure({id,targetRealm:realm,startedTick:tick,stage:one('lightning','heart_demon','passed','failed'),nextWave:count,totalWaves:count,
      pressure:percentage,interruptions:count,resolvedTick:otick,lastOutcome:otext,lastActedTick:otick})),
    guardAssignment:optional(structure({locationId:id,assignedTick:tick,expiresTick:tick})),namedHeirId:oid,alive:bool})),
  relationships:arr(SAVE_COLLECTION_LIMIT,structure({fromId:id,toId:id,type:one('师徒','同门','道侣','血仇','挚友','竞争'),affinity,note:text})),
  events:arr(200,structure({...publicFact,witnessScope:optional(one('participants')),duelWinnerId:oid,damage:optional(arr(SAVE_COLLECTION_LIMIT,structure({cultivatorId:id,amount:wealth})))})),
  diplomacy:arr(1200,structure({sectAId:id,sectBId:id,affinity,pact:one('neutral','alliance','war'),sinceTick:tick,lastActionTick:otick})),
  sieges:arr(2000,structure({id,attackerSectId:id,defenderSectId:id,destinationId:id,participantIds:ids,status:one('marching','sieging','victory','repelled','withdrawn'),
    startedTick:tick,rounds:count,lastResolvedTick:otick,outcome:otext})),
  tributeDemands:arr(2000,structure({id,demanderSectId:id,targetSectId:id,amount:wealth,status:one('pending','paid','rejected'),startedTick:tick,resolvedTick:otick})),
  occasions:arr(2000,structure({id,kind:one('tournament','expedition'),title:text,locationId:id,startedTick:tick,registrationClosesTick:tick,expiresTick:tick,
    status:one('registration','running','completed','cancelled'),participantIds:ids,remainingIds:ids,
    bouts:arr(30,structure({round:count,firstId:id,secondId:oid,winnerId:id})),
    expeditions:arr(30,structure({cultivatorId:id,tick,outcome:one('loot','wounded','death','escaped'),description:text})),round:count,championId:oid,lastResolvedTick:otick})),
  bounties:arr(2000,structure({id,targetCultivatorId:id,reason:text,issuedTick:tick,reward:wealth,status:one('open','claimed','withdrawn'),sponsorSectIds:ids,
    escrow:arr(48,structure({sectId:id,amount:wealth})),hunterId:oid,settledTick:otick})),
  terrain:structure({seed:unsigned32,columns:num(1,80,true),rows:num(1,80,true),tiles:arr(6400,structure({id,col:num(0,79,true),row:num(0,79,true),
    biome:one('灵山','毒沼','剑冢','荒漠','魔渊','坊市'),spiritQi:percentage,ownerSectId:oid}))}),
  mapPresentation:structure({tick,trails:arr(SAVE_COLLECTION_LIMIT,structure({cultivatorId:id,tick,fromLocationId:id,toLocationId:id,
    points:arr(6402,structure({x:num(0,1000),y:num(0,600)}))})),
    effects:arr(SAVE_COLLECTION_LIMIT,structure({id,tick,kind:one('damage','breakthrough','clash','lightning'),locationId:id,actorIds:ids,text:otext}))}),
  mapHazards:arr(1200,structure({id,kind:one('meteor','beast_tide','cursed_miasma'),tileId:id,createdTick:tick,expiresTick:tick,intensity:num(1,3,true)})),
  spiritBeasts:arr(500,structure({id,name:id,kind:one('妖兽','凶兽','瑞兽'),locationId:id,homeLocationId:id,hp:wealth,maxHp:num(1,1_000_000_000),
    power:wealth,cultivation:percentage,alive:bool,tamedBy:oid,nextActionTick:tick})),
  councils:arr(120,structure({id,tick,sectId:id,proposal,voterIds:arr(5,id),title:text,summary:text,
    rounds:arr(2,structure({round:one(1,2),turns:arr(5,structure({voterId:id,text,source}))})),
    ballots:arr(5,structure({voterId:id,vote,reason:text,source})),tally:structure({support:count,oppose:count,abstain:count,required:count}),
    status:one('passed','rejected','stale'),outcome:text})),
  chronicleArchive:structure({anchors:arr(384,anchor),chapters:arr(24,structure({id,chapterNumber:tick,startTick:tick,endTick:tick,title:text,
    anchors:arr(18,anchor),biographies:arr(8,structure({actorId:id,name:id,realm,sectName:otext,anchorIds:ids})),body:strings(25_000),source}))}),
  decisionTrace:structure({records:arr(100,structure({id,actorId:id,tick,source:one('model','utility','avatar'),applied:bool,
    chosenAction:one('REST','CULTIVATE','BREAKTHROUGH','SOCIALIZE','EXPLORE','FACE_TRIBULATION','redacted'),chosenCandidateId:oid,
    candidates:arr(48,structure({id,action:one('REST','CULTIVATE','BREAKTHROUGH','SOCIALIZE','EXPLORE','FACE_TRIBULATION'),
      score:num(-1000,1000),reason:one('recover','cultivate','ready','social','travel','tribulation'),
      targetLocationId:oid,targetCultivatorId:oid,tribulationStance:optional(one('guard','focus','defy'))}))}))}),
  estates:structure({entries:arr(SAVE_COLLECTION_LIMIT,structure({id,deceasedId:id,locationId:id,openedTick:tick,closesTick:tick,
    namedHeirId:oid,sponsorSectId:oid,status:one('open','settled','unclaimed'),
    holdings:structure({stones:wealth,herbs,pills,artifacts:arr(SAVE_COLLECTION_LIMIT,artifact)}),
    distributed:structure({stones:wealth,herbs,pills,artifactIds:ids}),
    eligibleHeirs:arr(SAVE_COLLECTION_LIMIT,structure(eligibility)),claims:arr(SAVE_COLLECTION_LIMIT,structure({...eligibility,tick})),
    beneficiaryId:oid,settledTick:otick,memorial:optional(structure({tick,organizerId:id,attendeeIds:ids,relationshipImpacts:count}))}))}),
  witnesses:structure({nextId:tick,
    facts:arr(240,structure({eventId:id,tick,locationId:id,participantIds:arr(2,id),winnerId:id,witnessIds:ids})),
    claims:arr(80,structure({id,sourceEventId:id,publicationEventId:id,claimantId:id,subjectId:id,locationId:id,
      filedTick:tick,deadlineTick:tick,challengeUntilTick:tick,status:one('pending','disputed','corroborated','retracted'),
      attestations:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,tick,verdict:one('supports','contradicts')})),
      appeal:optional(structure({tick,actorId:id,verdict:one('upheld','rejected'),reason:text})),settledTick:otick,
      reputationSectId:oid,reputationPenalty:percentage,reputationRestored:percentage,reason:otext}))}),
  chronicleErrata:structure({nextId:num(1,100_000_000,true),
    sources:arr(SAVE_COLLECTION_LIMIT,errataSourceFact),
    retellings:arr(SAVE_COLLECTION_LIMIT,structure({id,sourceEventId:id,authorId:id,tick,reading:chronicleReading})),
    corrections:arr(SAVE_COLLECTION_LIMIT,structure({id,sourceEventId:id,editorId:id,tick,reading:chronicleReading,
      contestedRetellingIds:arr(CHRONICLE_ERRATA_MAX_RETELLINGS,id)}))}),
  pilgrimages:structure({nextId:num(1,100_000_000,true),journeys:arr(SAVE_COLLECTION_LIMIT,structure({
    id,organizerId:id,companionId:id,stopIds:arr(3,id),stopsVisited:arr(3,structure({locationId:id,tick})),
    status:one('proposed','active','completed','declined','expired','withdrawn','interrupted'),
    proposedTick:tick,offerExpiresTick:tick,startedTick:otick,expiresTick:otick,settledTick:otick,
    reason:optional(one('declined','offer_expiry','journey_expiry','withdrawn','lost_site','member_missing')),
    legIndex:num(0,2,true),path:arr(6402,structure({x:num(0,1000),y:num(0,600)})),
    pathIndex:num(0,6401,true),lastMovedTick:otick,spentByEach:num(0,2 * PILGRIMAGE_LEG_COST,true),
    aid:arr(4,structure({tick,giverId:id,receiverId:id,locationId:id,hpRestored:num(Number.MIN_VALUE,PILGRIMAGE_RELIEF_HP)}))
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
      settledTick:otick,reason:otext})),
    reports:arr(SAVE_COLLECTION_LIMIT,structure({id,contractId:id,reporterId:id,observedTick:tick,hazardId:id,tileId:id,expiresTick:tick}))}),
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
  scenarioOrigin:optional(structure({version:one(1),ruleset:one(1),id:strings(100,1),endTick:num(1,120,true)})),
  worldgen:optional(structure({algorithm:one(1),profileId:one('classic','spirit-bloom','fractured-frontier'),
    seed:unsigned32,birthTick:one(1),resources:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,locationId:id,pathSteps:num(0,6402,true)}))})),
  doctrines:structure({nextId:num(1,100_000_000,true),
    schools:arr(SAVE_COLLECTION_LIMIT,structure({id,parentSectId:id,theme:doctrineTheme,founderId:id,stewardId:oid,
      foundedTick:tick,status:one('attached','autonomous','reconciled'),memberIds:ids,treasury:doctrineAmount,
      lastChangeTick:otick,lastTrainingTick:otick})),
    endorsements:arr(SAVE_COLLECTION_LIMIT,structure({actorId:id,sectId:id,schoolId:id,theme:doctrineTheme,tick,
      evidenceCount:num(1,100,true),score:num(0,10_000)})),
    proposals:arr(SAVE_COLLECTION_LIMIT,structure({id,schoolId:id,kind:one('separation','reconciliation'),
      openedTick:tick,expiresTick:tick,stewardId:id,leaderId:id,amount:doctrineAmount,
      status:one('pending','accepted','declined','expired','invalidated'),
      votes:arr(2,structure({actorId:id,tick,verdict:one('accept','decline')})),settledTick:otick,reason:otext})),
    records:arr(128,structure({id,tick,schoolId:id,
      kind:one('endorse','proposal','separation','reconciliation','declined','expired','invalidated','join','leave','training'),
      actorIds:ids,amount:doctrineAmount,support:tick,description:text}))}),
  settlements:structure({lastAdvancedTick:otick,
    villages:arr(48,structure({id,locationId:id,name:id,population:count,capacity:count,stress:percentage,
      volunteers:arr(SAVE_COLLECTION_LIMIT,structure({id,name:id,age:wealth,spiritRoot:spirit,willingness:percentage,aptitude:percentage,
        enlistedCultivatorId:oid,cohortYear:otick})),
      nextVolunteerSequence:optional(num(1,100_000_000,true)),
      juvenileCohorts:optional(arr(200,structure({bornTick:tick,count}))),lastCohortYear:otick,lastRecruitTick:otick,
      lastDisasterTick:otick,lastReliefTick:otick})),
    records:arr(100,structure({id,tick,kind:one('disaster','migration','relief','recruitment','growth'),settlementId:id,targetSettlementId:oid,
      actorId:oid,sectId:oid,volunteerId:oid,cultivatorId:oid,people:count,stones:wealth,herbs:count,description:text}))}),
  markets:structure({nextId:tick,
    orders:arr(320,structure({id,sequence:tick,actorId:id,locationId:id,side:one('buy','sell'),good:marketGood,
      quantity:marketQty,remaining:num(0,12,true),limitPrice:marketPrice,escrowStones:wealth,escrowGoods:num(0,12,true),
      placedTick:tick,expiresTick:tick,status:one('open','filled','cancelled','expired'),settledTick:otick})),
    shipments:arr(160,structure({id,sequence:tick,buyOrderId:id,sellOrderId:id,buyerId:id,sellerId:id,originId:id,destinationId:id,
      good:marketGood,quantity:marketQty,unitPrice:marketPrice,departedTick:tick,arrivalTick:tick,
      status:one('in_transit','delivered','lost','returned'),settledTick:otick,reason:otext})),
    receipts:arr(100,structure({id,sequence:tick,buyerId:id,sellerId:id,originId:id,destinationId:id,
      good:marketGood,quantity:marketQty,unitPrice:marketPrice,tick,status:one('local_fill','delivered','lost','returned'),shipmentId:oid,reason:otext}))}),
  oaths:structure({nextId:tick,contracts:arr(300,structure({id,requesterId:id,providerId:id,locationId:id,
    term:one('foundation_pill','jade_herb'),quantity:num(1,100,true),payment:wealth,collateral:wealth,
    offeredTick:tick,offerExpiresTick:tick,deadlineTick:otick,appealUntilTick:otick,
    status:one('offered','active','declined','fulfilled','breached','excused','expired'),
    escrow:structure({payment:wealth,collateral:wealth}),
    evidence:arr(60,structure({tick,actorId:id,kind:one('tender','delivery'),locationId:id,quantity:count,requesterPresent:bool})),
    appeal:optional(structure({tick,appellantId:id,status:one('upheld','rejected'),reason:text})),settledTick:otick,outcome:otext}))}),
  mentorship:structure({
    offers:arr(240,structure({id,mentorId:id,studentId:id,technique,createdTick:tick,expiresTick:tick,
      status:one('pending','accepted','declined','expired'),resolvedTick:otick,outcome:otext})),
    lineage:arr(SAVE_COLLECTION_LIMIT,structure({mentorId:id,studentId:id,technique,formedTick:tick,lastLessonTick:tick,lessons:count,flaw:percentage})),
    budgets:arr(SAVE_COLLECTION_LIMIT,structure({mentorId:id,tick,spent:num(0,2,true)})),lastMaintainedTick:otick}),
  playerAvatar:structure({possessedId:oid,possessionUntilTick:otick,switchAvailableTick:tick,essence:percentage,lastRefreshTick:tick,
    pendingOrder:optional(structure({actorId:id,action:one('REST','CULTIVATE'),queuedTick:tick})),
    transcript:arr(72,structure({id,tick,mode,intent,targetCultivatorId:id,message:text,actorId:oid,reply:text,
      outcome:one('agreed','resisted','revealed','recruited'),source,effect:text}))}),
});

function unique<T>(items: T[], key: (item: T) => string, path: string): Set<string> {
  const keys = new Set(items.map(key));
  if (keys.size !== items.length) fail(path);
  return keys;
}
function verifyWorld(value: unknown): WorldState {
  const candidate = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? { ...value,
      ...(!Object.hasOwn(value, 'mentorship') ? { mentorship: { offers: [], lineage: [], budgets: [] } } : {}),
      ...(!Object.hasOwn(value, 'decisionTrace') ? { decisionTrace: { records: [] } } : {}),
      ...(!Object.hasOwn(value, 'chronicleErrata') ? { chronicleErrata: createChronicleErrataState() } : {}),
      ...(!Object.hasOwn(value, 'pilgrimages') ? { pilgrimages: createPilgrimageState() } : {}),
      ...(!Object.hasOwn(value, 'credit') ? { credit: createSectCreditState() } : {}),
      ...(!Object.hasOwn(value, 'sanctuary') ? { sanctuary: createSanctuaryState() } : {}),
      ...(!Object.hasOwn(value, 'research') ? { research: createResearchState() } : {}),
      ...(!Object.hasOwn(value, 'ceasefires') ? { ceasefires: createCeasefireState() } : {}),
      ...(!Object.hasOwn(value, 'annotations') ? { annotations: createAnnotationState() } : {}),
      ...(!Object.hasOwn(value, 'escorts') ? { escorts: createEscortState() } : {}),
      ...(!Object.hasOwn(value, 'competitions') ? { competitions: { seasons: [], entries: [], scores: [], honors: [], optOutActorIds: [] } } : {}),
      ...(!Object.hasOwn(value, 'scriptures') ? { scriptures: createScriptureState() } : {}),
      ...(!Object.hasOwn(value, 'relics') ? { relics: { fragments: [] } } : {}),
      ...(!Object.hasOwn(value, 'reincarnation') ? { reincarnation: createReincarnationState() } : {}),
      ...(!Object.hasOwn(value, 'relocations') ? { relocations: createRelocationState() } : {}),
      ...(!Object.hasOwn(value, 'doctrines') ? { doctrines: createDoctrineState() } : {}),
      ...(!Object.hasOwn(value, 'estates') ? { estates: { entries: [] } } : {}),
      ...(!Object.hasOwn(value, 'witnesses') ? { witnesses: { facts: [], claims: [], nextId: 1 } } : {}),
      ...(!Object.hasOwn(value, 'settlements') ? { settlements: { villages: [], records: [] } } : {}),
      ...(!Object.hasOwn(value, 'markets') ? { markets: { orders: [], shipments: [], receipts: [], nextId: 1 } } : {}),
      ...(!Object.hasOwn(value, 'oaths') ? { oaths: { contracts: [], nextId: 1 } } : {}),
    } : value;
  shape(candidate, 'world');
  const w = candidate as WorldState;
  if (!w.cultivators.length || !w.locations.length) fail('world.minimum_entities');
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'settlements')) {
    w.settlements = createSettlementState(w.locations, w.random.seed);
  }
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'relics')) {
    w.relics = createRelicState(w.locations, w.random.seed);
  }
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'competitions')) {
    w.competitions = createCompetitionState(w.year, w.tick);
  }
  const actor = unique(w.cultivators, (item) => item.id, 'cultivators.id');
  const sector = unique(w.sects, (item) => item.id, 'sects.id');
  const locations = unique(w.locations, (item) => item.id, 'locations.id');
  const map = unique(w.terrain.tiles, (item) => item.id, 'terrain.tiles.id');
  unique(w.chronicleErrata.sources, ({ sourceEventId }) => sourceEventId, 'chronicleErrata.sources.id');
  const errataSources = new Map(w.chronicleErrata.sources.map((row) => [row.sourceEventId, row]));
  const errataVenues = new Map(w.locations.map(({ id, type }) => [id, type]));
  const errataPrivate = new Set(w.events.filter(({ witnessScope, tick }) => witnessScope === 'participants' || tick > w.tick).map(({ id }) => id));
  for (const fact of errataSources.values()) {
    const type = errataVenues.get(fact.locationId);
    if (fact.tick > w.tick || errataPrivate.has(fact.sourceEventId) || type === 'secret_realm') {
      fail('chronicleErrata.sources.public_time');
    }
    if (fact.kind === 'duel') {
      const liveFact = w.witnesses.facts.find(({ eventId }) => eventId === fact.sourceEventId);
      const publicEvent = w.events.find(({ id }) => id === fact.sourceEventId);
      if (fact.participantIds.length !== 2 || new Set(fact.participantIds).size !== 2 ||
          fact.participantIds.some((id) => !actor.has(id)) || !fact.participantIds.includes(fact.winnerId) ||
          !['duel', 'kill'].some((suffix) => fact.sourceEventId === 'evt-' + fact.tick + '-' + fact.participantIds[0] + '-' + suffix) ||
          (liveFact && (liveFact.tick !== fact.tick || liveFact.locationId !== fact.locationId || liveFact.winnerId !== fact.winnerId ||
            fact.participantIds.some((id) => !liveFact.participantIds.includes(id)))) ||
          (publicEvent && (publicEvent.tick !== fact.tick || publicEvent.locationId !== fact.locationId || publicEvent.duelWinnerId !== fact.winnerId ||
            fact.participantIds.some((id) => !publicEvent.actorIds.includes(id))))) fail('chronicleErrata.sources.duel_proof');
    } else {
      const recordId = 'settlement-' + fact.tick + '-relief-' + fact.settlementId + '-' + fact.actorId;
      const receipt = w.settlements.records.find(({ id }) => id === recordId);
      if ((type && type !== 'market') || !actor.has(fact.actorId) || fact.sourceEventId !== 'evt-' + recordId ||
          fact.stones !== SETTLEMENT_RELIEF.stones || fact.herbs !== SETTLEMENT_RELIEF.jade_leaf ||
          (receipt && (receipt.kind !== 'relief' || receipt.tick !== fact.tick || receipt.actorId !== fact.actorId ||
            receipt.settlementId !== fact.settlementId || receipt.stones !== fact.stones || receipt.herbs !== fact.herbs))) fail('chronicleErrata.sources.relief_proof');
    }
  }
  const errataSerials = new Set<number>();
  const validateErrataSerial = (id: string, kind: 'retelling' | 'correction') => {
    const serial = Number(id.match(new RegExp('^chronicle-' + kind + '-([1-9][0-9]*)$'))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.chronicleErrata.nextId || errataSerials.has(serial)) fail('chronicleErrata.nextId');
    errataSerials.add(serial);
  };
  const errataClaims = new Map<string, typeof w.chronicleErrata.retellings>();
  unique(w.chronicleErrata.retellings, ({ sourceEventId, authorId }) => JSON.stringify([sourceEventId, authorId]), 'chronicleErrata.retellings.once');
  const errataKey = (reading: typeof w.chronicleErrata.retellings[number]['reading']) =>
    reading.kind === 'duel' ? reading.winnerId : reading.delivery;
  for (const row of w.chronicleErrata.retellings) {
    validateErrataSerial(row.id, 'retelling');
    const fact = errataSources.get(row.sourceEventId);
    if (!fact || !actor.has(row.authorId) || row.tick < fact.tick || row.tick > w.tick ||
        row.tick >= fact.tick + CHRONICLE_ERRATA_WINDOW || row.reading.kind !== fact.kind ||
        (fact.kind === 'duel' && row.reading.kind === 'duel' && !fact.participantIds.includes(row.reading.winnerId))) fail('chronicleErrata.retellings.provenance');
    const claims = errataClaims.get(row.sourceEventId) ?? [];
    if (claims.length >= CHRONICLE_ERRATA_MAX_RETELLINGS) fail('chronicleErrata.retellings.count');
    claims.push(row); errataClaims.set(row.sourceEventId, claims);
  }
  unique(w.chronicleErrata.corrections, ({ sourceEventId }) => sourceEventId, 'chronicleErrata.corrections.once');
  for (const row of w.chronicleErrata.corrections) {
    validateErrataSerial(row.id, 'correction');
    const fact = errataSources.get(row.sourceEventId);
    const claims = errataClaims.get(row.sourceEventId) ?? [];
    const ids = new Set(row.contestedRetellingIds);
    if (!fact || !actor.has(row.editorId) || row.tick < fact.tick || row.tick > w.tick || row.tick >= fact.tick + CHRONICLE_ERRATA_WINDOW ||
        (fact.kind === 'duel' ? fact.participantIds.includes(row.editorId) : fact.actorId === row.editorId) ||
        row.reading.kind !== fact.kind || errataKey(row.reading) !== (fact.kind === 'duel' ? fact.winnerId : 'full_supplies') ||
        ids.size !== claims.length || ids.size !== row.contestedRetellingIds.length ||
        new Set(claims.map(({ reading }) => errataKey(reading))).size < 2 ||
        claims.some((claim) => claim.authorId === row.editorId || claim.tick >= row.tick || !ids.has(claim.id))) fail('chronicleErrata.corrections.provenance');
  }
  unique(w.pilgrimages.journeys, ({ id }) => id, 'pilgrimages.journeys.id');
  const reservedPilgrims = new Set<string>();
  const pilgrimageSites = new Map(w.locations.map((site) => [site.id, site]));
  for (const row of w.pilgrimages.journeys) {
    const serial = Number(row.id.match(/^pilgrimage-([1-9][0-9]*)$/)?.[1]);
    const pending = row.status === 'proposed';
    const active = row.status === 'active';
    const existing = pending || active;
    const started = row.startedTick !== undefined && row.expiresTick !== undefined;
    const moving = row.path.length > 0;
    const validReason = row.status === 'withdrawn' ? row.reason === 'withdrawn' :
      row.status === 'declined' ? row.reason === 'declined' :
      row.status === 'interrupted' ? row.reason === 'member_missing' || row.reason === 'lost_site' :
      row.status === 'expired' ? row.reason === (started ? 'journey_expiry' : 'offer_expiry') : row.reason === undefined;
    if (!Number.isSafeInteger(serial) || serial >= w.pilgrimages.nextId ||
        row.stopIds.length !== 3 || new Set(row.stopIds).size !== 3 ||
        row.organizerId === row.companionId || !actor.has(row.organizerId) || !actor.has(row.companionId) ||
        row.proposedTick > w.tick || row.offerExpiresTick !== row.proposedTick + PILGRIMAGE_OFFER_TICKS ||
        ((row.startedTick === undefined) !== (row.expiresTick === undefined)) ||
        (started && (row.startedTick! < row.proposedTick || row.startedTick! >= row.offerExpiresTick ||
          row.expiresTick !== row.startedTick! + PILGRIMAGE_ACTIVE_TICKS || row.startedTick! > w.tick)) ||
        (existing !== (row.settledTick === undefined)) ||
        (row.settledTick !== undefined && (row.settledTick > w.tick || row.settledTick < (row.startedTick ?? row.proposedTick))) ||
        !validReason || (active && (!started || row.expiresTick! <= w.tick)) ||
        (pending && (started || row.offerExpiresTick <= w.tick)) ||
        (row.status === 'declined' && started) ||
        (row.status === 'completed' ? !started || row.legIndex !== 2 : row.legIndex > 1) ||
        (row.status === 'expired' && row.settledTick! < (started ? row.expiresTick! : row.offerExpiresTick)) ||
        (existing && row.stopIds.some((id) => !pilgrimageSites.has(id) || pilgrimageSites.get(id)?.type === 'secret_realm'))) fail('pilgrimages.journeys.references');
    if (existing) {
      for (const memberId of [row.organizerId, row.companionId]) {
        if (reservedPilgrims.has(memberId)) fail('pilgrimages.journeys.membership');
        reservedPilgrims.add(memberId);
      }
    }
    if (active && [row.organizerId, row.companionId].some((id) => !w.cultivators.some((member) =>
      member.id === id && member.alive && member.hp > 0 && member.locationId === row.stopIds[row.legIndex]))) fail('pilgrimages.journeys.occupants');
    if (row.stopsVisited.length !== (started ? row.legIndex + 1 : 0) || (!started && row.legIndex !== 0) ||
        row.stopsVisited.some((stop, index) => stop.locationId !== row.stopIds[index] ||
          (index === 0 ? stop.tick !== row.startedTick : stop.tick <= row.stopsVisited[index - 1].tick) ||
          stop.tick >= (row.expiresTick ?? 0) || stop.tick > (row.settledTick ?? w.tick))) fail('pilgrimages.journeys.arrivals');
    const launched = row.spentByEach / PILGRIMAGE_LEG_COST;
    if (!Number.isInteger(launched) || launched < row.legIndex || launched > row.legIndex + 1 ||
        (!started && launched !== 0) || (active && launched !== row.legIndex + Number(moving)) ||
        (row.status === 'withdrawn' && launched !== row.legIndex) ||
        (Boolean(launched) !== (row.lastMovedTick !== undefined)) ||
        (row.lastMovedTick !== undefined && (row.lastMovedTick <= (row.startedTick ?? Infinity) ||
          row.lastMovedTick < (row.stopsVisited.at(-1)?.tick ?? 0) ||
          row.lastMovedTick > (row.settledTick ?? w.tick) || row.lastMovedTick >= (row.expiresTick ?? 0)))) fail('pilgrimages.journeys.spend');
    if (moving) {
      const origin = pilgrimageSites.get(row.stopIds[row.legIndex]);
      const dest = pilgrimageSites.get(row.stopIds[row.legIndex + 1]);
      const first = row.path[0], last = row.path.at(-1);
      if (!active || !origin || !dest || !last || row.path.length < 3 || row.pathIndex < 1 || row.pathIndex >= row.path.length - 1 ||
          first.x !== origin.x || first.y !== origin.y || last.x !== dest.x || last.y !== dest.y) fail('pilgrimages.journeys.path');
      const tilePath = row.path.map((point) => terrainTileAt(w, point.x, point.y));
      if (tilePath.some((tile, index) => {
        const earlier = tilePath[index - 1];
        return !tile || (index > 0 && (!earlier || Math.abs(tile.col - earlier.col) + Math.abs(tile.row - earlier.row) > 1));
      })) fail('pilgrimages.journeys.path_tile');
    } else if (row.pathIndex !== 0) fail('pilgrimages.journeys.path_index');
    unique(row.aid, ({ giverId, locationId }) => JSON.stringify([giverId, locationId]), 'pilgrimages.journeys.aid_once');
    if (row.aid.some((given) => {
      const hit = row.stopsVisited.findIndex(({ locationId }) => locationId === given.locationId);
      const nextArrival = row.stopsVisited[hit + 1];
      return !(given.giverId === row.organizerId && given.receiverId === row.companionId ||
        given.giverId === row.companionId && given.receiverId === row.organizerId) ||
        hit < 0 || hit >= 2 || given.tick <= row.stopsVisited[hit].tick ||
        given.tick >= (row.expiresTick ?? 0) || given.tick > (row.settledTick ?? w.tick) ||
        Boolean(nextArrival && given.tick > nextArrival.tick);
    })) fail('pilgrimages.journeys.aid_references');
  }
  unique(w.credit.loans, ({ id }) => id, 'credit.loans.id');
  unique(w.credit.loans.filter(({ status }) => status === 'offered' || status === 'active'),
    ({ borrowerSectId }) => borrowerSectId, 'credit.loans.active_borrower');
  unique(w.credit.restrictions, ({ sectId }) => sectId, 'credit.restrictions.sect');
  if (w.credit.restrictions.some(({ sectId }) => !sector.has(sectId))) fail('credit.restrictions.references');
  for (const loan of w.credit.loans) {
    const funded = loan.status === 'active' || loan.status === 'paid' || loan.status === 'defaulted';
    const closed = loan.status !== 'offered' && loan.status !== 'active';
    const serial = Number(loan.id.match(/^sect-credit-([1-9][0-9]*)$/)?.[1]);
    const paidByTick = new Map<number,number>();
    for (const row of loan.receipts) paidByTick.set(row.tick, (paidByTick.get(row.tick) ?? 0) + row.amount);
    if ([...paidByTick.values()].some((amount) => amount > SECT_CREDIT_PAYMENT_MAX)) fail('credit.loans.payment_tick');
    if (!Number.isSafeInteger(serial) || serial >= w.credit.nextId || loan.lenderSectId === loan.borrowerSectId ||
        !sector.has(loan.lenderSectId) || !sector.has(loan.borrowerSectId) || !actor.has(loan.lenderSignerId) ||
        !actor.has(loan.borrowerSignerId) || loan.lenderSignerId === loan.borrowerSignerId ||
        loan.openedTick > w.tick || loan.offerExpiresTick !== loan.openedTick + SECT_CREDIT_OFFER_TICKS ||
        funded !== (loan.fundedTick !== undefined) || funded !== (loan.dueTick !== undefined) ||
        funded !== (loan.collectionUntilTick !== undefined) || closed !== (loan.settledTick !== undefined) ||
        (loan.fundedTick !== undefined && (loan.fundedTick < loan.openedTick || loan.fundedTick > w.tick ||
          loan.fundedTick >= loan.offerExpiresTick || loan.dueTick !== loan.fundedTick + SECT_CREDIT_TERM_TICKS ||
          loan.collectionUntilTick !== loan.dueTick + SECT_CREDIT_COLLECTION_TICKS)) ||
        (loan.settledTick !== undefined && (loan.settledTick < (loan.fundedTick ?? loan.openedTick) || loan.settledTick > w.tick)) ||
        (loan.lastCollectionTick !== undefined && (loan.dueTick === undefined || loan.collectionUntilTick === undefined ||
          loan.lastCollectionTick < loan.dueTick || loan.lastCollectionTick >= loan.collectionUntilTick || loan.lastCollectionTick > w.tick)) ||
        loan.receipts.some((row) => loan.fundedTick === undefined || row.tick < loan.fundedTick || row.tick > w.tick ||
          (loan.settledTick !== undefined && row.tick > loan.settledTick) ||
          (row.kind === 'collection' && (loan.dueTick === undefined || loan.collectionUntilTick === undefined ||
            row.tick < loan.dueTick || row.tick >= loan.collectionUntilTick)))) fail('credit.loans.references');
    const paid = loan.receipts.reduce((sum,row) => sum + row.amount, 0);
    if (loan.principal !== SECT_CREDIT_PRINCIPAL || loan.paidTotal !== paid || loan.paidTotal + loan.writtenOff > loan.principal ||
        (!funded && (paid !== 0 || loan.writtenOff !== 0)) ||
        (loan.status === 'active' && paid >= loan.principal) ||
        (loan.status === 'paid' && paid !== loan.principal) ||
        (loan.status === 'defaulted' ? (loan.writtenOff <= 0 || loan.paidTotal + loan.writtenOff !== loan.principal)
          : loan.writtenOff !== 0)) fail('credit.loans.principal');
  }
  const sanctuaryIds = new Set<number>();
  const sanctuaryIndex = new Map(w.sanctuary.charters.map((charter) => [charter.id, charter]));
  const validSanctuarySerial = (id: string, kind: 'charter' | 'pass' | 'incident') => {
    const serial = Number(id.match(new RegExp(`^sanctuary-${kind}-([1-9][0-9]*)$`))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.sanctuary.nextId || sanctuaryIds.has(serial)) fail('sanctuary.nextId');
    sanctuaryIds.add(serial);
  };
  unique(w.sanctuary.charters.filter(({ status, expiresTick }) => status === 'active' && expiresTick > w.tick),
    ({ siteId }) => siteId, 'sanctuary.charters.active_site');
  unique(w.sanctuary.passes.filter(({ status, expiresTick }) => status === 'active' && expiresTick > w.tick),
    ({ actorId }) => actorId, 'sanctuary.passes.active_actor');
  unique(w.sanctuary.passes, ({ charterId, actorId }) => JSON.stringify([charterId,actorId]), 'sanctuary.passes.identity');
  for (const row of w.sanctuary.charters) {
    validSanctuarySerial(row.id, 'charter');
    if (!sector.has(row.sponsorSectId) || !actor.has(row.founderId) || (row.status === 'active' && !locations.has(row.siteId)) ||
        row.openedTick > w.tick || row.expiresTick !== row.openedTick + SANCTUARY_CHARTER_TICKS ||
        (row.status === 'ended') !== (row.endedTick !== undefined) || (row.endedTick !== undefined) !== (row.endReason !== undefined) ||
        (row.endedTick !== undefined && (row.endedTick < row.openedTick || row.endedTick > w.tick)) ||
        (row.lastRepairTick !== undefined && (row.lastRepairTick < row.openedTick || row.lastRepairTick > w.tick)) ||
        row.maxShieldHp !== SANCTUARY_MAX_SHIELD || row.shieldHp > row.maxShieldHp ||
        row.stonesSpent < SANCTUARY_FOUND_COST || (row.stonesSpent - SANCTUARY_FOUND_COST) % SANCTUARY_REPAIR_COST !== 0) fail('sanctuary.charters.references');
  }
  for (const row of w.sanctuary.passes) {
    validSanctuarySerial(row.id, 'pass');
    const charter = sanctuaryIndex.get(row.charterId);
    if (!charter || !actor.has(row.actorId) || row.issuedTick < charter.openedTick || row.issuedTick > w.tick ||
        row.expiresTick <= row.issuedTick || row.expiresTick !== Math.min(row.issuedTick + SANCTUARY_PASS_TICKS, charter.expiresTick) ||
        (row.status === 'ended') !== (row.endedTick !== undefined) || (row.endedTick !== undefined) !== (row.endReason !== undefined) ||
        (row.endedTick !== undefined && (row.endedTick < row.issuedTick || row.endedTick > w.tick))) fail('sanctuary.passes.references');
  }
  for (const row of w.sanctuary.incidents) {
    validSanctuarySerial(row.id, 'incident');
    const charter = sanctuaryIndex.get(row.charterId);
    if (!charter || !actor.has(row.aggressorId) || !actor.has(row.visitorId) || row.aggressorId === row.visitorId ||
        row.tick < charter.openedTick || row.tick > w.tick || row.sourceEventId !== `evt-${row.id}` ||
        row.shieldSpent !== (row.kind === 'blocked' ? SANCTUARY_BLOCK_HP : 0) ||
        row.karmaPenalty > SANCTUARY_KARMA_PENALTY) fail('sanctuary.incidents.references');
  }
  const bookmarkRows = w.annotations.bookmarks;
  const noteRows = w.annotations.notes;
  unique([...bookmarkRows,...noteRows], ({ id }) => id, 'annotations.id');
  unique(bookmarkRows, ({ eventId }) => eventId, 'annotations.bookmarks.eventId');
  const annotationSerials = new Set<number>();
  for (const item of [...bookmarkRows, ...noteRows]) {
    const prefix = 'eventId' in item ? 'bookmark' : 'annotation';
    const serial = Number(item.id.match(new RegExp(`^${prefix}-([1-9][0-9]*)$`))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.annotations.nextId || annotationSerials.has(serial)) fail('annotations.nextId');
    annotationSerials.add(serial);
  }
  const privateEvents = new Set(w.events.filter(({ witnessScope }) => witnessScope === 'participants').map(({ id }) => id));
  for (const row of bookmarkRows) if (row.eventTick > row.createdTick || row.createdTick > w.tick ||
      privateEvents.has(row.eventId) || /[\u0000-\u001f\u007f]/.test(row.title)) fail('annotations.bookmarks.references');
  for (const row of noteRows) if (!map.has(row.target.tileId) || row.createdTick > row.updatedTick ||
      row.updatedTick > w.tick || !row.text.trim() || /[\u0000-\u001f\u007f]/.test(row.text) ||
      (row.target.kind === 'site' && /[\u0000-\u001f\u007f]/.test(row.target.siteName))) fail('annotations.notes.references');
  if (w.scenarioOrigin && (w.scenarioOrigin.endTick > w.tick || !w.worldgen ||
      !/^scenario-[0-9a-f]{32}$/.test(w.scenarioOrigin.id))) fail('scenarioOrigin.references');
  if (w.worldgen) {
    const birthActors = unique(w.worldgen.resources, (item) => item.actorId, 'worldgen.resources.actorId');
    if (w.worldgen.seed !== w.random.seed || w.worldgen.birthTick > w.tick ||
        birthActors.size === 0 || w.worldgen.resources.some(({ actorId, locationId }) => !actor.has(actorId) || !locations.has(locationId))) {
      fail('worldgen.references');
    }
  }
  if (w.terrain.tiles.length !== w.terrain.columns * w.terrain.rows) fail('terrain.tiles.length');
  if (w.terrain.tiles.some((tile, index) => tile.col !== index % w.terrain.columns ||
      tile.row !== Math.floor(index / w.terrain.columns) || (tile.ownerSectId && !sector.has(tile.ownerSectId)))) fail('terrain.tiles.grid');
  for (const sect of w.sects) {
    if (!locations.has(sect.headquartersId) || sect.arrayHp > sect.arrayMaxHp ||
        (sect.leaderId && !w.cultivators.some((person) => person.id === sect.leaderId && person.sectId === sect.id))) fail('sects.references');
  }
  for (const site of w.locations) if (site.ownerSectId && !sector.has(site.ownerSectId)) fail('locations.ownerSectId');
  for (const person of w.cultivators) {
    if ((person.sectId && !sector.has(person.sectId)) || (person.alive && !locations.has(person.locationId)) || person.hp > person.maxHp ||
        (person.namedHeirId && (!actor.has(person.namedHeirId) || person.namedHeirId === person.id)) ||
        person.exploredTileIds.some((id) => !map.has(id)) || person.artifacts.some((art) => art.boundTo && !actor.has(art.boundTo))) fail('cultivators.references');
  }
  for (const edge of w.relationships) if (!actor.has(edge.fromId) || !actor.has(edge.toId) || edge.fromId === edge.toId) fail('relationships.references');
  for (const relation of w.diplomacy) if (!sector.has(relation.sectAId) || !sector.has(relation.sectBId) || relation.sectAId === relation.sectBId) fail('diplomacy.references');
  unique(w.diplomacy, (r) => [r.sectAId,r.sectBId].sort().join('|'), 'diplomacy.pairs');
  for (const siege of w.sieges) if (!sector.has(siege.attackerSectId) || !sector.has(siege.defenderSectId) ||
      siege.attackerSectId === siege.defenderSectId || siege.participantIds.some((id) => !actor.has(id))) fail('sieges.references');
  for (const tribute of w.tributeDemands) if (!sector.has(tribute.demanderSectId) || !sector.has(tribute.targetSectId) ||
      tribute.demanderSectId === tribute.targetSectId) fail('tributeDemands.references');
  for (const meeting of w.occasions) if (((meeting.status === 'registration' || meeting.status === 'running') && !locations.has(meeting.locationId)) ||
      meeting.participantIds.some((id) => !actor.has(id))) fail('occasions.references');
  for (const bounty of w.bounties) if (!actor.has(bounty.targetCultivatorId) || bounty.sponsorSectIds.some((id) => !sector.has(id)) ||
      bounty.escrow.some((item) => !sector.has(item.sectId)) || (bounty.hunterId && !actor.has(bounty.hunterId))) fail('bounties.references');
  unique(w.sieges, ({ id }) => id, 'sieges.id'); unique(w.tributeDemands, ({ id }) => id, 'tributeDemands.id');
  unique(w.ceasefires.agreements, ({ id }) => id, 'ceasefires.id');
  const liveAgreements = w.ceasefires.agreements.filter(({ status }) => status === 'offered' || status === 'active');
  const pairKey = (a: string, b: string) => JSON.stringify([a,b].sort());
  unique(liveAgreements, (item) => pairKey(item.proposerSectId, item.targetSectId), 'ceasefires.active.pair');
  const siegeById = new Map(w.sieges.map((siege) => [siege.id, siege]));
  for (const agreement of w.ceasefires.agreements) {
    const { terms, escrow } = agreement;
    const pair = new Set([agreement.proposerSectId, agreement.targetSectId]);
    const signed = agreement.status === 'active' || agreement.status === 'fulfilled' || agreement.status === 'breached';
    const resolved = agreement.status !== 'offered' && agreement.status !== 'active';
    const serial = Number(agreement.id.match(/^ceasefire-([1-9][0-9]*)$/)?.[1]);
    unique(agreement.withdrawnSiegeIds, (id) => id, 'ceasefires.withdrawal.ids');
    if (!Number.isSafeInteger(serial) || serial >= w.ceasefires.nextId || pair.size !== 2 ||
        [...pair].some((id) => !sector.has(id)) || !actor.has(agreement.proposerId) || !actor.has(agreement.targetLeaderId) ||
        agreement.proposerId === agreement.targetLeaderId || agreement.openedTick > w.tick || agreement.offerExpiresTick !== agreement.openedTick + CEASEFIRE_OFFER_TICKS ||
        !pair.has(terms.aidPayerSectId) || !pair.has(terms.aidRecipientSectId) || terms.aidPayerSectId === terms.aidRecipientSectId ||
        signed !== (agreement.signedTick !== undefined) || signed !== (agreement.endsTick !== undefined) ||
        (agreement.signedTick !== undefined && (agreement.signedTick < agreement.openedTick || agreement.signedTick > w.tick ||
          agreement.signedTick > agreement.offerExpiresTick || agreement.endsTick !== agreement.signedTick + terms.duration)) ||
        (agreement.aidReleasedTick !== undefined && (agreement.signedTick === undefined || agreement.endsTick === undefined ||
          agreement.aidReleasedTick < agreement.signedTick + CEASEFIRE_AID_DELAY || agreement.aidReleasedTick > w.tick ||
          (agreement.settledTick !== undefined && agreement.aidReleasedTick > agreement.settledTick))) ||
        (resolved !== (agreement.settledTick !== undefined)) ||
        (agreement.settledTick !== undefined && (agreement.settledTick < (agreement.signedTick ?? agreement.openedTick) || agreement.settledTick > w.tick)) ||
        (agreement.status === 'breached') !== (agreement.breach !== undefined) ||
        (agreement.breach !== undefined && (!pair.has(agreement.breach.offenderSectId) || agreement.breach.tick !== agreement.settledTick ||
          agreement.breach.forfeitedBond !== terms.bondPerSide)) ||
        (!signed && agreement.withdrawnSiegeIds.length > 0) ||
        agreement.withdrawnSiegeIds.some((id) => {
          const siege = siegeById.get(id);
          return siege && (siege.status !== 'withdrawn' || pairKey(siege.attackerSectId, siege.defenderSectId) !== pairKey(agreement.proposerSectId, agreement.targetSectId));
        })) fail('ceasefires.references');
    if (terms.duration !== CEASEFIRE_DURATION || terms.bondPerSide !== CEASEFIRE_BOND || terms.aidAmount < 30 || terms.aidAmount > 120 ||
        (agreement.status === 'active' ? (escrow.proposerBond !== terms.bondPerSide || escrow.targetBond !== terms.bondPerSide ||
          escrow.aid !== (agreement.aidReleasedTick === undefined ? terms.aidAmount : 0))
          : (escrow.proposerBond !== 0 || escrow.targetBond !== 0 || escrow.aid !== 0))) fail('ceasefires.escrow');
  }
  unique(w.occasions, ({ id }) => id, 'occasions.id'); unique(w.bounties, ({ id }) => id, 'bounties.id');
  unique(w.mapHazards, ({ id }) => id, 'mapHazards.id'); unique(w.spiritBeasts, ({ id }) => id, 'spiritBeasts.id');
  for (const item of w.mapHazards) if (!map.has(item.tileId) || item.expiresTick <= item.createdTick) fail('mapHazards.references');
  for (const beast of w.spiritBeasts) if ((beast.alive && !locations.has(beast.locationId)) || beast.hp > beast.maxHp ||
      (beast.tamedBy && !actor.has(beast.tamedBy))) fail('spiritBeasts.references');
  if ((w.playerAvatar.possessedId && !actor.has(w.playerAvatar.possessedId)) ||
      (w.playerAvatar.pendingOrder && w.playerAvatar.pendingOrder.actorId !== w.playerAvatar.possessedId) ||
      w.playerAvatar.transcript.some((entry) => !actor.has(entry.targetCultivatorId) || (entry.actorId && !actor.has(entry.actorId)))) fail('playerAvatar.references');
  unique(w.decisionTrace.records, ({id}) => id, 'decisionTrace.id');
  for (const row of w.decisionTrace.records) {
    unique(row.candidates, ({id}) => id, 'decisionTrace.candidateId');
    if (!actor.has(row.actorId) || row.tick > w.tick ||
        (row.chosenCandidateId && !row.candidates.some(({id,action}) => id === row.chosenCandidateId && action === row.chosenAction)) ||
        row.candidates.some((candidate) => candidate.targetCultivatorId && !actor.has(candidate.targetCultivatorId))) fail('decisionTrace.references');
  }
  unique(w.estates.entries, ({id}) => id, 'estates.id');
  unique(w.estates.entries, ({deceasedId}) => deceasedId, 'estates.deceasedId');
  const knownArtefacts = new Set(w.cultivators.flatMap((person) => person.artifacts.flatMap(({id}) => id ? [id] : [])));
  for (const estate of w.estates.entries) {
    if (!w.cultivators.some(({id,alive}) => id === estate.deceasedId && !alive) ||
        (estate.namedHeirId && !actor.has(estate.namedHeirId)) || (estate.beneficiaryId && !actor.has(estate.beneficiaryId)) ||
        (estate.sponsorSectId && !sector.has(estate.sponsorSectId)) || estate.closesTick < estate.openedTick ||
        estate.eligibleHeirs.some(({actorId}) => !actor.has(actorId) || actorId === estate.deceasedId) ||
        estate.claims.some(({actorId}) => !estate.eligibleHeirs.some((person) => person.actorId === actorId)) ||
        (estate.memorial && (!actor.has(estate.memorial.organizerId) || estate.memorial.attendeeIds.some((id) => !actor.has(id))))) fail('estates.references');
    unique(estate.eligibleHeirs, ({actorId}) => actorId, 'estates.eligibleHeirs');
    unique(estate.claims, ({actorId}) => actorId, 'estates.claims');
    for (const artifact of estate.holdings.artifacts) {
      if (artifact.id && knownArtefacts.has(artifact.id)) fail('estates.duplicate_asset');
      if (artifact.id) knownArtefacts.add(artifact.id);
    }
  }
  const factIds = unique(w.witnesses.facts, ({eventId}) => eventId, 'witnesses.facts.id');
  unique(w.witnesses.claims, ({id}) => id, 'witnesses.claims.id');
  for (const fact of w.witnesses.facts) {
    if (fact.participantIds.length !== 2 || new Set(fact.participantIds).size !== 2 ||
        !fact.participantIds.includes(fact.winnerId) || fact.participantIds.some((id) => !actor.has(id)) ||
        new Set(fact.witnessIds).size !== fact.witnessIds.length ||
        fact.witnessIds.some((id) => !actor.has(id) || fact.participantIds.includes(id))) fail('witnesses.facts.references');
  }
  for (const claim of w.witnesses.claims) {
    if (!actor.has(claim.claimantId) || !actor.has(claim.subjectId) ||
        (claim.settledTick === undefined && !factIds.has(claim.sourceEventId)) ||
        (claim.reputationSectId && !sector.has(claim.reputationSectId)) || claim.reputationRestored > claim.reputationPenalty ||
        (claim.appeal && claim.appeal.actorId !== claim.subjectId) ||
        new Set(claim.attestations.map(({ actorId }) => actorId)).size !== claim.attestations.length ||
        claim.attestations.some(({ actorId }) => !actor.has(actorId))) fail('witnesses.claims.references');
  }
  if (value !== null && typeof value === 'object' && !Object.hasOwn(value, 'witnesses')) {
    const historicalPrivate = new Set(w.events.filter(({ witnessScope }) => witnessScope === 'participants').map(({ id }) => `rumor-${id}`));
    for (const person of w.cultivators) for (const rumor of person.rumors) {
      if (historicalPrivate.has(rumor.id)) rumor.witnessScope = 'participants';
    }
  }
  unique(w.relocations.plans, ({ id }) => id, 'relocations.plans.id');
  unique(w.relocations.abandonedSites, ({ id }) => id, 'relocations.abandonedSites.id');
  const openRelocations = w.relocations.plans.filter(({ status }) => status === 'voting' || status === 'in_transit');
  unique(openRelocations, ({ sectId }) => sectId, 'relocations.active.sect');
  unique(openRelocations, ({ destinationId }) => destinationId, 'relocations.active.destination');
  for (const plan of w.relocations.plans) {
    const voterIds = unique(plan.voterIds, (id) => id, 'relocations.plans.voters');
    unique(plan.votes, ({ actorId }) => actorId, 'relocations.plans.votes');
    unique(plan.garrisonIds, (id) => id, 'relocations.plans.garrison');
    if (!sector.has(plan.sectId) || !locations.has(plan.originId) || !locations.has(plan.destinationId) || plan.originId === plan.destinationId ||
        !voterIds.has(plan.proposerId) || plan.voterIds.some((id) => !actor.has(id)) || plan.garrisonIds.some((id) => !actor.has(id)) ||
        plan.path.length < 2 || plan.pathIndex >= plan.path.length || plan.openedTick > w.tick || plan.deadlineTick <= plan.openedTick ||
        plan.votes.some((vote) => !voterIds.has(vote.actorId) || vote.tick < plan.openedTick || vote.tick > w.tick || vote.tick > plan.deadlineTick) ||
        (plan.departedTick !== undefined && (plan.departedTick < plan.openedTick || plan.departedTick > w.tick)) ||
        (plan.lastAdvancedTick !== undefined && (plan.lastAdvancedTick < (plan.departedTick ?? plan.openedTick) || plan.lastAdvancedTick > w.tick)) ||
        (plan.settledTick !== undefined && (plan.settledTick < (plan.departedTick ?? plan.openedTick) || plan.settledTick > w.tick)) ||
        ((plan.status === 'settled' || plan.status === 'aborted') !== (plan.settledTick !== undefined)) ||
        plan.spent !== (plan.departedTick !== undefined) ||
        (plan.status === 'voting' && plan.spent) || ((plan.status === 'in_transit' || plan.status === 'settled') && !plan.spent) ||
        (plan.status === 'settled' && plan.pathIndex !== plan.path.length - 1) ||
        (plan.status !== 'in_transit' && (plan.custody.stones !== 0 || plan.custody.pavilion.length > 0))) fail('relocations.plans.references');
  }
  for (const row of w.relocations.abandonedSites) {
    if (!sector.has(row.sectId) || !locations.has(row.originId) || !locations.has(row.destinationId) ||
        row.originId === row.destinationId || row.tick > w.tick || row.arrayHp > row.arrayMaxHp) fail('relocations.abandonedSites.references');
  }
  const { seasons, entries: competitionEntries, scores: competitionScores, honors: competitionHonors } = w.competitions;
  unique(w.competitions.optOutActorIds, (id) => id, 'competitions.optout.id');
  if (w.competitions.optOutActorIds.some((id) => !actor.has(id))) fail('competitions.optout.references');
  unique(seasons, ({ id }) => id, 'competitions.seasons.id');
  unique(seasons, ({ year }) => String(year), 'competitions.seasons.year');
  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const entryKey = ({ seasonId, actorId }: { seasonId: string; actorId: string }) => JSON.stringify([seasonId, actorId]);
  unique(competitionEntries, entryKey, 'competitions.entries.identity');
  unique(competitionScores, ({ id }) => id, 'competitions.scores.id');
  unique(competitionScores, ({ seasonId, actorId, sourceId, rule }) => JSON.stringify([seasonId, actorId, sourceId, rule]), 'competitions.scores.source');
  unique(competitionHonors, ({ id }) => id, 'competitions.honors.id');
  unique(competitionHonors, ({ seasonId }) => seasonId, 'competitions.honors.season');
  if (seasons.filter(({ status }) => status === 'open').length !== 1) fail('competitions.seasons.active');
  for (const season of seasons) if (season.openedTick > w.tick ||
      ((season.status === 'settled') !== (season.closedTick !== undefined)) ||
      (season.closedTick !== undefined && (season.closedTick < season.openedTick || season.closedTick > w.tick))) {
    fail('competitions.seasons.references');
  }
  const entryByIdentity = new Map(competitionEntries.map((entry) => [entryKey(entry), entry]));
  for (const entry of competitionEntries) {
    const season = seasonById.get(entry.seasonId);
    if (!season || !actor.has(entry.actorId) || entry.joinedTick < season.openedTick || entry.joinedTick > w.tick ||
        (season.closedTick !== undefined && entry.joinedTick >= season.closedTick) ||
        (entry.withdrawnTick !== undefined && (entry.withdrawnTick < entry.joinedTick || entry.withdrawnTick > w.tick ||
          (season.closedTick !== undefined && entry.withdrawnTick >= season.closedTick)))) fail('competitions.entries.references');
  }
  for (const row of competitionScores) {
    const entry = entryByIdentity.get(entryKey(row));
    const season = seasonById.get(row.seasonId);
    if (!entry || !season || row.tick <= entry.joinedTick || row.tick > w.tick ||
        (entry.withdrawnTick !== undefined && row.tick > entry.withdrawnTick) ||
        (season.closedTick !== undefined && row.tick >= season.closedTick) ||
        row.points !== COMPETITION_RULES[row.rule].points) fail('competitions.scores.references');
  }
  for (const honor of competitionHonors) {
    const season = seasonById.get(honor.seasonId);
    if (!actor.has(honor.actorId) || honor.awardedTick > w.tick ||
        (season && (season.status !== 'settled' || honor.awardedTick !== season.closedTick))) fail('competitions.honors.references');
  }
  unique(w.scriptures.originals, ({ id }) => id, 'scriptures.originals.id');
  unique(w.scriptures.editions, ({ id }) => id, 'scriptures.editions.id');
  unique(w.scriptures.editions.filter(({ kind }) => kind !== 'corrected'),
    ({ originalId, authorId }) => JSON.stringify([originalId, authorId]), 'scriptures.editions.annotator');
  unique(w.scriptures.editions.filter(({ kind }) => kind === 'corrected'),
    ({ parentEditionId }) => parentEditionId ?? '', 'scriptures.editions.correction');
  const originalById = new Map(w.scriptures.originals.map((original) => [original.id, original]));
  const editionById = new Map(w.scriptures.editions.map((edition) => [edition.id, edition]));
  for (const original of w.scriptures.originals) {
    if (original.id !== original.technique.id || original.firstSeenTick > w.tick ||
        (original.technique.createdTick !== undefined && original.technique.createdTick > original.firstSeenTick) ||
        (original.technique.authorId && !actor.has(original.technique.authorId)) ||
        (original.sourceSectId && !sector.has(original.sourceSectId))) fail('scriptures.originals.references');
  }
  for (const edition of w.scriptures.editions) {
    const original = originalById.get(edition.originalId);
    const parent = edition.parentEditionId ? editionById.get(edition.parentEditionId) : undefined;
    if (!original || !actor.has(edition.authorId) || edition.createdTick > w.tick || edition.createdTick < original.firstSeenTick ||
        (edition.kind === 'corrected' && (!parent || parent.id === edition.id || parent.originalId !== original.id ||
          parent.kind !== 'misread' || parent.createdTick > edition.createdTick || !edition.evidence)) ||
        (edition.kind !== 'corrected' && (edition.parentEditionId !== undefined || edition.evidence !== undefined)) ||
        (edition.evidence && (edition.evidence.locationId !== edition.locationId ||
          (edition.evidence.kind === 'pavilion') !== (edition.evidence.sectId !== undefined))) ||
        (edition.evidence?.sectId && !sector.has(edition.evidence.sectId))) fail('scriptures.editions.references');
  }
  for (const person of w.cultivators) if (person.activeEdition) {
    const active = person.activeEdition;
    const edition = editionById.get(active.editionId);
    const original = originalById.get(active.originalId)?.technique;
    if (!edition || !original || active.originalId !== person.technique.id || edition.originalId !== active.originalId ||
        edition.kind !== active.kind || original.name !== person.technique.name || original.spiritRoot !== person.technique.spiritRoot ||
        original.authorId !== person.technique.authorId || original.createdTick !== person.technique.createdTick) {
      fail('scriptures.active.references');
    }
  }
  unique(w.research.projects, ({ id }) => id, 'research.projects.id');
  unique(w.research.projects.filter(({ status }) => status === 'open'), ({ sectId }) => sectId, 'research.projects.active');
  unique(w.research.projects.filter(({ status }) => status === 'completed'),
    ({ sectId, topic }) => JSON.stringify([sectId, topic]), 'research.projects.discovery');
  for (const project of w.research.projects) {
    unique(project.contributors, ({ actorId }) => actorId, 'research.projects.contributors');
    const serial = Number(project.id.match(/^research-([1-9][0-9]*)$/)?.[1]);
    const completed = project.status === 'completed';
    if (!Number.isSafeInteger(serial) || serial >= w.research.nextId || !sector.has(project.sectId) || !actor.has(project.proposerId) ||
        !locations.has(project.locationId) || project.startedTick > w.tick || project.deadlineTick !== project.startedTick + RESEARCH_PROJECT_TICKS ||
        (project.status === 'open') === (project.settledTick !== undefined) ||
        (project.settledTick !== undefined && (project.settledTick < project.startedTick || project.settledTick > w.tick)) ||
        completed !== (project.discoveryTechniqueId !== undefined) || completed !== (project.discoveryLocationId !== undefined) ||
        (completed && (project.discoveryTechniqueId !== researchTechniqueId(project.sectId, project.topic) ||
          !originalById.has(project.discoveryTechniqueId ?? '') || !locations.has(project.discoveryLocationId!) ||
          project.contributors.filter(({ workTurns }) => workTurns > 0).length < RESEARCH_REQUIRED_RESEARCHERS ||
          project.contributors.reduce((total, row) => total + row.workTurns, 0) < RESEARCH_REQUIRED_TURNS))) fail('research.projects.references');
    for (const row of project.contributors) {
      const held = project.status === 'open' && row.withdrawnTick === undefined;
      if (!actor.has(row.actorId) || row.joinedTick < project.startedTick || row.joinedTick >= project.deadlineTick || row.joinedTick > w.tick ||
          (row.workTurns > 0) !== (row.lastWorkedTick !== undefined) ||
          (row.lastWorkedTick !== undefined && (row.lastWorkedTick <= row.joinedTick || row.lastWorkedTick >= project.deadlineTick || row.lastWorkedTick > w.tick)) ||
          (row.withdrawnTick !== undefined) !== (row.withdrawReason !== undefined) ||
          (row.withdrawnTick !== undefined && (row.withdrawnTick < (row.lastWorkedTick ?? row.joinedTick) || row.withdrawnTick > w.tick))) {
        fail('research.projects.work');
      }
      if (row.spent.stones !== row.workTurns * RESEARCH_WORK_COST.stones || row.spent.earthRoots !== row.workTurns * RESEARCH_WORK_COST.earthRoots ||
          (held ? (row.escrow.stones + row.spent.stones !== RESEARCH_DEPOSIT.stones || row.escrow.earthRoots + row.spent.earthRoots !== RESEARCH_DEPOSIT.earthRoots)
            : (row.escrow.stones !== 0 || row.escrow.earthRoots !== 0))) fail('research.projects.escrow');
    }
  }
  const fragmentById = new Map(w.relics.fragments.map((fragment) => [fragment.id, fragment]));
  unique(w.relics.fragments, ({ id }) => id, 'relics.fragments.id');
  const estateIds = new Set(w.estates.entries.map(({ id }) => id));
  const relicArtifacts = new Set<string>();
  const usedFragments = new Set<string>();
  for (const item of [...w.cultivators.flatMap((person) => person.artifacts),
      ...w.estates.entries.flatMap((estate) => estate.holdings.artifacts)]) {
    if (item.relicSetId === undefined && item.relicFragmentIds === undefined) continue;
    const [frame, core] = item.relicFragmentIds ?? [];
    if (!item.relicSetId || !item.id || !frame || !core || frame === core || relicArtifacts.has(item.id) ||
        usedFragments.has(frame) || usedFragments.has(core)) return fail('relics.artifact.references');
    for (const [fragmentId, slot] of [[frame, 'frame'], [core, 'core']] as const) {
      const fragment = fragmentById.get(fragmentId);
      if (!fragment || fragment.slot !== slot || fragment.setId !== item.relicSetId ||
          fragment.holder.kind !== 'consumed' || fragment.holder.id !== item.id) fail('relics.artifact.parts');
      usedFragments.add(fragmentId);
    }
    relicArtifacts.add(item.id);
  }
  const expeditionProofs = new Set<string>();
  for (const fragment of w.relics.fragments) {
    const { source, holder } = fragment;
    if (source.tick > w.tick ||
        (source.kind === 'wild_cache' && (!locations.has(source.locationId) || source.eventId !== undefined || source.occasionId !== undefined)) ||
        (holder.kind === 'site' && !locations.has(holder.id)) ||
        (holder.kind === 'actor' && !actor.has(holder.id)) ||
        (holder.kind === 'estate' && !estateIds.has(holder.id)) ||
        (holder.kind === 'consumed' && (!relicArtifacts.has(holder.id) || !usedFragments.has(fragment.id)))) fail('relics.fragments.references');
    if (source.kind === 'expedition') {
      if (!source.eventId || !source.occasionId || expeditionProofs.has(source.eventId)) return fail('relics.fragments.provenance');
      expeditionProofs.add(source.eventId);
    }
  }
  const doctrineSchoolById = new Map(w.doctrines.schools.map((school) => [school.id, school]));
  unique(w.doctrines.schools, ({ id }) => id, 'doctrines.schools.id');
  unique(w.doctrines.schools, ({ parentSectId, theme }) => JSON.stringify([parentSectId, theme]), 'doctrines.schools.theme');
  unique(w.doctrines.endorsements, ({ actorId }) => actorId, 'doctrines.endorsements.actorId');
  unique(w.doctrines.proposals, ({ id }) => id, 'doctrines.proposals.id');
  unique(w.doctrines.proposals.filter(({ status }) => status === 'pending'), ({ schoolId }) => schoolId, 'doctrines.proposals.pending');
  unique(w.doctrines.records, ({ id }) => id, 'doctrines.records.id');
  const doctrineSequence = new Set<number>();
  for (const row of [...w.doctrines.proposals, ...w.doctrines.records]) {
    const prefix = 'votes' in row ? 'proposal' : 'record';
    const serial = Number(row.id.match(new RegExp(`^doctrine-${prefix}-([1-9][0-9]*)$`))?.[1]);
    if (!Number.isSafeInteger(serial) || serial >= w.doctrines.nextId || doctrineSequence.has(serial)) fail('doctrines.nextId');
    doctrineSequence.add(serial);
  }
  const doctrineMembers = new Set<string>();
  for (const school of w.doctrines.schools) {
    if (!sector.has(school.parentSectId) || !actor.has(school.founderId) ||
        (school.stewardId && (!actor.has(school.stewardId) || !school.memberIds.includes(school.stewardId))) || school.foundedTick > w.tick ||
        (school.lastChangeTick !== undefined && (school.lastChangeTick < school.foundedTick || school.lastChangeTick > w.tick)) ||
        (school.lastTrainingTick !== undefined && (school.lastTrainingTick < school.foundedTick || school.lastTrainingTick > w.tick)) ||
        (school.status !== 'autonomous' && (school.treasury !== 0 || school.memberIds.length !== 0))) fail('doctrines.schools.references');
    for (const member of school.memberIds) {
      if (!actor.has(member) || doctrineMembers.has(member)) fail('doctrines.schools.members');
      doctrineMembers.add(member);
    }
  }
  for (const row of w.doctrines.endorsements) {
    const school = doctrineSchoolById.get(row.schoolId);
    if (!actor.has(row.actorId) || !school || school.parentSectId !== row.sectId ||
        school.theme !== row.theme || row.tick < school.foundedTick || row.tick > w.tick) fail('doctrines.endorsements.references');
  }
  for (const row of w.doctrines.proposals) {
    const school = doctrineSchoolById.get(row.schoolId);
    unique(row.votes, ({ actorId }) => actorId, 'doctrines.proposals.vote');
    if (!school || row.openedTick < school.foundedTick || row.openedTick > w.tick || row.openedTick >= row.expiresTick ||
        !actor.has(row.stewardId) || !actor.has(row.leaderId) || row.stewardId === row.leaderId ||
        (row.status === 'pending') !== (row.settledTick === undefined) ||
        row.votes.length !== (row.status === 'accepted' || row.status === 'declined' ? 2 : 1) ||
        row.votes[0]?.verdict !== 'accept' ||
        (row.status === 'accepted' && row.votes[1]?.verdict !== 'accept') ||
        (row.status === 'declined' && row.votes[1]?.verdict !== 'decline') ||
        (row.settledTick !== undefined && (row.settledTick < row.openedTick || row.settledTick > w.tick)) ||
        row.votes.some((vote) => (vote.actorId !== row.stewardId && vote.actorId !== row.leaderId) ||
          vote.tick < row.openedTick || vote.tick > w.tick || vote.tick > row.expiresTick)) fail('doctrines.proposals.references');
  }
  for (const row of w.doctrines.records) if (!doctrineSchoolById.has(row.schoolId) || row.tick > w.tick ||
      row.actorIds.some((actorId) => !actor.has(actorId))) fail('doctrines.records.references');
  for (const village of w.settlements.villages) {
    // Older snapshots have the original numbered volunteers but no cohort metadata.
    if (village.nextVolunteerSequence === undefined) {
      const highest = village.volunteers.reduce((max, item) => {
        const ordinal = Number(item.id.match(/-vol-(\d+)$/)?.[1] ?? 0);
        return Number.isSafeInteger(ordinal) ? Math.max(max, ordinal) : max;
      }, 4);
      village.nextVolunteerSequence = highest + 1;
    }
    village.juvenileCohorts ??= [];
    if (village.juvenileCohorts.some(({ bornTick }) => bornTick > w.tick) ||
        village.juvenileCohorts.reduce((sum, group) => sum + group.count, 0) > village.population) fail('settlements.cohorts');
  }
  const settlementIds = unique(w.settlements.villages, ({id}) => id, 'settlements.villages.id');
  const volunteers = w.settlements.villages.flatMap((village) => village.volunteers);
  const volunteerIds = unique(volunteers, ({id}) => id, 'settlements.volunteers.id');
  unique(w.settlements.records, ({id}) => id, 'settlements.records.id');
  for (const village of w.settlements.villages) {
    if (!locations.has(village.locationId) || village.population > village.capacity ||
        village.volunteers.some((volunteer) => volunteer.enlistedCultivatorId &&
          (volunteer.enlistedCultivatorId !== `recruit-${volunteer.id}` || !actor.has(volunteer.enlistedCultivatorId)))) fail('settlements.villages.references');
  }
  for (const row of w.settlements.records) {
    if (!settlementIds.has(row.settlementId) || (row.targetSettlementId && !settlementIds.has(row.targetSettlementId)) ||
        (row.actorId && !actor.has(row.actorId)) || (row.sectId && !sector.has(row.sectId)) ||
        (row.volunteerId && !volunteerIds.has(row.volunteerId)) || (row.cultivatorId && !actor.has(row.cultivatorId))) fail('settlements.records.references');
  }
  const deceasedActors = new Set(w.cultivators.filter(({ alive, hp }) => !alive && hp === 0).map(({ id }) => id));
  unique(w.reincarnation.cases, ({ id }) => id, 'reincarnation.cases.id');
  unique(w.reincarnation.cases, ({ deceasedId }) => deceasedId, 'reincarnation.cases.deceased');
  const registeredCases = new Set<string>();
  const reservedBirths = new Set<string>();
  const reborn = new Set<string>();
  for (const row of w.reincarnation.cases) {
    const hasBirth = row.settlementId !== undefined || row.birthTick !== undefined ||
      row.maturesTick !== undefined || row.birthSlot !== undefined;
    if (!deceasedActors.has(row.deceasedId) || row.deathTick > w.tick || row.expiresTick <= row.deathTick ||
        ((row.status === 'recruited' || row.status === 'expired') !== (row.resolvedTick !== undefined)) ||
        (row.resolvedTick !== undefined && (row.resolvedTick < row.deathTick || row.resolvedTick > w.tick)) ||
        (row.status === 'awaiting_birth' && (hasBirth || row.volunteerId || row.newActorId)) ||
        ((row.status === 'reserved' || row.status === 'volunteer' || row.status === 'recruited') && !hasBirth) ||
        ((row.status === 'volunteer' || row.status === 'recruited') && !row.volunteerId) ||
        (row.status === 'reserved' && row.volunteerId) ||
        (row.volunteerId !== undefined && (!hasBirth || row.maturesTick === undefined || row.maturesTick > w.tick)) ||
        ((row.status === 'recruited') !== (row.newActorId !== undefined))) fail('reincarnation.cases.references');
    if (hasBirth) {
      if (!row.settlementId || !settlementIds.has(row.settlementId) || row.birthTick === undefined ||
          row.birthTick <= row.deathTick || row.birthTick > row.expiresTick || row.birthTick > w.tick ||
          row.maturesTick !== row.birthTick + MORTAL_MATURITY_TICKS || row.birthSlot === undefined) fail('reincarnation.cases.birth');
      const birthKey = JSON.stringify([row.settlementId, row.birthTick, row.birthSlot]);
      if (reservedBirths.has(birthKey)) fail('reincarnation.cases.birth');
      reservedBirths.add(birthKey);
    }
    if (row.volunteerId) {
      if (registeredCases.has(row.volunteerId) ||
          (row.status === 'volunteer' && !volunteerIds.has(row.volunteerId))) fail('reincarnation.cases.volunteer');
      registeredCases.add(row.volunteerId);
    }
    if (row.newActorId) {
      if (!actor.has(row.newActorId) || row.newActorId === row.deceasedId || row.newActorId !== `recruit-${row.volunteerId}` ||
          reborn.has(row.newActorId)) fail('reincarnation.cases.recruit');
      reborn.add(row.newActorId);
    }
  }
  unique(w.reincarnation.echoes, ({ actorId }) => actorId, 'reincarnation.echoes.actor');
  for (const row of w.reincarnation.echoes) if (!actor.has(row.actorId) || row.receivedTick > w.tick ||
      ((row.status === 'unconsidered') !== (row.resolvedTick === undefined)) ||
      (row.resolvedTick !== undefined && (row.resolvedTick < row.receivedTick || row.resolvedTick > w.tick))) fail('reincarnation.echoes.references');
  const marketLocations = new Set(w.locations.filter(({type}) => type === 'market').map(({id}) => id));
  const marketOrders = unique(w.markets.orders, ({id}) => id, 'markets.orders.id');
  unique(w.markets.shipments, ({id}) => id, 'markets.shipments.id');
  unique(w.markets.receipts, ({id}) => id, 'markets.receipts.id');
  for (const order of w.markets.orders) {
    if (!actor.has(order.actorId) || (order.status === 'open' && !marketLocations.has(order.locationId)) ||
        order.remaining > order.quantity || order.expiresTick <= order.placedTick ||
        order.escrowStones !== (order.status === 'open' && order.side === 'buy' ? order.remaining * order.limitPrice : 0) ||
        order.escrowGoods !== (order.status === 'open' && order.side === 'sell' ? order.remaining : 0)) fail('markets.orders.references');
  }
  for (const shipment of w.markets.shipments) {
    if (!actor.has(shipment.buyerId) || !actor.has(shipment.sellerId) || shipment.buyerId === shipment.sellerId ||
        shipment.originId === shipment.destinationId || shipment.arrivalTick <= shipment.departedTick ||
        (shipment.status === 'in_transit' && (!marketOrders.has(shipment.buyOrderId) || !marketOrders.has(shipment.sellOrderId)))) fail('markets.shipments.references');
  }
  const escortContractById = new Map(w.escorts.contracts.map((contract) => [contract.id, contract]));
  const shipmentById = new Map(w.markets.shipments.map((shipment) => [shipment.id, shipment]));
  unique(w.escorts.contracts, ({ id }) => id, 'escorts.contracts.id');
  unique(w.escorts.contracts, ({ shipmentId }) => shipmentId, 'escorts.contracts.shipment');
  unique(w.escorts.contracts.filter(({ status }) => status === 'active'), ({ escortId }) => escortId ?? '', 'escorts.contracts.active_actor');
  unique(w.escorts.reports, ({ id }) => id, 'escorts.reports.id');
  for (const contract of w.escorts.contracts) {
    const shipment = shipmentById.get(contract.shipmentId);
    const activeContract = contract.status === 'offered' || contract.status === 'active';
    unique(contract.usedReportIds, (id) => id, 'escorts.contracts.used_reports');
    unique(contract.detours, ({ reportId }) => reportId, 'escorts.contracts.detours');
    if (!actor.has(contract.clientId) || contract.originId === contract.destinationId ||
        (contract.escortId !== undefined && (!actor.has(contract.escortId) || contract.escortId === contract.clientId)) ||
        (shipment && (shipment.sellerId !== contract.clientId || shipment.originId !== contract.originId || shipment.destinationId !== contract.destinationId)) ||
        (activeContract && (!shipment || shipment.status !== 'in_transit' || !locations.has(contract.originId) || !locations.has(contract.destinationId))) ||
        contract.offeredTick > w.tick || contract.expiresTick <= contract.offeredTick ||
        (contract.acceptedTick !== undefined && (contract.acceptedTick < contract.offeredTick || contract.acceptedTick > w.tick ||
          contract.acceptedTick > contract.expiresTick)) ||
        ((contract.escortId !== undefined) !== (contract.acceptedTick !== undefined)) ||
        (contract.status === 'active' && (contract.acceptedTick === undefined || contract.path.length < 2 || contract.stride <= 0)) ||
        (contract.pathIndex >= Math.max(1,contract.path.length)) ||
        (contract.arrivedTick !== undefined && (contract.arrivedTick > w.tick || contract.pathIndex !== contract.path.length - 1)) ||
        (contract.holdAppliedTick !== undefined && (contract.holdAppliedTick < contract.offeredTick || contract.holdAppliedTick > w.tick)) ||
        (contract.lastAdvancedTick !== undefined && (contract.lastAdvancedTick < (contract.acceptedTick ?? contract.offeredTick) || contract.lastAdvancedTick > w.tick)) ||
        (activeContract === (contract.settledTick !== undefined)) ||
        (contract.settledTick !== undefined && (contract.settledTick < contract.offeredTick || contract.settledTick > w.tick)) ||
        contract.lastCrossedTileIds.some((id) => !map.has(id)) ||
        contract.detours.some((data) => !contract.usedReportIds.includes(data.reportId) || data.tick > w.tick || data.tick < (contract.acceptedTick ?? contract.offeredTick))) {
      fail('escorts.contracts.references');
    }
    if (contract.feeEscrow + contract.feePaid + contract.feeRefunded !== ESCORT_FEE ||
        contract.rationsEscrow + contract.rationsSpent + contract.rationsReturned !== (contract.acceptedTick !== undefined ? ESCORT_RATIONS : 0) ||
        (activeContract ? (contract.feeEscrow !== ESCORT_FEE || contract.feePaid !== 0 || contract.feeRefunded !== 0)
          : (contract.feeEscrow !== 0 || contract.rationsEscrow !== 0)) ||
        (contract.status === 'delivered' && (contract.feePaid !== ESCORT_FEE || contract.acceptedTick === undefined)) ||
        ((contract.status === 'failed' || contract.status === 'expired') && contract.feeRefunded !== ESCORT_FEE)) fail('escorts.contracts.escrow');
  }
  for (const report of w.escorts.reports) {
    if (!escortContractById.has(report.contractId) || !actor.has(report.reporterId) || !map.has(report.tileId) ||
        report.observedTick > w.tick || report.expiresTick <= report.observedTick) fail('escorts.reports.references');
  }
  for (const receipt of w.markets.receipts) {
    if (!actor.has(receipt.buyerId) || !actor.has(receipt.sellerId) || receipt.buyerId === receipt.sellerId) fail('markets.receipts.references');
  }
  unique(w.oaths.contracts, ({ id }) => id, 'oaths.contracts.id');
  for (const oath of w.oaths.contracts) {
    const terms = OATH_TERMS[oath.term];
    const pendingEscrow = oath.settledTick === undefined && (oath.status === 'active' || oath.status === 'breached');
    const next = Number(oath.id.split('-').at(-1));
    if (!/^oath-[1-9]\d*$/.test(oath.id) || !Number.isSafeInteger(next) || next >= w.oaths.nextId ||
        !actor.has(oath.requesterId) || !actor.has(oath.providerId) || oath.requesterId === oath.providerId ||
        oath.payment !== terms.payment || oath.collateral !== terms.collateral || oath.quantity !== terms.quantity ||
        oath.escrow.payment !== (pendingEscrow ? terms.payment : 0) || oath.escrow.collateral !== (pendingEscrow ? terms.collateral : 0) ||
        ((oath.status === 'offered' || pendingEscrow) && !locations.has(oath.locationId)) ||
        (oath.appeal && oath.appeal.appellantId !== oath.providerId) ||
        oath.evidence.some((row) => row.actorId !== oath.providerId || row.locationId !== oath.locationId ||
          row.quantity !== oath.quantity || row.tick > w.tick)) fail('oaths.references');
  }
  unique(w.mentorship.offers, ({ id }) => id, 'mentorship.offers.id');
  for (const record of [...w.mentorship.offers, ...w.mentorship.lineage]) {
    if (!actor.has(record.mentorId) || !actor.has(record.studentId) || record.mentorId === record.studentId) fail('mentorship.references');
  }
  if (w.mentorship.budgets.some(({ mentorId }) => !actor.has(mentorId))) fail('mentorship.budgets.references');
  unique(w.mentorship.budgets, ({ mentorId, tick }) => `${mentorId}:${tick}`, 'mentorship.budgets.key');
  unique(w.mentorship.lineage, ({ studentId }) => studentId, 'mentorship.lineage.student');
  const parents = new Map(w.mentorship.lineage.map(({ studentId, mentorId }) => [studentId, mentorId]));
  for (const student of parents.keys()) {
    const visited = new Set<string>();
    let cursor: string | undefined = student;
    while (cursor) {
      if (visited.has(cursor)) fail('mentorship.lineage.cycle');
      visited.add(cursor);
      cursor = parents.get(cursor);
    }
  }
  for (const council of w.councils) if (!sector.has(council.sectId) || council.voterIds.some((id) => !actor.has(id))) fail('councils.references');
  return w;
}

function checkSize(text: string): void {
  if (text.length > WORLD_SAVE_MAX_BYTES || new TextEncoder().encode(text).byteLength > WORLD_SAVE_MAX_BYTES) {
    throw new WorldSaveError('size', '存档超过 8 MiB。');
  }
}

export function encodeWorldSave(world: WorldState): string {
  let raw: string;
  try { raw = JSON.stringify({ format: FORMAT, version: VERSION, world }); }
  catch { throw new WorldSaveError('json', '当前世界不能序列化为 JSON。'); }
  checkSize(raw);
  decodeWorldSave(raw);
  return raw;
}

export function decodeWorldSave(text: string): WorldState {
  if (typeof text !== 'string') throw new WorldSaveError('json', '存档必须是 JSON 文本。');
  checkSize(text);
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { throw new WorldSaveError('json', '存档不是有效的 JSON。'); }
  const envelope = payload as { format?:unknown; version?:unknown; world?:unknown } | null;
  if (!envelope || typeof envelope !== 'object' || envelope.format !== FORMAT || envelope.version !== VERSION) {
    throw new WorldSaveError('version', '不支持这个存档格式或版本。');
  }
  if (Object.keys(envelope).some((key) => !['format','version','world'].includes(key))) return fail('envelope');
  return verifyWorld(envelope.world);
}

export interface SaveSlotSummary { id: string; label: string; savedAt: number; tick: number; year: number; month: number; seed: number; profileId?: WorldgenProfileId }
interface SaveSlot { summary: SaveSlotSummary; content: string }
export interface SaveBackend {
  list(): Promise<SaveSlotSummary[]>;
  get(id: string): Promise<SaveSlot | undefined>;
  put(slot: SaveSlot): Promise<void>;
  remove(id: string): Promise<boolean>;
}

export function createMemorySaveBackend(): SaveBackend {
  const rows = new Map<string, SaveSlot>();
  return {
    list: async () => [...rows.values()].map(({ summary }) => ({ ...summary })),
    get: async (id) => { const slot = rows.get(id); return slot ? structuredClone(slot) : undefined; },
    put: async (slot) => { rows.set(slot.summary.id, structuredClone(slot)); },
    remove: async (id) => rows.delete(id),
  };
}

const PREFIX = 'ai-sect-sandbox:saves:v1:';
const storageError = () => new WorldSaveError('storage', '无法访问浏览器存档。存储可能被禁用或已满。');
const correctId = (id: string) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(id);
const checkSlotId = (id: string) => { if (!correctId(id)) throw new WorldSaveError('invalid_slot', '存档位编号无效。'); };
const checkSummary = (summary: SaveSlotSummary) => {
  if (!summary || !correctId(summary.id) || typeof summary.label !== 'string' || !summary.label || summary.label.length > 60 ||
      !Number.isSafeInteger(summary.savedAt) || summary.savedAt < 0 || !Number.isSafeInteger(summary.tick) || summary.tick < 0 ||
      !Number.isSafeInteger(summary.year) || summary.year < 0 || !Number.isSafeInteger(summary.month) || summary.month < 1 ||
      summary.month > 12 || !Number.isSafeInteger(summary.seed) || summary.seed < 0 || summary.seed > 0xffffffff ||
      (summary.profileId !== undefined && !isWorldgenProfileId(summary.profileId))) throw storageError();
  return { id: summary.id, label: summary.label, savedAt: summary.savedAt, tick: summary.tick, year: summary.year, month: summary.month, seed: summary.seed, ...(summary.profileId ? { profileId: summary.profileId } : {}) };
};

function localBackend(storage: Storage): SaveBackend {
  const key = (id: string) => PREFIX + id;
  const get = async (id: string): Promise<SaveSlot | undefined> => {
    const raw = storage.getItem(key(id));
    return raw === null ? undefined : JSON.parse(raw) as SaveSlot;
  };
  return {
    get,
    list: async () => {
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
      const rows = await Promise.all(keys.filter((k): k is string => !!k?.startsWith(PREFIX)).map((k) => get(k.slice(PREFIX.length))));
      return rows.flatMap((slot) => slot ? [slot.summary] : []);
    },
    put: async (slot) => { storage.setItem(key(slot.summary.id), JSON.stringify(slot)); },
    remove: async (id) => { const found = storage.getItem(key(id)) !== null; if (found) storage.removeItem(key(id)); return found; },
  };
}

function indexedBackend(db: IDBDatabase): SaveBackend {
  function access<T>(table: 'worlds' | 'summaries', mode: IDBTransactionMode, open: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(table, mode);
      const req = open(tx.objectStore(table));
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = tx.onerror = () => reject(storageError());
    });
  }
  const get = (id: string) => access<SaveSlot | undefined>('worlds', 'readonly', (store) => store.get(id));
  return {
    get,
    list: () => access<SaveSlotSummary[]>('summaries', 'readonly', (store) => store.getAll()),
    put: (slot) => new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['worlds','summaries'], 'readwrite');
      const store = tx.objectStore('worlds');
      const put = () => { store.put(slot); tx.objectStore('summaries').put(slot.summary); };
      const existing = store.count(slot.summary.id);
      let capped = false;
      existing.onsuccess = () => {
        if (existing.result) put();
        else {
          const n = store.count();
          n.onsuccess = () => {
            if (n.result >= WORLD_SAVE_MAX_SLOTS) { capped = true; tx.abort(); }
            else put();
          };
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(capped ? new WorldSaveError('slot_limit', '存档位已满。') : storageError());
    }),
    remove: (id) => new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(['worlds','summaries'], 'readwrite');
      const store = tx.objectStore('worlds');
      const check = store.count(id);
      check.onsuccess = () => { if (check.result) { store.delete(id); tx.objectStore('summaries').delete(id); } };
      tx.oncomplete = () => resolve(check.result > 0);
      tx.onabort = tx.onerror = () => reject(storageError());
    }),
  };
}

async function browserBackend(): Promise<SaveBackend> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('ai-sect-sandbox-saves', 1);
        let finished = false;
        const finish = (db?: IDBDatabase) => {
          if (finished) { db?.close(); return; }
          finished = true; clearTimeout(timer);
          if (db) resolve(db); else reject(storageError());
        };
        const timer = setTimeout(() => finish(), 3000);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('worlds')) req.result.createObjectStore('worlds', { keyPath: 'summary.id' });
          if (!req.result.objectStoreNames.contains('summaries')) req.result.createObjectStore('summaries', { keyPath: 'id' });
        };
        req.onsuccess = () => finish(req.result);
        req.onerror = req.onblocked = () => finish();
      });
      return indexedBackend(db);
    }
  } catch { /* A backend that cannot be opened may fall back, but failed writes never silently switch backends. */ }
  try {
    if (typeof localStorage !== 'undefined') {
      void localStorage.length;
      return localBackend(localStorage);
    }
  } catch { /* a browser may deny even read access */ }
  throw storageError();
}

export function createSaveStore(backend?: SaveBackend, now: () => number = Date.now) {
  let opened: Promise<SaveBackend> | undefined;
  const pick = () => backend ? Promise.resolve(backend) : (opened ??= browserBackend().catch((error) => { opened = undefined; throw error; }));
  let tail: Promise<unknown> = Promise.resolve();
  function operations<T>(work: (store: SaveBackend) => Promise<T>): Promise<T> {
    const run = tail.then(() => pick()).then(work).catch((error: unknown) => { throw error instanceof WorldSaveError ? error : storageError(); });
    tail = run.catch(() => undefined);
    return run;
  }
  return {
    list: () => operations(async (store) => (await store.list()).map(checkSummary)
      .sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id))),
    load: (id: string) => operations(async (store) => {
      checkSlotId(id);
      const slot = await store.get(id);
      if (!slot) throw new WorldSaveError('not_found', '这个存档位是空的。');
      const summary = checkSummary(slot.summary);
      if (summary.id !== id) throw storageError();
      const world = decodeWorldSave(slot.content);
      if (summary.tick !== world.tick || summary.year !== world.year || summary.month !== world.month || summary.seed !== world.random.seed ||
          (summary.profileId !== undefined && summary.profileId !== world.worldgen?.profileId)) throw storageError();
      return world;
    }),
    save: (id: string, label: string, world: WorldState) => {
      // Snapshot synchronously before the async backend queue so world mutations cannot alter the selected save.
      let content: string;
      let summary: SaveSlotSummary;
      try {
        checkSlotId(id);
        const name = typeof label === 'string' ? label.trim() : '';
        if (!name || name.length > 60) throw new WorldSaveError('invalid_slot', '存档名称须为 1 至 60 个字符。');
        content = encodeWorldSave(world);
        summary = checkSummary({ id, label: name, savedAt: now(), tick: world.tick, year: world.year, month: world.month, seed: world.random.seed, profileId: world.worldgen?.profileId });
      } catch (error) { return Promise.reject<SaveSlotSummary>(error); }
      return operations(async (store) => {
        const previous = (await store.list()).map(checkSummary);
        const prior = previous.find((slot) => slot.id === id);
        if (!prior && previous.length >= WORLD_SAVE_MAX_SLOTS) throw new WorldSaveError('slot_limit', '存档位已满。');
        if (prior) summary.savedAt = Math.max(summary.savedAt, prior.savedAt + 1);
        await store.put({ summary, content });
        return { ...summary };
      });
    },
    delete: (id: string) => operations(async (store) => { checkSlotId(id); return store.remove(id); }),
  };
}

export const worldSaveStore = createSaveStore();
