# H 线设计指南：沙雕宗门经营 + 修仙群聊直播间

> 用户反馈（2026-11-23 23:46）：**"玩法一般，一个个点来点去，没有沉浸感、没有喜感、没有特色。"**
> 用户已选定方向：**B + C 结合**，基调 **古风底子 + 适度沙雕**（参考《了不起的修仙模拟器》《大侠立志传》）。
>
> 本文给出核心循环、系统设计、数据样例与示意代码。代码为参考骨架，签名以仓库实际为准；**玩法思路、基调与验收必须遵守。**

---

## 0. 一句话定位

**你接手一个快要倒闭的破落小宗门，带着一群各有毛病的弟子，在修仙界的群聊、朋友圈和直播间里一边被人笑话、一边闹出名堂。**

三个支柱：

1. **派工经营**（玩的骨架）：每月晨会给弟子派活，看他们带回什么。
2. **怪癖喜感**（笑点来源）：弟子的毛病决定事情怎么搞砸、怎么歪打正着。
3. **群聊直播**（独特钩子）：整个江湖在群里实时吐槽、八卦、阴阳；你可以用掌门号或马甲下场带节奏。

现有的世界模拟、地图、庭院、小人、立绘、斗法舞台、天机风云报**全部保留复用**：弟子就是现有的 `Cultivator`，宗门就是现有的 `Sect`，月份推进仍走 `tickStagePipeline`。

---

## 1. 基调规则（写进每一句文案前先读）

| 要 | 不要 |
|---|---|
| 古风措辞打底，句末来一个反差或吐槽 | 满屏网络烂梗、"家人们""绝绝子" |
| 角色犯蠢、嘴硬、吹牛、甩锅、歪打正着 | 嘲讽玩家、低俗、地域/身份歧视 |
| 固定笑点反复回归（讨债的王掌柜、偷丹灵猫） | 每次都是全新、互不相关的段子 |
| 旁白轻快、点到为止 | 旁白自己哈哈哈、解释笑点 |
| 严肃时刻依然可以严肃（渡劫、陨落） | 把所有事都沙雕化 |

**真实性边界（与 AGENTS.md 一致）**：
- **结算层**（灵石、伤势、境界、生死、关系数值）仍由规则严格决定、可复现。
- **角色说的话**可以夸张、吹牛、说错、造谣——那是角色在说话，不是旁白在陈述事实。群聊里"我一剑劈开了半座山"不需要真的发生过，但旁白不能这么写。
- 群聊、朋友圈、弹幕属于**角色发言层**，可以由大模型自由生成；它们只能通过结构化意图影响世界（见第 5 节）。

示例语感：

> 路痴弟子柳二狗奉命下山采药，三日未归。第四日清晨，他扛着一口铁锅回来了，身后跟着一个系着围裙的魔宗厨子。
> "掌门，药没采到，但这位说想入咱们宗。他做的红烧肉，比丹房的辟谷丹好吃。"

---

## 2. 核心循环（每月一轮，约 1–3 分钟）

```
掌门晨会（派工）──▶ 一月过去（世界模拟照常推进）──▶ 回山汇报（逐个弟子演出结果）
       ▲                                                        │
       │                                                        ▼
  宗门升级/还债/招人  ◀── 群聊朋友圈刷屏、直播间弹幕、风云报八卦 ◀──┘
```

1. **晨会**：庭院画布上站着弟子小人。把弟子拖到右侧的「差事牌」上（或点选），每人一件差事。
2. **推进**：确认后推进一个月。被派工的弟子在世界模拟里执行对应行动（下山 = EXPLORE、闭关 = CULTIVATE …），其余照常 AI 行动。
3. **汇报**：弟子一个个回山，立绘带表情，弹出汇报卡：结果 + 一句他自己的话 + 收获/损失。好笑的、意外的结果优先展示。
4. **群聊刷新**：本月发生的事出现在群聊、朋友圈、直播间，别的宗门在笑你或羡慕你。
5. **经营**：花灵石升级建筑、还债、招新、应对踢馆和讨债。

**手感要求**：
- 晨会派工必须有**拖拽**（桌面）与**点选**（手机）两种方式，有小人走到差事牌旁的动画。
- 汇报必须**逐个演出**，可点击跳过，不能一次性甩一大段文字。
- 一个月内至少有 1 个"好笑的意外"（由喜剧事件引擎保证，见第 4 节）。

