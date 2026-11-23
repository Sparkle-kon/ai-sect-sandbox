# G0 参考实现指南：叙事导演 2.0、内容管线与生涯模式

> 本文给执行 G0 / G2 / G4 的开发者看，包含**设计要求、示意代码与验收样例**。
> 代码是**参考骨架**：函数签名、字段名请以仓库实际为准做适配，不必逐字照抄；但**接口思路、计数口径和验收标准必须遵守**。

---

## 0. 先读：为什么要重做

G1-1 初版导演的全部选项是「歇息 / 吐纳 / 说两句 / 沿熟路走」四种原有基础行动，外包六段氛围文字。它让"可交互次数"达标，但玩家体验没有变化。

**今后唯一的计数口径：高光（Highlight）**

> 玩家面对 **≥ 2 个结果不同的选项**，且至少一个选项会带来**普通行动不会产生的后果**：获得/失去法宝或功法、结下/断绝羁绊、重伤/破境/折寿、开启后续剧情、宗门或声望变化等。
> 「歇息 / 吐纳 / 交谈 / 赶路」四种基础行动本身**永远不算高光**。

---

## 1. 高光的类型定义

新建 `src/engine/director/highlight.ts`（路径可调整）：

```ts
/** 能进入导演候选池的玩法类型。新增玩法时在这里登记一个 kind。 */
export type HighlightKind =
  | 'encounter'      // 三选一奇遇（roguelikeEncounter / 新 Storylet）
  | 'heart_demon'    // 心魔劫抉择
  | 'tournament'     // 仙门大比报名/对阵
  | 'dungeon'        // 秘境入洞与层间抉择
  | 'auction'        // 拍卖会竞价
  | 'dao_path'       // 道途修习/剑意
  | 'forbidden_art'  // 绝境禁术
  | 'bond_reunion'   // 宿命羁绊重逢
  | 'quest'          // G2-3 任务委托（接取 / 完成 / 失败）
  | 'sequel';        // Storylet 跨月后续

/** 选项会带来的"非普通"后果标签。至少一个选项带标签才算高光。 */
export type ConsequenceTag =
  | 'item' | 'technique' | 'bond' | 'injury' | 'breakthrough'
  | 'lifespan' | 'reputation' | 'sect' | 'sequel' | 'death_risk' | 'stones_major';

export interface HighlightOptionPreview {
  readonly id: string;
  readonly label: string;              // 玩家可读，例如「上前接最后一剑」
  readonly consequences: readonly ConsequenceTag[];
}

export interface HighlightCandidate {
  readonly kind: HighlightKind;
  readonly sourceId: string;           // 原系统里的记录 id（奇遇 id、occasion id、拍卖 lot id…）
  readonly actorId: string;
  readonly siteId: string;
  readonly baseWeight: number;         // 来源自评的戏剧性 0–100
  readonly title: string;
  readonly teaser: string;             // 一两句场景引子
  readonly options: readonly HighlightOptionPreview[];
}

/** 唯一的高光判定函数。测试、文档、仪表盘全部用它计数。 */
export function isHighlight(candidate: HighlightCandidate): boolean {
  const distinct = new Set(candidate.options.map(option => option.id));
  return distinct.size >= 2 && candidate.options.some(option => option.consequences.length > 0);
}
```

---

## 2. 来源注册表：导演从真实玩法里"挑戏"

导演不自己发明玩法，而是向各个玩法系统**询问**"眼下这个人有没有能玩的事"，以及"如果想让事情发生，缺哪一环"。

```ts
import type { Cultivator, WorldState } from '../../types/world';
import type { HighlightCandidate, HighlightKind } from './highlight';
import type { DirectorNudge } from './nudge';

export interface HighlightSource {
  readonly kind: HighlightKind;
  /** 只读：当前这一刻对该角色真实可用的高光（来自原系统的 available* / active* 函数）。 */
  probe(world: WorldState, actor: Cultivator): readonly HighlightCandidate[];
  /**
   * 可选：如果现在没有，能否通过"影响未来"的方式促成？
   * 只能返回一个 nudge（见第 3 节），不得直接修改世界事实。
   */
  seed?(world: WorldState, actor: Cultivator): DirectorNudge | undefined;
}

export const HIGHLIGHT_SOURCES: readonly HighlightSource[] = [
  encounterSource,   // 见下方示例
  dungeonSource,
  auctionSource,
  heartDemonSource,
  bondReunionSource,
  tournamentSource,
  daoPathSource,
  forbiddenArtSource,
  questSource,       // G2-3 完成后注册
  sequelSource,      // Storylet 后续
];
```

