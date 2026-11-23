# BACKLOG.md — Infinite Evolution Task Queue (天道沙盒开发任务队列)

> **接续方法：** 从顶部第一个未勾选项（`- [ ]`）开始，每项独立实现、测试、验证和发布；完成后立即接下一项，不等人为确认。
> **当前最高战略（H 线：沙雕宗门经营 + 修仙群聊直播间）：** 用户反馈"玩法一般，一个个点来点去，没有沉浸感、没有喜感、没有特色"，并选定方向 **B + C**，基调 **古风底子 + 适度沙雕**（参考《了不起的修仙模拟器》《大侠立志传》）。玩家接手破落小宗当掌门，每月给有怪癖的弟子派工，看他们搞砸或歪打正着；整个江湖在群聊、朋友圈、直播间里实时吐槽，玩家可用掌门号或马甲下场。**动手前必读 [docs/design/H-sect-comedy-guide.md](docs/design/H-sect-comedy-guide.md)。**
> **完成标准：** 确定性测试、`npm run verify`（保持既有 3000+ 测试全绿）、更新 CHANGELOG（玩家能看懂的话）、一个任务一个提交并推送到 `origin/main`。
> **补队列：** 完成后若未勾选项少于 20 项，在队列末尾追加 10 项"喜剧内容 / 派工玩法 / 群聊直播 / 宗门经营 / 上手体验 / 画面手感"任务。**严禁再生成"只有……才……"式叠加门槛的纯文字微剧本或账本任务。** 完整规则见 [AGENTS.md](AGENTS.md)。

---

## H 线：沙雕宗门经营 + 修仙群聊直播间（最高优先级，按顺序执行）

> 📘 **必读：[docs/design/H-sect-comedy-guide.md](docs/design/H-sect-comedy-guide.md)**（定位、基调规则、核心循环、怪癖/差事/喜剧模板数据样例、群聊数据模型与大模型提示词、界面布局、验收）。
> 现有世界模拟、地图、庭院、小人、立绘、斗法舞台、风云报全部复用：弟子 = `Cultivator`，宗门 = `Sect`，月份推进仍走 `tickStagePipeline`。

### H1　核心循环：掌门晨会派工

- [x] **[H1-1] 开局「接手破落小宗」并设为默认入口**：至少 2 个起手宗门（见指南 3.1，含债务、建筑、弟子数），开局抽 3–5 名弟子（每人 1–2 个怪癖，可重抽一次）。玩家即掌门。原故事书卷 / 全息大盘 / 五大工作区收进「更多」。旧存档仍可从「更多 → 读档」进入。
- [x] **[H1-2] 弟子怪癖系统（12 个，数据驱动）**：按指南 3.2 定义怪癖、差事修正与喜剧标签，挂到 `Cultivator` 上（单一可选字段），支持两怪癖组合；人物档案、地图悬浮卡与庭院小人头顶显示怪癖小标签。NPC 弟子也有怪癖，影响其自主行动倾向。
- [x] **[H1-3] 掌门晨会派工台**：庭院画布上站着本宗弟子小人，右侧（手机为下方）10 种差事牌（见指南 3.3）。桌面拖拽、手机点选；派工后小人走到差事牌旁。确认后推进一个月，被派工弟子执行对应原生行动，其余照常。未派工的弟子由 AI 自选。
- [x] **[H1-4] 回山汇报逐个演出**：月末每个被派工弟子依次回山：立绘换表情（惊喜/黑线/冒烟/受伤）、汇报卡（结果档位 + 一句本人台词 + 收获/损失）、可点击跳过。结果四档 `success / windfall / mishap / disaster` 由规则层结算（见指南 3.4），可复现。
- [x] **[H1-5] 宗门成长、压力与目标**：宗门评级（不入流 → 天下名门）、六种建筑升级且庭院画面随等级变化、王掌柜按月催债、年度仙盟考核、破产/弟子跑光的失败条件与「东山再起」重开。顶栏常驻：宗门名、评级、灵石、债务倒计时。

### H2　喜感引擎

- [x] **[H2-1] 喜剧事件模板库（≥ 60 条，数据驱动）**：按怪癖 × 差事 × 档位匹配，含组合技模板（≥ 10 条）。每条含汇报文、本人台词、结构化效果、可选 `chatHook` 与动画标签（格式见指南 4.1）。保证每月至少 1 个喜剧结果；12 个月内至少 8 个不同模板。
- [x] **[H2-2] 固定笑点角色（≥ 5 个）**：王掌柜（债主）、隔壁宗赵掌门（死对头）、偷丹灵猫、后山老祖、天机阁主播（见指南 4.2）。定期回归，记住旧事并在台词里引用。
- [x] **[H2-3] 喜剧表情与小动画**：立绘与小人增加汗滴、黑线、头顶冒烟、星星眼、灵魂出窍、震屏（炸炉/炸厨房）等反应，按汇报档位和模板动画标签播放；尊重减弱动态设置。
- [x] **[H2-4] 弟子之间的闹剧关系**：同门暗恋、互坑、比拼、甩锅。两名有关系的弟子被派同一差事时触发专门模板（如互相甩锅导致都没完成）。

### H3　修仙群聊、朋友圈与直播间

- [x] **[H3-1] 仙门群聊界面（离线模板版）**：仿聊天软件，至少 4 个群（本宗内部群、九州修仙交流群、坊市二手群、掌门私聊），头像用现有立绘，未读红点。消息由真实事件、喜剧模板 `chatHook`、固定笑点角色生成；角色只谈论自己知道的事（复用见闻系统）。点击消息可跳到地图或纪事里的对应事件。
- [x] **[H3-2] 大模型驱动群聊（可选，Token 主要消耗点）**：开启后每月一轮 3–12 条、大事件追加，模型按人物性格、怪癖、心情、所知事实扮演发言（提示词骨架见指南 5.3）。模型输出只进发言层，不直接改世界。离线回退模板。测试用模拟响应。
- [x] **[H3-3] 掌门发言与马甲**：掌门号与 3 个马甲；离线快捷回复（替弟子出头 / 哭穷 / 放狠话 / 辟谣 / 打广告招新），在线自由输入由模型解析为结构化意图（见指南 5.2），规则层结算效果。马甲有被扒风险，被扒后固定笑点角色长期拿来阴阳。
- [x] **[H3-4] 修仙朋友圈**：角色晒破境、法宝、美食、旅行，配由场景画布生成的小图；其他人点赞评论（模板或模型）。玩家可点赞、评论、拉黑。
- [x] **[H3-5] 天机直播间**：大比、渡劫、踢馆、炸炉时开播，滚动弹幕（模板或模型），玩家可刷弹幕、打赏（花灵石换名望或气运小加成）。直播画面复用斗法舞台 / 场景画布。

### H4　江湖互动

- [ ] **[H4-1] 踢馆与被踢馆**：派弟子去别宗踢馆、AI 宗门也会来踢你；在斗法舞台演出，结果进群聊和直播间。死对头赵掌门优先。
- [ ] **[H4-2] 江湖小报**：把天机风云报改成带八卦味的江湖小报（头条、丢人榜、黑马、恩怨、广告位），每季度出刊，引用群聊热点。
- [ ] **[H4-3] 江湖节庆日历**：招新大会、联谊会、坊市大集、仙盟考核、讨债日，固定月份出现，提供专属差事与喜剧模板。

### H5　上手与发布

- [ ] **[H5-1] 第一次晨会新手引导**：从打开游戏到完成第一次派工 ≤ 60 秒；引导只在当时出现一次，可跳过。
- [ ] **[H5-2] 文案统一与开发者用语清理**：掌门模式全部玩家可见文案符合指南第 1 节基调；加测试禁止"实付、托管、凭据、原生、不替、不补"出现在玩家界面字符串中。
- [ ] **[H5-3] 真机试玩与线上发布**：在实际浏览器（360 / 390 / 1440px）完成「开局 → 3 次晨会 → 群聊发言 → 踢馆 → 存读档」流程，截图与问题清单写入 `docs/release-check.md`；具备条件时重新发布线上预览站，无法发布或登录时如实记录阻塞。

---

## 游戏化重塑主线：从高级模拟器到好玩的游戏 (G1–G5，H 线完成后再继续)

> **诊断（2026-11-23 评估）：**
> 1. **门槛叠加导致内容罕见**：P19–P22 上百个剧情点几乎都要"亲到 + 实付 + 对方另轮应允 + 同地"多重条件，正常一局极少触发，首页常年"本月暂无新见闻"。
> 2. **玩家参与感弱**：核心循环只有"看下个月"；无玩家目标、成长线、胜负或局外传承；高光抉择只能等世界碰巧满足条件。
> 3. **功能铺宽不铺深**：一百多个微系统，Storylet 仅迁入 3 个奇遇；`world.ts` 3,745 行、`WorldMapCanvas.tsx` 1,839 行。
> 4. **LLM 几乎闲置**：运行时模型只从预设台词中挑句，不接 API 也完全一样——与项目"消耗订阅 Token"的初衷相反。
> 5. **画面与发布未验收**：场景动画 4 秒后定格；线上预览站未登录验证、未真机测帧率。
> 6. **上手门槛高**：玩家可见文案大量出现"实付/托管/凭据/原生/不替……"等开发者审计语。
>
> **设计原则**：规则层（结算、扣费、生死、存档）继续严格可验证；**呈现层与事件供给层要慷慨**——宁可用概率与戏剧性打分主动制造机会，也不要让玩家等待。真实性约束只用于"不篡改已发生的事实"，不再用于"阻止事情发生"。

### G0　纠偏专项（最高优先级，严格按本区顺序执行）

> 📘 **动手前必读：[docs/design/G0-reference-guide.md](docs/design/G0-reference-guide.md)**（高光定义、导演来源注册表、nudge、通用 Storylet、数据样例、验收测试样例、反模式清单）。

> **第二次评估（2026-11-23 22:30）发现的问题：**
> 1. **G1-1 指标被"凑"出来**：导演的全部选项只是「歇息 / 吐纳 / 说两句 / 沿熟路走」四种原有基础行动，外包 6 段氛围文字，选完即翻月。没有接入奇遇、心魔、大比、秘境、拍卖等任何有分支后果的玩法。"120 月 41 次机会"不代表 41 次高光。（根因是原验收标准只写了"可交互次数 ≥ 40"，没定义什么算高光——此处一并修正。）
> 2. **G1-3 陷入逐个微调**：1,200 月无人干预实测，40 个剧情系统中 **26 个为 0**；四个提交只把个别数字从 0→1、3→9。许多系统是"A 罕见 → B 罕见 → C 罕见"的续集链，单独放宽某一环无效。文档还写了"不应强行补齐的前因"一节拒绝促成前置事件，与 AGENTS.md 设计铁律冲突。
> 3. **体验层仍未改变**：导演、玩家目标、主动 LLM 叙事三样都未真正落地。
>
> **高光的正式定义（今后所有验收以此为准）**：玩家面对 **≥ 2 个结果不同的选项**，且至少一个选项会带来**普通行动不会产生的后果**（获得/失去法宝功法、结下或断绝羁绊、受重伤或破境、开启后续剧情、改变宗门/声望等）。「歇息 / 吐纳 / 交谈 / 赶路」四种基础行动本身**永远不算高光**。

- [x] **[G0-1] 叙事导演重做：从真实玩法池里挑戏**：
  1) 把导演的候选池改为**真实有后果的玩法**：三选一奇遇（Storylet）、心魔劫、仙门大比报名、秘境开启与入洞、拍卖会、道途修习、禁术/器灵、宿命羁绊重逢、正在进行的续集剧情，以及后续 G2-3 的任务与 G4-2 的新奇遇（预留注册接口）。
  2) 导演可以**主动促成前置条件**来让玩法发生：例如安排一位合适的 NPC 下月路过主角所在地、让秘境先兆出现在主角已知地点附近、为奇遇挑选当前合适的地点与角色。促成手段只能是改变**未来的**行动倾向、路线和机缘出现位置，不得篡改已发生的事实。
  3) 原有六段氛围文字保留为"平常月"的过场，但**不得计入高光次数**。
  4) **验收**：固定种子「江湖风波」120 个月内，按上面的定义统计高光 **≥ 30 次**，且覆盖 **≥ 6 种不同玩法类型**，任意两次高光间隔 **≤ 4 个月**；「静水流深」≥ 15 次，「天地大劫」≥ 45 次。输出 `docs/director-highlights.md` 列出每次高光的月份、类型、选项与实际后果。Utility/Cognitive 同种子结果一致。
- [x] **[G0-2] G1-3 限时收尾（只用一次提交完成）**：停止逐个系统微调。对审计中 1,200 月触发 < 2 次的系统一次性分三类处理并写入 `docs/trigger-audit.md`：
  - **交给导演促成**：导演在条件接近时主动安排缺失的那一环（例如让拜师被拒的两人在一年内某处再遇）。
  - **并入奇遇引擎**：把剧情改写为一条 Storylet，用较宽松的条件随机出现。
  - **冻结**：价值低或依赖极罕见事件的系统，标为冻结，不再投入开发。
  删除"不应强行补齐的前因"一节中与 AGENTS.md 设计铁律冲突的表述。完成后把 [G1-3] 勾为"已由 G0-2 收尾"。
- [x] **[G2-1]（已并入 H1-1：掌门开局取代个人入世，不再单独实现）新游戏「入世」流程**：开局让玩家选择出身（宗门弟子 / 散修 / 凡村少年 / 世家子弟 / 魔门遗孤）、灵根、性格与一项先天命格，生成玩家主角并自动附身。保留原"旁观天道"模式作为第二入口。存档兼容旧档。
- [x] **[G2-2]（已并入 H1-5：宗门评级与成长取代个人仙途卡，不再单独实现）生涯目标与成长线**：主角有清晰的阶段目标（筑基 → 金丹 → 元婴…、外门 → 内门 → 真传 → 长老 → 掌门、名望榜排名），在故事首页常驻一张精简「仙途」卡（当前境界进度、寿元、下一目标、本月建议）。每达成一个里程碑有演出与奖励。
- [x] **[G2-3]（已并入 H1-3：晨会差事取代任务堂，不再单独实现）可接取的任务与委托**：宗门任务堂、坊市悬赏、村落求助、师门托付——以 Storylet 数据定义，至少 20 种任务模板（采药、护送、除妖、寻人、炼丹交付、秘境探路、送信、调停），有明确奖励（灵石/功法/贡献/声望/人情）。玩家每月可接 1 个，NPC 也会接。任务完成与失败都要计入导演的高光池。
- [x] **[G4-2]（已并入 H2-1：喜剧事件模板库取代，不再单独实现）新增 30 个奇遇 Storylet**：覆盖游历、宗门、坊市、秘境、凡俗、情缘、仇杀、师徒、天象九类，每个含场景配置（地点/画布元素）、三选项与差异化后果，至少 10 个有跨月后续。全部注册进导演候选池。

### G1　叙事导演：保证每 1–3 个月必有一次可选高光 (Storyteller Director)

- [x] **[G1-1] 叙事导演引擎 `storytellerDirector.ts`**（初版：仅接入四种基础行动，**按新定义不算达标**，由 [G0-1] 重做）：类 RimWorld 叙事者。每回合根据"距上次高光的月数、当前张力曲线、主角/关注对象状态、世界局势"计算戏剧性评分，提供三档导演风格并存档。
- [x] **[G1-2] 张力曲线与节奏面板**：导演维护"张力值"（冲突、危机、喜事交替），避免连续三个月全是战斗或全是平淡。在全息大盘顶栏显示简洁的「天势」曲线（近 24 月起伏），点击可看导演为何安排本月事件（玩家可读文案）。
- [x] **[G1-3] 门槛审计与放宽**（已由 [G0-2] 收尾）：扫描 P19–P22 所有剧情系统的触发条件，统计 1,200 个月实测触发次数，输出 `docs/trigger-audit.md`。
- [ ] **[G1-4] 主动追寻机缘**：玩家附身/引导的角色可在故事页选择「打听机缘」「寻访旧识」「闯荡险地」「回山闭关」四种月度意图，导演据此提高对应类型**高光**（按 G0 定义）的权重，让玩家能**主动去追**高光，而非被动等待。
- [ ] **[G1-5] 首页永不空白**：没有新公开见闻的月份，首页也要展示主角/关注对象本月的具体日常一幕（场景画布 + 一段闲笔）以及「下月可能的去处」两三条提示，彻底消灭"本月暂无新见闻 · 上一幕"。

### G2　主角修仙生涯模式：目标、成长、结局与传承 (Cultivator Career Mode)

> G2-1 ～ G2-3 已移至 G0 区优先执行。

- [ ] **[G2-4] 寿元结局与一生评价**：主角陨落、飞升或寿尽时生成「一生评定」画卷（境界、成就、羁绊、宿敌、传世功法、评级 甲/乙/丙），并写入封神榜。提供「转世重来」「以后人续玩」「旁观余世」三个选项。
- [ ] **[G2-5] 局外传承（Meta Progression）**：每局结局根据评级解锁"天道印记"（如：开局多一条灵根选项、新出身、新命格池、某宗门功法残卷），存于本地，独立于世界存档，下一局可选用。