---

## 3. 系统设计与数据样例

### 3.1 开局：接手破落小宗

```ts
export const STARTER_SECTS = [
  {
    id: 'qingyun-odd-jobs', name: '青云杂役派',
    pitch: '祖师爷留下一座漏雨的大殿、三个弟子，和一张欠坊市王掌柜八十灵石的借条。',
    stones: 12, debt: { creditor: 'wang-shopkeeper', amount: 80, dueMonths: 6 },
    buildings: { hall: 1, kitchen: 1, furnace: 0, trainingGround: 0, gate: 1 },
    disciples: 3,
  },
  {
    id: 'drunken-sword-hermitage', name: '醉剑小筑',
    pitch: '上一任掌门喝醉了把宗门输给了你。剑谱只剩半本，酒窖倒是满的。',
    stones: 30, debt: undefined,
    buildings: { hall: 1, kitchen: 2, furnace: 0, trainingGround: 1, gate: 0 },
    disciples: 4,
  },
] as const;
```

开局流程：选宗门 → 抽 3–5 个弟子（每人 1–2 个怪癖，可重抽一次）→ 第一次晨会（新手引导）。

### 3.2 弟子怪癖（喜感的核心数据）

```ts
export type QuirkId =
  | 'glutton' | 'lost' | 'shy' | 'chatterbox' | 'miser' | 'drama'
  | 'contrarian' | 'lovestruck' | 'jinx' | 'neat_freak' | 'chuunibyou' | 'coward_king';

export interface QuirkDefinition {
  readonly id: QuirkId;
  readonly name: string;            // 玩家可见
  readonly blurb: string;           // 一句话描述，带梗
  readonly jobModifiers: Partial<Record<JobId, { success: number; mishap: number; windfall: number }>>;
  readonly comedyTags: readonly string[];   // 喜剧事件引擎用来匹配模板
}

export const QUIRKS: readonly QuirkDefinition[] = [
  { id: 'glutton', name: '吃货', blurb: '修为平平，但能闻出十里外谁家在炖肉。',
    jobModifiers: { gather: { success: 0, mishap: 10, windfall: 15 }, kitchen: { success: 25, mishap: -5, windfall: 10 } },
    comedyTags: ['food', 'distracted'] },
  { id: 'lost', name: '路痴', blurb: '从未准时到达过任何地方，却总能到达某个地方。',
    jobModifiers: { gather: { success: -20, mishap: 20, windfall: 20 }, deliver: { success: -30, mishap: 25, windfall: 10 } },
    comedyTags: ['wrong_place', 'stumble_upon'] },
  { id: 'shy', name: '社恐', blurb: '剑法尚可，只要对手别看着他。',
    jobModifiers: { stall: { success: -25, mishap: 10, windfall: 0 }, cultivate: { success: 15, mishap: 0, windfall: 5 } },
    comedyTags: ['awkward', 'hide'] },
  { id: 'chatterbox', name: '话痨', blurb: '一张嘴能把仇家说成朋友，也能把朋友说成仇家。',
    jobModifiers: { recruit: { success: 20, mishap: 15, windfall: 10 }, stall: { success: 15, mishap: 10, windfall: 5 } },
    comedyTags: ['talk', 'gossip'] },
  { id: 'miser', name: '财迷', blurb: '算盘打得比剑舞得快。',
    jobModifiers: { stall: { success: 25, mishap: 5, windfall: 10 } }, comedyTags: ['money', 'haggle'] },
  { id: 'jinx', name: '乌鸦嘴', blurb: '他说会下雨，天上就会下刀子。',
    jobModifiers: {}, comedyTags: ['jinx', 'prophecy'] },
  { id: 'coward_king', name: '苟王', blurb: '遇事先跑，所以活得最久。',
    jobModifiers: { guard: { success: -15, mishap: 5, windfall: 0 }, explore: { success: 0, mishap: -20, windfall: -5 } },
    comedyTags: ['flee', 'survive'] },
  // …共 12 个，其余按同样格式补齐
];
```

**组合技**：两个怪癖同时出现在同一件差事或同一个人身上时，可以触发专门的组合模板（例如「吃货 + 路痴」=「循着肉香走错了宗门」）。

### 3.3 差事（Job）

