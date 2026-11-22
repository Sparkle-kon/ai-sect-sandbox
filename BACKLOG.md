# BACKLOG.md — Infinite Evolution Task Queue (天道沙盒开发任务队列)

> **接续方法：** 从顶部第一个未勾选项（`- [ ]`）开始，每项独立实现、测试、验证和发布；完成后立即接下一项，不等人为确认。
> **战略转向（天道变法）：** 停止新增微观账本/收据/工具磨损/过秤运费等琐碎行政任务！全面聚焦 **1) 大屏全息同屏指挥台 (Panoramic Cockpit UX)**、**2) 2D Canvas 九州视觉奇观与动画演出**、**3) 高戏剧性修仙爽感（肉鸽奇遇抉择、神通法宝对轰、心魔幻境、正魔灭门大战）**、**4) `App.tsx` 架构解耦瘦身与零散面板收拢**。
> **完成标准：** 双引擎兼容、直观视觉/UI 呈现、确定性测试、`npm run verify`（保持既有 2000+ 测试全绿）、更新 CHANGELOG、单独提交并推送到 `origin/main`。
> **补队列：** 完成后若未勾选项少于 20 项，在队列末尾追加一个包含 10 项“视觉奇观/修仙戏剧玩法/架构精简”的新阶段。完整规则见 [AGENTS.md](AGENTS.md)。

---

## 天道变法主线：大屏全息沙盒、视觉奇观、高能修仙戏剧与架构重塑 (V1–V4)

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
- [ ] **[P17-10] Verified Cultivation Slot Transfers Under Competing Claims (同地并约与实有时段让渡)**: Allow two original holders and a real site custodian to negotiate a finite reassignment of one previously granted cultivation period. Verify the other holder's actual timely consent and physical arrival, preserve old spend and completed periods, refund only unused entitlements through their original account, and never convert a time slot into title or faction rank.

---

## Phase 18: 仙途奇观、宗门大比舞台与神通法宝进阶 (Xianxia Spectacle & Grand Tournaments)

- [ ] **[P18-1] 可视化八强淘汰赛「仙门大比」演武擂台 (`TournamentBracketArena`)**：当触发宗门大比或天下论剑时，生成直观的 8 强/16 强晋级对阵图（Bracket UI），支持玩家逐轮观看或快进天骄对决、押注气运灵石，并为夺冠魁首颁发专属称号与通天灵宝。
- [ ] **[P18-2] 上古秘境多层探索地图与护宝妖王 Boss 战 (`SecretRealmDungeonExplorer`)**：进入开启的秘境后，展现秘境内部的三层险境节点（外围药园 → 核心古殿 → 传承禁地），修士可组队或独闯挑战镇守妖王，支持破阵、夺宝与秘境崩塌前的紧急逃生。
- [ ] **[P18-3] 炼丹炉火候微操与丹雷异象 (`AlchemyFurnaceInteractive & PillLightning`)**：炼制高阶金丹（九转金丹、渡劫神丹）时引动天地丹雷，成丹品质分为凡品、灵品、仙品与绝世丹纹，并在地图与面板上触发丹香百里异象。
- [ ] **[P18-4] 本命飞剑养成、剑意领悟与万剑归宗演出 (`SwordIntentMastery`)**：为剑修与法修提供专属道途（剑道、丹道、阵道、魔道、体修）进阶树，领悟剑意/刀意/魔意后在 Canvas 战斗中展现专属颜色的剑阵光效。
- [ ] **[P18-5] 拍卖行风云与压轴天材地宝竞价争夺 (`ImmortalAuctionHouse`)**：在万仙坊市定期开启「万宝大会拍卖行」，各宗门长老、散修与玩家引导角色同场加价竞拍残破古宝、筑基/结婴灵丹，买下后甚至可能引来魔修半路截杀。
- [ ] **[P18-6] 修士立绘头像生成器与境界气场特效 (`ProceduralCultivatorPortrait`)**：为每位修士根据其性别、年龄、宗门、灵根、境界与性格生成独特的 SVG 国风古装头像与背后的境界法相光环（金丹金轮、元婴法相、魔道血月）。
- [ ] **[P18-7] 天机奇闻日报与修仙界热搜风云榜 (`TianjiGazetteNewspaper`)**：每逢年度交替或重大战役后，由天机阁自动编撰一份排版精美的《天机风云报》，包含头版头条、天骄黑马点评、恩怨八卦与悬赏通缉令。
- [ ] **[P18-8] 道侣双修大典、血脉后代灵根遗传与修仙家族崛起 (`CultivationClanDynasty`)**：当两位修士结为生死道侣并举办双修大典，可诞下拥有父母复合灵根与先天词条的后代，逐步在宗门外形成绵延数百年的修仙世家。
- [ ] **[P18-9] 飞升天劫终极演出与上界仙门接引 (`AscensionToImmortalPlaneVFX`)**：当修士修炼至渡劫大圆满引发飞升天劫时，全地图渲染九天仙门洞开、仙乐齐鸣的史诗级过场与结局纪传，将其永载入封神榜。
- [ ] **[P18-10] 全息沙盒性能与代码整洁度全面巡检 (`HolisticSandboxPolish & BundleOptimization`)**：对所有新增的视觉特效、全息指挥台与戏剧引擎进行渲染帧率与构建包体积优化，确保在千人长局下依然丝滑流畅。

## Phase 19　天命分岔与万象同屏 (Fate, Crossing Timelines & Canvas)
- [ ] **[P19-1] 主角扶危的三回合逃亡戏**：只从原生追击、向导和安全通道选候选，逐回合追踪方向和承诺；地图只画实际路线，验证断援时仍有可说明的撤退结局。
- [ ] **[P19-2] 心魔余波与道心自疗**：按真实已完成心魔劫生成可见的后果与复原路径；守护记忆隐私，固定种子验证三种余波会分别改变后续救援和交情选择。
- [ ] **[P19-3] 万剑来朝的结阵战景**：由真实参战阵眼、各修士调息和本命神通结算驱动三层光效；阵眼未开不演放招，逐帧核对弱动效与命中。
- [ ] **[P19-4] 拜山试心、宗门破局三择**：实际到场后触发守诺、识破、离开的短章，按门规和真实声望结算，手机只在需要时插入场景。
- [ ] **[P19-5] 宿缘重逢的主角交接**：在上一主角真实退场后，以已发生的关系事件选择候选视角；三条能解释分歧的旧证据，不强推预写角色。
- [ ] **[P19-6] 同一场决战的不同目击视点**：地图、故事与战报能从合法在场双方切换，只呈现各自亲见，异步切换不把兄弟分支或失密话串入。
- [ ] **[P19-7] 飞升渡口卷轴与入界动画**：只读取真实上界入口资格与位置，飞升途中、通过、折返各有演出，不借切换视图跳过路程。
- [ ] **[P19-8] 夜宴前厅与私语清晰分场**：同一场已发生宴会支持公开演说、个人内心和会后对谈分场；故事模式无额外常驻菜单，两个引擎同用真实出席逻辑。
- [ ] **[P19-9] 绘景与界面权限边界模块化**：将事件过滤与 Canvas 绘景调度从工作区组件拆为具名适配层，单一时钟，无障碍地图与实际绘制来源一致，旧入口保持可用。
- [ ] **[P19-10] 故事模式长局回顾与回看返回**：提供可从手机一键进出的短篇会目，从真实转折抽取分幕，选当前分支恢复原阅读位置和焦点，不触发模拟。
