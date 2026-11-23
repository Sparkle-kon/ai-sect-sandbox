# PROMPT_FOR_DOTS.md — 唤醒 / 纠偏指令（复制整段发给 GPT Dots）

```markdown
Target GitHub Repository: https://github.com/Sparkle-kon/ai-sect-sandbox

You stopped committing at 19:18. Resume now.

1. `git pull --rebase origin main`, then read `AGENTS.md`, `BACKLOG.md`, and **`docs/design/G0-reference-guide.md`** completely before writing any code.

2. Second review findings (2026-11-23 22:30):
   - G1-1's "41 interactive opportunities in 120 months" were only the four basic moves (rest / cultivate / talk / travel) wrapped in six flavor texts. That is not a highlight. The acceptance criterion was under-specified; it is now fixed.
   - G1-3 fell into micro-tuning (A/B/C/D sub-commits moving 0→1, 3→9). 26 of 40 story systems still trigger 0 times in 1,200 months. Stop micro-tuning.

3. New counting rule: a **highlight** = ≥2 options with different outcomes, and at least one option causes a consequence that ordinary actions never produce (item/technique, bond, injury/breakthrough/lifespan, sequel, sect/reputation). Use `isHighlight` from the guide everywhere. The four basic moves never count.

4. Execute the G0 section in this exact order, **one commit per task**:
   - `[G0-1]` Rebuild the director: probe real gameplay sources (encounters, heart demon, tournament, dungeon, auction, dao path, forbidden art, bond reunions, quests, sequels) via a `HighlightSource` registry; when nothing is available, **seed** missing preconditions with future-only nudges (`travel_bias`, `encounter_ticket`, `omen_bias`, `npc_accept_bias`) stored in one field. Acceptance: seed 13071 "wandering_jianghu" 120 months → ≥30 highlights, ≥6 kinds, max gap ≤4; still_water ≥15; great_calamity ≥45; deterministic; output `docs/director-highlights.md`.
   - `[G0-2]` Close G1-3 in a single commit: classify every <2-trigger system as director-seeded / folded into a storylet / frozen (see the table in the guide), rewrite `docs/trigger-audit.md`, remove the "should not force antecedents" section, tick G1-3.
   - `[G2-1]` Origin selection & player cultivator. `[G2-2]` Career goals & "仙途" card. `[G2-3]` 20+ quest templates as storylet data. `[G4-2]` 30 new encounter storylets as data (use the generic `StoryletRuntimeState` + `StoryletEffect` descriptors; no new per-story top-level WorldState fields).

5. For every task: implement fully, deterministic tests with mocked LLM, `npm run verify`, tick BACKLOG, CHANGELOG in player-readable Chinese, commit, `git push origin main`, continue immediately. Never stop to ask.
```