### 2.1 示例：三选一奇遇

仓库现状：`maybeOpenRoguelikeEncounter` 只在角色 `EXPLORE` 抵达一条奇遇路线时开启；被附身者必开，NPC 只有 1/100。

```ts
import { activeRoguelikeEncounter, roguelikeEncounterRoute } from '../roguelikeEncounterEngine';
import { ROGUELIKE_ENCOUNTER_CATALOG } from '../roguelikeEncounterCatalog';

export const encounterSource: HighlightSource = {
  kind: 'encounter',
  probe(world, actor) {
    const row = activeRoguelikeEncounter(world, actor);
    if (!row || row.kind === 'sect-gate') return [];
    const words = ROGUELIKE_ENCOUNTER_CATALOG[row.kind];
    return [{
      kind: 'encounter', sourceId: row.id, actorId: actor.id, siteId: row.siteId,
      baseWeight: 70, title: words.title, teaser: words.scene,
      options: words.choices.map(choice => ({
        id: choice.choice, label: choice.label,
        consequences: choice.choice === 'leave' ? [] : ['breakthrough', 'lifespan', 'injury'],
      })),
    }];
  },
  seed(world, actor) {
    // 缺的那一环是"走上一条奇遇路线"。挑一个已知、安全、一回合可达、且属于奇遇路线的地点。
    const target = knownReachableSites(world, actor)
      .find(site => roguelikeEncounterRoute(world, actor.locationId, site.id));
    if (!target) return undefined;
    return {
      kind: 'encounter_ticket', actorId: actor.id, targetSiteId: target.id,
      reason: 'encounter', expiresTick: world.tick + 3,
    };
  },
};
```

配套改动（在 `maybeOpenRoguelikeEncounter` 里）：持有有效 `encounter_ticket` 的角色抵达目标地点时，**视同被附身者**，跳过 1/100 抽签。票据用一次即作废。

### 2.2 示例：秘境（让先兆出现在主角附近）

```ts
export const dungeonSource: HighlightSource = {
  kind: 'dungeon',
  probe(world, actor) {
    const moves = availableDungeonMoves(world, actor, world.tick + 1);
    if (moves.length < 2) return [];
    const occasion = activeDungeonForActor(world, actor)!;
    return [{
      kind: 'dungeon', sourceId: occasion.id, actorId: actor.id, siteId: occasion.locationId,
      baseWeight: 80, title: '星门之内', teaser: '古殿阵门微亮，药园的灵叶还带着露水。',
      options: moves.map(move => ({ id: move.id, label: move.label, consequences: dungeonTags(move) })),
    }];
  },
  seed(world, actor) {
    // 缺的是"附近有先兆"。下一次秘境先兆的生成位置偏向主角已知的灵脉/秘境。
    const site = knownReachableSites(world, actor).find(s => s.type === 'secret_realm' || s.type === 'spirit_vein');
    return site ? { kind: 'omen_bias', siteId: site.id, reason: 'dungeon', expiresTick: world.tick + 6 } : undefined;
  },
};
```

### 2.3 示例：宿命重逢（让 NPC 往主角那里走）

```ts
export const bondReunionSource: HighlightSource = {
  kind: 'bond_reunion',
  probe(world, actor) { /* 读取 dramaticBond / mercyReunion / apprenticeshipReunion 当前可用选项 */ return []; },
  seed(world, actor) {
    const partner = strongestOpenBond(world, actor);   // 有未了结的仇、恩、拒绝过的拜师……
    if (!partner || partner.locationId === actor.locationId) return undefined;
    return {
      kind: 'travel_bias', actorId: partner.id, targetSiteId: actor.locationId,
      weight: 35, reason: 'bond_reunion', expiresTick: world.tick + 6,
    };
  },
};
```

