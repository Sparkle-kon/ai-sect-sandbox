# H6 设计指南：让笑话真的发生

> 评估时间：2026-11-24 11:50，代码版本 `f426a82`。
> H 线 20 项已全部完成，结构正确、台词写得好。但有两个硬伤让它依然"不好玩"。本指南给出改法、示例数据与验收口径。代码为参考骨架，签名以仓库实际为准。

---

## 0. 问题与数据

### 0.1 笑话只停在嘴上

统计 `src/data/sectComedy/` 全部 86 条桥段：

| 指标 | 数量 |
|---|---|
| 完全没有后果（`effects: []`） | **68** |
| 有后果 | 18：17 条灵气 ±1/±2，1 条饭堂受损 |
| 招到人 / 得失物品 / 结仇结交 / 留下后续 | **0** |
| 两怪癖组合桥段 | 全部是闲聊，无后果 |

而且类型定义把后果锁死了：`SectComedyEffect` 只允许 `qi: -2|-1|1|2` 和 `kitchen_damage: 1`。

汇报文也写得很虚。例如 `work-gather-lost-windfall`：
> 汇报：采药一趟另有进益。弟子请先看结果，再听自己怎么走的。
> 后果：无

设计指南的招牌例子（路痴吃货走进魔宗后厨，带回一个魔宗厨子）没有实现。

**根因**：执行者坚持"旁白不能写没发生的事"，于是把所有好笑的东西都塞进弟子的一句台词。
**正确理解**：真实性原则要求的是**旁白不能虚构**，不是**世界里不能发生好笑的事**。解决办法是**让桥段通过规则真的在世界里制造后果**——事情真的发生了，旁白就可以如实地、具体地写出来。

### 0.2 最有意思的差事，第一个月都在赶路

6 个种子 × 2 个起手宗门新开 12 局，统计开局第一个月每个差事能否直接办：

| 差事 | 第一个月 |
|---|---|
| 采药、闭关、掌勺 | 可直接办 |
| 看守山门 | 42 人次中 24 次不可派（山门未修） |
| 历练、摆摊、送货、招新、踢馆、联谊 | **100% 在路上** |

H5-3 试玩验收只派了三次"闭关"，慢差事基本没被验到。

---

## 1. 原则：桥段 = 一个真实发生的小事件

```
怪癖 × 差事 × 结果档位  ──▶  选中桥段  ──▶  规则层结算桥段后果（真实改变世界）
                                         │
                                         ├─▶ 汇报文：如实写出发生了什么（谁、在哪、干了什么、带回了什么）
                                         ├─▶ 弟子台词：负责嘴硬、甩锅、吹牛（笑点）
                                         ├─▶ 群聊：别人怎么议论（可夸张）
                                         └─▶ 后续：几个月后有人找上门
```

- **汇报文写事实**，必须具体：出现人名、地名、物品名、数量。
- **台词负责笑**：弟子怎么解释这件事。
- **群聊负责发酵**：别宗、坊市、王掌柜怎么看。
- **后续负责回味**：同一件事过几个月还有下文。

---

## 2. 扩展后果类型

```ts
export type SectComedyEffect =
  | { kind: 'qi'; amount: number }                                   // 去掉 ±2 上限，按档位给 -10~+15
  | { kind: 'stones'; amount: number }                               // 本宗公库，扣不起则该桥段不可选
  | { kind: 'herb'; herb: HerbId; amount: number }                   // 带回 / 丢失灵草
  | { kind: 'item'; template: ComedyItemTemplate }                   // 奇怪的东西：魔宗铁锅、半截剑碑拓本、会说话的葫芦
  | { kind: 'injury'; rate: number }                                 // 损失最大气血比例
  | { kind: 'building_damage'; building: BuildingId; amount: 1 }     // 任意建筑，不止饭堂
  | { kind: 'sect_relation'; target: 'rival' | 'bloodmoon' | 'host_sect'; amount: number }
  | { kind: 'fame'; amount: number }                                 // 宗门名望
  | { kind: 'debt'; amount: number }                                 // 欠王掌柜的钱增减
  | { kind: 'recruit'; template: ComedyRecruitTemplate }             // 招来一个怪人（带怪癖的新弟子）
  | { kind: 'pet'; template: 'pill-cat' | 'lost-crane' | 'fat-goose' } // 收养灵宠
  | { kind: 'visit'; npc: RecurringNpcId; afterMonths: [number, number]; reason: string } // 固定角色上门
  | { kind: 'sequel'; templateId: string; afterMonths: [number, number] }                // 后续桥段
  | { kind: 'rumor'; group: ChatGroupId; line: string };            // 往群里放一条传闻（角色发言层）
```

