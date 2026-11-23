import { createInitialWorld } from '../src/data/initialWorld';
import { projectDirectorHighlight, resolveDirectorHighlight } from '../src/engine/director/directorHighlights';
import { isHighlight } from '../src/engine/director/highlight';
import { configureStoryteller } from '../src/engine/storytellerDirector';
import { settleAnnualCouncilOffline } from '../src/engine/councilRuntime';
import { settleChronicleOffline } from '../src/engine/chronicleRuntime';
import { decodeEraWorldSave, encodeEraWorldSave } from '../src/engine/storageEngine';
import { advanceWorldTick } from '../src/engine/worldEngine';
import { heartDemonResultEventId } from '../src/engine/heartDemonEngine';
import { forbiddenArtEventId } from '../src/engine/forbiddenArtEngine';
import { immortalAuctionEventId } from '../src/engine/immortalAuctionTerms';
import type { StorytellerStyle } from '../src/types/storytellerDirector';
import type { Cultivator, WorldEvent, WorldState } from '../src/types/world';

export const DIRECTOR_AUDIT_STYLES = [
  ['still_water', '静水流深', 15],
  ['wandering_jianghu', '江湖风波', 30],
  ['great_calamity', '天地大劫', 45],
] as const;
export type DirectorAuditLane = 'utility' | 'cognitive';
type Candidate = NonNullable<ReturnType<typeof projectDirectorHighlight>>;
interface AuditRow {
  readonly tick: number;
  readonly date: string;
  readonly kind: Candidate['kind'];
  readonly sourceId: string;
  readonly title: string;
  readonly options: readonly string[];
  readonly choice: string;
  readonly applied: boolean;
  readonly awaiting?: true;
  readonly observations: readonly string[];
}

function actor(world: WorldState, id: string): Cultivator | undefined {
  return world.cultivators.find(row => row.id === id);
}

function actorChanges(before: Cultivator | undefined, after: Cultivator | undefined): string[] {
  if (!before || !after) return [];
  const changes: Array<readonly [string, string | number | boolean, string | number | boolean]> = [
    ['气血', before.hp, after.hp], ['灵气', before.qiProgress, after.qiProgress],
    ['寿元', before.lifespan, after.lifespan], ['业力', before.karma, after.karma],
    ['灵石', before.spiritStones, after.spiritStones], ['宗门贡献', before.contribution, after.contribution],
    ['境界', `${before.realm} ${before.realmStage}`, `${after.realm} ${after.realmStage}`],
    ['门派', before.sectId, after.sectId], ['位阶', before.sectRank, after.sectRank],
    ['功法', before.technique.id ?? before.technique.name, after.technique.id ?? after.technique.name],
    ['法宝', before.artifacts.map(item => item.name).join('、'), after.artifacts.map(item => item.name).join('、')],
    ['存活', before.alive, after.alive],
  ];
  return changes.flatMap(([label, start, finish]) => start === finish ? [] : [`${label}：${start === '' ? '—' : start} → ${finish === '' ? '—' : finish}`]);
}

/** Only receipts tied to the exact chosen source/actor, never another ordinary act in that later month. */
function delayedReceipt(world: WorldState, candidate: Candidate, optionId: string, events: readonly WorldEvent[]): WorldEvent | undefined {
  const { kind, actorId, sourceId } = candidate;
  const history = world.storyteller?.highlights?.find(row => row.kind === kind && row.actorId === actorId &&
    row.sourceId === sourceId && row.tick === candidate.openedTick && row.chosen === optionId);
  const eventIds: string[] = history?.resolutionEventId && history.resolutionTick === world.tick ? [history.resolutionEventId] : [];
  if (kind === 'heart_demon') eventIds.push(heartDemonResultEventId(sourceId));
  if (kind === 'forbidden_art') eventIds.push(forbiddenArtEventId(sourceId));
  if (kind === 'dungeon') {
    const step = world.occasions.find(row => row.id === sourceId)?.dungeon?.steps.find(row =>
      row.actorId === actorId && row.move === optionId && row.tick === world.tick);
    if (step) eventIds.push(step.eventId);
    if (optionId === 'register') {
      const edition = world.occasions.find(row => `${row.id}-registration` === sourceId && row.participantIds.includes(actorId));
      if (edition) eventIds.push(`evt-${world.tick}-${edition.id}-join-${actorId}`);
    }
  }
  if (kind === 'auction') {
    if (optionId.startsWith('bid-')) {
      const bid = world.immortalAuction?.lots.find(row => row.id === sourceId)?.bids.find(row =>
        row.bidderId === actorId && row.tick === world.tick && optionId === `bid-${row.stones}`);
      if (bid) eventIds.push(immortalAuctionEventId(world.tick, sourceId, 'bid', actorId));
    } else if (optionId === 'withdraw') {
      const terminal = world.immortalAuction?.lots.find(row => row.id === sourceId && row.sellerId === actorId)?.terminal;
      if (terminal?.reason === 'withdrawn' && terminal.tick === world.tick) eventIds.push(terminal.eventId);
    } else if (optionId === 'consign_pill' || optionId === 'consign_artifact') {
      for (const lot of world.immortalAuction?.lots ?? []) {
        if (lot.sellerId !== actorId || lot.listedTick !== world.tick) continue;
        const assetSource = lot.asset.kind === 'artifact' ? `artifact:${lot.asset.artifactId}` : `pill:${lot.asset.pillId}`;
        if (assetSource === sourceId && optionId === `consign_${lot.asset.kind}`)
          eventIds.push(immortalAuctionEventId(world.tick, lot.id, 'consign', actorId));
      }
    }
  }
  return events.find(event => event.tick === world.tick && eventIds.includes(event.id) && event.actorIds.includes(actorId));
}