---

## 3. Nudge：只影响未来，不改写过去

这是"慷慨供给"与"事实可信"之间的唯一桥梁。

```ts
export type DirectorNudge =
  | { kind: 'travel_bias'; actorId: string; targetSiteId: string; weight: number; reason: HighlightKind; expiresTick: number }
  | { kind: 'encounter_ticket'; actorId: string; targetSiteId: string; reason: 'encounter'; expiresTick: number }
  | { kind: 'omen_bias'; siteId: string; reason: 'dungeon' | 'tournament'; expiresTick: number }
  | { kind: 'npc_accept_bias'; actorId: string; towardActorId: string; delta: number; reason: HighlightKind; expiresTick: number };
```

**规则**
1. 所有 nudge 存在**一个**字段里：`world.storyteller.nudges`（不要每种剧情加一个顶层字段）。
2. 生效点只有三处：
   - `heuristicDecision`（以及 Cognitive 候选排序）：`travel_bias` 给去目标地点的 `EXPLORE` 加权；`npc_accept_bias` 调整 NPC 对某人邀请的应允概率。
   - `maybeOpenRoguelikeEncounter`：消费 `encounter_ticket`。
   - 秘境/大比先兆生成：读取 `omen_bias` 选择位置。
3. 被附身/玩家控制的角色**不受** `travel_bias` 影响（不替玩家做决定），但可以在故事页看到"听说某地有动静"的提示。
4. 随机性用导演自己的稳定哈希（参考现有 `stableJitter`），**不消耗世界随机流**，保证同种子复现。
5. 过期自动清除；存档往返测试覆盖。

---

## 4. 导演每月的主流程

```ts
export function directMonth(world: WorldState, recentEvents: readonly WorldEvent[]): void {
  const state = world.storyteller;
  if (!state) return;
  advanceTension(world, state, recentEvents);           // 保留现有张力曲线
  pruneExpiredNudges(state, world.tick);

  const actor = canonicalFocus(world, state);           // 保留现有焦点逻辑
  if (!actor) return;

  // 1) 先看眼下有没有真实高光
  const candidates = HIGHLIGHT_SOURCES
    .flatMap(source => source.probe(world, actor))
    .filter(isHighlight);

  if (candidates.length > 0) {
    const best = pickWithVariety(candidates, state);    // 见下
    offerHighlight(state, best, world.tick);            // 首页/大盘展示、记入 pulse
    return;
  }

  // 2) 没有，而且快到节奏点了 → 主动促成
  const gap = world.tick - state.lastHighlightTick;
  if (gap >= cadenceOf(state.style) - 1) {
    const nudge = HIGHLIGHT_SOURCES
      .filter(source => source.seed && !recentlyUsedKind(state, source.kind))
      .map(source => source.seed!(world, actor))
      .find(Boolean);
    if (nudge) state.nudges = [...(state.nudges ?? []), nudge];
  }

  // 3) 仍可用原来六段氛围文字做"平常月过场"，但不计入高光
  maybeOfferQuietScene(world, state, actor);
}

/** 多样性：最近 3 次用过的 kind 降权，避免连续三次都是奇遇。 */
function pickWithVariety(candidates: readonly HighlightCandidate[], state: StorytellerDirectorState) {
  const recent = (state.highlights ?? []).slice(-3).map(row => row.kind);
  return [...candidates]
    .map(c => ({ c, score: c.baseWeight + toneBonus(state, c) - recent.filter(k => k === c.kind).length * 25 }))
    .sort((a, b) => b.score - a.score || (a.c.sourceId < b.c.sourceId ? -1 : 1))[0].c;
}
```

需要在 `StorytellerDirectorState` 上新增：`lastHighlightTick`、`highlights: {tick, kind, sourceId, actorId, chosen?: string, consequences?: ConsequenceTag[]}[]`（保留最近 120 条）、`nudges`。

