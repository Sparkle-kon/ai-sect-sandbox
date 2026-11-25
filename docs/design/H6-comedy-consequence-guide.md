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

### 0.3 "每月点 19 次"的操作地狱与"5/6 空白汇报"（源码级定位）

逐行审计 UI 与结算代码，定位到玩家抱怨"都是一个个点来点去，毫无沉浸感和喜感"的四个直接代码根因：

1. **派工每月清空 + 桌面端藏起弟子列表（`src/components/SectMorningBoard.tsx`）**：
   - 第 75 行：`const draftOrders = draft?.world === world ? draft.orders : empty;` —— 因为 `draft` 绑定了 `world` 引用，每过一个月 `world` 更新，**上月派好的差事全部归零**！6 个弟子每月都要重新点选 6 次弟子 + 6 次差事牌（12 次点击）。
   - 第 181 行：`<ul className="mb-2 flex flex-wrap gap-1.5 lg:hidden" aria-label="庭院弟子">` —— 桌面端（`lg` 以上）居然把弟子列表 `lg:hidden` 隐藏了，逼玩家在庭院画布里找浮动小字点人！
2. **月末强制点 6 次「下一位」，且 5/6 的弟子没有桥段（`src/components/SectJobReportStage.tsx` + `src/engine/sectComedy.ts`）**：
   - `sectComedy.ts` 第 128 行：`settleSectComedyMonth` 每月**全宗门只挑 1 条桥段（`candidates[0]`）**！
   - 结果在 `SectJobReportStage.tsx` 的单人翻页器（`第 1 / 6 位` → 点 6 次「下一位」）中，**6 个弟子只有 1 个人有 `sceneComic`**，其余 5 个人全部退化为 `sectJobReportPresentation.ts` 第 41 行的 4 句公文套话（`"掌门，弟子照吩咐办了，且向您交代一声。"`）！
   - 12 次派工点击 + 1 次过月 + 6 次翻页 = **每月重复点击 19 次，却只看到 5 页公文和 1 页无后果闲聊**。
3. **`sectChat.ts` 第 305 行把喜剧 `chatHook` 自我阉割成了废话**：
   - `src/engine/sectChat.ts` 第 305 行写着：
     ```ts
     text = template.match.phase==='ambient' && !/[{}]/.test(template.chatHook.line)
       ? template.chatHook.line
       : COMIC_NEUTRAL[post.variant];
     ```
   - 这行代码导致**所有差事桥段（`phase !== 'ambient'`）以及所有带 `{name}` / `{site}` / `{job}` 的 `chatHook.line` 被当场丢弃**，全部替换成了 `COMIC_NEUTRAL` 那 4 句毫无意义的茶馆废话（`"且留一句闲笔。话写得太满，下个月的我不好落款。"`）！
4. **群聊、直播弹幕、小报丢人榜写成了"安监局公文"（`sectChatVoices.ts` / `sectLiveLines.ts` / `tianjiTabloid.ts`）**：
   - `sectChatVoices.ts` 第 19–22 行：群聊见闻全是 `"听闻「{title}」。我没在场，先把这句传话记在边上。"`。
   - `sectLiveLines.ts` 第 9 行：炸炉直播弹幕居然是 `"先看人有无大碍，再来算这一炉账。"`。
   - `tianjiTabloid.ts` 第 117 行：江湖小报丢人榜连炸炉弟子的名字都不写，只写 `"炉先响了，丹没出炉。本报只记这声响，不拿伤势取笑。"`。
   - `SectChatPanel.tsx` 第 17 行：`WIDE = '(min-width: 1440px)'` 导致 1280px/1366px 常规笔记本屏幕默认把群聊收起在页面最底下，根本看不见。

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

## 6. 彻底消灭"每月点 19 次"与"群聊自我阉割"（必改代码点）

### 6.1 晨会派工默认沿用上月 + 桌面端常驻弟子排班表（`SectMorningBoard.tsx`）

1. **默认继承上月差事**：
   - 不要在 `world` 翻月后把 `draftOrders` 重置为空 `Map`（修掉 `SectMorningBoard.tsx:75`）。
   - 新月份打开晨会时，自动读取每位弟子上月的差事（若该差事本月仍可派，直接预填入 `draftOrders`），并提供「一键沿用上月差事，直接过一个月」快捷操作。玩家只需要调整想改的那 1–2 个弟子，**每月操作从 12 次点击降为 1 次点击**。
