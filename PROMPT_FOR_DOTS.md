# PROMPT_FOR_DOTS.md — H6 指令（复制整段发给 GPT Dots）

```markdown
Target GitHub Repository: https://github.com/Sparkle-kon/ai-sect-sandbox

Great work finishing all 20 H-track tasks overnight. A review found two problems that keep the game from being fun. New top priority: H6 "make the jokes actually happen".

1. `git pull --rebase origin main`, then read `AGENTS.md`, `BACKLOG.md`, and **`docs/design/H6-comedy-consequence-guide.md`** before coding.

2. Findings (version f426a82):
   - Of 86 comedy templates, **68 have no effect at all**; the rest are only qi ±1/±2 (17) or kitchen damage (1). `SectComedyEffect` even hard-caps qi to -2|-1|1|2. Zero templates recruit anyone, gain/lose items, change sect relations, or leave a sequel. Report text is vague ("另有进益", "有些不顺"). The guide's flagship example (lost glutton brings back a demon-sect cook) was never implemented.
   - Across 12 fresh games (6 seeds × 2 starter sects), the six away jobs (历练/摆摊/送货/招新/踢馆/联谊) are **100% still travelling in month one**; gate guard is blocked in 24 of 42 cases.

3. Key correction: the truth rule means **the narrator must not invent facts** — it does NOT mean funny things cannot happen. Make each template **actually change the world through rules** (recruit a quirky stranger, bring back a weird item, damage any building, sour relations with the rival sect, schedule a recurring NPC visit or a sequel), then narrate those real facts concretely. The disciple's quote carries the punchline.

4. Execute H6-1 → H6-7 in order, one commit per task:
   H6-1 expand effects & rule settlement (single pending field for visits/sequels) → H6-2 rewrite templates: ≥70% with non-qi consequences, ≥10 combo templates with consequences, ≥4 recruitable oddballs, concrete report text → H6-3 ≥20 templates with sequel/visit, sequels may offer 2–3 choices, recurring NPCs quote the original incident → H6-4 away jobs resolve as same-month round trips with map trails; gate guard available from start; publish first-month availability stats → H6-5 courtyard idle life, click-to-poke quips, live pill-cat → H6-6 LLM-written return reports (default on when API configured, fact-checked, fallback, budgeted) → H6-7 remove disclaimer-style copy and run a 12-month rotating-assignment playtest, write `docs/h6-playtest.md` meeting the acceptance numbers in the guide.

5. For every task: implement fully, deterministic tests (mock LLM), `npm run verify`, tick BACKLOG, CHANGELOG in fun player-readable Chinese (no disclaimers), commit, `git push origin main`, continue immediately. Never stop to ask.
```
