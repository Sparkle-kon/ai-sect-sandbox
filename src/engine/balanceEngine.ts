import { createInitialWorld } from '../data/initialWorld';
import type { LLMDecisionPayload, WorldEvent, WorldState } from '../types/world';
import { adjustSectAffinity, resolveDiplomacyAction, SIEGE_COST } from './diplomacyEngine';
import { clanChildActorId, clanEventId, CLAN_ADULT_AGE, CLAN_MATURITY_TICKS } from './cultivationClanTerms';
import { CORE_LIMIT, EPISODIC_LIMIT } from './memoryEngine';
import { advanceWorldTick } from './worldEngine';

export interface BalanceSettings { populationScenario?: 'evolving' | 'baseline'; seed: number; ticks?: number; restBelow?: number }
export interface BalanceReport {
  seed: number; steps: number; restBelow: number; populationScenario: 'evolving' | 'baseline'; initialLiving: number; finalLiving: number;
  minimumLiving: number; maximumLiving: number; maximumRoster: number; verifiedRecruits: number; verifiedClanAdults: number; extinctAtTick?: number;
  maximumEpisodicMemory: number; maximumCoreMemory: number; maximumRumors: number; maximumReflections: number;
  maximumTreasury: number; maximumPersonalStones: number; maximumTotalHerbs: number;
  activeSieges: number; completedSieges: number; longestObservedSiege: number; distinctSieges: number;
  supervisedRestOrders: number; violations: Array<{ tick: number; code: string }>;
}
const checkNat = (value: number, max: number) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const duration = (ticks: number | undefined) => {
  const value = ticks ?? 500;
  if (!checkNat(value, 1500) || value === 0) throw new RangeError('Benchmark ticks must be in 1..1500.');
  return value;
};
const threshold = (restBelow = 0) => {
  if (!Number.isFinite(restBelow) || restBelow < 0 || restBelow > .6) throw new RangeError('REST threshold must be in [0,.6].');
  return restBelow;
};

/** Authoritative accounting for new playable clan residents, including events outside the bounded hot feed. */
export function verifyBalanceClanEntrants(before: WorldState, world: WorldState, events: readonly WorldEvent[]) {
  const entrantIds = new Set<string>();
  let invalid = false;
  const matured = world.cultivationClans?.children.filter(child => child.maturedTick === world.tick) ?? [];
  const receipts = events.filter(event => /^evt-[1-9]\d*-clan-union-[1-9]\d*-mature$/u.test(event.id));
  if (matured.length !== receipts.length) invalid = true;
  for (const child of matured) {
    const actorId = clanChildActorId(child.id), id = clanEventId(world.tick, child.unionId, 'mature');
    const now = world.cultivators.filter(actor => actor.id === actorId);
    const older = before.cultivationClans?.children.filter(row => row.id === child.id) ?? [];
    const origin = world.cultivationClans?.unions.filter(row => row.id === child.unionId) ?? [];
    const current = receipts.filter(event => event.id === id);
    const [actor] = now, [prior] = older, [union] = origin, [receipt] = current;
    if (entrantIds.has(actorId) || now.length !== 1 || older.length !== 1 || origin.length !== 1 || current.length !== 1 ||
        before.cultivators.some(row => row.id === actorId) || prior.maturedTick !== undefined ||
        prior.unionId !== child.unionId || prior.birthTick !== child.birthTick || prior.maturesAtTick !== child.maturesAtTick ||
        child.maturesAtTick !== child.birthTick + CLAN_MATURITY_TICKS || world.tick < child.maturesAtTick ||
        union.plan?.status !== 'born' || union.plan.childId !== child.id || union.plan.closedTick !== child.birthTick ||
        union.clanId !== child.clanId || union.siteId !== child.siteId ||
        !actor.alive || actor.hp <= 0 || actor.age !== CLAN_ADULT_AGE || actor.sectId !== '' || actor.positionPlane !== undefined ||
        actor.locationId !== child.siteId || actor.clanHeritage?.childId !== child.id || actor.clanHeritage.clanId !== child.clanId ||
        actor.clanHeritage.innateTrait !== child.innateTrait || JSON.stringify(actor.clanHeritage.roots) !== JSON.stringify(child.roots) ||
        receipt.tick !== world.tick || receipt.year !== world.year || receipt.month !== world.month ||
        receipt.locationId !== child.siteId || receipt.category !== 'breakthrough' || receipt.witnessScope !== undefined ||
        receipt.actorIds.length !== 1 || receipt.actorIds[0] !== actorId) {
      invalid = true;
      continue;
    }
    entrantIds.add(actorId);
  }
  return { entrantIds, invalid };
}