### 2.1 结算骨架

```ts
export function applyComedyEffects(world: WorldState, moment: ComedyContext, effects: readonly SectComedyEffect[]): AppliedEffect[] {
  // 1) 先整体校验：任何一项结算不了（例如灵石不够扣），整条桥段换成同档位的备选，而不是只结算一半
  if (!effects.every(effect => canApply(world, moment, effect))) return [];
  // 2) 逐项结算，全部走现有规则函数（扣灵石、加灵草、伤势、关系、招人……）
  return effects.map(effect => applyOne(world, moment, effect));
}

function applyOne(world: WorldState, ctx: ComedyContext, effect: SectComedyEffect): AppliedEffect {
  switch (effect.kind) {
    case 'recruit': {
      // 生成一名带怪癖的新弟子，复用 starterSectWorld 的人物生成；记录来历（"从血月魔宗后厨跟回来的"）
      const person = spawnComedyRecruit(world, ctx, effect.template);
      return { kind: 'recruit', actorId: person.id, origin: COMEDY_RECRUITS[effect.template].origin };
    }
    case 'visit':
      scheduleRecurringVisit(world, effect.npc, ctx.tick + pickMonths(world, ctx, effect.afterMonths), effect.reason, ctx.momentId);
      return { kind: 'visit', npc: effect.npc };
    case 'sequel':
      scheduleComedySequel(world, effect.templateId, ctx, pickMonths(world, ctx, effect.afterMonths));
      return { kind: 'sequel', templateId: effect.templateId };
    // ……其余各项调用现有规则函数
  }
}
```

所有后续（`visit`、`sequel`）存在**一个**字段里，例如 `world.sectComedy.pending`，不要每种后续一个顶层字段。

---

## 3. 桥段改写示例

### 3.1 前后对比

```ts
// ❌ 现在
{ id: 'work-gather-lost-windfall', match: { phase: 'performed', job: 'gather', tier: 'windfall', quirks: ['lost'] },
  report: '采药一趟另有进益。弟子请先看结果，再听自己怎么走的。',
  quote: '掌门，要画路图也成。能不能先定个规矩，纸上没有哪头算北？',
  effects: [] },

// ✅ 改后
{ id: 'work-gather-lost-windfall', match: { phase: 'performed', job: 'gather', tier: 'windfall', quirks: ['lost'] },
  report: '{name}采药迷了路，误入{rivalSect}的药园，背回来满满一篓星辉花。药园门口的木牌上写着「私产，擅入者打断腿」。',
  quote: '掌门，那木牌立得太矮了，弟子是先采完才看见的。',
  effects: [
    { kind: 'herb', herb: 'star_bloom', amount: 3 },
    { kind: 'sect_relation', target: 'rival', amount: -8 },
    { kind: 'visit', npc: 'rival-leader', afterMonths: [1, 3], reason: 'stolen_herbs' },
  ],
  chatHook: { group: 'jiuzhou', speaker: 'rival-leader', line: '哪家弟子半夜进我药园？篓子上还绣着字。' },
  animation: 'sparkle' },
```

### 3.2 更多样例