### G3　让大模型真正干活：天道史官与自由演绎 (LLM Narrator — Token Burner)

- [ ] **[G3-1] 天道史官模式（可选，默认关闭）**：开启后，每章连载由 LLM 基于本章已核事实锚点 + 人物档案 + 上章摘要**扩写为 1,500–3,000 字的完整章节正文**（保留七分闲笔三分戏眼的节奏规范）。规则层校验：不得新增事实层面的死亡/胜负/财物/境界变化；违规段落回退为确定性文本。离线无 API 时自动使用现有确定性文本。
- [ ] **[G3-2] 自由对白与当面交谈**：玩家附身角色与 NPC 当面时，可输入自然语言交谈；LLM 以该 NPC 的性格、记忆、关系与所知信息实时回应（多轮）。对话结果只能通过结构化意图（结交/拒绝/交易提议/拜师请求/挑衅）落入规则层，由规则结算。
- [ ] **[G3-3] LLM 即兴奇遇文本**：导演挑出的事件机会，可让 LLM 依据真实情境即兴撰写场景描写与三个选项的叙事包装（选项的机制效果仍来自 Storylet 定义）。同一事件每次都有新鲜文字。
- [ ] **[G3-4] 模型调用的预算与遥测**：在现有 Token 仪表盘基础上增加每章/每月/每局的 Token 预算上限、调用失败降级统计和可选"高消耗模式"（多候选生成后由模型自评择优），方便用户主动消耗订阅额度。
- [ ] **[G3-5] 史官文风与人物声口一致性**：为 LLM 构建人物声口卡（性格、口头禅、近期遭遇、与对话方关系）与全局文风指南，测试中用模拟响应验证"同一人物跨章声口一致、不泄露私密信息"。

### G4　内容量：把微剧本迁入 Storylet 并批量扩充 (Content Volume)

- [ ] **[G4-1] 迁移第一批 20 个微剧本到 `storyletEngine`**：从 P19–P22 中挑最常触发/最有戏的 20 个系统迁成数据定义，删除对应的顶层 `WorldState` 字段（提供旧档迁移），目标 `world.ts` 减少 ≥ 600 行。
> G4-2 已移至 G0 区优先执行。
- [ ] **[G4-3] Storylet 内容编辑器（开发者工具）**：在剧本编辑器中提供 Storylet 的可视化编辑、条件预览与"在当前世界试触发"，导出为数据文件，便于批量扩写。
- [ ] **[G4-4] 拆分 `WorldMapCanvas.tsx`**：按图层（地貌/建筑/人物/特效/UI 覆层/交互）拆成独立模块，主组件 ≤ 600 行，绘制结果与命中测试逐帧一致。
- [ ] **[G4-5] 内容覆盖率报告**：脚本统计 1,200 个月实测中每个 Storylet 与原生事件的触发次数、玩家可见次数，输出 `docs/content-coverage.md`，作为后续扩写依据。

### G5　上手、文案与真机发布 (Onboarding, Copy & Release)

- [ ] **[G5-1] 玩家文案去审计腔**：全站扫描玩家可见文案，替换"实付/托管/凭据/原生/不替/不补"等开发者用语为自然的修仙口吻；开发者说明只保留在 CHANGELOG/docs。加测试禁止这些词出现在玩家界面字符串中（白名单除外）。
- [ ] **[G5-2] 前十分钟新手引导**：入世后前 3 个月有轻量引导（看懂主角卡、第一次奇遇、第一次接任务、第一次进庭院、第一次斗法），可跳过，只在当时上下文出现一次。
- [ ] **[G5-3] 画面持续生命感**：场景画布、庭院与地图在可见时保持低频持续动画（衣袂、炊烟、水流、落花），取代 4 秒后定格；仍尊重减弱动态与后台暂停，并给出 CPU 占用测量。
- [ ] **[G5-4] 美术质量提升**：为小人与建筑增加更细的轮廓、阴影与配色层次，建立统一调色板；可选支持加载外部 PNG Sprite Sheet（若存在则优先使用，否则回退程序化绘制）。
- [ ] **[G5-5] 真机验收与线上发布**：在可用环境中重新构建并发布线上预览站；在 360/390/1440px 实际浏览器中完成入世 → 奇遇 → 任务 → 斗法 → 庭院 → 存读档的完整流程验收，记录截图与问题清单到 `docs/release-check.md`。无法发布或登录时如实记录阻塞，不得声称已发布。

---

## 试玩反馈直修

- [x] **[G1-3D] 提交可复跑的 P19–P22 阶段审计：分别列出连续百年、配对改动和仅有诊断机会的结果，G1-3 整体仍未验收。
- [x] **[G1-3C] 已有真兽潮和可交付的新地点时，在现有传闻名额中给有限接续优先；实收才记为两地或三地传信。
- [x] **[G1-3B] 少量原可亲阅的当地 NPC 补位；原读者能在保有原证据的短时段向现地原目击者私询，结案不重开、不泄露给旁人。
- [x] **[G1-3A] 战后亲历者可以主动提出照料、留守或循旧路归去；仍由受伤者本人另行同意。G1-3 总体验收继续进行。
- [x] **[G1-3UI] 真实可选的旧剧情不再被通用机缘盖住**：战后与师徒选择优先，通用机缘仍可从「另有一幕」找到；完整 G1-3 审计与门槛调整仍继续。
- [x] **[MUSIC-1] 试玩站配乐改成有留白的原创古琴风音景**：替换机械短循环及启动钟声，保留主动启用、原生动作音效及即时静音。

## 星露谷式 2D 具象化视觉与大型游戏升维主线 (SV1–SV3)

以下三阶段（共 15 项）为当前最高优先级队列，按「顶部第一个未勾选项」依次执行：

### SV1　星露谷式 2D 具象小人、全彩多层人物样貌与彩绘瓦片实景地图 (Stardew-Style 2D Sprites, Portraits & Tilemaps)

- [x] **[SV1-1] 首页与戏台升级为「星露谷式 2D 实景舞台 + 底部全彩立绘对话框」(`StardewSceneStage & IllustratedStoryHome`)**：
  - 彻底告别“黑底纯文字网页”式的浅显展示！构建 `src/components/SceneStageCanvas.tsx` 并直接嵌入 `StoryFirstHome.tsx` 与 `CockpitStoryStage.tsx` 的主视觉区（同时保留原有按钮、标题与 ARIA 结构以确保既有测试 100% 通过）。
  - **上方实景舞台画布**：根据当前一幕所在的真实地点（太虚剑峰云海白玉广场、丹霞灵谷药田竹庐、万仙坊市红灯笼青石街、血月魔渊黑石血池、极北寒玉脉雪松古井等），实时绘制 **《星露谷物语》式的 2D 具象场景画卷**（有青草地、石板路、飞檐古建筑、摇曳松竹、冒烟丹炉、流水石桥、四时落花/飘雪粒子），并在场景中画出当前登场修士的 **2D 全身小人 Sprite（有发型、面孔、门派道袍、配剑，以及打坐、挥剑、采药、交谈的生动姿态）**！
  - **下方星露谷式立绘对话框**：在剧情正文左侧常驻展示当前主角或核心登场人物的**大尺寸全彩精绘半身立绘头像框 (`CultivatorPortrait`) + 角色姓名/境界铭牌**，让你一打开游戏就能看到鲜活的人物样貌与修仙世界场景！
- [x] **[SV1-2] 地图圆点彻底替换为「星露谷式 2D 全身可动修仙小人 Sprite」(`Canvas2DCharacterSprites`)**：
  - 构建 `src/components/canvasCharacterSprite.ts` 并接入 `WorldMapCanvas.tsx` 与场景画布：彻底淘汰用“小圆圈/几何玉牌”代替活人的简陋画法！
  - 为每位修士在 Canvas 上绘制 **2D 具象 Q 版/像素风全身小人（head + hair bun/crown + face with eyes + flowing sect robe & sleeves + held/backed sword or staff + flying sword/lotus mount）**。
  - 实现 **4 种具象动作姿态与微动画**：① **待机/游历**（衣袂微摆、御剑悬浮） ② **盘膝吐纳修炼**（盘腿坐于蒲团/莲台，周身环绕上升的五行灵气光点） ③ **挥剑斗法**（持剑前刺/劈砍姿态 + 刀光剑影） ④ **采药/炼丹/劳作**（俯身采摘或炉前控火姿态），人物下方配清晰的半透明墨金姓名与境界铭牌。
- [x] **[SV1-3] 九州地图背景重绘为「星露谷式彩绘地形瓦片 + 飞檐古建筑群立面」(`LushTilemap & ArchitecturalSprites`)**：
  - 构建 `src/components/lushTilemapRenderer.ts` 并升级 `WorldMapCanvas.tsx`：彻底改变“深黑底色块拼贴”的简陋感！
  - **丰富的自然地貌瓦片**：绘制色彩层次饱满的翠绿灵山草甸、蜿蜒流动的碧蓝溪流与海岸浪花、青石板古驿道、苍松翠竹林、金黄沙丘、皑皑雪原与紫雾魔渊，相邻地貌自然衔接。
  - **具象化古风建筑群 Sprite**：在每个地点坐标上不再画空心圆圈，而是绘制**立体感十足的 2D 古风建筑立面图标**——太虚剑峰绘制【三重飞檐白玉剑阁与巨剑石碑】、丹霞灵谷绘制【茅檐丹房、紫金八卦炉与整齐的灵田菜畦】、万仙坊市绘制【红灯笼酒楼、木牌坊与摊位帐篷】、摘星天机台绘制【悬空星象高塔】、极北寒玉脉绘制【雪地石井与木架矿洞】、凡人村落绘制【青瓦农舍、篱笆与水车】。
- [x] **[SV1-4] 全彩多层纸娃娃人物样貌系统与 5 态动态眼神表情 (`FullColorLayeredPortrait & Expressions`)**：
  - 全面重绘 `src/components/CultivatorPortrait.tsx` 与 `src/components/cultivatorPortraitModel.ts`：告别简陋的暗色单线轮廓！
  - 采用高颜值、色彩明快的**8 层全彩纸娃娃（Paper-Doll）SVG 精绘体系**：
    1) **实景氛围背景层**：根据修士当前所在地与节气绘制青山云海、竹林丹房、灯火坊市、冰峰雪月等彩绘背景；
    2) **境界法相背光层**：金丹璀璨金轮、元婴神祇光影、化神星河、魔道血月；
    3) **背负/伴生法宝层**：背后斜背的古剑剑匣、悬浮宝葫芦、琵琶琴囊、阵盘；
    4) **门派华服与纹样层**：多层交领古装道袍、云肩、广袖、束腰玉带与宗门徽纹（太虚云青白袍、丹霞杏黄翠衫、血月玄黑金红袍、天机星紫长衫）；
    5) **写实温润肤色与脸型立体阴影层**；
    6) **高光双眸与 5 态动态面部表情层**：根据修士当前状态（气血、动作、心魔、破境）动态切换**【平静温雅】、【欣喜破境】、【凌厉斗法（剑眉怒目）】、【重伤虚弱（汗珠/血迹）】、【心魔狂乱（紫红妖瞳）】**，带灵动的眼白、虹膜高光与唇色；
    7) **12 款古风男女发式与飘带层**（高马尾、仙子垂云髻、道冠束发、披肩白发等）；
    8) **发冠配饰层**（玉冠、步摇、抹额、剑簪）。
- [x] **[SV1-5] 星露谷式「宗门洞天 / 坊市村落」实地微缩庭院视图 (`LocalCourtyardTilemapView`)**：
  - 构建 `src/components/LocalCourtyardCanvas.tsx`。在 `WorldMapCanvas` 或地点检视卡上支持一键切换**「九州山河全图 ⇄ 本地图景（星露谷式实地庭院视图）」**！
  - 当切入某个地点的「实地庭院视图」（16×10 精细瓦片场景）时，玩家就像在玩《星露谷物语》一样俯瞰这处洞天或村落：可以看到场景里的**主殿大门、藏经阁书架、炼丹房炉火、一块块种着灵草的药田格子、护山阵基座、溪流石桥、街道摊位**，以及当前驻留此地的每一位修士和凡人以 **2D 全身小人** 形态分布在各自岗位上（有人在药田浇水采药、有人在丹炉旁扇火、有人在演武场对剑、有人在树下打坐），点击场景中的任意小人或设施即可直接查看详情与互动！

### SV2　可视化回合斗法剧场、具象化炼丹/秘境小舞台与四时音画氛围 (Visual Combat Arena & Interactive Mini-Stages)

- [x] **[SV2-1] 可视化「仙道斗法对决舞台」：左右全彩立绘 + 2D 小人拆招动画 + 招式卡牌博弈 (`VisualDuelArenaStage`)**：
  - 构建 `src/components/VisualDuelArena.tsx`。当发生关键生死决战、仙门大比擂台赛或秘境妖王战时，展开极具视觉冲击力的**可视化横版斗法舞台**：
  - 舞台背景为交战地实景（剑峰云顶、魔渊血池、比武石台）；左右两侧既展示双方的**大尺寸全彩半身立绘（带实时受击表情变化）+ 气血/真气双槽**，舞台中央又绘制两个 **2D 全身修仙小人** 进行你来我往的御剑冲锋、法宝碰撞、剑阵光柱与受击击退动画，并在下方滚动展示分招拆解的战斗过程与神通/禁术抉择按钮。
- [x] **[SV2-2] 星露谷式「丹房控火开炉」与「灵田药圃耕作」可视化微缩交互画布 (`VisualAlchemyAndHerbGarden`)**：
  - 在丹道与灵植面板上方加入具象化的 2D 视觉画布：直观看到**药圃每一格土地里灵草从幼苗、抽叶到开花成熟的生长形态**，以及**炼丹房内八卦丹炉的火焰颜色（温火青焰、文武金焰、冲纹紫火）、药液翻滚、修士小人在炉边掐诀控火与成丹时的彩霞丹雷动画**。
- [x] **[SV2-3] 可视化「秘境三层地宫探索棋盘」与妖王 Boss 房间实景 (`VisualDungeonMapExplorer`)**：
  - 升级 `DungeonExpeditionRead.tsx`：将秘境探索从纯文字按钮升级为**可视化的 2D 地宫房间地图**——画出「外围灵草园 → 上古符文阵门 → 禁地妖王祭坛」的石室通道、宝箱、阵法光幕、修士小人当前所在的房间位置，以及盘踞在深处的巨型妖王 Boss 2D 具象形象与血条。
- [x] **[SV2-4] 昼夜晨昏光影、四时节气天气粒子与全屏天地异象演出 (`DayNightWeatherParticles & CelestialPhenomena`)**：
  - 为 `WorldMapCanvas`、`SceneStageCanvas` 与 `LocalCourtyardCanvas` 引入细腻的氛围光影层：春季落英桃花瓣随风飘落、夏季阵雨涟漪与林间流萤、秋季金枫飘叶、冬季寒玉脉漫天飞雪；当世有人破入元婴/化神/飞升时，画面浮现祥云金莲与霞光万道。
- [x] **[SV2-5] 原生 Web Audio 国风程序化古琴音景与法术打击音效系统 (`ProceduralXianxiaSoundscape`)**：
  - 构建零外部音频文件依赖、基于浏览器 `AudioContext` 合成的 `src/engine/soundscapeEngine.ts`（顶栏配显眼的「仙乐/静音」开关，测试环境自动静默）：合成悠扬的**五声音阶（宫商角徵羽）古琴泛音与洞箫意境音、清晨山门钟声、御剑破空风声、飞剑金铁交鸣声、丹成清脆玉磬声、以及九重雷劫的低频雷鸣**。

### SV3　迈向大型游戏的 Engine 2.0 架构解耦与线上预览站全量发布 (Engine 2.0 Architecture & Live Site Sync)

- [x] **[SV3-1] Engine 2.0 第一刀：通用数据驱动 `Storylet` 奇遇/叙事引擎 (`DataDrivenStoryletEngine`)**：
  - 解决“每写一个剧情就要新建 3 个 `.ts` 文件并往 `WorldState` 顶层加字段”的膨胀瓶颈！构建 `src/engine/storyletEngine.ts`（统一管理 `Condition 触发条件 -> Role 角色绑定 -> Scene 2D舞台配置 -> Choices 选项 -> Effects 状态变更`），将散落的微剧本逐步收敛为干净的数据驱动 Storylet 注册表，不再污染 `WorldState` 顶层结构。
- [x] **[SV3-2] Engine 2.0 第二刀：拆解 4,600 行 `storageEngine.ts` 与 4,000 行 `llmBrain.ts` 上帝文件 (`ModularStorageAndBrainRegistry`)**：
  - 将 `src/engine/storageEngine.ts`（4624行）按领域拆分为声明式/模块化的子校验器（`src/engine/storage/`），将 `src/engine/llmBrain.ts`（4041行）拆分为独立的领域候选动作注册表（`src/engine/cognition/`），使核心引擎单个文件控制在 1,000 行以内，大幅提升大型游戏的可维护性与编译速度。