```ts
export type JobId = 'gather' | 'explore' | 'cultivate' | 'stall' | 'kitchen'
  | 'guard' | 'deliver' | 'recruit' | 'challenge' | 'matchmaking';

export const JOBS: Record<JobId, { label: string; nativeAction: string; reward: string; risk: string }> = {
  gather:      { label: '下山采药', nativeAction: 'EXPLORE',   reward: '灵草、偶得奇物', risk: '迷路、遇兽' },
  explore:     { label: '外出历练', nativeAction: 'EXPLORE',   reward: '修为、机缘',     risk: '受伤、惹事' },
  cultivate:   { label: '闭关修炼', nativeAction: 'CULTIVATE', reward: '修为',           risk: '走火入魔（低）' },
  stall:       { label: '坊市摆摊', nativeAction: 'SOCIALIZE', reward: '灵石',           risk: '被骗、被城管' },
  kitchen:     { label: '饭堂掌勺', nativeAction: 'REST',      reward: '全宗心情',       risk: '炸厨房' },
  guard:       { label: '看守山门', nativeAction: 'REST',      reward: '防偷防踢馆',     risk: '打瞌睡' },
  deliver:     { label: '跑腿送货', nativeAction: 'EXPLORE',   reward: '灵石、人情',     risk: '送错人' },
  recruit:     { label: '下山招新', nativeAction: 'SOCIALIZE', reward: '新弟子',         risk: '招来奇怪的人' },
  challenge:   { label: '去别宗踢馆', nativeAction: 'DUEL',    reward: '名望',           risk: '被打回来' },
  matchmaking: { label: '参加联谊', nativeAction: 'SOCIALIZE', reward: '人情、道侣',     risk: '社死' },
};
```

### 3.4 结算：四档结果

每件差事结算为四档之一，概率由弟子属性 + 怪癖修正 + 建筑等级 + 随机流决定：

| 档位 | 含义 | 演出 |
|---|---|---|
| `success` | 正常完成 | 简短汇报 |
| `windfall` | 歪打正着，收获超出预期 | 惊喜表情 + 喜剧模板 |
| `mishap` | 搞砸了，但不致命 | 黑线/冒烟表情 + 喜剧模板 |
| `disaster` | 真出事了（重伤、欠债、得罪大宗门） | 严肃演出，可能引出后续 |

```ts
export function resolveJob(world: WorldState, disciple: Cultivator, job: JobId, rng: () => number): JobOutcome {
  const base = baseOdds(job, disciple);                  // 修为、灵根、性格
  const quirk = quirkModifiers(disciple.quirks, job);    // 叠加怪癖
  const building = buildingModifiers(world, job);        // 饭堂等级影响 kitchen …
  const odds = normalize(add(base, quirk, building));
  const tier = pickTier(odds, rng());                    // 世界随机流，可复现
  const effects = settleJobEffects(world, disciple, job, tier, rng);   // 规则层真实结算
  const comedy = tier === 'windfall' || tier === 'mishap'
    ? pickComedyTemplate(world, disciple, job, tier)     // 第 4 节
    : undefined;
  return { discipleId: disciple.id, job, tier, effects, comedy };
}
```

### 3.5 宗门成长与目标

- **宗门评级**：不入流 → 九品 → … → 一品 → 天下名门。评级由名望、弟子平均境界、建筑、年度考核决定。
- **建筑**：大殿、饭堂、丹房、演武场、山门、藏经阁，每级有明显画面变化（庭院画布换贴图）。
- **压力源**：王掌柜按月催债、隔壁宗死对头踢馆、弟子被挖角、天灾。
- **年度考核**（每 12 月）：仙盟来人评级，成绩决定补贴或降级。
- **失败条件**：破产（债务逾期 + 灵石为负连续 3 月）或弟子全跑光；**可以选择"东山再起"重开**。

---

## 4. 喜剧事件引擎

### 4.1 模板数据（≥ 60 条，按怪癖、差事、档位匹配）

