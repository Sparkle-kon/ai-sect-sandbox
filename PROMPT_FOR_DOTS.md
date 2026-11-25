# PROMPT_FOR_DOTS.md — H6 指令（复制整段发给 GPT Dots）

```markdown
Target GitHub Repository: https://github.com/Sparkle-kon/ai-sect-sandbox

Great work finishing all 20 H-track tasks. A deep code audit of `f426a82` found six concrete root causes why the game still feels tedious ("一个个点来点去，没有沉浸感和喜感"). New top priority: **H6 — Make the jokes actually happen & eliminate the 19-clicks-per-month UI grind**.

1. `git pull --rebase origin main`, then read `AGENTS.md`, `BACKLOG.md`, and **`docs/design/H6-comedy-consequence-guide.md`** (especially Sections 0.1–0.3 and Section 6) before coding.

2. Six Root Causes Found in Code (`f426a82`):
   - **68 of 86 comedy templates have `effects: []`**; the rest are only qi ±1/±2 (17) or kitchen damage (1). `SectComedyEffect` hard-caps qi to -2|-1|1|2. Zero templates recruit oddballs, gain/lose items, alter sect relations, or schedule sequels. Report text is vague ("另有进益", "有些不顺").
   - **6 away jobs (历练/摆摊/送货/招新/踢馆/联谊) are 100% stuck `on_route` in month 1** across 12 fresh games; gate guard is blocked in 24/42 cases.
   - **Monthly job assignments reset to empty (`SectMorningBoard.tsx:75`) & desktop hides the disciple roster (`SectMorningBoard.tsx:181`)**: `draft?.world === world` wipes all 6 disciples' job assignments every new month, and `lg:hidden` hides the disciple list on desktop, forcing 12 clicks on tiny canvas labels every month.
   - **End-of-month report forces 6 pagination clicks (`SectJobReportStage.tsx`) where 5 of 6 pages have no story**: `settleSectComedyMonth` (`sectComedy.ts:128`) only picks 1 disciple per month, so the other 5 disciples fall back to 4 stiff bureaucratic lines in `sectJobReportPresentation.ts:41` (`"掌门，弟子照吩咐办了，且向您交代一声。"`). Total = 19 clicks per month!
   - **`sectChat.ts:305` self-censors almost all comedy `chatHook.line`s**: `template.match.phase==='ambient'&&!/[{}]/.test(template.chatHook.line)` throws away every work-related or placeholder-bearing `chatHook.line` and replaces it with `COMIC_NEUTRAL` nonsense (`"且留一句闲笔。话写得太满，下个月的我不好落款。"`).
   - **Chat, livestream danmaku, and tabloid copy read like a safety inspection report (`sectChatVoices.ts`, `sectLiveLines.ts`, `tianjiTabloid.ts:117`)**, `sectPairDrama.ts` has near-impossible trigger gates (`both: true` + specific edge types), and `SectChatPanel.tsx:17` hides the chat sidebar below `1440px`.

3. Execute H6-1 → H6-7 in order, one commit per task:
   - **H6-1**: Expand `SectComedyEffect` & rule settlement (single pending field for visits/sequels).
   - **H6-2**: Rewrite all 86+ templates so ≥70% have non-qi consequences, ≥10 combo templates with consequences, ≥4 recruitable oddballs, concrete report text naming who/where/what/how much.
   - **H6-3**: ≥20 templates with `sequel` or `visit` (sequels can offer 2–3 choices; recurring NPCs quote the incident) + relax `sectPairDrama.ts` trigger gates so any pair on the same job can spark drama.
   - **H6-4**: Away jobs resolve as same-month round trips (`errand`) with map trails; gate guard available from start; verify 100% first-month availability across 12 starts.
   - **H6-5**: Fix `SectMorningBoard.tsx:75` (carry over last month's valid job assignments by default + 1-click "沿用上月差事并过月" + remove `lg:hidden` on desktop roster), replace `SectJobReportStage.tsx`'s 6-click pagination with a single-screen Monthly Sect Briefing (top 1–2 spotlight dramas + full roster summary where every disciple gets vivid quirk/job-specific copy, deleting `plain[tier]`), and add courtyard idle life / click-to-poke quips / interactive pill-cat.
   - **H6-6**: Fix `sectChat.ts:305` (substitute `{name}`/`{sect}`/`{site}`/`{job}` into `chatHook.line` and delete `COMIC_NEUTRAL`), lower chat sidebar breakpoint from `1440px` to `lg` (`1024px`), rewrite `sectChatVoices.ts`/`sectLiveLines.ts`/`sectMomentLines.ts`/`tianjiTabloid.ts` with lively xianxia humor (named embarrassment ranking in tabloid!), and add LLM-written return reports.
   - **H6-7**: Purge all disclaimer copy ("不等于/不算/照样算数") and run a 12-month rotating-assignment playtest, writing `docs/h6-playtest.md`.

4. For every task: implement fully, deterministic tests (mock LLM), `npm run verify`, tick BACKLOG, CHANGELOG in fun player-readable Chinese, commit, `git push origin main`, continue immediately. Never stop to ask.
```