- [x] **[SV3-3] Engine 2.0 第三刀：2,500 行 `worldEngine.ts` 回合管线插件化 (`WorldTickPipelineRegistry`)**：
  - 将 `worldEngine.ts` 中硬编码串联的 110+ 个子系统调用重构为清晰的五阶段 `TickStagePipeline`（`PreTurn -> MovementAndEncounter -> ActionAndCombat -> InstitutionAndWorld -> ChronicleAndPostTurn`），让新系统通过标准插件接口挂载。
- [x] **[SV3-4] 视觉一致性与 UI 卡片国风纹理全面精修 (`XianxiaVisualIdentityAudit`)**：
  - 为全站面板、按钮、弹窗与页签统一赋予极具辨识度的东方仙侠美术风格（玄墨底纹、暗金边角纹饰、宣纸卷轴卡片、清晰的角色小头像徽章），确保无论在「故事首页」、「全息大盘」还是「五大工作区」中，每一屏都有丰富的图形、立绘与场景视觉元素，绝无单调的黑底纯文字页。
- [x] **[SV3-5] 全量性能基准测试与线上试玩站 (`chatgpt.site`) 最新视觉版发布验收 (`PerformanceAudit & LivePreviewDeploy`)**：
  - 运行全套 `npm run verify` 与 Canvas 渲染性能测试，确保 2D 小人 Sprite、彩绘瓦片地图、全彩立绘与实地庭院在桌面端与移动端均流畅运行；**立即构建并将这套带星露谷式 2D 场景与全彩立绘的最新版本部署发布到线上预览站 (`https://ai-sect-sandbox-mobile-20261121.spazzzz.chatgpt.site/`)**！

---

## 天道变法主线：大屏全息沙盒、视觉奇观、高能修仙戏剧与架构重塑 (V1–V4 已完成)

以下四阶段（共 20 项）为当前最高优先级队列，按「顶部第一个未勾选项」依次执行：

### V1　大屏全息天道指挥台与 `App.tsx` 架构解耦瘦身 (Panoramic Cockpit & Architecture Refactor)

- [x] **[V1-1] 大屏全息同屏指挥台模式 (Panoramic God-View Cockpit Mode)**：构建 `src/components/PanoramicCockpit.tsx`。在宽屏桌面端（或通过顶栏一键切换「全息大盘 / 故事书卷」视图，同时保持现有默认测试契约 100% 兼容），提供无需层层翻找折叠菜单的同屏三栏指挥台：**左栏为 2D 九州动态沙盒大地图 (`WorldMapCanvas`) + 快捷时间推演控制栏**；**中栏为当前主角戏剧舞台 + 当月核心奇遇/冲突焦点**；**右栏为选中修士的识海思维链 (`AgentInspector`) + 因果关系拓扑 (`RelationshipGraph`) + 实时编年史流**。补充组件与切换测试。
- [x] **[V1-2] `App.tsx` 架构解耦第一刀：抽离世界推演与时间线控制器 (`useWorldSimulationController`)**：当前 `src/App.tsx` 已膨胀至 2000+ 行。将世界状态推进、快进 Worker 编排、时间线分支切换、自动播放定时器以及 Fair Model Turn 调度逻辑抽离至 `src/controllers/useWorldSimulationController.ts`，使 `App.tsx` 大幅瘦身并保持所有既有单元测试与集成测试零回归。
- [x] **[V1-3] `App.tsx` 架构解耦第二刀：聚合零散制度小面板为三大主题总览中心 (`InstitutionHubPanel`)**：将散落在 `App.tsx` 中的几十个微型制度/账本面板（如工坊、借器、运费、乡祠、驿站、观象、静养、义仓等）按领域整合进 `src/components/hubs/SectAffairsHub.tsx`（宗门内政与工坊总览）、`src/components/hubs/CivicWorldHub.tsx`（九州民生与坊市商路总览）、`src/components/hubs/ChronicleArchiveHub.tsx`（天机史馆与考据总览），用清晰的二级 Tab 替代冗长的手风琴堆叠，将 `App.tsx` 行数压缩 40% 以上。
- [x] **[V1-4] 地图悬浮气泡检视器与就地交互 (`MapEntityPopover`)**：在 `WorldMapCanvas` 上点击或悬停任意灵脉地点、村镇或修士时，直接在地图旁弹出高颜值的半透明古风悬浮检视卡（显示该地灵气/驻留修士/正在发生的大事件/聚落人口，或该修士的境界/气血条/当前动作/内心独白一句话），并支持在悬浮卡上一键「聚焦追踪」、「神念传音」或「降下机缘/雷劫」，无需跳转到其他工作区才能看清地图上的内容。
- [x] **[V1-5] 顶栏全局修仙界态势感知仪 (`WorldPulseBar`)**：在全息指挥台与沙盒工作区顶部增加紧凑的「天地气运态势条」，直观显示：当前九域灵潮节气图标、正魔势力气运对比条、当世战力榜首（天下第一人）、正在渡劫或激战的高危预警闪光标签（点击可直接将地图镜头平滑聚焦到事发地点）。

### V2　九州山河画卷与 2D Canvas 斗法/天劫视觉奇观 (Canvas Visual Spectacle)

- [x] **[V2-1] 九州国风山河地貌与动态灵脉气韵渲染 (`CanvasBiomeShader & QiFlow`)**：升级 `WorldMapCanvas` 的视觉表现力。为不同地形（太虚剑峰、血月魔渊、丹霞灵谷、摘星天机台、极北寒玉脉、东海外港、西漠盐井、高原雷脊、上界阵原）绘制具有国风辨识度的地貌纹理、云雾粒子、灵气光环呼吸灯效，以及连接各地脉的流光灵气粒子线。
- [x] **[V2-2] 御剑流光、飞剑传书与跨区商队动态轨迹 (`CanvasTrajectoryVFX`)**：在 `WorldMapCanvas` 上用平滑插值动画直观渲染修士的跨地点移动（正道化作青金剑光尾迹、魔道化作血影流光）、密函飞剑传书的金色流光弧线、以及跨境商队/朝山巡礼队伍在驿路上的行进图标，让沙盒地图真正“活起来”。
- [x] **[V2-3] 生死斗法剑气碰撞与九重雷劫天威特效 (`CanvasCombatAndTribulationVFX`)**：当某地点发生修士生死斗法、宗门攻防战或大境界渡劫时，在 `WorldMapCanvas` 对应坐标渲染醒目的动态视觉演出：斗法时的双色剑气交击火花与气血浮动飘字（`-320 HP`）、渡劫时的紫霄劫云漩涡与落雷闪电链、破境成功时的金莲异象光柱。
- [x] **[V2-4] 修士头顶微缩状态徽章与戏剧气泡 (`CanvasActorBadges`)**：在地图上的修士节点旁渲染直观的微缩视觉指示器：残血重伤闪烁红光、即将破境圆满环绕金光、心魔缠身环绕紫黑煞气，并在其触发高光台词或重要决策时在地图头顶弹出简短的古风台词气泡（如*“今日便斩你证道！”*、*“天地灵气，入我金丹！”*）。
- [x] **[V2-5] 护山大阵光幕与九域全景战略缩略图 (`ProtectiveArrayDome & StrategicMinimap`)**：为各大宗门驻地渲染半透明的「护山大阵」阵法穹顶（完整度随大阵耐久变化，遭围攻时出现裂纹特效）；升级九域全景导航小地图，支持一键在「本域精细画卷」与「九域十洲无缝战略全图」之间缩放巡览。

### V3　修仙爽感回归：肉鸽奇遇抉择、上古神通、心魔幻境与仙魔大劫 (High-Drama Xianxia Gameplay)

- [x] **[V3-1] 秘境探索与游历「三选一」肉鸽奇遇事件台 (`RoguelikeEncounterModal`)**：构建 `src/engine/roguelikeEncounterEngine.ts` 与 `src/components/RoguelikeEncounterCard.tsx`。当玩家引导的主角（或重点关注的修士）探索秘境、古迹或跨域游历时，触发极具修仙小说代入感的奇遇事件（如*“误入坐化剑仙洞府”*、*“偶遇重伤垂死的千年妖修求救”*、*“发现带有心魔封印的上古残卷”*），提供 3 个风险与收益截然不同的抉择分支（离线时由 NPC 性格自动抉择，玩家引导时可亲自拍板），直接影响功法领悟、气运、寿元或结下奇缘。
- [x] **[V3-2] 逆天改命词条与本命神通觉醒系统 (`DestinyTraits & SignatureDivineArts`)**：创建 `src/engine/destinyTraitEngine.ts`。每次修士突破大境界（筑基→金丹→元婴→化神→渡劫）时，可从随机刷出的 3 个「逆天改命」先天/后天命格词条中觉醒其一（如*【剑心通明】*、*【血海不枯】*、*【天道宠儿】*、*【苟道至尊】*、*【丹毒化灵】*），不仅带来独特的战斗与修行机制加成，还会显著改变其面对危机时的行为风格并在人物档案中以炫酷徽章展示。
- [x] **[V3-3] 沉浸式「心魔劫」幻境拷问剧场 (`HeartDemonTrialTheatre`)**：当修士冲击金丹/元婴/化神遭遇心魔劫时，根据其真实的生平执念、未报血仇、亏欠的道侣或师徒因果，生成一场直击灵魂的「心魔幻境对决」（心魔化作其宿敌或挚友质问其道心）。提供“斩断尘缘”、“以杀止杀”或“直面愧疚”的破劫选择；破劫成功则道心大进，失败则走火入魔甚至性情大变（正入魔/魔悟道）。
- [x] **[V3-4] 上古十大禁术、法宝器灵复苏与越阶反杀 (`AncientForbiddenArts & SpiritWeaponAwakening`)**：为高阶法宝引入「器灵觉醒」与「燃血催动禁术」机制。当修士在生死决战中濒临绝境（气血低于 25%）时，可选择燃烧寿元或精血发动本命法宝禁招（如*“太虚诛仙剑阵”*、*“万魂血海吞天”*），上演热血的越阶反杀或断臂逃生，生成极具画面感的战斗战报与永恒伤痕印记。
- [x] **[V3-5] 百年仙魔大劫与灭门级护山大阵攻防战 (`GrandSectSiegeTheatre`)**：将正魔冲突与天地大劫升级为可视化的「仙魔大战战役舞台」。展示攻守双方出战长老与真传弟子阵容、护山大阵阵眼破损进度、阵前斗将单挑、太上长老出关救场或掌门自爆金丹护宗的高潮戏码，战后在地图与编年史上留下永久的战场遗迹与宗门兴衰转折。

### V4　群像戏剧舞台与大模型狂野叙事解放 (Dramatic Character Theatre & Wild LLM Storytelling)

- [x] **[V4-1] 宿命对手、师徒反目与道侣生死羁绊戏剧引擎 (`DramaticBondArcEngine`)**：构建 `src/engine/dramaticBondEngine.ts`。自动识别并强化世界中最具戏剧张力的双人/三人关系弧线（如“杀师之仇不共戴天”、“正魔殊途的禁忌道侣”、“同门天骄的掌门继承人之争”），在首页故事舞台与人物面板上以【宿命羁绊卷轴】重点追踪他们的每一次重逢、背叛、救援与决战。
- [x] **[V4-2] 解放 LLM「狂野戏精模式」与个性化古风台词生成 (`WildXianxiaPersonaPrompts`)**：升级 `src/engine/llmBrain.ts` 与 `src/engine/dialogueEngine.ts`。在保证底层状态合法的前提下，赋予 LLM 更大的文学创作自由度：根据修士的性格（狂傲、阴险、苟道、痴情、嗜血）与命格词条，生成极具网文爽感与古典仙侠韵味的内心独白、战前叫阵诗词、临终遗言与密谋私语，彻底告别千篇一律的干瘪公文腔。
- [x] **[V4-3] 交互式「随身老爷爷 / 天道降旨」实时对话审讯台 (`InteractiveRingGrandpaChat`)**：升级 `PossessionPanel` 与 `GodConsole`，允许玩家以“戒指里的上古残魂”或“天道化身”身份，与任意修士展开多轮自然语言交互（支持离线性格仿真应答与在线 LLM 实时飙戏）：可以忽悠他叛出宗门、传授他禁忌功法、挑拨他刺杀掌门，并实时看到其道心摇摆度与最终顺从/逆天反抗的决定。
- [x] **[V4-4] 封神榜、陨落英魂录与人物一生传记画卷 (`HallOfImmortals & BiographyScroll`)**：打造高颜值的「天机封神榜 & 历代列传」画卷模态框（`src/components/HallOfImmortalsModal.tsx`）。不仅展示战力榜、恶人榜、炼丹宗师榜，还能为任何一位陨落或飞升的传奇修士一键生成图文并茂的《本纪/世家列传》（串联其出身、拜师、高光奇遇、宿敌决战、逆天命格与结局）。
- [x] **[V4-5] 丝滑新手引导、一键高能开局剧本与全息大盘终极打磨 (`HighDramaScenarioPresets & UXPolish`)**：内置 3 个开局即高潮的特色修仙剧本预设（如*《山雨欲来：正魔决战陨仙墟》*、*《天骄争锋：百年仙门大比前夜》*、*《微末凡人：从寒玉矿奴到万年老祖》*），玩家一键即可进入充满戏剧冲突的鲜活局面，完成大屏全息指挥台与移动端故事模式的体验闭环。

### UI1　界面与地图视觉严格打磨专项：解决文字重叠、死板棋盘、右侧大片留白与线上站同步发布 (Visual Polish & Live Deployment)

> **实机与线上站 (`https://ai-sect-sandbox-mobile-20261121.spazzzz.chatgpt.site/`) 巡检暴露的 7 大 UI 硬伤（必须逐一根治）：**
> 1. **地图文字与圆点严重撞车重叠**：在 `WorldMapCanvas` 上，`太虚剑峰`、`摘星天机台` 与 `松灯坊市`、`丹霞灵谷`、`血月魔渊` 处，修士圆圈、修士姓名、`[宗1]`~`[宗4]` 框、地点标题、`〈灵根〉`、`炉1/2/3 卫1 经 祠 秘`、`兽1`、`潮`、`灵气 85` 全部叠在同一坐标上，字压字完全看不清！
> 2. **地图背景像简陋的扫雷方格表，人物只是纯色小圆点**：`15×9` 方块网格线与粗虚线领地框太生硬，人物只是单调的纯色实心圆点（`●`），缺乏仙侠画卷美感。
> 3. **右下角小地图配色刺眼且遮挡魔渊**：右下角的彩色马赛克缩略图 / `战略小地图` 直接盖在 `血月魔渊` 区域上。
> 4. **「地图」标签页右侧 80% 是黑屏大留白**：`views.map` 右侧栏（`<aside aria-label="当前修士">`）只有三行字，下面整片黑屏浪费，而常用的「地图工具」却被挤到屏幕下方折叠起来！
> 5. **首页到沙盒入口藏得太深（要连点 3 层），且 `全息大盘` 在 `1112px` 笔记本屏上不显示**：从故事首页进沙盒地图竟然要点 `走进故事 -> 更多工具 -> 查看地图、纪事与存档` 三次；`CockpitModeSwitch` 设了 `1280px` 门槛导致普通笔记本屏看不到；`另选开局剧本` 没有按钮边框样式像普通文字。
> 6. **「人物」等标签页全是折叠黑框 + 英文枚举泄露 (`当前: CULTIVATE`)**：`AgentInspector` 里状态徽章直接裸露英文 `当前: CULTIVATE`（应汉化为 `当前：吐纳修炼` 等中文）；桌面端左侧 `修士名册` 默认折叠导致左栏空旷。
> 7. **线上预览站 (`chatgpt.site`) 未同步发布最新代码**：完成 UI 与小说打磨后必须重新构建并同步发布线上预览站。

- [x] **[UI1-1] 根治地图文字、标签与节点重叠碰撞 (`MapCollisionFreeLayout & CleanNodeLabels`)**：
  1) 拉开过近的地点坐标（如 `摘星天机台` 与 `松灯坊市` 保持足够垂直与水平间距，避免标题互踩）；
  2) 将 `[宗1]`~`[宗4]` 领地角标移至领地边界角落（或改用低调的领地底纹），严禁画在宗门驻地圆心正上方；
  3) **大幅精简地图常驻文字**：地点节点上方只绘制带半透明墨色胶囊底托的「地点名 + 灵根色标」，将冗长的 `炉2 卫1 经 祠 集 俸 苗 共器 校` 等后缀收进点击/悬停的 `MapEntityPopover` 详情卡内；
  4) 优化在场修士环绕轨道角度与半径（避开正北 `y - 26` 地点名与正南 `y + 33` 灵气文字扇区），给修士姓名加上清晰深色描边底托，确保全图 **0 文字重叠**。