```ts
export const COMEDY_TEMPLATES: readonly ComedyTemplate[] = [
  {
    id: 'lost-gather-wrong-sect', match: { quirk: 'lost', job: 'gather', tier: 'windfall' },
    report: '{name}采药迷了路，误入{rivalSect}的药园。等发现时，背篓已经满了。',
    quote: '掌门，这药园的看门狗挺好说话的。',
    effects: [{ kind: 'item', template: 'rare-herb', count: 2 }, { kind: 'relation', sect: 'rivalSect', amount: -5 }],
    chatHook: { group: 'jiuzhou', poster: 'rivalSect.leader', line: '谁家弟子半夜偷我药园？背篓上还写着"青云"二字！' },
  },
  {
    id: 'glutton-kitchen-explode', match: { quirk: 'glutton', job: 'kitchen', tier: 'mishap' },
    report: '{name}想试试用三昧真火炖肉。饭堂没了，肉很香。',
    quote: '……要不咱们露天吃？',
    effects: [{ kind: 'building_damage', building: 'kitchen', amount: 1 }, { kind: 'morale', amount: 10 }],
    chatHook: { group: 'own', poster: 'random_disciple', line: '今天饭堂炸了，但我吃到了这辈子最好吃的红烧肉。' },
    animation: 'explosion_smoke',
  },
  {
    id: 'shy-stall-silent-bestseller', match: { quirk: 'shy', job: 'stall', tier: 'windfall' },
    report: '{name}在坊市摆摊，一整天没敢开口。路人以为他是隐世高人，东西被抢购一空。',
    quote: '……他们为什么都对我行礼？',
    effects: [{ kind: 'stones', amount: 60 }, { kind: 'fame', amount: 3 }],
  },
  {
    id: 'combo-glutton-lost', match: { quirks: ['glutton', 'lost'], job: 'any', tier: 'windfall' },
    report: '{name}循着肉香走了三天三夜，走进了血月魔宗的后厨，带回一锅红烧肉和一个想跳槽的魔宗厨子。',
    quote: '他说魔宗伙食太差，咱们这儿至少有肉。',
    effects: [{ kind: 'recruit', template: 'demon-sect-cook' }, { kind: 'morale', amount: 15 }],
    chatHook: { group: 'jiuzhou', poster: 'sect-bloodmoon.leader', line: '本座的厨子呢？？' },
  },
];
```

### 4.2 固定笑点角色（Running Gags，≥ 5 个）

```ts
export const RECURRING_NPCS = [
  { id: 'wang-shopkeeper', name: '王掌柜', role: '债主', gag: '每月准时出现，每次借口不同，从不放弃。' },
  { id: 'rival-leader',    name: '隔壁宗赵掌门', role: '死对头', gag: '处处跟你比，比输了就在群里阴阳。' },
  { id: 'pill-cat',        name: '偷丹灵猫', role: '惯犯', gag: '每隔几个月来偷一次丹，越偷越胖，最后可能被收为灵宠。' },
  { id: 'old-ancestor',    name: '后山老祖', role: '隐藏大佬', gag: '一直在后山闭关，偶尔出来说一句话就回去。' },
  { id: 'tianji-host',     name: '天机阁主播', role: '直播间主持', gag: '什么都要直播，包括你家饭堂爆炸。' },
];
```

这些角色要**记住**之前发生过什么（复用现有记忆系统），下次出场引用旧事："上回你家弟子偷我药园，这回又想干什么？"

---

## 5. 修仙群聊、朋友圈与直播间

### 5.1 群聊数据模型

```ts
export interface ChatGroup {
  id: 'own' | 'jiuzhou' | 'market' | 'leaders' | string;
  name: string;                 // 「青云杂役派内部群」「九州修仙交流群（500人）」「坊市二手灵器群」「掌门私聊」
  memberIds: string[];          // 可见成员，按"谁知道这件事"过滤
}

export interface ChatMessage {
  id: string; groupId: string; tick: number;
  senderId: string;             // cultivator id，或 'player' / 'player_alt'
  text: string;                 // 角色发言，可夸张、可吹牛
  replyTo?: string;
  reactions?: { emoji: string; count: number }[];
  sourceEventId?: string;       // 由哪件真实事件引出（用于跳转到地图/纪事）
  source: 'template' | 'llm' | 'player';
}
```

**发帖来源**：
- 真实事件（破境、斗法、炸炉、招新、踢馆、欠债）→ 相关角色按性格发帖。
- 喜剧模板里的 `chatHook`。
- 固定笑点角色的定期出场。
- 离线时用模板；开启大模型时由模型扮演角色生成（见 5.3）。

**可见性**：角色只会在群里谈论他知道的事（复用现有见闻/传闻系统）。这既是现有底座的优势，也是笑点来源：消息传歪了。

### 5.2 掌门发言与马甲

