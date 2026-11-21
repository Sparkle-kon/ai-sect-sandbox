import { createSettlementState } from './settlementEngine';
import { OATH_TERMS } from './oathEngine';
import type { WorldState } from '../types/world';

export const WORLD_SAVE_MAX_BYTES = 8 * 1024 * 1024;
export const WORLD_SAVE_MAX_SLOTS = 12;
const FORMAT = 'ai-sect-sandbox';
const VERSION = 1;
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
const ids = arr(1200, id);
const oid = optional(id), otick = optional(tick), otext = optional(text);
const spirit = one('金','木','水','火','土','雷','暗','天灵根');
const realm = one('练气','筑基','金丹','元婴','化神','炼虚','合体','大乘','渡劫');
const sectRank = one('外门弟子','内门弟子','真传弟子','长老','太上长老','掌门');
const source = one('utility','llm');
const eventCategory = one('breakthrough','combat','intrigue','heavenly','death','diplomacy');
const mode = one('avatar','ring');
const intent = one('guide','persuade','deceive','interrogate','recruit');
const vote = one('support','oppose','abstain');
const action = one(...'CULTIVATE BREAKTHROUGH EXPLORE SOCIALIZE DUEL SCHEMING PURSUE_SCHEME AUTHOR_TECHNIQUE STUDY_TECHNIQUE GATHER_HERBS BREW_PILL USE_PILL FORGE_ARTIFACT BIND_ARTIFACT REPAIR_ARTIFACT AWAKEN_ARTIFACT FACE_TRIBULATION AMBUSH_TRIBULATION CHALLENGE_LEADERSHIP PLOT_COUP BUILD_FACILITY DISPATCH_GUARD GUARD_DUTY OFFER_ALLIANCE DECLARE_WAR DEMAND_TRIBUTE LAUNCH_SIEGE JOIN_OCCASION PURSUE_BOUNTY TAME_BEAST TRADE DUAL_CULTIVATE SECT_DIPLOMACY TEACH ACCEPT_TUITION DECLINE_TUITION OFFER_OATH ACCEPT_OATH DECLINE_OATH FULFILL_OATH APPEAL_OATH PLACE_MARKET_BUY PLACE_MARKET_SELL CANCEL_MARKET_ORDER RECRUIT_SETTLER DELIVER_RELIEF FILE_WITNESS_CLAIM ATTEST_WITNESS CHALLENGE_WITNESS NAME_HEIR CLAIM_ESTATE HOLD_MEMORIAL REST'.split(' '));
const herbs = structure({jade_leaf:count,earth_root:count,star_bloom:count,shadow_moss:count});
const marketGood = one('jade_leaf','earth_root','star_bloom','shadow_moss','foundation','golden','barrier','heart_poison');
const marketQty = num(1,12,true), marketPrice = num(1,500,true);
const pills = structure({foundation:count,golden:count,barrier:count,heart_poison:count});
const technique = structure({id:oid,authorId:oid,createdTick:otick,name:id,spiritRoot:spirit});
const artifact = structure({id:oid,tier:optional(one('法器','灵器','法宝','通天灵宝')),durability:optional(wealth),maxDurability:optional(wealth),boundTo:oid,
  soul:optional(structure({name:id,experience:percentage})),resonance:optional(percentage),name:id,spiritRoot:spirit});
const eligibility = { actorId:id,basis:one('nomination','bond','sect'),strength:num(0,10_000) };
const memory = structure({id,tick,content:text,importance:num(1,10),emotionalValence:num(-5,5),decayRate:num(0,10),
  consolidatedAtTick:otick,category:one('cultivation','combat','social','heavenly','whisper')});
const dialogue = structure({kind:one('combat','trade','dual_cultivation','sect_diplomacy'),source,
  turns:arr(24,structure({speakerId:id,speakerName:id,text}))});
const publicFact = {id,tick,year:tick,month,title:text,description:text,category:eventCategory,actorIds:ids,locationId:oid,dialogue:optional(dialogue)};
const anchor = structure(publicFact);
const proposal: Validator = (value, path) => {
  const kind = (value as {kind?:unknown} | null)?.kind;
  if (kind === 'war') return structure({kind:one('war'),targetSectId:id})(value,path);
  if (kind === 'expel') return structure({kind:one('expel'),targetCultivatorId:id})(value,path);
  if (kind === 'allocate_pill') return structure({kind:one('allocate_pill'),targetCultivatorId:id,donorId:id})(value,path);
  fail(path);
};