- [x] **[UI1-2] 去棋盘化国风山河画卷与不遮挡魔渊的古风罗盘缩略图 (`OrganicInkMap & NonOccludingMinimap`)**：
  1) 弱化 `terrainMapDraw.ts` 中生硬的方格直线网格与刺眼粗虚线，采用柔和的国风青黛/玄墨渐变过渡、温润的领地光晕边界与水墨山川暗纹；
  2) 重塑右下角缩略小地图 (`StrategicMinimap`)：去掉刺眼的高饱和粉绿橘马赛克色块，改用与主图协调的暗金玄墨古风配色，支持折叠为精致的「山河罗盘」小按钮，并将小地图或 `血月魔渊` 坐标合理错开，确保**绝不遮挡 `血月魔渊` 节点与文字**。
- [x] **[UI1-3] 地图驻地地标与修士棋子视觉精致化 (`StylizedLandmarkGlyphs & AvatarTokens`)**：告别“空心黑圈 + 纯色小圆点”的电路板画风！在 `WorldMapCanvas` 上为宗门山门、秘境、魔渊、坊市、灵脉绘制精美的国风矢量中心徽记（如剑峰、丹鼎、星盘、魔月、古亭图案 + 多层灵气光晕），为修士棋子绘制带内环纹理、境界光圈与高光质感的精致玉牌/棋子造型。
- [x] **[UI1-4] 填补「地图」工作区右侧 80% 空白：立绘 + 气血灵气条 + 识海心声 + 快捷天道同屏侧栏 (`RichMapSidebarDossier`)**：升级 `src/App.tsx` 中 `views.map` 右侧的 `<aside aria-label="当前修士">`（从 `17rem` 扩宽至 `21rem`~`23rem` 并充实内容）：同屏展示选中修士的**水墨 SVG 立绘 (`CultivatorPortrait`) + 境界/宗门/命格徽章 + 气血与灵气可视化进度条 + 识海内心独白引文框 + 本命法宝/道途状态 + 当前所在地见闻摘要 + 快捷「聚焦 / 传音 / 赐宝 / 降雷」天道操作**，彻底消灭右侧黑屏留白。
- [x] **[UI1-5] 修复英文枚举泄露 (`CULTIVATE`)、桌面端展开名册、优化首页直达沙盒入口并同步发布线上站 (`UXPolishAndLiveDeploy`)**：
  1) 将 `AgentInspector.tsx` 及全站所有裸露的英文 `ActionType` 枚举（如 `当前: CULTIVATE`、`BREAKTHROUGH`、`EXPLORE`、`SCHEMING`、`DUEL`、`SOCIALIZE`、`REST`）全面映射为典雅的中文（如 `吐纳修炼`、`破境冲关`、`御剑游历`、`暗中谋划`、`生死斗法`、`品茗论道`、`闭关调息`）；
  2) 在桌面宽屏（`>= 768px`）下，「人物」页左侧 `ActorRoster`（修士名册）默认展开显示人物列表（带头像缩略图与境界），不再默认折叠留白；
  3) 将 `CockpitModeSwitch`（全息大盘切换）的宽屏阈值从 `1280px` 放宽至 `1024px`（覆盖主流笔记本屏幕），美化 `另选开局剧本` 的卡片/按钮边框，并在宽屏首页提供更直观的沙盒/大盘切换体验（同时保持既有窄屏 360px 测试契约 100% 兼容）；
  4) **重新构建并将最新前端版本发布更新到线上预览站点 (`https://ai-sect-sandbox-mobile-20261121.spazzzz.chatgpt.site/`)**！

### N1　连载章回小说的呼吸感：平淡闲笔铺垫、疏密详略与跨章起承转合 (Serialized Novel Pacing & Continuity)

> **核心文学准则：** 每一章要像真正的连载修仙小说一样——**绝不能要求每一段文字都惊天动地、句句高潮！** 满篇高潮只会变成流水账快讯。真正的连载小说必须有**平淡日常的闲笔过渡、山中岁月的慢节奏铺垫、次要琐事的平实略写**，用 70% 平实有烟火气的过渡文字去烘托每章仅有的 1~2 处核心戏眼，并做到章首承接上回、章末留白悬念。

- [x] **[N1-1] 章回内部「疏密详略」编排器：一章一戏眼，其余皆化平实闲笔 (`SerializedChapterPacing & MundaneTransitions`)**：改造 `src/engine/novelGenerator.ts` 与章节生成管线。取消将一章内十几个锚点事件全部写成同等权重“高光小标题”的做法；将每章结构重编为 **「起（节气风物与山门日常闲笔）→ 承（行旅、吐纳、坊市交割等次要事件的平实串场，不单列夸张标题）→ 转（本章唯一 1~2 处核心戏眼展开）→ 合（余波散去与平淡收束）」**。让大部分过场文字保持平实、克制、从容的叙述节奏。
- [x] **[N1-2] 跨章「书接上回」与章末「连载留白钩子」承接链 (`ChapterContinuityThread & CliffhangerHooks`)**：在相邻章节之间建立真实的叙事承接。新章开篇自然承接上一章末尾人物的落脚处、伤势调养、未走完的旅途或时令更替（如*“上回陨仙墟的动静散去后，太虚剑峰接着落了半月春雨，山中一时无话……”*）；每章末尾根据当前真实在途的行程、未开的秘境先兆或正在闭关的人，留下一句平淡却吊人胃口的连载收尾（如*“至于北岭那批暖芦何时过关，已是入冬以后的事了。”*），严禁编造未发生的事实。
- [x] **[N1-3] 修仙界「烟火日常与山中岁月」平淡闲笔库 (`MundaneXianxiaLifeProse`)**：创建 `src/engine/mundaneLifeProse.ts`。针对“并无大战发生”的寻常月份与次要人物动向，结合当前真实的四时节气、地域风貌（如丹霞炉火、外港潮汐、寒玉井绳、村落耕作）与修士日常（闭关吐纳、照看灵田、山径赶路、坊市歇脚），生成平淡、真实、有呼吸感的日常闲笔过渡段，营造“山中无甲子，寒尽不知年”的修仙连载韵味。
- [x] **[N1-4] 核心戏眼的多层次「过程与环境烘托」扩写 (`FocalSceneLayeredExpansion`)**：在一章 70% 平淡日常与过渡铺垫的基础上，对本章选出的唯一「核心戏眼」（如一场真正发生的生死决战、一次九重雷劫或宗门攻防）进行有层次的细节展开（从战前山风/炉火的寂静、交手时的道途剑意/禁术痕迹、到胜负落定后的现场余音），通过“平淡闲笔 vs 核心戏眼”的疏密对比，拉满连载章节的阅读张力。
- [x] **[N1-5] 沉浸式「连载追更书页」排版：连贯散文流与低调史料角标 (`SerializedBookPageTypography`)**：升级 `ChronicleLibraryPanel` 中的章节阅读视图。将同一章的起、承、转、合渲染为连贯、舒适的连载小说书页段落流，去掉打断阅读心流的碎片化外框与冗余机械标签；将每个段落对应的原始事件时间与实据隐藏为段末低调的古风角标/注脚（点击注脚可展开核查原始事件与证词），兼顾纯粹的连载小说阅读体验与 100% 史实可核查性。

---

## 纪元主线 (E1–E4 已完成基座)

下面三阶段是自动执行器当前的优先队列，沿用「顶部第一个未勾选项」规则。原有 Phase 0–18 的编号、状态和相对顺序保留在后。每阶段末项都要交付一个可以进场、做选择、再存档的年代。

**起点。** 在 `4ff38bc` 的经典谱系、种子 `2031` 下，从仙历 1001 年一月离线逐月推进 600 个月，全程无干预。1051 年一月有 207 名在世修士、213 名历代入册修士、11 名创世修士仍在、三村在籍凡人共 331 名。6,035,977 字节的存档已验证读回、推进和分叉。此例可从种子重建，无需私人存档。数值仅用于识别版本差异。实施起点的单次快进上限为 120 个月，传统 JSON 导入上限为 8 MiB。百年、千年和万年分别按实测认定。

### E1　百年后入世

- [x] **[E1-1] 选择抵达的仙历。** 在「更多 → 纪事 → 原始时间线与分支」的现有快进入口接受目标年、月，按所在分支的年月换算。先支持现有单批范围，显示预计月数、进度和取消。验收跨年、过去日期、越界和取消后原世界仍可玩，用普通单步核对同月结果。
- [x] **[E1-2] 可重跑的长局丈量。** 扩展现有无头工具，从同一起点按 10、25、50 年取样，再选一个不同种子做对照。输出四类人口、掌门更替、实测耗时、存档字节和读回结果。用小样本验证口径，保留日后复跑长样本的命令。
- [x] **[E1-3] 可携带的年代检查点。** 每个年代节点登记来源分支、规则版本、仙历和内容校验值。小档沿用现有 JSON，超出单文件预算时提供可分块保存并整体恢复的路径。验证旧档、缺块、损坏、中断与重复导入，保持人物、财物、未结契约和原存档完整。
- [x] **[E1-4] 跨批按年推演。** 让一次目标年份请求在同一条候选时间线上分批逐月推进，定期落下已验证节点。暂停、关闭后恢复、取消和重复点击都从正确月份接续。每个内部批次不占一个玩家分支。用十年、五十年样本与连续月算核对，再回到源线继续玩。
- [x] **[E1-5] 遇见关心的变化就停。** 在目标年份之外允许选一个停止条件，如指定掌门更替、某人陨落或某地易主。取条件首次成立的真实月份与对应事件。验收提前触发、同月多事、期限内未触发和重载续跑。
- [x] **[E1-6] 让旧事在多年后仍可查。** 给影响后世的死亡、继任、迁徙和契约留持久索引，携带稳定实体 ID、时间、来源和仍可查的凭据。轮换近期日志后，晚世读者仍能找到原事或得知原件已失。测试同名人、同年异支与见闻权限。
- [x] **[E1-7] 在年代中选人入世。** 从保留的节点列出有来历的当地人，显示一段已发生的经历和一件仍待决定的事。可以选凡人出身的后进、仍在世的创世人物或只观察。验证重名、角色已故、正在参赛时的行动资格，以及返回原年代。
- [x] **[E1-8] 比较同一个人的两种命运。** 扩展现有分支对照，按同一人物、村庄或宗门查看共同起点后的首个有据差异、一个后果及其事件。用一次赐宝的同源样本验证突破、斩杀或继任。没有证据的远因保留为未知。
- [x] **[E1-9] 随机创世也能复演。** 在现有创世表单一键抽取并显示可复制的种子，同时保留手填种子与谱系。核对同规则、同种子和相同干预能重演。多个种子记录实际人物、战事和行动差异。
- [x] **[E1-10] 百年可玩验收。** 从创世逐月推满 1,200 个月，途中退出并恢复。在验证过的百年节点选一名在世者，采取一次合法行动，另开旁观线，并将两线分别存读、再推一月。公布实测用时、档案总字节、人口、可回查事件和适用设备环境。

### E2　玩家编写未来，地方经历兴衰

- [x] **[E2-1] 修士会因局势改变打算。** 在可选事务间用性格、所知情报、供需、旧约与近期重复行动调节权重，保留救急和已承诺事项的优先权。多种子统计自发行动与重复率。验证资源不足、目标不在场和同种复演。
- [x] **[E2-2] 有先兆的秘境。** 宗门大比沿用历法。让秘境开启的地点与时窗受当地灵气、天候和实地探查影响。不同修士可因收到线索的时间而争夺、救援或避险。验证无人探查、错过窗口与线索过期。
- [x] **[E2-3] 《丹荒之年》由世界触发。** 将当地霜息、药草再生、库存和已承担的用药需求接成危机。给丹霞弟子和求药村户具体身份。用一组短缺和一组足以自给的世界验证触发、解除和防重复。
- [x] **[E2-4] 留药、送药或旁观。** 让有资格的当事人决定留药开炉或委托护送，玩家可介入，也可让离线修士自行作决定。检验同一批药材只能花一次，承诺、在途、交付和失约各自有结果，期限到了世界继续走。
- [x] **[E2-5] 来年算旧账。** 增加由真实过程判定的剧本目标。次季根据兑现情况决定续约、改投他宗或拒绝往来。让玩家从当事人回查原承诺和实交，比较两条线对同一弟子与村庄的影响。旧版末回合目标仍可载入。
- [x] **[E2-6] 迁村、成城与遗址。** 当水源、人口和通路持续改变，允许一个聚落迁出、废弃或成长为城镇。地图留下旧址和新路，居民、未成年人、库存和职责有去向。验证留守、部分迁徙、灾后复居及旧地名的查找。
- [x] **[E2-7] 道统成为新势力。** 接续已有道统分野、宗门迁移与传承。让实际成员、传承物和供养地满足条件时建立独立势力。失去根基可并入、散亡或留下后继。验证谁继承哪项资产、旧债和名号，分裂两方仍可继续行动。
- [x] **[E2-8] 写下纪元条件。** 在现有剧本编辑器选择未来年月及两三条结构化设定，如寒玉脉枯竭、丹霞一支迁北。预览地点、成员及资产的约束冲突，显示作者设定的来源。草案可保存、重开和修改，编辑或取消时保持在玩世界完整。
- [x] **[E2-9] 从写定的未来真正开玩。** 按草案和种子生成自洽的当代人口、地权、承继与在途义务。整体验证后由玩家确认，一次创建可玩的独立分支，提供有资格的当代人物和行动。纪事区分设定、已有实录与从此刻发生的事件。同设定可复演，失败可返回草案，原线和旧剧本仍可恢复。
- [x] **[E2-10] 自然未来与作者未来对读。** 从同一起点选择一个已支持的未来年份，一线放手推演，一线写定两三条史实。各自进场、干预、导出读回并对照谁拥有寒玉脉、村户在哪里、哪项承诺尚在。为两线分别标明事实来源与可追溯的最早节点。

### E3　多域千年与天门再开

- [x] **[E3-1] 地域按远近推演。** 为人物、聚落、地脉和跨域通路登记稳定的归属。玩家所在区域逐月运行，远区引入带规则版本的年度结算。用同种小世界和逐月参照比较人口、资源与重要事件，公布精确对齐项和近似偏差。
- [x] **[E3-2] 远人近事能展开。** 远域商队接境、战争波及或故人归来时，从确定的年月展开当地人物和待办，到期义务只结算一次。测试往返切换、在途货物、重载和同月冲突。保住已有人物的身份、关系和财产。
- [x] **[E3-3] 百代史料能抵达当世。** 把一件遗物、一份契书和一位长寿见证者接入跨区纪事。数代凡人经历生老迁徙，高阶修士按实有寿元存续。查到原件、只闻转述、证词矛盾三种情况给出不同的行动机会。
- [x] **[E3-4] 《井浅三寸》的天地规则。** 在极北寒玉脉实现天门向下界水脉借取灵气的世界规则。登记具体水脉、开门消耗、影响范围和恢复周期。测试井水、灵田与采矿的先后变化。当地人可发现征兆，能知道多少取决于实地观测和已传到的消息。
- [x] **[E3-5] 当世封矿与通行。** 让村户、矿工和宗门面对封矿保水、维持采矿或出资改道的代价。玩家可以调查采契并参与，也可旁观。以真实井址、受损生计、通路和签署原件留下可供后代处理的事实。
- [x] **[E3-6] 三百年后重返故地。** 在自然演化线验证聚落、驿路或道统的一项长期变化与它的实据，在作者线另验「旧村成禁地」的设定。从迁户后人、守禁弟子或勘脉人中选实际存在且合资格的角色，查旧契并处置本次开禁争议，两线都可续玩。
- [x] **[E3-7] 跨域进入上界。** 通过已建立的通路、资格与代价进入第二层世界。上界阵图能指向下界的真实水脉，下界先前留下的损益能影响交涉。验收中途折返、物资不足与断路后两界各自的变化。
- [x] **[E3-8] 千年规模验收。** 运行至少一个千年自然演化样本并读回，另用千人以上名册压测查询，分别报告数据来源、在世与历代人数。压测人数不设为世界上限。测量区域数、峰值内存、耗时、存档总量和查询延迟。验收跨代同名、分支隔离，以及早期来源可追到当世人物、制度或地图。原 P18-9 继续负责窄屏交互验收。
- [x] **[E3-9] 三千年后天门再开。** 从受前代选择影响的可玩年代决定续用旧阵、由本宗承担损失或与下界合议改阵。每条可行道路要有真实供给和承担者，也允许无人干预时开门失败。当代结果进入下一纪元。分别注明实算、区域年算与作者设定的范围。
- [x] **[E3-10] 跨纪元回访与下一轮扩域。** 在当世、三百年、三千年三个节点读档入世，各从一位可行动的人追到同一处旧井，再推进一个有代价的选择。记录已验证的地域数、最长年代和规模瓶颈。据实把九域、万年拆成 E4 的 10 个新任务，插在本项之后、原 Phase 0–18 之前。每个新地域写清生计、修行代价和跨域交换，以实际可读回的万年节点收尾。E4 后接回原有待办。

### E4　九域相交，万年仍可入世

