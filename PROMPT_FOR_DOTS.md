# PROMPT_FOR_DOTS.md — 复制给 GPT / Dots / Codex 的【游戏化重塑 G1–G5】指令

```markdown
Target GitHub Repository: https://github.com/Sparkle-kon/ai-sect-sandbox
Live Preview Site: https://ai-sect-sandbox-mobile-20261121.spazzzz.chatgpt.site/

Sync first: `git pull --rebase origin main`, then read `AGENTS.md` and `BACKLOG.md` completely.

SV1–SV3 are done. The 2026-11-23 review concluded: the engine is large-game grade, but the experience is still an "advanced simulator", not a game. New top priority is the `G1`–`G5` track at the top of `BACKLOG.md`:

- G1 Storyteller Director: a RimWorld-style director that guarantees an interactive highlight every 1–3 months, tension curve, trigger-threshold audit & relaxation, player-chosen monthly intents, and a homepage that is never empty.
- G2 Cultivator Career Mode: origin selection, clear progression goals (realm / sect rank / fame), 20+ quest templates, end-of-life evaluation scroll, and local meta-progression unlocks.
- G3 LLM Narrator (token burner, optional): LLM expands each chapter to 1,500–3,000 chars, free-form NPC conversation, improvised encounter prose, token budget & telemetry. LLM writes, rules decide; offline falls back to deterministic text.
- G4 Content Volume: migrate 20 micro-stories into `storyletEngine`, add 30 new storylets, a storylet editor, split `WorldMapCanvas.tsx`, content coverage report.
- G5 Onboarding & Release: remove developer/audit jargon from player-facing copy, first-10-minutes tutorial, continuous ambient animation (no 4-second freeze), art quality upgrade, real-browser acceptance & live redeploy.

Key rule change: keep settlement/cost/death/save strictly verifiable, but stop gating whether events happen behind stacked preconditions. Never generate new "only if A and B and C" text-only micro-stories or ledger tasks again.

Start with `[G1-1]`. For every task: implement fully, add deterministic tests (mock LLM), `npm run verify`, tick BACKLOG, update CHANGELOG in player-readable language, commit, `git push origin main`, and immediately continue. Never stop to ask.
```
