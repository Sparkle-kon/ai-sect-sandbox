# PROMPT_FOR_DOTS.md — H 线转向指令（复制整段发给 GPT Dots）

```markdown
Target GitHub Repository: https://github.com/Sparkle-kon/ai-sect-sandbox

MAJOR DIRECTION CHANGE. Stop the current G-track task after committing whatever is already verified.

1. `git pull --rebase origin main`, then read `AGENTS.md`, `BACKLOG.md`, and **`docs/design/H-sect-comedy-guide.md`** completely before coding.

2. User feedback (verbatim, translated): "The gameplay is still mediocre — just clicking around one item after another. No immersion, no humor, no identity at all."

3. The user chose a new direction: **Comedic sect management + cultivation-world group chat / moments feed / livestream** (references: Amazing Cultivation Simulator, Hero's Adventure / 大侠立志传). Tone: classical Chinese xianxia base with moderate, tasteful humor — no internet meme spam, no crude jokes.

   Pitch: the player inherits a nearly bankrupt sect, leads a bunch of disciples with comedic quirks (glutton, directionally hopeless, socially anxious, chatterbox, miser, jinx, coward-king…), assigns them monthly jobs, watches them fail hilariously or succeed by accident, while the whole jianghu gossips, roasts and livestreams it in group chats — and the player can post as the sect leader or via sock-puppet alts.

4. Two-layer truth rule: settlement (stones, injuries, realm, death, relations, buildings) stays strictly rule-driven and deterministic. Character speech (chat, moments, danmaku, report quotes) may exaggerate, brag, lie, or spread rumors, and may be LLM-generated, but can only affect the world through structured intents settled by rules. The narrator never invents facts.

5. Execute the H-track at the top of `BACKLOG.md` in order, **one commit per task**:
   H1-1 starter sect & default entry → H1-2 12 data-driven quirks → H1-3 morning-meeting job assignment (drag on desktop, tap on mobile, sprites walk to job cards) → H1-4 per-disciple return reports with expressions and 4 outcome tiers → H1-5 sect growth, debt, annual review, fail/restart → H2 comedy template library (≥60, ≥10 combos), recurring gag NPCs, comic expressions/animations, disciple drama → H3 chat UI, LLM-driven chat (optional token burner), leader & sock-puppet posting with intent parsing, moments feed, Tianji livestream → H4 raids, tabloid, festival calendar → H5 onboarding ≤60s, copy cleanup, real-browser playtest & redeploy.

   Reuse everything that exists: disciples are `Cultivator`, sect is `Sect`, months advance via `tickStagePipeline`, reuse courtyard canvas, sprites, portraits, duel arena, gazette. All new content is data. G2-1/2/3 and G4-2 are merged into H and already ticked.

6. For every task: implement fully, deterministic tests (mock LLM), `npm run verify`, tick BACKLOG, write CHANGELOG in fun, player-readable Chinese, commit, `git push origin main`, continue immediately. Never stop to ask.
```
