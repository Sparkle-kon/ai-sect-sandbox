# PROMPT_FOR_DOTS.md — 复制给 GPT / Dots / Codex 的全自动永动指令

你可以直接把下面的 **【主启动指令 (Master Autonomous Loop Prompt)】** 复制粘贴给你的 GPT Agent / Dots / Codex / Cursor Agent，让它读取仓库里的 `AGENTS.md` 和 `BACKLOG.md` 开启无人值守的连续开发。

---

## 一、 主启动指令（首次启动或想让它一口气狂肝时复制这段）

```markdown
You are operating in UNATTENDED AUTONOMOUS EVOLUTION MODE on this repository (`ai-sect-sandbox` - 天道沙盒：AI修仙宗门与群像模拟器).

First, read `AGENTS.md` and `BACKLOG.md` completely.

Your mission is to work through `BACKLOG.md` continuously, task by task, phase by phase, without stopping to ask for my confirmation or waiting for human input.

For EVERY task in `BACKLOG.md`, strictly execute this closed loop:
1. Pick the next unchecked `- [ ]` task in `BACKLOG.md`.
2. Design and implement full, production-grade TypeScript + React code (zero placeholders, zero `TODO` stubs, zero `any` types). Ensure every new mechanic works in both the Deterministic Utility AI engine AND the LLM Cognitive JSON engine, and is fully wired into the UI panels/Canvas.
3. Write or update deterministic unit & simulation tests in `tests/` covering the new feature.
4. Run `npm run verify` (`npm run typecheck && npm run test && npm run build`) and fix any errors or warnings until it passes 100%.
5. Update `BACKLOG.md` (mark the completed item `- [x]`) and record the iteration summary in `CHANGELOG.md`.
6. Check the remaining unchecked `- [ ]` count in `BACKLOG.md`: if fewer than 20 unchecked tasks remain, immediately design and append 8-12 new deep gameplay/AI/UI tasks to `BACKLOG.md` so the queue never runs dry.
7. Commit all changes to git with a descriptive conventional commit message (and push to origin if configured).
8. CRITICAL: DO NOT STOP after completing one task! Do not ask "Would you like me to continue?" Immediately proceed to the next `- [ ]` task in `BACKLOG.md` and repeat the loop for as long as your execution window allows.

Start now with the first unchecked task in `BACKLOG.md` (`[P1-1]`).
```

---

## 二、 续命 / 唤醒指令（如果 Agent 跑满单次上下文窗口停下来了，复制这段让它无缝接着干）

```markdown
Resume UNATTENDED AUTONOMOUS EVOLUTION MODE per `AGENTS.md`.
1. Check `git status`, `CHANGELOG.md`, and `BACKLOG.md` to see where the last iteration finished.
2. Immediately pick the next unchecked `- [ ]` task in `BACKLOG.md`.
3. Remember the self-proliferation rule: keep at least 20 unchecked tasks in `BACKLOG.md` at all times, verify every task with `npm run verify`, commit to git, and NEVER stop to ask for confirmation between tasks. Keep iterating continuously!
```

---

## 三、 专项狂烧 Token 指令（如果你想让它在开发之余，专门跑大规模沙盒演化并生成长篇修仙史书）

```markdown
Read `AGENTS.md` and `BACKLOG.md`. In addition to advancing the feature backlog, write and execute a headless simulation chronicle script (`scripts/generateWorldHistory.ts`) that:
1. Runs the world engine for 300 virtual ticks (25 virtual years) with 20+ cultivators across 4 sects.
2. Uses deep cognitive reasoning to generate rich sect conspiracies, alchemy breakthroughs, tribulation tragedies, and faction wars.
3. Outputs a complete multi-chapter Markdown chronicle (`docs/CHRONICLES_OF_IMMORTALS.md`) with character biographies, sect rise-and-fall timelines, and battle transcripts, then verifies and commits everything.
```
