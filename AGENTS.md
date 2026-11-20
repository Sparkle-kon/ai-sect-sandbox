# AGENTS.md — Autonomous Perpetual Iteration Protocol (全自动无限演进协议)

> **CRITICAL DIRECTIVE FOR AUTONOMOUS AGENTS (GPT / Dots / Codex / Cursor / Devin):**
> You are operating in **UNATTENDED PERPETUAL EVOLUTION MODE (无人值守无限开发模式)** on **《天道沙盒：AI修仙宗门与群像模拟器》(AI Sect Sandbox)**.
> The human owner wants you to continuously expand, polish, test, and evolve this project without stopping to ask for confirmation or waiting for human input.

---

## 1. The Perpetual Execution Loop (永动机开发闭环)

You MUST execute the following loop continuously until explicitly interrupted by the user or system limits:

1. **SELECT**: Read `BACKLOG.md` and find the highest-priority unchecked task (`- [ ]`).
2. **ARCHITECT & IMPLEMENT**:
   - Design clean, modular TypeScript + React code adhering strictly to project conventions.
   - Never write placeholder stubs (`// TODO`, `// implement later`, dummy buttons that do nothing). Every feature must be fully wired into the simulation engine (`src/engine/`), state store, and UI (`src/components/`).
   - Maintain **Dual-Brain Compatibility**: Every new agent capability must work both with **Deterministic Utility AI (离线启发式规则脑)** AND **LLM Cognitive Brain (大模型 JSON 思维链推理脑)**.
3. **TEST**:
   - Add or update unit/simulation tests in `tests/` covering the new mechanics, edge cases, and state transitions.
4. **VERIFY**:
   - Run `npm run verify` (`npm run typecheck && npm run test && npm run build`).
   - If any type error, test failure, or build warning occurs, fix it immediately before proceeding.
5. **RECORD & PROLIFERATE (任务打卡与自繁殖机制)**:
   - Mark the completed task as `- [x]` in `BACKLOG.md`.
   - Append a concise entry to `CHANGELOG.md` documenting what was built and verified.
   - **SELF-PROLIFERATION RULE (核心自增殖法则)**: Count the remaining `- [ ]` tasks in `BACKLOG.md`. If fewer than **20 unchecked tasks** remain, or if completing a task opens up deep new gameplay/simulation possibilities, **immediately append 5–10 new concrete, high-depth tasks** to `BACKLOG.md` under a new or existing Phase.
6. **COMMIT**:
   - Stage all changes and commit with a clear conventional commit message (e.g., `feat(alchemy): implement pill crafting furnace, toxicity accumulation, and tribulation resistance pills`).
   - If a remote repository is configured and reachable, push intermittently or after each milestone phase.
7. **CONTINUE IMMEDIATELY**:
   - **DO NOT STOP** to ask *"Would you like me to move on to the next task?"* or *"Should I implement X next?"*
   - Immediately loop back to **Step 1 (SELECT)** and start the next task in `BACKLOG.md`!

---

## 2. Anti-Stall & Autonomous Decision Rules (防停机与自主决策准则)

- **Never Ask for Permission on Design Details**: You have full creative and architectural authority over cultivation realms, sect politics, combat formulas, map generation algorithms, LLM prompt templates, and UI layouts. Make the most engaging, deep, WorldBox/RimWorld/鬼谷八荒-inspired choice and implement it directly.
- **No Fake / Mock UI**: Every panel, button, filter, or God Console trigger in the UI must actually mutate or inspect `WorldState` and produce observable results on the 2D Canvas map, Relationship Graph, and Chronicle Feed.
- **Strict Type Safety**: Zero `any` types. All domain models live in `src/types/` with exhaustive union types and well-documented interfaces.
- **Deterministic Seeded Testing**: Simulation mechanics in `src/engine/` must be testable deterministically in Vitest without requiring live network LLM calls during `npm run test`.

---

## 3. Architecture Overview (项目架构蓝图)

```text
ai-sect-sandbox/
├── AGENTS.md                 # This perpetual execution protocol
├── BACKLOG.md                # Living self-expanding task queue (60+ tasks & growing)
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

## 4. Quality Gates Checklist (每次提交前必须通过的门禁)

Before marking any task `[x]` in `BACKLOG.md`:
- [ ] `npm run typecheck` passes with 0 errors.
- [ ] `npm run test` passes all existing + newly added tests.
- [ ] `npm run build` succeeds cleanly.
- [ ] `BACKLOG.md` is updated (`[x]` checked + new tasks spawned if queue < 20).
- [ ] `CHANGELOG.md` has the latest iteration summary.
- [ ] Git commit created cleanly.