玩家可以：
- 用**掌门号**在本宗群训话、在九州群发公告。
- 用**马甲**（「路过的前辈」「天道小号」「匿名热心修士」）在九州群带节奏。
- 离线：快捷回复按钮（「替弟子出头」「哭穷」「放狠话」「辟谣」「打广告招新」）。
- 在线：自由输入，由模型解析成结构化意图：

```ts
export type PlayerChatIntent =
  | { kind: 'recruit_ad' }                         // 招新广告 → 下月招新成功率上升
  | { kind: 'hype'; targetSectId?: string }        // 带节奏 → 名望/对方名望变化
  | { kind: 'provoke'; targetSectId: string }      // 挑衅 → 可能引发踢馆
  | { kind: 'debunk'; rumorId: string }            // 辟谣
  | { kind: 'beg' }                                // 哭穷 → 可能有人接济，也可能被嘲笑
  | { kind: 'sell'; itemTemplate: string }         // 卖货
  | { kind: 'chat' };                              // 纯闲聊，无世界效果
```

意图由规则层结算；**马甲有被扒的风险**（被扒后名望下降，固定笑点角色会长期拿这件事阴阳你）。

### 5.3 大模型驱动（Token 主要消耗点）

```ts
const system = `你在扮演修仙世界里的人物，正在一个修仙群聊里发言。
基调：古风措辞打底，可以带一点反差和吐槽，适度幽默，不用网络烂梗。
你只能谈论下面"你知道的事"里列出的内容，可以夸张、吹牛、嘴硬，但不能编造你不知道的具体事件。
每条消息不超过 40 字。输出 JSON：{"messages":[{"senderId":"...","text":"...","replyTo":"可选"}]}`;

const user = JSON.stringify({
  group: '九州修仙交流群',
  speakers: candidates.map(c => ({ id: c.id, name: c.name, sect: c.sectName, personality: c.personality,
    quirks: c.quirkNames, mood: c.mood, knows: c.knownFacts.slice(0, 5) })),
  recentMessages: last20,
  trigger: '青云杂役派的饭堂今天炸了',
});
```

- 每月生成一轮群聊（3–12 条），大事件时追加。
- 模型输出只进入**发言层**；任何世界效果必须来自规则（例如：模型写"我要去踢馆"不会自动触发踢馆，除非规则层的 AI 决策也选择了踢馆）。
- 测试一律用模拟响应。

### 5.4 朋友圈与直播间

- **朋友圈**：角色"晒"破境、法宝、美食、旅行，配一张由场景画布截出的小图；其他人点赞评论。
- **天机直播间**：大比、渡劫、踢馆、炸炉时开播，右侧滚动弹幕（模板或大模型生成），玩家可以刷弹幕、打赏（花灵石，换名望或气运小加成）。

---

## 6. 界面布局

```
┌─────────────────────────────────────────────────────────────┐
│ 青云杂役派 · 不入流 · 灵石 12 · 欠债 80（王掌柜，余 5 月）    │
├───────────────────────────────┬─────────────────────────────┤
│                               │  💬 群聊 (3)  朋友圈  直播间 │
│     庭院画布（弟子小人）       │  ─────────────────────────── │
│                               │  [九州修仙交流群]            │
│   [柳二狗] [苏小满] [赵铁柱]   │  赵掌门：谁家弟子偷我药园？  │
│                               │  路过的前辈：我看见了是…     │
├───────────────────────────────┤  ...                        │
│ 差事牌：采药 历练 闭关 摆摊…   │  [输入框 / 快捷回复]          │
│           [ 开晨会，过一个月 ] │                             │
└───────────────────────────────┴─────────────────────────────┘
```

- 桌面：左庭院 + 差事，右群聊。手机：庭院为主，群聊为底部抽屉，有未读红点。
- 原「故事书卷」「全息大盘」「五大工作区」移到「更多」，掌门模式为默认入口。

---

## 7. 验收

- 新玩家从打开到完成第一次晨会 ≤ 60 秒。
- 每月至少 1 个喜剧结果（`windfall` 或 `mishap` 模板），12 个月内至少出现 8 个不同模板、至少 2 次固定笑点角色回归。
- 群聊每月离线模式至少 3 条与本月真实事件相关的消息；开启大模型时 3–12 条。
- 同种子、同派工结果可复现（大模型文本除外，但其结构化效果必须可复现）。
- 玩家界面不出现开发者用语（实付、托管、凭据、原生、不替、不补）。