以下十项依次执行并各自验收。此时只验证下界原三域；不把上界现有节点当新经济地域。万年不改日历、不以作者跳时冒充逐月离线结果，实测阻塞保留原档和最后能继续的月份。九域任务之后接回原队列。

- [x] **[E4-1] 九域名册、空间和边界凭据。** 保留旧西／中／东精确 ID，建可检验的新域注册、权属、真实空间及区际路线，不把地名或界路节点自动算作域。分别验旧档、地图和当前实际见闻。先完成三域兼容基线。
- [x] **[E4-2] 存档分块、去重和脱离玩家分支的复验链。** 以真实 7/8 快照拒绝和千人检索复测读写、RSS 和完整性；在不剪历史、不丢成员与托管前提下分块原子验证，拦损坏和错误构建。按实测调整限制，不静默扩大玩家 1,200 月窗口。
- [x] **[E4-3] 北岭雪谷、南泽灵田的生活与互换。** 两个新登记地域。北岭靠护泉、冬药圃，修行实际费御寒物；南泽靠地力轮作，修行占农工／潮水。用可核库存、真实居民和本来稀缺货物跑互换，测季节绕行及未到货，不能凭区域标签生货。
- [x] **[E4-4] 东海外港与潮窗商路。** 新海港靠合法靠岸、潮产、修船维生，修行实用船具与潮窗体力。与真实已知内陆港路供销，实际港费、装货、风断、晚到或返航均有记录，海上不复制人物与库存。
- [x] **[E4-5] 西漠盐井、高原雷脊的互补供养。** 两个新域。西漠靠实井预算与盐材，冲境耗水／运输；雷脊靠牧群与雷石，避雷阵耗真正材料。盐材、阵耗或饲料实走至少一批，验缺资和归还，实际居民与责任人可入世。
- [x] **[E4-6] 上界阵原：从真实界路扩出第九域。** 保持已实证门台／阵庭／议廊地址和人身唯一性，新增可生活的阵原区域。供养来自有来源的阵材或时窗贸易，修行费用真实定量；和下界实际旧井做有双方确认的交换，既有水债另算。到此旧三加新六都实体验证，才报九域。
- [x] **[E4-7] 九域承诺和命运的真实跨界后果。** 跑至少两条从生计、消耗、到货到同一人物下一选择的跨域链，验证断路／换代／到期没有重算或凭空付费。用重叠样本比整月和远地区年度计算偏差，单列作者变更来源。
- [x] **[E4-8] 六千年中途实跑和性能剖面。** 以同一验证根实际续演 72,000 月并逐段读回，测真地理域数、人口两口径、文件量、RSS 和查询 p50／p95。合成 1000+ 名册只作单独压力测试。遇首次阻塞保持可验前缀，不调整钟、人物寿元或名册。
- [x] **[E4-9] 万年前的续跑、可玩和失败退出协议。** 针对实际剖面发现的问题改进，并在长局中途实做重启、错规则、损坏包、同名错误与原分支不变。至少从当期真实人物继续一个有代价的合法选择。移动的实机验收仍归 P18-9，实际没测就不承诺。
- [x] **[E4-10] 九域万年后的可读可玩交付。** 从精确共同源走完 120,000 个原生年月（若仍以 T34／1003-10 为起，月序 T120034／11003-10）。实际打包、另一进程严格读回，核实九域与早期人、制度或地图的关系，从合资格当世人完成一个有真实代价的下一选择。单列逐月／区域年算／作者覆盖和所有未过项；不拿九块地图冒充九域或只靠日历标注万年。随后接回原待办。

---

## Phase 0: Foundation & Core Loop (已完成基座)
- [x] **[P0-1]** Initialize Vite + React + TypeScript + Tailwind + Vitest workspace.
- [x] **[P0-2]** Define core domain types (`Cultivator`, `Sect`, `LocationNode`, `MemoryEntry`, `RelationshipEdge`, `WorldEvent`, `LLMDecisionPayload`) in `src/types/world.ts`.
- [x] **[P0-3]** Build procedural initial world with 4 distinct Sects, 9 cultivation realms, spirit veins, and initial cultivators in `src/data/initialWorld.ts`.
- [x] **[P0-4]** Implement core tick engine (`advanceWorldTick`, breakthrough/tribulation rolls, combat resolution, relationship updates, God interventions) in `src/engine/worldEngine.ts`.
- [x] **[P0-5]** Implement Dual-Mode AI Brain (`src/engine/llmBrain.ts`) supporting OpenAI/Gemini compatible API structured JSON decisions + offline heuristic Utility AI fallback.
- [x] **[P0-6]** Build interactive 2D World Map Canvas, SVG Relationship Graph, God Intervention Console, Agent Psyche Inspector, and Chronicle Feed.
- [x] **[P0-7]** Establish initial Vitest suite (`tests/worldEngine.test.ts`) verifying tick progression, breakthroughs, and God interventions.

---

## Phase 1: Deep Cognitive Architecture & Memory Reflection (斯坦福小镇式记忆与心魔系统)
- [x] **[P1-1] Episodic Memory Importance & Decay System**: Enhance `MemoryEntry` in `src/types/world.ts` and `src/engine/worldEngine.ts` with `importance` (1-10), `emotionalValence` (-5 to +5), and `decayRate`. Implement automatic memory pruning and long-term core memory consolidation every 12 ticks (1 virtual year). Add unit tests in `tests/memory.test.ts`.
- [x] **[P1-2] Daily/Yearly Self-Reflection Synthesis (记忆反思与道心凝练)**: Create `src/engine/reflectionEngine.ts`. Every 12 ticks, each cultivator synthesizes their recent high-importance memories into higher-level `Belief` / `CoreObsession` (执念/心魔) statements (via LLM or heuristic synthesizer). Display active Obsessions and Heart Demons in `AgentInspector.tsx`.
- [x] **[P1-3] Rumor & Information Propagation Network (修仙界流言与情报网)**: Implement `src/engine/rumorEngine.ts`. Cultivators do not have omniscient knowledge of the world; instead, when an event happens at a location, witnesses record a `Rumor` and spread it to others at the same location or via sect flying swords (飞剑传书). False or exaggerated rumors can be fabricated by deceitful (`阴险`/`诡诈`) NPCs.
- [x] **[P1-4] Secret Schemes & Multi-Tick Goals (长线阴谋与多步计划状态机)**: Add `activeScheme` to `Cultivator` (e.g., "Infiltrate Blood Moon Sect", "Save spirit stones for Foundation Establishment Pill", "Avenge fallen master", "Steal Sect Supreme Artifact"). Break schemes into 3-5 sequential sub-steps tracked across ticks, visible in `AgentInspector.tsx`.
- [x] **[P1-5] Dialogue & Debate Generator (修士论道与对峙剧场)**: When two cultivators meet for combat, trade, dual cultivation, or sect diplomacy, generate a multi-turn dramatic dialogue transcript (`DialogueExchange`) stored in the event log and viewable in a dedicated modal or expandable card in `ChronicleFeed.tsx`.

---

## Phase 2: Rich Cultivation, Alchemy, Artifacts & Techniques (功法、炼丹、炼器与天劫深度演化)
- [x] **[P2-1] Elemental Five-Phases Affinity & Spirit Roots (五行灵根与相生相克)**: Add `SpiritRoot` (`金`, `木`, `水`, `火`, `土`, `雷`, `暗`, `天灵根`) to cultivators, locations, techniques, and artifacts. Implement elemental damage multipliers and cultivation speed modifiers when practicing matching/clashing techniques on elemental spirit veins.
- [x] **[P2-2] Cultivation Technique Mastery & Procedural Scripture Creation (功法参悟与自创神通)**: Allow High-Realm cultivators (`元婴` and above) to author original techniques (`Technique`) named after their personality and history, storing them in their Sect Pavilion (藏经阁) or dropping them as inheritance scrolls upon death.
- [x] **[P2-3] Alchemy System: Herbs, Recipes, Furnaces & Pill Toxicity (炼丹系统与丹毒机制)**: Create `src/engine/alchemyEngine.ts`. Add gatherable spirit herbs on map nodes, alchemy recipes (筑基丹, 九转金丹, 破障丹, 噬心毒丹), crafting success rolls, and `pillToxicity` accumulation on cultivators who over-consume pills.
- [x] **[P2-4] Artifact Forging, Spirit Weapon Souls & Looting (法宝炼制、器灵与杀人夺宝)**: Create `src/engine/artifactEngine.ts`. Support tiered equipment (`法器` -> `灵器` -> `法宝` -> `通天灵宝`), artifact durability, blood-binding (滴血认主), and automatic looting of a slain enemy's storage ring (储物戒) after lethal duels.
- [x] **[P2-5] Multi-Stage Heavenly Tribulation & Heart Demon Trial (九重雷劫与心魔劫演武)**: Upgrade breakthrough to `金丹`, `元婴`, `化神`, `渡劫` into a multi-wave tribulation event (`src/engine/tribulationEngine.ts`). Include physical lightning waves (mitigated by artifacts/pills), Heart Demon trials (mitigated by Dao Heart stability & low unresolved grudges), and external interference (enemies ambushing a cultivator during their tribulation!).

---

## Phase 3: Sect Politics, Territory Economy & Faction Warfare (宗门内政、领地经济与正魔大战)
- [x] **[P3-1] Sect Hierarchy, Elections & Coup d'État (宗门职位晋升与夺权政变)**: Implement sect ranks (`外门弟子` -> `内门弟子` -> `真传弟子` -> `长老` -> `太上长老` -> `掌门`). Automatically promote based on realm and sect contribution points (`contribution`). Allow ambitious elders with high power and faction backing to challenge or assassinate the Sect Leader.
- [x] **[P3-2] Sect Buildings, Spirit Stone Mines & Array Formations (宗门建设与护山大阵)**: Add buildable facilities to Sect headquarters (`聚灵阵`, `炼丹房`, `藏经阁`, `护山大阵`, `灵石矿脉`). Sects collect monthly tax/spirit stones, maintain their defensive array HP, and dispatch disciples to guard resource nodes.
- [x] **[P3-3] Inter-Sect Diplomacy Matrix & War Declarations (宗门外交矩阵与宗门大战)**: Track bilateral sect relations (-100 Blood Feud to +100 Sworn Alliance). Implement formal War Declarations, Alliance Treaties, Tribute Demands, and full-scale Sect Siege campaigns where 5+ cultivators march together to attack an enemy sect's Protective Array.
- [x] **[P3-4] Grand Sect Tournament & Secret Realm Expeditions (百年宗门大比与上古秘境开启)**: Every 60 ticks (5 years), spawn either an Inter-Sect Grand Tournament (bracket duel with rich rewards & prestige) or a temporary Ancient Secret Realm (上古秘境) on the map with high mortality and legendary loot.
- [x] **[P3-5] Demonic Corruption, Bounty Board & Righteous Alliances (魔道悬赏榜与正道讨魔盟)**: Add a global Bounty Board (`天机悬赏榜`). Cultivators who commit mass slaughter or betray their sect gain `karma` (业力/魔气) and get placed on the bounty board, attracting righteous bounty hunters.

---

## Phase 4: Spatial 2D WorldBox Map & Interactive Canvas Upgrades (2D 像素/水墨沙盒地图深度进化)
- [x] **[P4-1] Grid/Tile Biome Map Generator & Fog of War (多地形网格地图与灵气分布热力图)**: Upgrade `src/components/WorldMapCanvas.tsx` and world data to render rich terrain biomes (灵山, 毒沼, 剑冢, 荒漠, 魔渊, 坊市), animated spirit qi density heatmap overlay, and territory borders colored by controlling sect.
- [x] **[P4-2] Smooth Entity Pathfinding, Projectiles & Combat VFX (剑光飞行、斗法粒子特效与渡劫雷云)**: Add sub-tick interpolated movement trails (御剑飞行流光), floating damage/breakthrough text popups, sword beam clashes during duels, and dramatic lightning bolts on the Canvas when a tribulation or God Smite occurs.
- [x] **[P4-3] Map Zoom, Pan, Minimap & Brush Tooling (地图缩放平移与天道地形画笔)**: Implement mouse-wheel zoom, click-and-drag pan, a corner minimap, and WorldBox-style God Brushes (paint Spirit Veins, drop Meteorite, spawn Beast Tide, raise Cursed Miasma directly by clicking/dragging on the canvas).
- [x] **[P4-4] Roaming Spirit Beasts & Monster Lairs (妖兽森林、护宝灵兽与兽潮爆发)**: Populate wilderness nodes with Spirit Beasts (`妖兽` / `凶兽` / `瑞兽`) that cultivate, guard herbs, attack passing low-realm cultivators, can be tamed as Spirit Pets (`灵宠`), or erupt into periodic Beast Tides (`兽潮`).

---

## Phase 5: Advanced LLM Multi-Agent Orchestration & Token Burners (高阶多智能体博弈与深度烧Token引擎)
- [x] **[P5-1] Sect Elder Council Multi-Agent Debate (宗门长老议事厅多Agent圆桌辩论)**: Create `src/engine/councilEngine.ts` and `src/components/SectCouncilModal.tsx`. Allow the user (or periodic annual trigger) to convene a Sect Council where 3-5 top elders of a sect conduct a multi-turn LLM debate on sect strategy (declare war, expel a traitor, allocate the last Foundation Pill) and vote on a binding policy.
- [x] **[P5-2] Heavenly Dao Chronicler & Chapter Novel Generator (天道史官：自动生成连载修仙小说章节)**: Create `src/engine/novelGenerator.ts` and a "藏书阁 / 纪传体史书" UI tab. Accumulate every 12-24 ticks of world events, dialogues, and character arcs and synthesize them into a rich, literary Chinese Xianxia novel chapter (`第X章：...`) with character biographies!
- [x] **[P5-3] Batch Concurrent LLM Agent Scheduler & Token Telemetry Dashboard (并发Agent推理调度器与Token消耗仪表盘)**: Track real-time prompt tokens, completion tokens, latency, requests per minute, and estimated cost across all NPC brain calls. Add a sleek Telemetry Panel in the header/drawer and support configurable batch concurrency (e.g., running 5 NPC LLM calls in parallel per tick).
- [x] **[P5-4] Player Avatar Possession & Interactive Chat/Torture/Recruitment (夺舍降临模式：玩家亲自对话、审问或收徒)**: Allow the user to "Possess (夺舍)" any cultivator or speak as an Ancient Ring Grandpa (随身老爷爷) directly via a real-time chat box with that NPC, persuading, deceiving, guiding, or interrogating them in natural language.

---

## Phase 6: Persistence, Time Travel, Analytics & Replay Studio (存档、时间轴回溯与数据大屏)
- [x] **[P6-1] IndexedDB / LocalStorage Save Slots & JSON World Export/Import (多槽位存档与世界种子导出)**: Build `src/engine/storageEngine.ts` enabling full world snapshot saving, loading, JSON file export/import, and custom World Seed configuration before starting a new universe.
- [x] **[P6-2] Snapshot Time-Machine & Branching Timelines (时光倒流与平行宇宙分支)**: Keep ring-buffer snapshots of the last 50 ticks so the user can scrub backward on a timeline slider, inspect historical states, and fork a new timeline by injecting a different God Intervention in the past.
- [x] **[P6-3] Cultivation World Analytics & Demographics Charts (修仙界宏观人口、境界金字塔与灵石经济图表)**: Build `src/components/AnalyticsModal.tsx` showing SVG charts of realm population distribution over time, sect wealth power curves, mortality causes pie chart (天劫 vs 仇杀 vs 寿元耗尽), and top legendary cultivators hall of fame (封神榜 / 陨落榜).
- [x] **[P6-4] Headless 1000-Tick Stress Benchmark & Balance Auto-Tuner (千轮无头压力测试与天道数值平衡测试集)**: Add `tests/simulationBalance.test.ts` that runs a 500-tick headless simulation verifying that population neither goes extinct nor explodes infinitely, sect wars resolve properly, and memory bounds remain stable.

---

## Phase 7: Living Legacies, Markets & Accountable Institutions (传承、鬼市与宗门制度)

