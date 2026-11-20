# 天道沙盒：AI修仙宗门与群像模拟器 (AI Sect Sandbox)

一个结合 **WorldBox + 鬼谷八荒 + 斯坦福 AI 小镇 (Generative Agents)** 的可视化沙盒修仙模拟器。
支持 **双核驱动**（离线启发式规则脑 + 接入任意 OpenAI / Gemini / DeepSeek 兼容接口的大模型思维链推理脑），并且内置专门为 **Autonomous Coding Agents (GPT Dots / Codex / Cursor / Claude Code)** 设计的**全自动无限演进协议 (`AGENTS.md` + `BACKLOG.md`)**。

## 核心特性
- **2D 宗门与灵脉沙盒地图 (`WorldMapCanvas`)**：实时渲染各大宗门驻地、灵脉秘境、修士游历轨迹与渡劫/斗法事件。
- **动态因果与恩怨关系网 (`RelationshipGraph`)**：SVG 实时拓扑展示修士之间的师徒、道侣、同门、血仇与结盟。
- **双模式 AI 修士大脑 (`llmBrain.ts`)**：每个 NPC 拥有独立性格、功法、记忆流、内心独白（Chain-of-Thought）与行动决策。
- **天道干预控制台 (`GodConsole`)**：作为“天道/老爷爷”随时降下九天神雷、赐予天材地宝、发动魔道入侵，或向指定修士脑海灌输流言密语。
- **AI 永动机开发协议 (`AGENTS.md` & `BACKLOG.md`)**：直接复制 `PROMPT_FOR_DOTS.md` 中的指令给你的 AI 编程 Agent，即可让其自动按阶段完成 60+ 项深度修仙机制开发、自编写测试、自动构建校验并自动裂变新任务。

## 快速开始

```bash
npm install
npm run dev      # 启动可视化沙盒界面
npm run verify   # 运行 TypeScript 类型检查 + Vitest 单元测试 + 生产构建校验
```

## 如何让 GPT Dots / Codex 全自动一直肝这个项目？
打开 [`PROMPT_FOR_DOTS.md`](./PROMPT_FOR_DOTS.md)，将里面的 **主启动指令** 复制粘贴给你的 Agent 即可。
