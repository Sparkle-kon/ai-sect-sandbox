# 天道沙盒：AI修仙宗门与群像模拟器 (AI Sect Sandbox)

一个结合 **WorldBox + 鬼谷八荒 + 斯坦福 AI 小镇 (Generative Agents)** 的可视化沙盒修仙模拟器。
支持 **离线规则脑** 与兼容模型接口的 **结构化 JSON 决策**。不配置模型也可玩。仓库按 [开发规则](AGENTS.md) 和 [任务队列](BACKLOG.md) 逐项开发、验证和提交。

## 核心特性
- **2D 宗门与灵脉沙盒地图 (`WorldMapCanvas`)**：实时渲染各大宗门驻地、灵脉秘境、修士游历轨迹与渡劫/斗法事件。
- **动态因果与恩怨关系网 (`RelationshipGraph`)**：SVG 实时拓扑展示修士之间的师徒、道侣、同门、血仇与结盟。
- **双模式 AI 修士大脑 (`llmBrain.ts`)**：每个 NPC 拥有独立性格、功法、记忆流、虚构角色内心独白与行动决策。
- **天道干预控制台 (`GodConsole`)**：作为“天道/老爷爷”随时降下九天神雷、赐予天材地宝、发动魔道入侵，或向指定修士脑海灌输流言密语。
- **创世与剧本**：选择种子和创世谱系，也可以在「世界」里用[可交换剧本](docs/scenario-fixtures.md)离线复演一组干预。

## 快速开始

```bash
npm install
npm run dev      # 启动可视化沙盒界面
npm run verify   # 运行 TypeScript 类型检查 + Vitest 单元测试 + 生产构建校验
```

## 如何在同一次执行里连续开发？
把 [启动指令](PROMPT_FOR_DOTS.md) 交给编码 Agent。按队列做完并验证一项后，直接做下一项；只在实际执行窗口允许时继续。Markdown 不会延长执行窗口，也不会创建定时唤醒。