- [x] **[P7-1] Apprenticeship, Teaching & Inheritance Chains (师徒授艺与衣钵谱系)**: Give mentors a limited teaching budget, allow apprentices to accept or refuse tuition, and propagate unlocked techniques and flawed interpretations along the lineage. Show proficiency changes and an inspectable lineage, and test that unrelated NPCs receive no training benefit.
- [x] **[P7-2] Sect Contracts & Oath Arbitration (天道契书与宗门仲裁)**: Model scoped terms, collateral escrow, milestones and deadlines. Process fulfillment and breach exactly once, make settlement depend on evidence, and show escrow flow and appeal status in the diplomacy UI.
- [x] **[P7-3] Seasonal Qi Weather & Resource Migrations (四时灵潮与灵脉迁徙)**: Add deterministic seasonal qi fronts that alter herb regeneration, travel and monster migration without destroying resources arbitrarily. Show forecasts separately from observations and batch-test multiple seeds for bounded resource levels.
- [x] **[P7-4] Regional Order Books & Merchant Caravans (坊市挂单与跨境商队)**: Turn regional trading into inventory-conserving, price-time matched orders with escrow and caravan transit. Model market closures, partial fills and lost shipments; expose positions, receipts and settlement in the market pane.
- [x] **[P7-5] Mortal Villages, Recruitment & Relief (凡人村镇与仙门招徕)**: Add settlements with finite populations, willingness to join sects, and relief decisions after disasters. Recruit only eligible volunteers, track migration and sect sponsorship, and inspect population changes on the map.
- [x] **[P7-6] Witness Attestations & False-Report Appeals (证词、辟谣与名誉修复)**: Keep source lineage separate from agreement count; compare testimony with first-hand events without granting NPCs global knowledge. Give a wrongfully accused actor a bounded challenge route and show corroborated, disputed and retracted claims.
- [x] **[P7-7] Funeral Rites, Estates & Heir Disputes (归葬、遗产与继承争议)**: Form an estate from assets left after verified loot, resolve named heirs and claims, and hold memorial events that update relationships. Require zero duplicated assets across corpse, estate, heirs and marketplace.
- [x] **[P7-8] Decision Trace & One-Turn Counterfactuals (天机溯因与单回合假设复盘)**: Record public rationale, legal candidates and deterministic utility scores without exposing hidden reasoning. Let the player replay one turn on an isolated branch with an alternate legal action and compare effects without modifying the original timeline.
- [x] **[P7-9] Accessible World Map Action Parity (键盘山河图与无障碍操作对等)**: Offer a keyboard-accessible node/agent explorer equivalent to essential Canvas controls, including panning, focus tracking, selected actor quick jumps and live event targets. Test reduced motion, keyboard activation and stable focus after realm changes.
- [x] **[P7-10] Doctrinal Schools, Schisms & Reconciliation (道统分野与宗门和解)**: Let beliefs aggregate into schools with evidence and dissent thresholds distinct from rank. Resolve negotiation, peaceful separation or reconciliation, conserve members and held assets across changes, and visualize shifting support in a doctrine history panel.

---

## Phase 8: Deep Time, Relic Economies & Scenario Tools (长纪元、古器经济与沙盒共创)

- [x] **[P8-1] Living Worldgen Profiles (世界生成谱系)**: Select seeded climate, faction distributions and scarcity profiles; certify that every world has reachable starting resources and distinguish world-generation choices from later interventions.
- [x] **[P8-2] Displacement & Sect Resettlement (山门迁移与流亡重建)**: Let damaged sects relocate using supplies, a real route and relocation votes; move treasury, pavilions and garrisons exactly once and preserve abandoned-site history.
- [x] **[P8-3] Reincarnation & Uncertain Recollection (轮回与残响)**: Add rare rebirth from a recorded death with explicit probability, uncertain narrative fragments and no duplicated possessions, office or ground-truth knowledge.
- [x] **[P8-4] Relic Fragments & Set Resonance (碎片重铸与套装共鸣)**: Define provenance for each fragment, recover missing components through multiple play paths, assemble them at a valid site and show actual nonstacking set effects.
- [x] **[P8-5] Scripture Translation and Competing Editions (经义校勘与异本参修)**: Track inherited originals, glosses and corrected editions; allow mistranslations to alter mastery tradeoffs, with comparisons and independently testable correction.
- [x] **[P8-6] Public Competitions and Rank Seasons (赛季榜与参赛资格)**: Score achievements against a typed rulebook, award seasonal honors exactly once, separate private schemes from public rankings, and preserve opt-out choices.
- [x] **[P8-7] Movement Hazards and Escort Logistics (驿路护镖与险区规避)**: Make escort paths account for travel risk, supplies and visibility; distinguish client cargo from escort possessions and show route changes driven by trusted reports.
- [x] **[P8-8] Scenario Authoring & Fixture Exchange (剧本编辑与复演交换)**: Let players compose a constrained initial scenario, validate references before import and export a seed-plus-command fixture that replays deterministically without exporting credentials.
- [x] **[P8-9] Chronicle Bookmarks & Annotated Maps (纪年书签与地图批注)**: Bookmark public events and add map annotations scoped to the timeline; preserve them across save/export and prevent spoilers from another branch.
- [x] **[P8-10] Ceasefire, Relief & Reconstruction (止戈、救济与战后重建)**: Allow war-weary sects to negotiate arms pauses, withdraw armies, escrow reconstruction aid, and record breaches with visible consequences for the signatories.

---

## Phase 9: Institutions, Stewardship & Long-Horizon Play (制度、守护与纪元经营)

- [x] **[P9-1] Research Assemblies & Shared Discoveries (论道会与共研创法)**: Let sect members pool explicitly committed time and materials on a bounded research question, attribute contributions, permit justified withdrawal, and unlock one reproducible discovery without duplicating pavilion copies.
- [x] **[P9-2] Sanctuary Charters & Safe Conduct (避难所与通行敕令)**: Establish bounded protection for eligible visitors at specific sites, honor access independently of faction alliance, and show when and why sanctuary rights or shields expire or are violated.
- [x] **[P9-3] Sect Credit, Repayment & Insolvency (宗门信贷与清算)**: Keep internal loans distinct from trade and oath collateral, reject overcommitted lenders, settle repayments and bounded defaults from actual holdings exactly once, and expose the surviving exposure by sect.
- [x] **[P9-4] Pilgrimages & Shared Vows (朝山巡礼与共愿)**: Plan multi-stop noncombat journeys with companionship, tangible travel costs and known-route constraints. Track partial completion and relief for companions without instantly revealing undiscovered locations.
- [x] **[P9-5] Conflicting Chronicles & Errata (纪传异闻与勘误)**: Link public retellings to stable source facts, flag contradictory claims without choosing truth from prose alone, and add corrections without rewriting simulation facts or leaking participant-only knowledge.
- [x] **[P9-6] Habitat Stewardship & Beast Rewilding (灵兽栖息地与放归)**: Let qualified stewards spend fixed resources to restore habitats and release eligible pets. Use carrying capacities and follow-up sightings to distinguish successful rewilding from runaway spawns.
- [x] **[P9-7] Sect Infirmaries & Recovery Triage (宗门静养院与救治调度)**: Queue fictional injury recovery by need, capacity and guard availability; consume real supplies, permit refusal, and compare treatment, wait and field rest in deterministic scenarios.
- [x] **[P9-8] Interlinked Formations & Qi Dispatch (阵网连通与灵气调拨)**: Make array links relay bounded qi through actual owned facilities, account for losses and overloads, and draw active/broken links on the map with nonexplosive conservation tests.
- [x] **[P9-9] Territorial Leases & Resource Access (地契租赁与采集许可)**: Allow reversible, time-limited site rights without transferring sovereignty, validate lessee use and payments, and restore access correctly at expiry or after an ownership transition.
- [x] **[P9-10] Era Objectives & Scenario Audit Cards (纪元目标与完成凭证)**: Compose challenge objectives from independently testable conditions and a frozen scenario seed. Publish precise completion or failure evidence for each objective without mutating other branches or awarding achievements twice.

---

## Phase 10: Readable Long Worlds and Local Institutions (长局可读性与地方制度)

- [x] **[P10-1] Households and Generational Registers (家户谱系与代际坊籍)**: Track kinship and voluntary guardianship separately from sect rank. Use actual birth cohorts, migration and deaths to carry household membership forward without doubling village or recruit counts.
- [x] **[P10-2] Village Works and Carrying Capacity (村镇工役与承载增长)**: Let residents contribute bounded labor and sect sponsors spend real materials on wells, fields or shelters. Show completed capacity changes and maintain valid birth/abandonment paths after disasters.
- [x] **[P10-3] Large-Roster Map Aggregation (大规模名册与地图聚合)**: Cluster visible markers by screen scale while preserving every reachable individual through the searchable index. Add a selected-person relationship neighborhood and paged full relations instead of a global ring. Benchmark/map-test 48 and 526 actor fixtures at narrow viewports, test touch drill-down, and prevent counts from exposing fog-hidden occupants.
- [x] **[P10-4] Quiet Player Watchlists (静默关注与推演摘要)**: Let players opt in to in-game actor, site and sect watches. Coalesce repeat events into a small per-tick digest, preserve the uncluttered default, and keep watch data and unread state tied to the right branch.
- [x] **[P10-5] Sealed Couriers and Lost Dispatches (密函递送与消息失联)**: Route actual public or private dispatches through legal couriers with delivery dates and custody. Resolve loss or return once and distinguish received facts, unresolved reports and unauthorized recipients.
- [x] **[P10-6] Deep-History Archives with Active References (远纪档案与活跃引用)**: Separate archival records from active simulation without dropping living people or pending contractual references. Measure full snapshot memory and serialized save bytes separately, then verify branch isolation, budget behavior and identical results when moving old records to cold history.
- [x] **[P10-7] Voluntary Retirement and Return to Service (告老退居与自愿复出)**: Release actual guard, stewardship and council duties while preserving personal assets and rank history. Reassign service once, record voluntary return and test seamless operation when key officers retire together.
- [x] **[P10-8] Shared Commons and Joint Quotas (灵地公域与共管配额)**: Let several sects fund a common site through explicit agreements, allocate real harvest and maintenance by signed shares, and settle unpaid commitments without duplicating stock or forcing territorial transfer.
- [x] **[P10-9] Resource Flow Reconciliation (物资流向与月度对账)**: Show accountable transfers between people, sites, caravans, clan chests and escrow without counting the same goods in multiple ledgers. Distinguish production, consumption and losses in deterministic monthly receipts.
- [x] **[P10-10] Long-Term Terrain Recovery and Succession (地脉修复与长期演替)**: Track irreversible and recoverable ecological changes after prolonged stress. Follow bounded recovery work and terrain state transitions; prove routes remain connected or show a valid alternate route in the map index.

---

## Phase 11: Accountable Institutions & Resilient Play (可核查制度与耐久体验)

- [x] **[P11-1] Commissioned Workshops & Quality Receipts (工坊委制与品质交割)**: Commission bounded craft batches with actual materials, work turns and agreed quality grades. Attribute inputs and deeds, settle acceptable products once, and return unused supplies without copying failed pieces.
- [x] **[P11-2] Temporary Relic Exhibits & Custody (古器陈列与限期保管)**: Let a pavilion accept a real provenance-backed relic on loan. Remove it from the owner's active equipment, track consent and custody, and return possession exactly once after closure or a documented breach.
- [x] **[P11-3] Restorative Probation & Reinstatement (赎责见习与宗籍复核)**: Let censured or expelled characters request a finite, voluntary remedial plan. Score actual completed service and independent reviews, not model prose, before lifting specific restrictions without rewriting prior misconduct.
- [x] **[P11-4] Road Maintenance & Crossing Rights (驿路修缮与关津权限)**: Contract for real maintenance materials and patrol time on specific map links. Show deterioration, restored route costs and lawful crossing fees without charging twice or blocking an unrepresented alternative.
- [x] **[P11-5] Village Census & Count Reconciliation (坊籍核点与人口口径)**: Distinguish counted residents, sampled households and unobserved migrants. Reconcile verified births, departures and recruit rollovers by actual event evidence without setting a world population cap or leaking hidden settlements.
- [x] **[P11-6] Conflict-of-Interest Arbitration Panels (回避裁断与多方担保)**: Let disputants choose eligible, neutral adjudicators for real multi-party obligations; require disclosed conflicts and independently filed facts. Hold each party's assets once and apply one audited disposition.
- [x] **[P11-7] Field Weather Observatories (观象台与区域实测校准)**: Fund local observations and measure forecast errors against later real readings. Age and relay timestamped observations without treating stale predictions as current facts or revealing fog-hidden sites.
- [x] **[P11-8] Season Honor Review & Corrections (赛季荣誉复核与更正)**: Allow bounded review of a public scoring receipt using actual event evidence. Preserve the original record, publish justified corrections and move an honor at most once without rewriting private actions.
- [x] **[P11-9] Recoverable Save Journals (事务存档与恢复点)**: Keep a separately validated previous snapshot when a browser save is interrupted. Restore only after explicit selection and validate slot identity, version, branch and integrity without silently clearing older progress.
- [x] **[P11-10] Pause-Safe Long-World Fast Forward (长局快进与可取消回放)**: Advance through budgeted chunks on an isolated branch, keep pause/cancel responsive and commit only checked checkpoints. Test equivalence to ordinary ticks and compare latency on growing rosters without dropping people.

---

## Phase 12: Touch Control, Legible Causality & Fair Autonomy (触屏可控、因果可读与均衡自治)

- [x] **[P12-1] Two-Finger Map and Brush Interlock (双指山河与画笔防误触)**: Keep zoom anchored under the gesture centroid and preserve single-touch scrolling and panning. A second pointer or canceled gesture must disarm an unfinished brush stroke without changing the world. Verify actual touch input on narrow layouts and safe-area controls. Implementation and synthesized browser touch-pointer inputs were verified at 360px and 390px. P14-1 verified accessible narrow browser views. Native handset touch and physical safe-area coverage are still unverified and may be repeated when available under P16-10.
- [x] **[P12-2] Narrow-Screen Focus Links and Back Context (专注词条与窄屏返回)**: Link an observed chronicle fact to the relevant map, actor or institution without opening another main panel. Back restores the exact branch, filter and scroll context; a missing or fogged target gets a safe receipt instead of guessed coordinates. Verify 360px and 390px layouts with touch and keyboard.
- [x] **[P12-3] Reverse Chronicle and Proven Causality (逆向纪事与可证原因链)**: Start with siege-to-truce, vacancy-to-election and market-to-settlement chains. Record typed public predecessor IDs, show terminal cause and deliberately omit private or missing links. Test same-name events, fork isolation and a 526-actor long-world fixture.
- [x] **[P12-4] Fair Model Turns and Unstarved Utility Fallback (轮值推理与无饥饿回退)**: Rotate bounded model slots across actual eligible actors by wait age; every unscheduled actor still acts through Utility. Reject stale responses and expose coverage and longest wait without private reasoning. With 526 actors and a tiny mocked budget, verify no roster truncation or permanent favorites.
- [x] **[P12-5] Atomic Reservations for Scarce Facility Turns (同刻稀缺设施预约)**: Reserve an actual furnace slot and time exactly once, then release it on cancellation, death or expiry. Publish queue order and real custody; test stable ties, one winner for a last slot and unchanged actor counts in both 48- and 526-person fixtures.
- [x] **[P12-6] Overnight Camps and Honest Journey Resumption (夜宿营地与行程接续)**: Let delayed travelers spend real provisions on a temporary camp. Resume only from a verified checkpoint and dismantle once. Show only visible camps, never treating them as extra destinations or land titles. Test concurrent arrivals, shortages and cancellation.
- [x] **[P12-7] Consensual Sparring and Timely Yield (同契切磋与及时认输)**: Require mutually accepted practice terms, honor a valid yield and stop without lethal loot, criminal penalties or tournament points. Apply actual practice and fatigue once; show agreed limits and the stop reason, and test refusal and stale actions.
- [x] **[P12-8] Expedition Distress and Proven Extraction (秘境求援与实际撤离)**: Let an eligible expedition participant signal only to reachable witnesses. A consenting rescuer spends real supplies and completes one route-backed extraction without teleporting or copying loot. Show observed status and the real outcome; reject stale or impossible efforts.
- [x] **[P12-9] Cross-Sect Short Shifts and Two-Sided Exit (跨宗短聘与双向退出)**: Staff one actual noncombat workshop or observatory shift with a named worker, real pay, and voluntary entry or exit. Do not transfer rank or membership. Audit attendance and settlement once under revoked access, withdrawal and expiry.
- [x] **[P12-10] Boundary Patrol and Physical Relief (巡界阵位与换防交接)**: Hand duty between two existing service actors only after an actual checkpoint arrival. Account for route, strain and coverage gaps without phantom guards; publish the latest confirmed coverage without remote hidden positions. Test late relief, death and conflicting duties.

---

## Phase 13: Legible Long Lives & Civic Resilience (长世易读与城镇韧性)