```ts
export const COMEDY_SITUATIONS: readonly SectComedyTemplate[] = [
  {
    id: 'combo-glutton-lost-demon-cook', match: { phase: 'performed', job: 'any_away', tier: 'windfall', quirks: ['glutton', 'lost'] },
    report: '{name}循着肉香走了三天，走进了血月魔宗的后厨。回来时扛着一口铁锅，身后跟着一个系围裙的魔宗厨子。',
    quote: '他说魔宗一个月才开一次荤。咱们这儿虽穷，至少饭堂有锅。',
    effects: [
      { kind: 'recruit', template: 'demon-sect-cook' },
      { kind: 'item', template: 'demon-iron-wok' },
      { kind: 'sect_relation', target: 'bloodmoon', amount: -5 },
      { kind: 'sequel', templateId: 'sequel-bloodmoon-wants-cook-back', afterMonths: [2, 5] },
    ],
    chatHook: { group: 'jiuzhou', speaker: 'sect-bloodmoon.leader', line: '本座的厨子呢？？' },
  },
  {
    id: 'sequel-bloodmoon-wants-cook-back', match: { phase: 'sequel' },
    report: '血月魔宗派了两名弟子上门，要把厨子领回去。厨子躲在灶台后面，说什么也不肯走。',
    quote: '（魔宗厨子）我在这儿每天都能吃上自己做的饭，你们那儿只让我做，不让我吃！',
    choices: [
      { id: 'keep', label: '护着厨子', effects: [{ kind: 'sect_relation', target: 'bloodmoon', amount: -10 }, { kind: 'fame', amount: 3 }] },
      { id: 'trade', label: '让魔宗拿灵石来换', effects: [{ kind: 'stones', amount: 60 }, { kind: 'remove_recruit', template: 'demon-sect-cook' }] },
      { id: 'feast', label: '请两位魔宗弟子吃顿饭再说', effects: [{ kind: 'herb', herb: 'jade_leaf', amount: -1 }, { kind: 'sect_relation', target: 'bloodmoon', amount: 5 }] },
    ],
  },
  {
    id: 'work-kitchen-glutton-mishap', match: { phase: 'performed', job: 'kitchen', tier: 'mishap', quirks: ['glutton'] },
    report: '{name}想试试用三昧真火炖肉。饭堂的屋顶飞出去半截，肉倒是炖得极烂。',
    quote: '……要不咱们这个月露天吃？',
    effects: [{ kind: 'building_damage', building: 'kitchen', amount: 1 }, { kind: 'qi', amount: 4 }],
    chatHook: { group: 'own', speaker: 'random_disciple', line: '饭堂炸了。但我吃到了这辈子最好吃的红烧肉。' },
    animation: 'smoke',
  },
  {
    id: 'work-stall-shy-windfall', match: { phase: 'performed', job: 'stall', tier: 'windfall', quirks: ['shy'] },
    report: '{name}在坊市摆了一天摊，一句话没说。路人以为是隐世高人在考校缘法，四十灵石的货卖了一百二。',
    quote: '……他们为什么都对我行礼？',
    effects: [{ kind: 'stones', amount: 80 }, { kind: 'fame', amount: 2 }],
  },
  {
    id: 'work-guard-jinx-mishap', match: { phase: 'performed', job: 'guard', tier: 'mishap', quirks: ['jinx'] },
    report: '{name}守山门时随口说了句"今晚肯定没贼"。半夜丹房少了一枚筑基丹，地上一串梅花脚印。',
    quote: '弟子说的是"没贼"，没说"没猫"。',
    effects: [{ kind: 'item_loss', item: '筑基丹', amount: 1 }, { kind: 'visit', npc: 'pill-cat', afterMonths: [2, 4], reason: 'more_pills' }],
  },
  {
    id: 'work-recruit-chatterbox-windfall', match: { phase: 'performed', job: 'recruit', tier: 'windfall', quirks: ['chatterbox'] },
    report: '{name}在村口讲了一整天宗门的好处，把一个原本只想讨碗水喝的落第书生说动了心。',
    quote: '弟子也没夸大，只是把漏雨说成了"天人感应"。',
    effects: [{ kind: 'recruit', template: 'failed-scholar' }],
  },
];
```

### 3.3 招来的怪人（数据样例）

```ts
export const COMEDY_RECRUITS = {
  'demon-sect-cook':   { name: '屠大勺', origin: '从血月魔宗后厨跟回来的厨子', quirks: ['glutton'], realm: '练气', bonus: { kitchen: 30 } },
  'failed-scholar':    { name: '孔落第', origin: '考了七次没中的书生',         quirks: ['chatterbox', 'contrarian'], realm: '练气', bonus: { recruit: 15 } },
  'runaway-princess':  { name: '赵小满', origin: '离家出走的世家小姐',         quirks: ['drama', 'miser'], realm: '练气', bonus: { stall: 20 } },
  'retired-assassin':  { name: '无名',   origin: '自称退休的刺客，只想种花',   quirks: ['shy', 'neat_freak'], realm: '筑基', bonus: { guard: 30 } },
} as const;
```

---

## 4. 汇报文写作规则

| 好的汇报文 | 坏的汇报文 |
|---|---|
| 写清楚谁、在哪、干了什么、带回了什么 | "另有进益""有些不顺""请先看结果" |
| 出现具体人名、地名、物品、数量 | 只说结果档位 |
| 事实由旁白交代，笑点交给台词 | 旁白自己解释笑点 |
| 不加免责句 | "到村不等于收徒""摆好货也不等于卖出" |

---

## 5. 差事当月办完

把外出差事（历练、摆摊、送货、招新、踢馆、联谊）改成**当月往返的跑腿**：