const shape = structure({
  tick, interventionSequence:tick, year:tick, month,
  random:structure({algorithm:one('mulberry32-v1'),seed:unsigned32,state:unsigned32}),
  sects:arr(48,structure({id,name:id,alignment:one('正道','魔道','中立'),color:strings(80),doctrine:text,reputation:num(-1_000_000,1_000_000),spiritStones:wealth,headquartersId:id,
    pavilion:arr(350,technique),leaderId:oid, arrayHp:wealth,arrayMaxHp:wealth,
    facilities:structure({qi_array:num(0,3,true),alchemy_hall:num(0,3,true),scripture_pavilion:num(0,3,true),defense_array:num(0,3,true),spirit_mine:num(0,3,true)}),
    succession:optional(structure({tick,method:one('election','challenge','coup'),previousLeaderId:oid,leaderId:id,supporterIds:ids})),
    monthlyEconomy:optional(structure({tick,taxes:wealth,mining:wealth,upkeep:wealth,net:num(-1_000_000_000,1_000_000_000)}))})),
  locations:arr(1200,structure({id,name:id,x:num(0,1000),y:num(0,600),type:one('sect_hq','spirit_vein','secret_realm','market','abyss'),spiritRoot:spirit,
    spiritQi:num(0,150),ownerSectId:oid,inheritanceScrolls:arr(350,technique),herbs,herbCapacity:herbs,furnaceGrade:one(0,1,2,3),description:text})),
  cultivators:arr(500,structure({id,name:id,title:text,sectId:strings(240),sectRank,contribution:wealth,transgressions:percentage,realm,realmStage:num(1,9,true),
    qiProgress:percentage,hp:wealth,maxHp:num(1,1_000_000_000),combatPower:wealth,age:wealth,lifespan:wealth,
    personality:one('刚正','阴险','狂傲','苟道','痴情','嗜血','逍遥','诡诈'),locationId:id,spiritStones:wealth,karma:affinity,currentAction:action,
    innerMonologue:text,secretGoal:text,spiritRoot:spirit,technique,techniqueMastery:percentage,authoredTechnique:optional(technique),herbs,pills,pillToxicity:percentage,
    exploredTileIds:ids,artifacts:arr(700,artifact),memories:arr(160,memory),coreMemories:arr(160,memory),memorySequence:tick,
    reflections:arr(100,structure({id,tick,kind:one('belief','obsession','heart_demon'),theme:one('cultivation','conflict','community','heavenly'),intensity:num(1,10),statement:text,sourceMemoryIds:ids,source})),
    rumors:arr(200,structure({id,subject:text,locationId:oid,originTick:tick,learnedTick:tick,provenance:one('witness','conversation','flying_sword','fabricated'),
      confidence:percentage,hops:count,sourceCultivatorId:oid,originEventId:oid,originSourceCultivatorId:oid,
      witnessScope:optional(one('participants')),lead:optional(bool)})),
    activeScheme:optional(structure({id,kind:one('infiltration','foundation_pill','vengeance','artifact_heist'),title:text,status:one('active','completed','failed'),
      startedTick:tick,finishedTick:otick,stepIndex:count,steps:arr(32,structure({label:text,completedTick:otick})),targetCultivatorId:oid,targetLocationId:oid,artifactName:otext,outcome:otext})),
    tribulation:optional(structure({id,targetRealm:realm,startedTick:tick,stage:one('lightning','heart_demon','passed','failed'),nextWave:count,totalWaves:count,
      pressure:percentage,interruptions:count,resolvedTick:otick,lastOutcome:otext,lastActedTick:otick})),
    guardAssignment:optional(structure({locationId:id,assignedTick:tick,expiresTick:tick})),namedHeirId:oid,alive:bool})),
  relationships:arr(8000,structure({fromId:id,toId:id,type:one('师徒','同门','道侣','血仇','挚友','竞争'),affinity,note:text})),
  events:arr(200,structure({...publicFact,witnessScope:optional(one('participants')),duelWinnerId:oid,damage:optional(arr(500,structure({cultivatorId:id,amount:wealth})))})),
  diplomacy:arr(1200,structure({sectAId:id,sectBId:id,affinity,pact:one('neutral','alliance','war'),sinceTick:tick,lastActionTick:otick})),
  sieges:arr(2000,structure({id,attackerSectId:id,defenderSectId:id,destinationId:id,participantIds:ids,status:one('marching','sieging','victory','repelled'),
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
  mapPresentation:structure({tick,trails:arr(500,structure({cultivatorId:id,tick,fromLocationId:id,toLocationId:id,
    points:arr(6402,structure({x:num(0,1000),y:num(0,600)}))})),
    effects:arr(1000,structure({id,tick,kind:one('damage','breakthrough','clash','lightning'),locationId:id,actorIds:ids,text:otext}))}),
  mapHazards:arr(1200,structure({id,kind:one('meteor','beast_tide','cursed_miasma'),tileId:id,createdTick:tick,expiresTick:tick,intensity:num(1,3,true)})),
  spiritBeasts:arr(500,structure({id,name:id,kind:one('妖兽','凶兽','瑞兽'),locationId:id,homeLocationId:id,hp:wealth,maxHp:num(1,1_000_000_000),
    power:wealth,cultivation:percentage,alive:bool,tamedBy:oid,nextActionTick:tick})),
  councils:arr(120,structure({id,tick,sectId:id,proposal,voterIds:arr(5,id),title:text,summary:text,
    rounds:arr(2,structure({round:one(1,2),turns:arr(5,structure({voterId:id,text,source}))})),
    ballots:arr(5,structure({voterId:id,vote,reason:text,source})),tally:structure({support:count,oppose:count,abstain:count,required:count}),
    status:one('passed','rejected','stale'),outcome:text})),
  chronicleArchive:structure({anchors:arr(384,anchor),chapters:arr(24,structure({id,chapterNumber:tick,startTick:tick,endTick:tick,title:text,
    anchors:arr(18,anchor),biographies:arr(8,structure({actorId:id,name:id,realm,sectName:otext,anchorIds:ids})),body:strings(25_000),source}))}),
  estates:structure({entries:arr(500,structure({id,deceasedId:id,locationId:id,openedTick:tick,closesTick:tick,
    namedHeirId:oid,sponsorSectId:oid,status:one('open','settled','unclaimed'),
    holdings:structure({stones:wealth,herbs,pills,artifacts:arr(700,artifact)}),
    distributed:structure({stones:wealth,herbs,pills,artifactIds:ids}),
    eligibleHeirs:arr(500,structure(eligibility)),claims:arr(500,structure({...eligibility,tick})),
    beneficiaryId:oid,settledTick:otick,memorial:optional(structure({tick,organizerId:id,attendeeIds:ids,relationshipImpacts:count}))}))}),
  witnesses:structure({nextId:tick,
    facts:arr(240,structure({eventId:id,tick,locationId:id,participantIds:arr(2,id),winnerId:id,witnessIds:ids})),
    claims:arr(80,structure({id,sourceEventId:id,publicationEventId:id,claimantId:id,subjectId:id,locationId:id,
      filedTick:tick,deadlineTick:tick,challengeUntilTick:tick,status:one('pending','disputed','corroborated','retracted'),
      attestations:arr(500,structure({actorId:id,tick,verdict:one('supports','contradicts')})),
      appeal:optional(structure({tick,actorId:id,verdict:one('upheld','rejected'),reason:text})),settledTick:otick,
      reputationSectId:oid,reputationPenalty:percentage,reputationRestored:percentage,reason:otext}))}),
  settlements:structure({lastAdvancedTick:otick,
    villages:arr(48,structure({id,locationId:id,name:id,population:count,capacity:count,stress:percentage,
      volunteers:arr(80,structure({id,name:id,age:wealth,spiritRoot:spirit,willingness:percentage,aptitude:percentage,enlistedCultivatorId:oid})),
      lastDisasterTick:otick,lastReliefTick:otick})),
    records:arr(100,structure({id,tick,kind:one('disaster','migration','relief','recruitment'),settlementId:id,targetSettlementId:oid,
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
    lineage:arr(600,structure({mentorId:id,studentId:id,technique,formedTick:tick,lastLessonTick:tick,lessons:count,flaw:percentage})),
    budgets:arr(500,structure({mentorId:id,tick,spent:num(0,2,true)})),lastMaintainedTick:otick}),
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
  const actor = unique(w.cultivators, (item) => item.id, 'cultivators.id');
  const sector = unique(w.sects, (item) => item.id, 'sects.id');
  const locations = unique(w.locations, (item) => item.id, 'locations.id');
  const map = unique(w.terrain.tiles, (item) => item.id, 'terrain.tiles.id');
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
  unique(w.occasions, ({ id }) => id, 'occasions.id'); unique(w.bounties, ({ id }) => id, 'bounties.id');
  unique(w.mapHazards, ({ id }) => id, 'mapHazards.id'); unique(w.spiritBeasts, ({ id }) => id, 'spiritBeasts.id');
  for (const item of w.mapHazards) if (!map.has(item.tileId) || item.expiresTick <= item.createdTick) fail('mapHazards.references');
  for (const beast of w.spiritBeasts) if ((beast.alive && !locations.has(beast.locationId)) || beast.hp > beast.maxHp ||
      (beast.tamedBy && !actor.has(beast.tamedBy))) fail('spiritBeasts.references');
  if ((w.playerAvatar.possessedId && !actor.has(w.playerAvatar.possessedId)) ||
      (w.playerAvatar.pendingOrder && w.playerAvatar.pendingOrder.actorId !== w.playerAvatar.possessedId) ||
      w.playerAvatar.transcript.some((entry) => !actor.has(entry.targetCultivatorId) || (entry.actorId && !actor.has(entry.actorId)))) fail('playerAvatar.references');
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

export interface SaveSlotSummary { id: string; label: string; savedAt: number; tick: number; year: number; month: number; seed: number }
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
      summary.month > 12 || !Number.isSafeInteger(summary.seed) || summary.seed < 0 || summary.seed > 0xffffffff) throw storageError();
  return { id: summary.id, label: summary.label, savedAt: summary.savedAt, tick: summary.tick, year: summary.year, month: summary.month, seed: summary.seed };
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
      if (summary.tick !== world.tick || summary.year !== world.year || summary.month !== world.month || summary.seed !== world.random.seed) throw storageError();
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
        summary = checkSummary({ id, label: name, savedAt: now(), tick: world.tick, year: world.year, month: world.month, seed: world.random.seed });
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