- [x] **[P13-1] Mobile Attention Budget & Saved Folds (窄屏注意力与折叠记忆)**: Keep one primary task and one explicit next interaction above the fold at 360px, and remember expanded subpanels by workspace without adding a home entry. Roll back invalid actor, branch or imported-world focus; test keyboard and touch with both 48 and 526 real selectable actors.
- [x] **[P13-2] Apprenticeship Cohorts & Proven Graduation (合班学徒与实绩出师)**: Let one consenting teacher spend one actual instruction period on a finite local cohort. Credit attendance and independently demonstrated skill, track genuine departures without erasing lineage, and award any graduation just once without limiting world population.
- [x] **[P13-3] Household Name Register & Identity Disputes (家户称名与同名核验)**: Attach locally known names and aliases to actual stable people, never infer kinship from a name. Verify voluntary changes and disambiguate same-name living, deceased and arriving actors across forks, with unknown identities safely remaining unmerged.
- [x] **[P13-4] Found Caravan Goods & Proven Restitution (遗货寻回与归还凭据)**: When a tracked cargo loss physically leaves recoverable stock, place only the survived units in one real custody record. Require actual discovery and prove custody before restitution; never return the same goods twice or undo the original cash settlement.
- [x] **[P13-5] Public Granaries & Shortage Drawdowns (义仓库存与短缺支取)**: Let villages hold donated existing roots and spirit stones in one local buffer, release finite rations only to actual shortages, and disclose the remaining balance without minting residents, supply or debt. Verify interrupted deliveries and concurrent demands.
- [x] **[P13-6] Conflicting Duties & Explicit Handoffs (并行职责冲突与明确交棒)**: Prevent the same actor from completing incompatible staffed duties in one real period. Use reproducible priorities, actual presence and accepted handoffs; expose the withheld or rescheduled duty without replaying payments or exposing private movement.
- [x] **[P13-6a] Xianxia Scenes, Not Epoch Summaries (玄幻故事体纪事)**: Put readable, individually grounded xianxia scenes first in the live feed and reading room. Let one lead emerge from repeated recorded public actions, without preferring them in simulation. Keep verified chronology, dialogue and source links in their existing secondary controls. Keep private/future events out; preserve exact navigation, authored evidence and old saves. Do not institute new eras, jobs, or provider calls.
- [x] **[P13-7] Building Inspection & Safe Reopening (设施复检与有据复开)**: Close a genuinely damaged facility's applicable service for a specific condition, let local qualified actors spend real materials to inspect or remediate, and reopen only after a verified physical threshold. Protect pending reservations and receipts without inventing replacements.
- [x] **[P13-8] Long-World Topic Digest Without Extra Alerts (长局主题摘要与静默回看)**: Group already observable chapter, village and trading outcomes by cause and period inside the chronicle, preserving direct proof links and independent conflicting evidence. Keep summary generation read-only and on demand; never add automatic alerts or claim omitted facts did not happen.
- [x] **[P13-9] Disbanded Institutions & Surviving Obligations (机构撤并与未清义务)**: Close an actual failing institution without deleting its people or outstanding custody. Use explicit successor consent or an audited return for each enforceable obligation; show old and new scopes and prove no duplicate asset transfer.
- [x] **[P13-10] Large-Save Preview & Honest Capacity Advice (大存档预检与容量指引)**: Estimate exported UTF-8 bytes and distinguish retained snapshot pressure from file size before an optional export or fast-forward. Offer a separate explicitly confirmed archive optimization; it may move eligible narrative only and may not remove any person, unsettled contract or branch proof.

---

## Phase 14: Accessible Worlds & Proven Tradeoffs (可达世界与有据取舍)

- [x] **[P14-1] Non-Color Map Symbols & Text Navigation (非色彩地图与文字导航)**: Make faction, hazard and visible-route states legible without hue, and expose an equivalent keyboard and screen-reader map index. Test narrow layouts, viewport text sizing, native or trusted device touch and physical safe-area controls when available (including P12-1), and base/fog branches without exposing unseen sites or adding a home workspace.
- [x] **[P14-2] Aligned Branch Comparison & Unproven Differences (同轮分支对照与未证差异)**: Compare retained checkpoints at the same actual tick, using the same world genesis and observed counters. Distinguish causal receipts from mere differences and report gaps explicitly; an absent intermediate snapshot is never reconstructed or applied.
- [x] **[P14-3] Repair Salvage & Unique Material Reuse (破器拆解与唯一回收)**: Allow an owner to retire one truly damaged, unloaned artifact at a capable furnace. Transfer only verifiable reusable material once, consume the worn original and respect probate, loan custody and bound relic exclusions without copying item identity.
- [x] **[P14-4] Reciprocal Village Supply Agreements (村镇互助与双向实运)**: Two actual villages may agree to share a finite surplus in complementary shortages. Charge real transport and dispatch only available inventory; tie arrival to checkpoints and return or record verified loss once without minting supplies or population.
- [x] **[P14-5] Public Route Warnings With Expiring Evidence (驿路警示与限时证据)**: Let a real traveler post an observed hazard notice covering only verified segments. Age, retract and independently corroborate it, distinguish known alternatives from unobserved geometry, and never hard-block a route on unproven rumor.
- [x] **[P14-6] Shared Reference Manuals & Lending History (共读典籍与借阅沿革)**: Lend one canonical scripture edition for a dated study period through a staffed pavilion. Confirm actual checkout, reading and return, prevent duplicate versions or repeat credit, and keep private learning notes out of public receipt history.
- [x] **[P14-7] Resource Promises Under Changing Capacity (容量变化下的资源承诺)**: Reconcile real preexisting commitments after facility or treasury capacity changes. Protect actual custody, offer verifiable partial settlement or authorized release, and show the original amount and unmet balance without manufacturing stock or auto-refusing valid future orders.
- [x] **[P14-8] Civic Memorials & Verifiable Historical Names (乡祠纪念与历史姓名核验)**: Let an eligible local community use real supplies to record one independently verified deed by a named former resident. Preserve the individual's actual identity, migration or death status and conflicting evidence; no revival, ancestry inference or public disclosure of private records.
- [x] **[P14-9] Shared World Export Privacy Preview (共享世界导出前隐私预览)**: Show whether a user-requested export contains private notes, dialogue or branch labels without previewing secret contents by default. Offer a separate confirmed redacted copy, prove canonical counts, bindings and pending custody remain intact, and never modify the original.
- [x] **[P14-10] Reproducibility Receipt for Long-World Checks (长局验证与可复演回执)**: Record an explicit seed, rule version, branch checkpoint, actor count and deterministic run outcome for on-demand local QA. Benchmark both short and long rosters with clear missing-coverage labels; the receipt cannot schedule jobs, submit live-model requests or silently advance the current world.

---

## Phase 15: Earned Access & Living Continuity (实有许可与长世接续)

- [x] **[P15-1] Timed Village Fairs and Real Stall Claims (乡集时段与真实摊位)**: Let a village issue a finite fair-day place to an independently present merchant. Record real goods offered and an actual location-local stall fee, return reservations when a fair is called off, and never convert visitor counts into residents. Test weather cancellation, stale invitations and competing last slots.
- [x] **[P15-2] Earned Service Stipends and Unpaid Balances (退居俸养与实兑凭据)**: Accept a finite voluntary stipend supported by independently recorded former service and real uncommitted funds. Post each due, paid or unpaid period separately; a transfer uses existing assets once and creates no new rank, grant or automatic debt. Verify successor handoff and lifetime closure.
- [x] **[P15-3] Small-Sample Seed Viability and Planted Stock (灵植留种与实测出苗)**: Keep actual seed custody separate from harvested herbs. Spend a finite sample on an observed local germination check, retain the original report when conditions change, and plant only the genuinely available remainder. Verify losses, repeated trials and downstream yield reconciliation.
- [x] **[P15-4] Work-Tool Lending and Return Condition (共器借用与磨损交割)**: Lend one real unbound craft instrument to a separately consenting user for an actual staffed period. Trace the same object through authorized use and measurable wear to confirmed return or probate; the owner cannot use it during custody and neither side can duplicate it.
- [x] **[P15-5] Recurring Care Follow-Ups With Independent Attendance (静养复诊与到场接力)**: Schedule a genuine finite follow-up only after a recorded discharge. Re-check present need and real supplies at the later appointment; missing support closes or defers without healing, fees, or a second original discharge. Publish only an authorized participant receipt and anonymous local capacity.
- [x] **[P15-6] Independent Aligned Weather Readings (同刻异读与观象复核)**: Let consenting qualified observers compare actual independent readings at the same known place and turn. Preserve each report, mark uncertainty if they disagree, and never treat an old forecast or a measurement from the next valley as confirmation. Test timing, dissent and incomplete visibility.
- [x] **[P15-7] Local Damage Assurance and Verified Make-Good (在地损害与实付补偿)**: Record one actual measurable facility or parcel loss, seal the initial condition, and allow a qualified liable actor or institution to make an explicit affordable contribution. Accept only verifiable work or transferred funds, leave any remaining shortfall visible and prevent duplicate compensation across branches.
- [x] **[P15-8] Sealed Mail Handoff at a Verified Post (驿站转接与原件守密)**: Permit two consenting named carriers to transfer one original sealed packet at an actual shared checkpoint. Keep contents sealed and preserve sender/recipient, open custody and real travel histories; a failed meeting or intervening loss never creates another packet or a receipt of delivery.
- [x] **[P15-9] Side-by-Side Resume Choice for Saved Worlds (续局选择与同源异支辨认)**: Preview exact save ancestry, branch and observed checkpoint before a deliberate resume, retaining all independent candidate slots. A similarly named world or newer unrelated slot never silently wins; verify identical ticks, stale review, genuine absence and keyboard selection.
- [x] **[P15-10] One-Handed Navigation Without Extra Tabs (单手操作与不增入口)**: Offer an explicit local left- or right-handed control preference. Keep repeat controls, back and map tools within comfortable reach without reordering semantic keyboard navigation or persisting actor/branch focus. Verify 360/390px and 48/526 actors, and distinguish trusted device testing from simulated inputs.

---

## Phase 16: Earned Storylines & Useful Long Lives (有据主线与可用长局)

- [x] **[P16-1] Earned Protagonist Succession (主线自然交棒)**: Retain a story lead only while independent public scenes support them; if they leave, fall or recede, archive their exact arc and let a successor qualify from their own events. Show a genuine change of focal character without rewriting earlier chapters, changing gameplay priority or joining people by shared names.
- [x] **[P16-2] Chapter Arcs From Proven Turning Points (有据转折与小说段落)**: Offer a read-only scene arc around actual decisions with typed later consequences. Keep narrative openings in character and place, not century headings; show independently verifiable links and let unrelated scenes remain separate rather than inventing a resolution.
- [x] **[P16-3] Speaker Provenance for Existing Public Dialogue (公开对白与发言归属)**: Attribute only exact retained words to independently verified speakers and public source events. Distinguish overheard fragments, conflicting transcript attribution and context switches without generating missing dialogue or leaking private thoughts; test near-name branches.
- [x] **[P16-4] Witnessed Personal Story View (亲历者故事视角)**: A player may read an explicitly selected living actor's genuinely witnessed public scenes as a personal thread, independent of the public protagonist. Never append another person's secrets or infer motives; stale observation fades without transferring knowledge across forks.
- [x] **[P16-4A] Story-First Play (小说式简洁入口)**: Make the default browser game visibly answer who the protagonist is and what just happened. Keep one plain Continue button for a canonical live turn and one More button for the original map, characters, records, and saves; return without autoplay or a world reset. An unearned lead stays undetermined, and earlier context must not be shown as new.
- [x] **[P16-5] Resume the Exact Scene on Mobile (窄屏小说续读位置)**: Remember explicit reading place by stable branch, viewing scope and actual scene ID; restore the original open evidence and keyboard focus only when still authorized. Provide a neutral fallback for expired or private records, with no new home controls or automatic notices.
- [x] **[P16-6] Voluntary Mentor Transfer With Skills Intact (师承自愿转接与旧功保留)**: A named apprentice and new eligible mentor may mutually accept a real local transfer after the previous agreement ends. Preserve old attendance and actual learned techniques, charge only new instruction periods, and ensure refusal never creates missing lineage or rank.
- [x] **[P16-7] Seasonal Housing Claims and Real Move-Outs (节令借居与实地迁出)**: A household may loan finite actual spare accommodation to one named consenting visitor who physically arrives; end it by a real move-out or lawful interruption. Keep visitors distinct from census residency and support repeated influx with no hard world population cap.
- [x] **[P16-8] Negotiation Failures With Mutual Release (议价落空与双方释约)**: Record the actual point at which two parties stop an already funded local exchange. Return only live escrow, distinguish consent, expiry and unavailable stock, and preserve already delivered assets without creating a phantom shipment or score.
- [x] **[P16-9] Scribe Commission and Verified Manuscript Payment (掌卷委写与有据交割)**: A patron may commission a bounded factual account from a consenting local scribe with actual escrow. Deliver an original sourced narrative only after verifiable work; preserve disagreements and refund unspent funds when refused, with no automatic external-model calls or erased evidence.
- [x] **[P16-10] Dense-Crowd Reading and Roster Continuity (密集群像阅读与人物续存)**: Test selectable actual actors and direct story/event paths in much larger growing worlds. Keep UI mirrors virtualized or paged without removing people, hiding the focal character on an authorized filter, or presenting page size as a population limit; verify across branch and mobile context changes; record physical-device accessibility separately whenever trusted input and safe-area inspection become available.

---

## Phase 17: Intersecting Lives & Verifiable Stewardship (交会众生与实据持守)

- [x] **[P17-1] Shared Turning Points Without Blended Arcs (主线交会与各自凭据)**: When two distinct actors with independently earned arcs share one exact public decision, show the meeting from each person's documented position and keep their later consequences separate. No shared names, identical dates, fascination score or speculative motive can substitute for a shared source. Verify reunion, split outcomes, disappearing evidence and separate same-tick forks.
- [x] **[P17-2] Estate-Funded Commission Continuation (遗托续制与余料守界)**: Let a duly authorized beneficiary and the named actual maker explicitly continue an already funded private commission from its last verifiable physical work stage. Use only remaining real estate-bound custody; no duplicated first stage, new order identity or inferred heirs. Test custody during probate, refusal, genuine continuation after discharge and a later precise return.
- [x] **[P17-3] Wilderness Waypost Shared Meals (山驿歇脚与实物共餐)**: Allow consenting travelers from different established groups to share finite real supplies only at the same independently reached safe checkpoint. Record exact provisions and independently realized rest, preserve each preexisting itinerary, and let missed contact release unused custody without teleporting the groups or creating supplies.
- [x] **[P17-4] Joint Craft Training With Named Work Stages (合练铸坯与实作署名)**: Give independently qualified trainees and an authorized shopkeeper one voluntary project using a single actual blank and two distinct staffed turns. Attribute paid materials, the exact work stage and any bounded skill credit to the real contributor. Failed work and opt-out preserve the original custody and do not duplicate an artifact or teaching lineage.
- [x] **[P17-5] Selectable Private-Free Chapter Excerpts (节选分享与最小文本边界)**: Prepare a local, explicitly confirmed standalone chapter selection from actual public scenes and independently visible citations, not a world file. Show exclusions without revealing private text, strip unsafe archive copies and branch labels, preserve disjoint viewpoints, and test source changes, witnesses-only quotes and unchanged original chapters.
- [x] **[P17-6] Verified Temporary Disaster Shelters (临灾借泊与回乡凭据)**: During a documented village hazard, let actual consenting households reserve finite shelter that opens only after real arrivals along an established route. Record each departure, temporary stay and genuine return separately; do not convert guests or absent family members into permanent residents, revive anyone or double-count original registers.
- [x] **[P17-7] Market Freight Charged for Verified Loads (货重量核验与实付运力)**: Attach real measured load bands to an existing consignment, use a consenting carrier's actual capacity and charge only the one shipment actually dispatched. Preserve original market quantity and financial receipt, release unused freight custody on verified cancellation, and distinguish a light partial delivery from a mere promise or inferred loss.
- [x] **[P17-8] Additive Local Memorial Corrections (乡祠追加勘误与同名分列)**: Let a different authorized local witness append a narrowly typed correction for a published memorial only from new actual documentary evidence. Keep the former reading, same-named people and unchanged relief and household records visible under the original proof; correction cannot infer a death date, new ancestry or replacement identity.
- [x] **[P17-9] Linked Reproducibility Receipts Across Retained Checkpoints (留存检查点与复演回执链)**: Verify two explicitly selected local receipts against exact retained checkpoint bytes and known rule versions, and link them only when the recorded predecessor digest and actual source identity match. Distinguish lost snapshots and unavailable rule builds from mismatches, without replaying automatically, applying history, exposing branch labels or uploading a save.

---

## Phase 18: 仙途奇观、宗门大比舞台与神通法宝进阶 (Xianxia Spectacle & Grand Tournaments)