export function runDirectorHighlightsAudit({
  seed = 13071, months = 120, style, lane = 'utility', reloadAfterMonth,
}: {
  readonly seed?: number;
  readonly months?: number;
  readonly style: StorytellerStyle;
  readonly lane?: DirectorAuditLane;
  /** Optional production save/restore checkpoint; traces before and after must remain comparable. */
  readonly reloadAfterMonth?: number;
}) {
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(months) || months < 1)
    throw new Error('Director audit requires an integer seed and a positive integer month count.');
  if (reloadAfterMonth !== undefined && (!Number.isSafeInteger(reloadAfterMonth) || reloadAfterMonth < 1 || reloadAfterMonth >= months))
    throw new Error('Director audit reload must be after a completed month but before the end.');
  let world = createInitialWorld(seed);
  if (!configureStoryteller(world, style)) throw new Error('Cannot configure the audited director.');
  const startTick = world.tick;
  const seen = new Set<string>();
  const rows: AuditRow[] = [];
  function advance(before: WorldState, onCompletedEvents?: (events: readonly WorldEvent[]) => void) {
    const after = advanceWorldTick(before, undefined, undefined,
      lane === 'utility' ? 'utility' : 'deferred', undefined,
      { captureTrace: false, capturePresentation: false, onCompletedEvents });
    const month = before.month % 12 + 1;
    if (after.tick !== before.tick + 1 || after.month !== month ||
        after.year !== before.year + Number(month === 1)) {
      throw new Error(`Director audit did not complete one native month at tick ${before.tick + 1}.`);
    }
    // Cognitive defers the annual council and chronicle; use their canonical offline settlement, without asking a provider.
    if (lane === 'cognitive') {
      settleAnnualCouncilOffline(after);
      settleChronicleOffline(after);
    }
    return after;
  }
  let pending: { readonly candidate: Candidate; readonly optionId: string; readonly rowIndex: number } | undefined;
  for (let i = 0; i < months; i++) {
    const previousMonth = world;
    const completedEvents: { rows?: readonly WorldEvent[] } = {};
    world = advance(world, pending ? events => { completedEvents.rows = events; } : undefined);
    if (pending) {
      const { candidate, optionId, rowIndex } = pending;
      const { awaiting: _awaiting, ...row } = rows[rowIndex];
      const nativeResult = delayedReceipt(world, candidate, optionId, completedEvents.rows ?? []);
      const previousActor = actor(previousMonth, candidate.actorId);
      const currentActor = actor(world, candidate.actorId);
      const interruption = previousActor?.alive && currentActor && !currentActor.alive ? '当事人次月身故，此选未结算' :
        previousActor && currentActor && previousActor.locationId !== currentActor.locationId ? '当事人次月已离开原处，此选未结算' :
          '次月未找到与此选择相符的结算记录';
      rows[rowIndex] = nativeResult ? {
        ...row, applied: true, observations: [...row.observations, `次月：${nativeResult.title}：${nativeResult.description}`],
      } : { ...row, observations: [...row.observations, interruption] };
      pending = undefined;
    }
    const offer = projectDirectorHighlight(world);
    if (!offer || !isHighlight(offer)) {
      if (i + 1 === reloadAfterMonth) world = decodeEraWorldSave(encodeEraWorldSave(world));
      continue;
    }
    // The physical actor's legal opportunity is the unit; a card reappearing for that actor is not a new source.
    const identity = JSON.stringify([offer.kind, offer.sourceId, offer.actorId]);
    if (seen.has(identity)) {
      if (i + 1 === reloadAfterMonth) world = decodeEraWorldSave(encodeEraWorldSave(world));
      continue;
    }
    seen.add(identity);
    const choice = offer.options.find(option => option.consequences.length > 0);
    if (!choice) throw new Error('A high point was admitted without a consequential branch.');
    const before = world;
    const picked = resolveDirectorHighlight(before, offer.key, choice.id);
    const applied = picked !== before;
    const previousIds = new Set(before.events.map(event => event.id));
    const sameMonth = applied
      ? picked.events.filter(event => event.tick === picked.tick && !previousIds.has(event.id) && event.actorIds.includes(offer.actorId))
      : [];
    const observations = [
      ...sameMonth.map(event => `${event.title}：${event.description}`),
      ...(applied ? actorChanges(actor(before, offer.actorId), actor(picked, offer.actorId)) : []),
    ];
    const deferred = applied && (picked.storyteller?.pendingHighlightChoice?.optionId === choice.id ||
      offer.kind === 'heart_demon' && actor(picked, offer.actorId)?.tribulation?.heartDemon?.queued?.choice === choice.id ||
      offer.kind === 'forbidden_art' && sameMonth.length === 0);
    if (deferred) pending = { candidate: offer, optionId: choice.id, rowIndex: rows.length };
    if (!applied) observations.push('高光已见，原有规则未接纳这一选择');
    rows.push({
      tick: offer.openedTick, date: `第 ${before.year} 年 ${before.month} 月`, kind: offer.kind,
      sourceId: offer.sourceId, title: offer.title, options: offer.options.map(option => option.label),
      choice: choice.label, applied: applied && !deferred, observations, ...(deferred ? { awaiting: true } : {}),
    });
    world = i + 1 === reloadAfterMonth ? decodeEraWorldSave(encodeEraWorldSave(picked)) : picked;
  }
  const ticks = [startTick, ...rows.map(row => row.tick), world.tick];
  return {
    seed, months, style, startTick, endTick: world.tick, completedMonths: world.tick - startTick, rows,
    kinds: [...new Set(rows.map(row => row.kind))].sort(),
    maxGap: ticks.slice(1).reduce((gap, tick, i) => Math.max(gap, tick - ticks[i]), 0),
    finalRandom: world.random.state,
  };
}