export function runBalanceSimulation({ seed, ticks, restBelow = 0, populationScenario = 'evolving' }: BalanceSettings): BalanceReport {
  const steps = duration(ticks);
  const rest = threshold(restBelow);
  if (!checkNat(seed, 0xffffffff)) throw new RangeError('Seed must be uint32.');
  let world = createInitialWorld(seed);
  // The control isolates stress from both village intake and new authored clan lineages; live gameplay evolves both.
  if (populationScenario === 'baseline') world.settlements = { villages: [], records: [] };
  const initialLiving = world.cultivators.filter(({ alive }) => alive).length;
  const initialRoster = new Set(world.cultivators.map(({ id }) => id));
  const verifiedRecruitment = new Set<string>();
  const verifiedClanAdults = new Set<string>();
  const report: BalanceReport = {
    seed, steps, restBelow: rest, populationScenario, initialLiving, finalLiving: initialLiving, minimumLiving: initialLiving, maximumLiving: initialLiving,
    maximumRoster: world.cultivators.length, verifiedRecruits: 0, verifiedClanAdults: 0, maximumEpisodicMemory: 0, maximumCoreMemory: 0, maximumTreasury: 0,
    maximumPersonalStones: 0, maximumTotalHerbs: 0, maximumRumors: 0, maximumReflections: 0,
    activeSieges: 0, completedSieges: 0, longestObservedSiege: 0, distinctSieges: 0, supervisedRestOrders: 0, violations: [],
  };
  const flagged = new Set<string>();
  const violation = (code: string) => {
    // Bound diagnostics; retain the earliest evidence for each invariant, not one copy per subsequent tick.
    if (!flagged.has(code)) { flagged.add(code); report.violations.push({ tick: world.tick, code }); }
  };
  const processedSieges = new Set<string>();
  const nonnegative = (n: number) => Number.isFinite(n) && n >= 0;
  const active = (status: WorldState['sieges'][number]['status']) => status === 'marching' || status === 'sieging';
  function observe(before?: WorldState, completed: readonly WorldEvent[] = []) {
    const present = world.cultivators.filter(({ alive }) => alive).length;
    report.finalLiving = present;
    report.minimumLiving = Math.min(report.minimumLiving, present);
    report.maximumLiving = Math.max(report.maximumLiving, present);
    report.maximumRoster = Math.max(report.maximumRoster, world.cultivators.length);
    if (!present && report.extinctAtTick === undefined) report.extinctAtTick = world.tick;
    for (const row of world.settlements.records) if (row.kind === 'recruitment' && row.tick === world.tick &&
      row.people === 1 && row.cultivatorId && row.volunteerId && row.cultivatorId === `recruit-${row.volunteerId}`) verifiedRecruitment.add(row.cultivatorId);
    report.verifiedRecruits = verifiedRecruitment.size;
    if (before) {
      const actual = verifyBalanceClanEntrants(before, world, completed);
      if (actual.invalid) violation('population_growth');
      if (populationScenario === 'evolving') for (const id of actual.entrantIds) verifiedClanAdults.add(id);
    }
    report.verifiedClanAdults = verifiedClanAdults.size;
    const currentIds = new Set(world.cultivators.map(({ id }) => id));
    if (currentIds.size !== world.cultivators.length || world.cultivators.some(({ id }) => !initialRoster.has(id) && !verifiedRecruitment.has(id) && !verifiedClanAdults.has(id)) ||
        populationScenario === 'baseline' && !!world.cultivationClans?.unions.length ||
        world.settlements.villages.some(({ population, capacity }) => population < 0 || population > capacity)) violation('population_growth');
    if (new Set(world.cultivators.map(({ id }) => id)).size !== world.cultivators.length) violation('duplicate_cultivator');
    let herbs = 0;
    for (const actor of world.cultivators) {
      report.maximumEpisodicMemory = Math.max(report.maximumEpisodicMemory, actor.memories.length);
      report.maximumCoreMemory = Math.max(report.maximumCoreMemory, actor.coreMemories.length);
      report.maximumRumors = Math.max(report.maximumRumors, actor.rumors.length);
      report.maximumReflections = Math.max(report.maximumReflections, actor.reflections.length);
      report.maximumPersonalStones = Math.max(report.maximumPersonalStones, actor.spiritStones);
      if (actor.memories.length > EPISODIC_LIMIT || actor.coreMemories.length > CORE_LIMIT || actor.rumors.length > 100 || actor.reflections.length > 6) violation('memory_bounds');
      if (!nonnegative(actor.hp) || actor.hp > actor.maxHp || !nonnegative(actor.spiritStones) ||
          !nonnegative(actor.qiProgress) || actor.qiProgress > 100 || !nonnegative(actor.pillToxicity) || actor.pillToxicity > 100 ||
          Object.values(actor.pills).some((amount) => !nonnegative(amount)) || Object.values(actor.herbs).some((amount) => !nonnegative(amount))) violation('cultivator_resources');
      herbs += Object.values(actor.herbs).reduce((total, amount) => total + amount, 0);
    }
    for (const site of world.locations) {
      for (const kind of Object.keys(site.herbs) as Array<keyof typeof site.herbs>) {
        herbs += site.herbs[kind];
        if (!nonnegative(site.herbs[kind]) || site.herbs[kind] > site.herbCapacity[kind]) violation('herb_capacity');
      }
    }
    report.maximumTotalHerbs = Math.max(report.maximumTotalHerbs, herbs);
    for (const sect of world.sects) {
      report.maximumTreasury = Math.max(report.maximumTreasury, sect.spiritStones);
      if (!nonnegative(sect.spiritStones) || !nonnegative(sect.arrayHp) || sect.arrayHp > sect.arrayMaxHp) violation('sect_resources');
    }
    if (world.events.length > 120 || world.chronicleArchive.chapters.length > 24 || world.chronicleArchive.anchors.length > 384 ||
        world.playerAvatar.transcript.length > 72) violation('history_bounds');
    for (const siege of world.sieges) {
      processedSieges.add(siege.id);
      const span = (active(siege.status) ? world.tick : siege.lastResolvedTick ?? world.tick) - siege.startedTick;
      report.longestObservedSiege = Math.max(report.longestObservedSiege, span);
      if (span > 9 || siege.rounds > 7) violation('siege_did_not_terminate');
    }
    report.activeSieges = world.sieges.filter(({ status }) => active(status)).length;
    report.completedSieges = world.sieges.length - report.activeSieges;
    report.distinctSieges = processedSieges.size;
  }
  observe();
  for (let i = 0; i < steps; i++) {
    const overrides: Record<string, LLMDecisionPayload> = {};
    if (rest) for (const actor of world.cultivators) {
      if (!actor.alive || actor.hp <= 0 || actor.hp / Math.max(1, actor.maxHp) > rest ||
          actor.tribulation?.stage === 'lightning' || actor.tribulation?.stage === 'heart_demon' ||
          world.sieges.some(({ status, participantIds }) => active(status) && participantIds.includes(actor.id)) ||
          world.occasions.some(({ status, participantIds }) => (status === 'running' || status === 'registration') && participantIds.includes(actor.id))) continue;
      overrides[actor.id] = { chosenAction: 'REST', innerMonologue: '压力测试：伤势较重，优先休整。' };
      report.supervisedRestOrders++;
    }
    const before = world;
    let completed: readonly WorldEvent[] = [];
    world = advanceWorldTick(before, rest ? overrides : undefined, undefined, 'utility', undefined, {
      captureTrace: false, capturePresentation: false,
      ...(populationScenario === 'baseline' ? { suppressAutoClanConsent: new Set(before.cultivators.map(actor => actor.id)) } : {}),
      onCompletedEvents: events => { completed = events; },
    });
    observe(before, completed);
  }
  if (report.extinctAtTick !== undefined) {
    report.violations.push({ tick: report.extinctAtTick, code: 'population_extinction' });
  }
  return report;
}

