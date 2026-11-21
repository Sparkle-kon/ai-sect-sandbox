# AGENTS.md — 天道沙盒连续开发协议

**做完一项，直接做下一项。** 开发迭代以提交为单位，不以对话回复为单位。这是同一次执行中的连续循环，不靠定时任务、提醒或周期唤醒。只在用户叫停、真实阻塞或执行环境硬性结束时停下；系统强制结束不能靠 Markdown 延长。

## 1. 每轮执行

1. 完整阅读本文件和 [任务队列](BACKLOG.md)。检查工作区、`origin/main`、`CHANGELOG.md` 和最近的接续记录，不覆盖未识别改动。
2. 从顶部取第一个未勾选任务。不要跳过依赖项，或为凑数量把多个功能合并为一次验收。
3. 完整实现 TypeScript + React 功能，不新增 `any`、占位、空按钮或 TODO 桩。机制用正式世界状态和规则结算，接通离线 Utility AI 与 LLM Cognitive JSON；UI/Canvas 应显示或操作与该任务相关的真实结果。
4. 在 `tests/` 补确定性单元和模拟测试，覆盖正常、拒绝、重复和必要的状态竞争。LLM 路径用模拟响应，不用付费请求跑测试。
5. 执行 `npm run verify`（类型检查、测试、生产构建）。修复失败及相关警告，失败时不勾选也不发布。通过后勾选本项，并在 `CHANGELOG.md` 写下实现、验证和限制。
6. 统计 `BACKLOG.md` 中真实未勾选任务。少于 20 时在末尾追加一个阶段，列出 **10 项**有玩法深度且可验收的任务。沿[纪元主线](BACKLOG.md#纪元主线)最近一次实测留下的问题补队列，写明玩家能做什么、世界怎样变化、用哪个存档或场景验收。先查已有编号，避免重复立项。
7. 单独创建描述性的 conventional commit。在获授权的工作中逐项推送 `origin main` 并核对远端；不强推。若推送受阻，保留已验证的本地提交，不声称已发布。
8. 返回第 2 步。不要在正常设计选择、单项完成或报告阶段停下来请示。

### 纪元主线的交付口径

以 `BACKLOG.md` 的物理顺序为准。先让玩家从百年后的真实世界入世，再开放作者编写未来，最后推进跨域、跨千年的文明演化。E3-10 验收时按其实测结果就地展开 E4，此次接续独立于第 6 步的队列余量。首页沿用「继续／更多」，年代入口放在现有世界、存档、纪事和人物工作区。观察、跟随、附身分别沿用各自的资格规则。

长局任务在变更记录中留下可复查的起点（规则版本、种子、谱系、分支、仙历）、推进方式、干预与终点。按任务记录在世修士、历代入册、创世仍在、在籍凡人，以及受影响的具名人物、地点或契约。涉及规模时记录耗时和实际存档字节。小场景覆盖日常回归，百年及以上样本在对应里程碑复跑，并验证读回后还能推进和分叉。旧规则的样本数值仅作对照。

在纪事与读档中，分别标明逐月事实、版本化区域年算结果和作者设定的来源。因果引用落到所属分支的实体和事件，保留未知与相互冲突的证词。快进续跑还原已确认的世界检查点。开发续跑还原任务编号、代码提交与验证进度，两者分别记录。

## 2. 运行结束、恢复和实际阻塞

- **可用窗口内**：持续按队列推进；通过验收的里程碑可以报告，但报告不是停止信号。
- **窗口即将结束**：保存已验证、已发布的最后 SHA；把未验证的工作保留在云端可恢复检查点，并记下任务编号、最近验证、下一步及阻塞。不把半成品标为完成或推到 main。
- **实际重启后**：先确认没有重叠执行，核对远端与检查点；安全时从未完成项恢复，不重新做已经发布的工作。不要创建定时唤醒替代持续运行。
- **真正阻塞**：用户要求暂停、平台不允许、权限/凭证不可用，或者验证失败且剩余窗口无法解决。报告具体影响，不能借“无人值守”规避权限、付费、密钥或部署边界。

## 3. Architecture Overview (项目架构蓝图)

```text
ai-sect-sandbox/
├── AGENTS.md                 # This iteration and handoff protocol
├── BACKLOG.md                # Ordered task queue
├── PROMPT_FOR_DOTS.md        # Copy-paste master prompts to launch/resume GPT Dots
├── CHANGELOG.md              # Automated iteration log maintained by the agent
├── src/
│   ├── types/
│   │   └── world.ts          # Core domain types: Cultivator, Sect, Tile, Memory, Event, LLMDecision
│   ├── data/
│   │   └── initialWorld.ts   # Procedural world generator, sects, biomes, techniques, artifacts
│   ├── engine/
│   │   ├── worldEngine.ts    # Core tick simulation: cultivation, combat, movement, tribulations, diplomacy
│   │   └── llmBrain.ts       # Dual-mode AI driver: OpenAI-compatible JSON cognitive loop + Utility AI fallback
│   ├── components/
│   │   ├── WorldMapCanvas.tsx    # Interactive HTML5 Canvas 2D map with territories, particles & entities
│   │   ├── RelationshipGraph.tsx # Dynamic SVG force/radial social graph (master, grudge, lover, ally)
│   │   ├── GodConsole.tsx        # Heavenly Dao intervention deck, LLM settings, whisper injector
│   │   ├── AgentInspector.tsx    # Deep NPC psyche inspector (CoT inner monologue, memory stream, gear)
│   │   └── ChronicleFeed.tsx     # Filterable living history log & world lore generator
│   ├── App.tsx               # Main dashboard layout & simulation loop controller
│   └── main.tsx              # Entry point
└── tests/
    └── worldEngine.test.ts   # Vitest deterministic simulation test suite
```

---