---

## 5. 验收测试样例（G0-1）

```ts
import { describe, expect, it } from 'vitest';

function runDirectorLane(seed: number, style: StorytellerStyle, months: number) {
  let world = createWorldFromSeed(seed);
  configureStoryteller(world, style);
  const offered: { tick: number; kind: HighlightKind }[] = [];
  for (let i = 0; i < months; i++) {
    const offer = world.storyteller?.highlightOffer;
    // 脚本化玩家：总是选第一个"带后果"的选项，模拟有人在玩
    const orders = offer ? scriptedPick(world, offer) : undefined;
    world = advanceWorldTick(world, orders, undefined, 'utility');
    const latest = world.storyteller?.highlights?.at(-1);
    if (latest && latest.tick === world.tick) offered.push({ tick: latest.tick, kind: latest.kind });
  }
  return offered;
}

const maxGap = (rows: { tick: number }[]) =>
  rows.reduce((gap, row, i) => i === 0 ? gap : Math.max(gap, row.tick - rows[i - 1].tick), 0);

describe('叙事导演 2.0 高光供给', () => {
  it('江湖风波：120 月 ≥30 次、≥6 种、间隔 ≤4', () => {
    const rows = runDirectorLane(13071, 'wandering_jianghu', 120);
    expect(rows.length).toBeGreaterThanOrEqual(30);
    expect(new Set(rows.map(r => r.kind)).size).toBeGreaterThanOrEqual(6);
    expect(maxGap(rows)).toBeLessThanOrEqual(4);
  });
  it('静水流深 ≥15，天地大劫 ≥45', () => {
    expect(runDirectorLane(13071, 'still_water', 120).length).toBeGreaterThanOrEqual(15);
    expect(runDirectorLane(13071, 'great_calamity', 120).length).toBeGreaterThanOrEqual(45);
  });
  it('四种基础行动永不计入高光', () => {
    const quiet = { kind: 'encounter', options: [{ id: 'rest', consequences: [] }, { id: 'cultivate', consequences: [] }] };
    expect(isHighlight(quiet as never)).toBe(false);
  });
  it('同种子两次运行完全一致，且不消耗世界随机流', () => {
    expect(runDirectorLane(709, 'wandering_jianghu', 60)).toEqual(runDirectorLane(709, 'wandering_jianghu', 60));
  });
});
```

同时输出 `docs/director-highlights.md`：月份、类型、标题、可选项、玩家（脚本）选择、实际后果。

---

## 6. 通用 Storylet 内容管线（G4-2 / G2-3 共用）

### 6.1 一个通用存储字段，替代"每个剧情一个顶层字段"

```ts
export interface StoryletRuntimeState {
  /** 已开启、等待玩家或 NPC 选择的实例 */
  open: { id: string; storyletId: string; actorId: string; siteId: string; roles: Record<string, string>; openedTick: number; expiresTick: number }[];
  /** 跨月后续票据 */
  sequels: { storyletId: string; actorId: string; roles: Record<string, string>; dueTick: number; fromInstanceId: string }[];
  /** 最近结果，用于冷却与导演多样性 */
  history: { instanceId: string; storyletId: string; actorId: string; choice: string; tick: number }[];
}
// WorldState 上只新增：storylets?: StoryletRuntimeState
```

### 6.2 声明式效果描述符（规则层只认这些）

```ts
export type StoryletEffect =
  | { kind: 'qi'; amount: number }
  | { kind: 'hp_rate'; rate: number }                     // -0.15 = 损失 15% 最大气血
  | { kind: 'stones'; amount: number }
  | { kind: 'lifespan'; years: number }
  | { kind: 'karma'; amount: number }
  | { kind: 'affinity'; role: string; amount: number }
  | { kind: 'grant_artifact'; template: string }
  | { kind: 'grant_technique'; template: string }
  | { kind: 'sect_contribution'; amount: number }
  | { kind: 'schedule_sequel'; storyletId: string; afterMonths: readonly [number, number] }
  | { kind: 'chance'; percent: number; win: readonly StoryletEffect[]; lose: readonly StoryletEffect[] };
```