type AuditResult = ReturnType<typeof runDirectorHighlightsAudit>;
export function renderDirectorHighlightsAudit(results: readonly AuditResult[]): string {
  const cell = (value: string) => value.replaceAll('|', '\\|').replace(/[\r\n]+/gu, ' ');
  return [
    '# 天道高光实测',
    '',
    '复跑：`npx vite-node scripts/printDirectorHighlightsAudit.ts > docs/director-highlights.md`。',
    '',
    '固定种子，实际逐月推进。只统计通过 `isHighlight` 且首次向该角色展示的玩法来源；每次选第一个带机制后果的选项。表中的后果是结算后观测到的记录，不是选项描述承诺的效果。',
    '本报告使用 Utility 推演；另用 Cognitive 月步入口、无模型建议与官方离线结算进行配对回归，因此不声称任意模型会做出相同选择。',
    '',
    '| 风格 | 月数 | 高光 | 已结算 | 类型 | 最大间隔（含首尾） |',
    '|---|---:|---:|---:|---:|---:|',
    ...results.map(result => `| ${DIRECTOR_AUDIT_STYLES.find(([style]) => style === result.style)?.[1] ?? result.style} | ${result.completedMonths} | ${result.rows.length} | ${result.rows.filter(row => row.applied && row.observations.length > 0).length} | ${result.kinds.length} | ${result.maxGap} |`),
    ...results.flatMap(result => [
      '', `## ${DIRECTOR_AUDIT_STYLES.find(([style]) => style === result.style)?.[1] ?? result.style}（种子 ${result.seed}）`, '',
      '| 月份 | 类型／发生的事 | 来源 | 可选项 | 实选 | 结算后观测 |',
      '|---|---|---|---|---|---|',
      ...result.rows.map(row => `| ${row.date} | ${cell(`${row.kind}／${row.title}`)} | ${cell(row.sourceId)} | ${cell(row.options.join('；'))} | ${cell(row.choice)} | ${cell(row.observations.join('；') || (row.awaiting ? '截止月已选，尚未推进至结算月' : row.applied ? '未捕捉到当月变化' : '指令未被接纳'))} |`),
    ]),
  ].join('\n');
}