- [x] **[P18-1] 可视化八强淘汰赛「仙门大比」演武擂台 (`TournamentBracketArena`)**：当触发宗门大比或天下论剑时，生成直观的 8 强/16 强晋级对阵图（Bracket UI），支持玩家逐轮观看或快进天骄对决、押注气运灵石，并为夺冠魁首颁发专属称号与通天灵宝。
- [x] **[P18-2] 上古秘境多层探索地图与护宝妖王 Boss 战 (`SecretRealmDungeonExplorer`)**：进入开启的秘境后，展现秘境内部的三层险境节点（外围药园 → 核心古殿 → 传承禁地），修士可组队或独闯挑战镇守妖王，支持破阵、夺宝与秘境崩塌前的紧急逃生。
- [x] **[P18-3] 炼丹炉火候微操与丹雷异象 (`AlchemyFurnaceInteractive & PillLightning`)**：炼制高阶金丹（九转金丹、渡劫神丹）时引动天地丹雷，成丹品质分为凡品、灵品、仙品与绝世丹纹，并在地图与面板上触发丹香百里异象。
- [x] **[P18-4] 本命飞剑养成、剑意领悟与万剑归宗演出 (`SwordIntentMastery`)**：为剑修与法修提供专属道途（剑道、丹道、阵道、魔道、体修）进阶树，领悟剑意/刀意/魔意后在 Canvas 战斗中展现专属颜色的剑阵光效。
- [x] **[P18-5] 拍卖行风云与压轴天材地宝竞价争夺 (`ImmortalAuctionHouse`)**：在万仙坊市定期开启「万宝大会拍卖行」，各宗门长老、散修与玩家引导角色同场加价竞拍残破古宝、筑基/结婴灵丹，买下后甚至可能引来魔修半路截杀。
- [x] **[P18-6] 修士立绘头像生成器与境界气场特效 (`ProceduralCultivatorPortrait`)**：为每位修士根据其性别、年龄、宗门、灵根、境界与性格生成独特的 SVG 国风古装头像与背后的境界法相光环（金丹金轮、元婴法相、魔道血月）。
- [x] **[P18-7] 天机奇闻日报与修仙界热搜风云榜 (`TianjiGazetteNewspaper`)**：每逢年度交替或重大战役后，由天机阁自动编撰一份排版精美的《天机风云报》，包含头版头条、天骄黑马点评、恩怨八卦与悬赏通缉令。
- [x] **[P18-8] 道侣双修大典、血脉后代灵根遗传与修仙家族崛起 (`CultivationClanDynasty`)**：当两位修士结为生死道侣并举办双修大典，可诞下拥有父母复合灵根与先天词条的后代，逐步在宗门外形成绵延数百年的修仙世家。
- [x] **[P18-9] 飞升天劫终极演出与上界仙门接引 (`AscensionToImmortalPlaneVFX`)**：当修士修炼至渡劫大圆满引发飞升天劫时，全地图渲染九天仙门洞开、仙乐齐鸣的史诗级过场与结局纪传，将其永载入封神榜。
- [x] **[P18-10] 全息沙盒性能与代码整洁度全面巡检 (`HolisticSandboxPolish & BundleOptimization`)**：对所有新增的视觉特效、全息指挥台与戏剧引擎进行渲染帧率与构建包体积优化，确保在千人长局下依然丝滑流畅。

## Phase 19　天命分岔与万象同屏 (Fate, Crossing Timelines & Canvas)
- [x] **[P19-1] 主角扶危的三回合逃亡戏**：只从原生追击、向导和安全通道选候选，逐回合追踪方向和承诺；地图只画实际路线，验证断援时仍有可说明的撤退结局。
- [x] **[P19-2] 心魔余波与道心自疗**：按真实已完成心魔劫生成可见的后果与复原路径；守护记忆隐私，固定种子验证三种余波会分别改变后续救援和交情选择。
- [x] **[P19-3] 万剑来朝的结阵战景**：由真实参战阵眼、各修士调息和本命神通结算驱动三层光效；阵眼未开不演放招，逐帧核对弱动效与命中。
- [x] **[P19-4] 拜山试心、宗门破局三择**：实际到场后触发守诺、识破、离开的短章，按门规和真实声望结算，手机只在需要时插入场景。
- [x] **[P19-5] 宿缘重逢的主角交接**：在上一主角真实退场后，以已发生的关系事件选择候选视角；三条能解释分歧的旧证据，不强推预写角色。
- [x] **[P19-6] 同一场决战的不同目击视点**：地图、故事与战报能从合法在场双方切换，只呈现各自亲见，异步切换不把兄弟分支或失密话串入。
- [x] **[P19-7] 飞升渡口卷轴与入界动画**：只读取真实上界入口资格与位置，飞升途中、通过、折返各有演出，不借切换视图跳过路程。
- [x] **[P19-8] 夜宴前厅与私语清晰分场**：同一场已发生宴会支持公开演说、个人内心和会后对谈分场；故事模式无额外常驻菜单，两个引擎同用真实出席逻辑。
- [x] **[P19-9] 绘景与界面权限边界模块化**：将事件过滤与 Canvas 绘景调度从工作区组件拆为具名适配层，单一时钟，无障碍地图与实际绘制来源一致，旧入口保持可用。
- [x] **[P19-10] 故事模式长局回顾与回看返回**：提供可从手机一键进出的短篇会目，从真实转折抽取分幕，选当前分支恢复原阅读位置和焦点，不触发模拟。

## Phase 20　生死一幕与群像余波 (Playable Scenes & Ensemble Aftermath)
- [x] **[P20-1] 同一险境的两条命轨**：在现有故事页保留一次玩家亲选前的实有节点，从该同源节点试走两个合法分岔；逐幕呈现实际获救、代价与牵连，不把未前往的预演写回原线。用一场真实秘境或渡劫复验。
- [x] **[P20-2] 战场残响与归来的幸存者**：只把真正打坏的阵眼和原生在场者带入战后一幕；幸存者实地再访时可以凭自己的目击选择修阵或寻回师友。Canvas 分开显示正在发光的阵和已熄的旧伤，旧谣不补成战果。
- [x] **[P20-3] 灵兽护主与断契时刻**：同地绑定灵兽在真实濒危交锋中有守护与撤离两条路，分别核实际受伤、主人选择和诀别；不得借常驻增益在异地护主。用生还、灵兽不在场、两者真实离散三个种子验演出。
- [x] **[P20-4] 青黄两阵的同场守望**：同一已确认天灾下，在场的两宗可分别选择合阵或各守山门；唯实到阵眼者参与。不同合阵决定真实影响救下的人和拆阵后的异议，地图展示各股实际流线。
- [x] **[P20-5] 重走师门旧剑式**：修士确曾亲授并习过一招，才有机会在符合条件的后续交锋里认出旧剑式、以真代价还招或停手。师承私密时只给当事人看；公开演出仅画真实已落招式。
- [x] **[P20-6] 异域夜猎与辨认妖迹**：根据真实异域地貌、天气和当地妖兽足迹，玩家与两脑均可选择查迹、守候或安返。选择改变实际接敌与脱身地点；舆图不提前泄露未发现妖兽。
- [x] **[P20-7] 异闻里的三种真相**：从同一真实争端的不同当事见闻做一小章可玩的查证；玩家得到的是可亲临的两个线索和可否追问，不凭故事生成器揭私语、判假罪或指定下一主角。
- [x] **[P20-8] 诸宗问鼎的誓师剧场**：在真实结盟、宣战和派遣均成立以后，按确已到场的宗门与将领呈现一幕战前或收兵戏。两脑可选择改守、议和或赴阵，实际结算已有参战资格和时序；不虚构阵营全员战胜。
- [x] **[P20-9] 可键盘与单手游玩的临战场景**：在 360px、390px 和宽屏验证同一临战抉择的焦点、44px 点按、返回位置和减弱动效。历史页同构但只读，旧帧、重复触控和失焦不提交第二次。
- [x] **[P20-10] 新手故事只亮下一件事**：把大比、秘境与心魔的必要引导收在当时的故事卡，保留“看下个月／走进故事”两个固定入口；实际条件不具备便无按钮，仍能通过原工具看到完整世界和进度。

## Phase 21　山河易色与故人归来 (Living Geography & Returning Characters)
- [x] **[P21-1] 山门失火与藏卷抢救**：实际天灾烧到书楼时，仅现场可通行者能救卷、护人或撤走。要选真实有限的时间和路线；下一卷可以重获亲手救出的功法，也能明确失传，未找到的卷不补出伪本。
- [x] **[P21-2] 云潮封峡后的两条归途**：同一峡谷顺逆风各有真实通行门槛，已在路上的人物可改道或驻足；地图只亮走过的折返和当时看得到的路，绝不为存档换月回填假行程。
- [x] **[P21-3] 放下旧怨还是回敬一剑**：真正被某人留过一命的修士，彼此后来实地重见才可停手、护对方一程或开战；代价落在真实声望、地位与关系上，不拿流言当恩、不强制化敌为友。
- [x] **[P21-4] 夜渡引魂灯**：确有已亡者、本人曾相识并实际踏入可祭的岸边，才能把一次悼念写成短章，选择守灯或送别影响现存人物下一幕，不复活亡者也不公开生前私语。
- [x] **[P21-5] 灵兽大迁与借道**：不同体型灵兽因原生季候真的离开旧地，在同一段经过两个势力时分别遭遇放行、追踪或驱赶；以物种与到场视野决定屏上表现，不为每个角色加常驻按钮。
- [x] **[P21-6] 掌门未归的一夜**：宗门实际失去掌门或护阵者、且同月面临来袭时，留在山门的正式成员可以实际守阵或请众人撤下；表现多人独立应允，表现权力真空而不伪造继承和战果。
- [x] **[P21-7] 一场天变，三地闻钟**：同一真实天地异象只有看得见且实际传到的人才会报信；按原生抵达日期分三短幕，最后才连上全貌。地图、会目和本地存档重开均验证真传播；多人断线重连验收另见 [P21-7-NET]，不生成未闻消息。
- [x] **[P21-8] 凡门同窗到山门异途**：两个在真正官学或村社共同生活过的人，入宗后亲身重遇时可忆旧、各行或相助；从实际生活与后续决定生立场分歧，不自动制造道侣、同姓或对立关系。
- [x] **[P21-9] 战后拾愿的群像尾章**：只从同一场真正结算的冲突中选择在世目击者，由他们按合法余力选择留守、归去或照料同伴。短章分出不同视角和实有去向，日记不串分支。
- [x] **[P21-10] 十代之上仍看清当下**：以真实生育、成人和主角交接做跨代长局，冷记录按需加载，两块不同宽度的首屏只讲当前一幕。验证旧姓同名与隐私、返回焦点、存档读回和千人压力，不设人口硬上限。

## Phase 22　山门问心与天涯回响 (Choices That Echo)
- [x] **[P22-1] 同路一夜，各望一山**：两位真正同行的修士在岔口各自选护送、改道或独留。分开后只演各自真的走过的路和遇到的人；用地图同屏的双线把取舍讲清，不默认第二人跟随。
- [x] **[P22-2] 拜师未果之后**：曾当面拒绝拜师的双方再次重遇，依当下人事选择重新授业、公开切磋或作别。至少一幕安静交谈为转折蓄势，让旧拒绝与新决定都能在小说里找到。
- [x] **[P22-3] 丹火将熄，谁先出门**：原生丹房险情确实波及有人值守的炉火时，只让现场学徒决定疏散、护炉或求援。以真实伤亡、损坏与救援抵达决定下章，不用一次冷却条充当灾情。
- [x] **[P22-4] 剑鸣穿过空城**：旧城因真实迁徙而空，旧住者或新来者重返时才能在原生遗迹探查、暂住或离开。水墨空城与有人的旧章呼应，地图不把旧城区当现场人口。
- [x] **[P22-5] 关外两面旗**：同一险关换守时按实到先后演旧守撤下、新守到场或中间失守，现场人物可掩护、拒援或留守。迷雾外不画新旗；失守不等于整个州失陷。
- [x] **[P22-6] 村灯照见今朝**：从真实完成的赈灾与当地留守者中选一个普通人的安静夜晚，以亲见的缺席和归来承接大情节。不同角色只讲自己所知，手机首屏只留一幕正文。
- [x] **[P22-7] 夜半叩门，谁在风里**：一个真正受险阻的旅人抵达有人的驿站后，可选收留、闭门或护送；若误把后来者当旧识，下一幕必须由实地相认或误会延续来解开，不由系统断言。
- [x] **[P22-8] 大比之后无人赴席**：真实受邀者可赴、婉拒或迟到，重要人物缺席时按真到场者改变那一夜的氛围与后续相逢。公席、席后与错过的对话保持分明。
- [x] **[P22-9] 宗门终章之后的空页**：真实宗门散去后，最后几位在世同门能以原生去向展开不同短篇。有人投新门，有人回乡或留在旧址；不逼所有人团圆，也不凭归档的姓氏指定继任者。
- [ ] **[P22-10] 手机上只复盘一处选择**：真实长局中分别验证 360px、390px 的同源比较、触控和键盘；原线、预演、真选择在阅读页清楚分开，退出回原焦点，不新增常驻入口。

## Phase 23　旧章有回声 (Echoes Across Chapters)
- [x] **[P23-1] 山钟停了一夜**：只在钟楼因实际天灾受损后，让原本要循钟声报平安的角色亲自查楼或改走已知信路。下一章分别写真正收到消息的人、没收到的人，不把未传到的警讯画过迷雾。
- [ ] **[P23-2] 石阶上等人的信**：只从实际送达而非投递承诺选一封信。收信者可回信、暂搁或当面问；各自实际选择才影响来日重逢，不把一方的心事和未寄出的字公开。
- [ ] **[P23-3] 旧雨新衣**：有真实冬夜收留和后来独立离去的两人，实地重见时可续一宿、还人情或各行。用闲话与日常得失承接大事，不强制结盟或改变亲缘。
- [ ] **[P23-4] 黑潮退后再开渡**：先有真封渡和实际重开条件，遇阻商旅才可等、折走或沿已通渡路推进。留下一次真正的两条行路体验，未走的潮路不写作亲历。
- [ ] **[P23-5] 借来的旧伞**：只凭一次真实借用、实地归还或合法未还建立交情。以后可在重逢中借伞、归还原件或说明遗失；持有状态与当时的场景一致，不复制原物。
- [ ] **[P23-6] 灯火换了屋檐**：在真实搬迁后追踪两户原住人何时亲手开新屋，何时确实回看旧宅。可在新村成一段安静小章，也可因旧地不可通而实际受阻，不从旧门牌推出在场名单。
- [ ] **[P23-7] 请一位对手喝茶**：曾有真实公开交锋的双方，停战后且实际见面方可询问、婉拒或短坐。只写得到回应的说话，不把同席写成原谅，也不越过当前休兵规则。
- [ ] **[P23-8] 春汛退尽的药圃**：已有亲手栽下的真苗被实际水灾改变以后，角色可实去抢救、重栽或待来春。展示下一季真正活下的药苗与未去的人，不空添产量。
- [ ] **[P23-9] 屏上一人，卷中众声**：同一真实日期在手机上先读一个角色，读完可由确有关系的关键事件切到另一个在场者。保留阅读位置与已读权限，不为同一件事重复堆整屏角色统计。
- [ ] **[P23-10] 三页之间的过渡季**：以一段真实连续季节、至少两次亲见日常和一个确实发生的转折，把前一章、当章、下一章接起来。以实际时间和身体所在为准，安静段落不能被无来源的高潮取代。

## 后续多人验收
- [ ] **[P21-7-NET] 三地闻钟的多人断线重连**：现有试玩是单机；等真正的多人传输可用，以两个独立在线客户端在第一与第三次到达之间断线、重连，确认只重放本人实收、同一分支的原日期和地名。不得用本地存档重开替代多人验收。

## Phase 24　旧伤与新声 (New Voices in Old Places)
- [ ] **[P24-1] 没赶上的拜师礼**：当真实已约定的礼日在路阻中错过，只让原有双方面对重约、改投或作别；未到山门者不算赴约，不把误时自动写成背叛。
- [ ] **[P24-2] 河水淹过碑脚**：原生雨汛切断一处实际渡路后，从被困、另寻渡口或真已抵达的人选一幕。地图用实走与水位区分痕迹，不把无路的拟渡画成成功。
- [ ] **[P24-3] 空炉边有春芽**：真实险情烧废一炉，过一个完整季候之后，现场旧学徒才可查灰、守新苗或移去别处。以真实芽、余火与去向交代转折，不用复原所有损失制造团圆。
- [ ] **[P24-4] 抄书人只带走一页**：有真正受托抄卷且老师正式离任或失踪，两个独立书吏只能依据各自真正亲抄的残页决定合记或存异；旧卷与后来的复原本不互通权限。
- [ ] **[P24-5] 再走一段旧路**：曾在实际岔路各自分开的同路人在别处亲身重遇，仅双方独立同意且已有真可走去向时才共走一段；未同意只写各自真正行动，不自动化敌为友。
- [ ] **[P24-6] 一人留村，一人赴会**：必须真有在地照料与同月会期冲突；两名原有承诺的角色并行决定留下或赴会，只让实际现场人作证，不给离开者虚补值守与救援。
- [ ] **[P24-7] 入门后的第一个冬天**：只从原生入门后的第一季寒候与真实练功、失败、值守或回乡中写一章。默认一位新人视角，主角可在真实后果中浮现，不按境界排行授主角。
- [ ] **[P24-8] 旧伤使剑慢一分**：实际曾受伤且仍有余波的修士，亲到擂台后可改用合法术式、谢绝或请陪练。反映真实行动代价与复原状态，不补一条历史旧伤也不强制复仇。
- [ ] **[P24-9] 主角不在的那一夜**：主角确实不在某个真实关键事件现场时，让实际见证者分别留一句不同的第一人称短章；消息后来真实传到才连上下回，不给主角补现场记忆。
- [ ] **[P24-10] 山河静下来的一页**：用同一条真实长分支验证从当前正文点开上一季、回到原段、继续下一月的三步，其中旧章按需加载；在 360px 与 390px 下保留操作焦点、分支身份和事件原日期。