每个效果在执行时由规则层**按真实状态结算**（例如 `stones` 不能扣成负数，扣不起则该选项不可选），并生成事件记录。描述符本身就是数据，可以在存档校验里复算。

### 6.3 奇遇数据样例（G4-2，每条都是数据，不新写引擎文件）

```ts
export const NEW_ENCOUNTERS: readonly EncounterDefinition[] = [
  {
    id: 'broken-sword-stele', category: '游历',
    title: '断剑碑前', scene: '山道尽头立着半截石碑，碑上剑痕犹新，像是刚有人在此留下一式。',
    when: [{ kind: 'site_type', any: ['spirit_vein', 'sect_hq'] }, { kind: 'realm_at_most', realm: '金丹' }],
    roles: [{ id: 'lead', binder: { kind: 'actor' } }],
    stage: { backdrop: 'mountain_path', props: ['stele'] },
    choices: [
      { id: 'study', label: '静坐参碑三日', effects: [{ kind: 'chance', percent: 70,
        win: [{ kind: 'grant_technique', template: 'stele-sword-form' }], lose: [{ kind: 'qi', amount: -6 }] }] },
      { id: 'copy',  label: '拓下剑痕带走', effects: [{ kind: 'stones', amount: 30 }, { kind: 'karma', amount: -2 },
        { kind: 'schedule_sequel', storyletId: 'stele-owner-returns', afterMonths: [3, 8] }] },
      { id: 'leave', label: '拱手离去',     effects: [{ kind: 'karma', amount: 1 }] },
    ],
  },
  {
    id: 'stele-owner-returns', category: '仇杀', sequelOnly: true,
    title: '碑主寻来', scene: '那半截剑碑的主人找上门来，问你拓走的东西何在。',
    roles: [{ id: 'lead', binder: { kind: 'actor' } }, { id: 'owner', binder: { kind: 'stronger_local_cultivator' } }],
    stage: { backdrop: 'courtyard' },
    choices: [
      { id: 'return',    label: '奉还拓本，赔礼', effects: [{ kind: 'stones', amount: -30 }, { kind: 'affinity', role: 'owner', amount: 15 }] },
      { id: 'challenge', label: '拔剑相见',       effects: [{ kind: 'chance', percent: 40,
        win: [{ kind: 'grant_technique', template: 'stele-sword-form' }, { kind: 'affinity', role: 'owner', amount: -30 }],
        lose: [{ kind: 'hp_rate', rate: -0.35 }] }] },
      { id: 'flee',      label: '连夜远走',       effects: [{ kind: 'affinity', role: 'owner', amount: -20 }] },
    ],
  },
];
```

**注意**：`when` 条件要宽松（地点类型、境界上限、季节、身边有无人），**不要**写成"必须先有 A 事件、再有 B 事件、且 C 同意"。连续性交给 `schedule_sequel`。

### 6.4 任务模板样例（G2-3）

```ts
export const QUEST_TEMPLATES: readonly QuestTemplate[] = [
  {
    id: 'herb-delivery', board: 'sect_hall', title: '采药交付',
    brief: '丹房缺三株翡翠灵叶，限两月内交回。',
    accept: { realmAtLeast: '练气' },
    objective: { kind: 'deliver_item', item: '翡翠灵叶', count: 3, toSite: 'origin' },
    deadlineMonths: 2,
    reward: [{ kind: 'sect_contribution', amount: 20 }, { kind: 'stones', amount: 40 }],
    failure: [{ kind: 'sect_contribution', amount: -5 }],
  },
  {
    id: 'beast-cull', board: 'market_bounty', title: '除妖',
    brief: '村外妖兽伤人，坊市悬赏取其妖丹。',
    accept: { realmAtLeast: '筑基' },
    objective: { kind: 'defeat_beast', near: 'nearest_village' },
    deadlineMonths: 3,
    reward: [{ kind: 'stones', amount: 120 }, { kind: 'karma', amount: 3 }],
    failure: [{ kind: 'karma', amount: -1 }],
  },
];
```