```ts
type SectJobPlan =
  | { kind: 'native'; phase: 'performed'; decision: LLMDecisionPayload; siteId: string }
  | { kind: 'chore'; ... }
  | { kind: 'errand'; destinationId: string; route: string[]; returnHome: true }   // 新增
  | { kind: 'blocked'; reason: string };

function planErrand(world: WorldState, actor: Cultivator, job: SectJobId): SectJobPlan {
  const target = pickErrandDestination(world, actor, job);   // 坊市 / 村社 / 别宗山门 / 可去的历练地
  if (!target) return { kind: 'blocked', reason: ERRAND_BLOCK_TEXT[job] };
  return { kind: 'errand', destinationId: target.id, route: shortestKnownRoute(world, actor, target), returnHome: true };
}
```

- 这个月里：出门 → 在目的地办事并结算 → 回山。地图画出这一趟的往返轨迹。
- 路上风险照常结算（沿途灾害、遇兽），出事就变成 `mishap` 或 `disaster`，不是"还在路上"。
- 踢馆：对方 AI 当月决定接不接，不接就是"吃了闭门羹"的 `mishap` 桥段，同样有笑点和后果。
- 招新：当月有结果（招到 / 没招到 / 招来怪人）。
- 山门值守：开局即可派（起手宗门山门至少 1 级，或允许在大殿值守）。

---

## 6. 庭院日常生气

- 没派工时弟子在庭院里闲逛、扫地、打盹、凑在一起说话，头顶偶尔冒出 `ambient` 桥段的一句话。
- **点一下弟子**：冒出一句符合怪癖的话（不推进时间，不改世界）。
- **偷丹灵猫**：有 `pill-cat` 待访时，庭院里能看到它溜进丹房；点它可以吓跑（下次再来）或喂它（好感 +1，好感满了可收为灵宠）。
- 动画低频持续，可见时才播放，尊重减弱动态。

---

## 7. 大模型写回山汇报（Token 主要去处）

配置了 API 就**默认开启**，可在设置里关闭。

```ts
const system = `你是修仙宗门里的记事弟子，为掌门写回山汇报。
基调：古风措辞打底，句末可以带一点反差和吐槽，适度幽默，不用网络烂梗。
只能使用下面给出的事实（人名、地名、物品、数量、后果），不得新增事件、物品或伤亡。
写 80–150 字的一段汇报，再给出弟子本人的一句台词（不超过 40 字）。
输出 JSON：{"report":"...","quote":"..."}`;

const user = JSON.stringify({
  disciple: { name, quirks: quirkNames, personality, realm },
  job: jobLabel, tier, siteName,
  facts: appliedEffects.map(describeEffectForPrompt),   // 例如「带回星辉花 3 株」「与三尺门交情 -8」
  templateHint: { report: template.report, quote: template.quote },
});
```

- 校验：输出里出现的人名、地名、物品必须都在 `facts` 或白名单里，否则回退模板文本。
- 每月最多 N 次调用（按派工人数），计入 Token 仪表盘。
- 测试用模拟响应。

---

## 8. 验收

1. **桥段后果**：≥ 70% 桥段至少有一项"灵气以外"的后果；≥ 20 条带 `sequel` 或 `visit`；组合桥段 ≥ 10 条且全部有后果。
2. **差事当月办完**：12 局开局统计（6 种子 × 2 起手宗门），10 种基础差事第一个月都能直接办（除非建筑等级确实不够且界面写明原因），没有"还在路上"。
3. **12 个月脚本试玩**：每月给所有弟子轮换派不同差事，输出 `docs/h6-playtest.md`，记录每月汇报、后果、后续触发。要求：
   - 有实际后果的喜剧事件 ≥ 10 次；
   - 后续 / 上门 ≥ 3 次真正触发；
   - 至少 1 次通过桥段招到怪人；
   - 固定角色上门 ≥ 3 次，且台词引用旧事。
4. **文案**：玩家界面与 CHANGELOG 不出现免责式句子（"……不等于……""不算……""照样算数"）。
5. `npm run verify` 全绿，同种子同派工结果可复现（大模型文字除外，其结构化后果必须可复现）。

---

## 9. 反模式

- ❌ 把后果数值锁在 ±1、±2，让桥段等于没发生。
- ❌ 汇报文写"另有进益""有些不顺"这类空话。
- ❌ 用免责句解释"什么不算"。
- ❌ 有意思的差事要赶一个月路才开始办。
- ❌ 为每种后续新增一个顶层 `WorldState` 字段。