2. **桌面端显示清晰弟子名册与怪癖标签**：
   - 去掉 `SectMorningBoard.tsx:181` 的 `lg:hidden` 隐藏逻辑！在所有屏幕尺寸下都清晰展示弟子排班列表（头像 + 姓名 + 怪癖标签 + 当前预派差事 + 快捷切换），同时保留画布点选/拖拽。

### 6.2 月末回话改为"焦点大戏 + 同屏一览"，废除强制点 6 次「下一位」（`SectJobReportStage.tsx` + `sectComedy.ts`）

1. **一屏看完全宗月末汇报（`SectJobReportStage.tsx`）**：
   - 把现在强制点 6 次「下一位」的单人翻页器，改为**一屏总览的《月末回山简报》**：
     - **顶部「本月焦点奇遇」（1–2 桩）**：大立绘表情 + 动画反应 + 完整桥段汇报文 + 弟子嘴硬金句 + 结构化得失标签（若有后续选泽则直接在卡片上展示 2–3 个抉择按钮）。
     - **下方「同门差事一览」**：其余弟子以紧凑卡片/列表同屏展示，**每个人都有根据其怪癖 × 差事 × 档位生成的具体一句话事由与个性回话**（彻底删除 `sectJobReportPresentation.ts:41` 里那 4 句干瘪的 `plain[tier]` 公文套话！）。
     - 底部只需 **1 个主按钮（「知道了，回晨会」）** 即可翻篇（保留点击任意弟子切换顶部大立绘查看详情的能力，但绝不强制点 6 次「下一位」）。

### 6.3 修复 `sectChat.ts:305` 自我阉割 Bug，重做群聊/弹幕/小报台词库

1. **立即修复 `src/engine/sectChat.ts` 第 305 行**：
   - 删除 `COMIC_NEUTRAL` 降级逻辑！把：
     ```ts
     // ❌ 错误：把所有差事桥段和带占位符的 chatHook 全丢掉换成废话
     text = template.match.phase==='ambient' && !/[{}]/.test(template.chatHook.line)
       ? template.chatHook.line
       : COMIC_NEUTRAL[post.variant];
     ```
     改为**调用与 `projectSectComicMoment` 相同的占位符替换函数（填入真实的 `{name}`、`{sect}`、`{site}`、`{job}`、`{rivalSect}`）渲染 `template.chatHook.line`**，让桥段自带的群聊梗 100% 真正发到群里！
2. **重写 `sectChatVoices.ts`、`sectLiveLines.ts`、`sectMomentLines.ts`、`tianjiTabloid.ts` 的冷淡公文腔**：
   - `sectChatVoices.ts`：彻底替换 `"听闻「{title}」。我没在场，先把这句传话记在边上。"` 这类免责公文；按发言人性格（狂傲/苟道/吃货/中二/财迷/话痨）和事件类型写出有修仙江湖味、会起哄、会眼红、会吐槽的群聊发言。
   - `sectLiveLines.ts`：炸炉、渡劫、大比、踢馆弹幕要有真正的修仙直播间气氛（如炸炉：`"丹房喜提露天通风！"`、`"黑烟里飞出来的是丹还是丹童？"`、`"王掌柜连夜把修炉砖涨了三成"`），禁止安监局口吻。
   - `tianjiTabloid.ts`：江湖小报的「丢人榜」「头条」「黑马」必须**连名带姓**写出当事修士、所属宗门与狼狈细节（如 `"${actorName}在${siteName}开炉，丹没见着，炉盖先上了房梁"`），严禁再写 `"本报只记这声响，不拿伤势取笑"`。
3. **群聊侧栏常驻断点降至 `1024px`（`SectChatPanel.tsx:17` & `SectManagementHome.tsx:271`）**：
   - 将 `min-[1440px]` 降至 `lg`（`1024px`），让常规笔记本与桌面显示器打开游戏就能同屏看到右侧实时跳动的仙门群聊、朋友圈与直播间。
4. **放宽双人同差事闹剧触发门槛（`sectPairDrama.ts`）**：
   - 只要两名弟子同派一处差事，即便只是普通同门关系或单方带怪癖，也能高概率触发搭伙甩锅、抢功、互相拆台或暗生情愫，不再要求苛刻的 `both: true` 双怪癖交集。

---

## 7. 庭院日常生气

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