任务的**接取、完成、失败**都要作为高光候选注册进导演（`kind: 'quest'`）。

---

## 7. 生涯模式骨架（G2-1 / G2-2）

```ts
export const ORIGINS = [
  { id: 'sect_disciple', label: '宗门弟子', sect: 'random_righteous', realm: '练气', stage: 3, stones: 40,  rank: '外门弟子' },
  { id: 'rogue',         label: '散修',     sect: null,               realm: '练气', stage: 5, stones: 120, rank: null },
  { id: 'village_youth', label: '凡村少年', sect: null,               realm: '练气', stage: 1, stones: 5,   rank: null, bonus: 'luck' },
  { id: 'clan_heir',     label: '世家子弟', sect: 'clan',             realm: '练气', stage: 4, stones: 300, rank: null },
  { id: 'demon_orphan',  label: '魔门遗孤', sect: 'sect-bloodmoon',   realm: '练气', stage: 2, stones: 20,  rank: '外门弟子', bonus: 'karma_dark' },
] as const;

export interface CareerState {
  readonly playerActorId: string;
  readonly originId: (typeof ORIGINS)[number]['id'];
  readonly startedTick: number;
  milestones: { id: string; tick: number }[];   // 'first_breakthrough' | 'foundation' | 'golden_core' | 'inner_disciple' ...
  fame: number;
}

/** 首页「仙途」卡的数据投影：只读。 */
export function projectCareerCard(world: WorldState) {
  const career = world.career; const actor = career && world.cultivators.find(a => a.id === career.playerActorId);
  if (!career || !actor) return undefined;
  return {
    name: actor.name, realm: `${actor.realm}${actor.realmStage}层`, qi: actor.qiProgress,
    lifespan: { age: actor.age, max: actor.lifespan },
    nextGoal: nextMilestone(career, actor),      // 例如「凝结金丹（灵气 82/100）」
    advice: monthlyAdvice(world, actor),          // 例如「丹霞谷本月开炉，可去换一枚筑基丹」
  };
}
```

---

## 8. G0-2 分类样例（只用一次提交完成）

| 系统 | 1,200 月实测 | 处理 | 做法 |
|---|---:|---|---|
| P22-2 拜师未果之后 | 0 | 导演促成 | 有"被拒"记录后，对双方之一发 `travel_bias`，一年内安排重逢 |
| P20-8 诸宗问鼎的誓师剧场 | 0 | 导演促成 | 宣战后对双方掌门发 `travel_bias` 到战场 |
| P20-3 灵兽护主 | 0 | 并入奇遇 | 改写为 Storylet：有灵宠者在险地遇袭即可触发 |
| P22-7 夜半叩门 | 0 | 并入奇遇 | 改写为「风雪借宿」奇遇，条件放宽为冬季 + 村落 |
| P21-4 夜渡引魂灯 | 0（需玩家主动） | 并入奇遇 | 有亡故旧识即可在任意水边触发 |
| P22-9 宗门终章之后 | 0 | 冻结 | 依赖宗门合并，过于罕见 |
| P19-5 宿缘重逢的主角交接 | 0 | 冻结 | 依赖主角自然退场 |

`docs/trigger-audit.md` 中"不应强行补齐的前因"一节删除，改为本表。

---

## 9. 反模式清单（出现即视为不合格）

- ❌ 把四种基础行动包装后计入高光。
- ❌ 一个任务拆成 A/B/C/D 多个子提交反复微调同一批数字。
- ❌ 为单个剧情新增顶层 `WorldState` 字段 + 三个硬编码文件。新内容必须是 Storylet 数据。
- ❌ 剧情条件写成"必须先有 A，再有 B，且 C 另轮同意"。连续性用 `schedule_sequel`。
- ❌ nudge 直接改已发生的事实（地点、生死、财物、关系历史）。nudge 只改未来倾向。
- ❌ 玩家界面出现"实付、托管、凭据、原生、不替、不补"。
- ❌ 用"可交互次数""选项数量"这类可以被凑出来的指标做验收；一律用 `isHighlight`。