export interface BalanceTuningReport {
  seeds: number[]; steps: number; recommendedRestBelow: number;
  evaluations: Array<{ restBelow: number; score: number; reports: BalanceReport[] }>;
}

/** Bounded opt-in diagnostics. The score rewards across-seed survival with a penalty for invariants and rest overrides. */
export function tuneSimulationBalance({ seeds = [0, 2031], ticks, candidates = [0, .2, .35] }: {
  seeds?: readonly number[]; ticks?: number; candidates?: readonly number[];
} = {}): BalanceTuningReport {
  const steps = duration(ticks ?? 500);
  if (seeds.length < 1 || seeds.length > 5 || candidates.length < 1 || candidates.length > 5 ||
      new Set(seeds).size !== seeds.length || new Set(candidates).size !== candidates.length ||
      seeds.some((seed) => !checkNat(seed, 0xffffffff))) throw new RangeError('Use 1–5 distinct uint32 seeds and 1–5 distinct candidates.');
  const valid = candidates.map(threshold);
  const evaluations = valid.map((restBelow) => {
    const reports = seeds.map((seed) => runBalanceSimulation({ seed, ticks: steps, restBelow }));
    const minimum = Math.min(...reports.map(({ minimumLiving }) => minimumLiving));
    const average = reports.reduce((sum, row) => sum + row.finalLiving, 0) / reports.length;
    const faults = reports.reduce((sum, row) => sum + row.violations.length, 0);
    const adjustments = reports.reduce((sum, row) => sum + row.supervisedRestOrders, 0) / (steps * seeds.length);
    return { restBelow, score: minimum * 10 + average - 1000 * faults - adjustments, reports };
  }).sort((a, b) => b.score - a.score || a.restBelow - b.restBelow);
  return { seeds: [...seeds], steps, recommendedRestBelow: evaluations[0].restBelow, evaluations };
}

export function runSiegeBalanceFixture(seed = 2031) {
  let world = createInitialWorld(seed);
  const [own, enemy, ally] = world.sects;
  const lead = world.cultivators.find(({ id }) => id === own.leaderId)!;
  for (const actor of world.cultivators) {
    actor.locationId = world.sects.find(({ id }) => id === actor.sectId)!.headquartersId;
    actor.combatPower = actor.sectId === enemy.id ? 100 : 2_000;
  }
  world.diplomacy = [];
  const decide = (chosenAction: LLMDecisionPayload['chosenAction'], targetSectId: string) =>
    resolveDiplomacyAction(world, lead, { chosenAction, targetSectId, innerMonologue: '战事结算压力样本' });
  adjustSectAffinity(world, own.id, ally.id, 65);
  if (!decide('OFFER_ALLIANCE', ally.id)) throw new Error('Invalid siege fixture alliance.');
  adjustSectAffinity(world, own.id, enemy.id, -65);
  if (!decide('DECLARE_WAR', enemy.id)) throw new Error('Invalid siege fixture war.');
  world.tick += 3;
  const initialArray = 400;
  enemy.facilities.defense_array = 2;
  enemy.arrayMaxHp = enemy.arrayHp = initialArray;
  const beforeLaunch = own.spiritStones;
  if (!decide('LAUNCH_SIEGE', enemy.id)) throw new Error('Invalid siege fixture coalition.');
  const consumed = beforeLaunch - own.spiritStones;
  if (consumed !== SIEGE_COST) throw new Error('Siege launch did not consume the treasury fee.');
  const launched = world.sieges[0];
  const rest: Record<string, LLMDecisionPayload> = Object.fromEntries(world.cultivators.map(({ id }) =>
    [id,{ chosenAction: 'REST', innerMonologue: '本轮略去非围城冲突。' }]));
  for (let i = 0; i < 10 && (world.sieges[0].status === 'marching' || world.sieges[0].status === 'sieging'); i++) {
    world = advanceWorldTick(world, rest);
  }
  const final = world.sieges[0];
  const arrayAfter = world.sects.find(({ id }) => id === enemy.id)!.arrayHp;
  return { status: final.status, rounds: final.rounds, elapsed: world.tick - launched.startedTick,
    initialArray, arrayAfter, participants: [...launched.participantIds], consumed };
}
