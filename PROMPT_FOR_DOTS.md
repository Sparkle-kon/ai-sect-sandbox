# PROMPT_FOR_DOTS.md — 复制给 GPT / Dots / Codex 的 UI 视觉精修 + 连载小说扩充指令

```markdown
Target GitHub Repository: https://github.com/Sparkle-kon/ai-sect-sandbox
Git Clone URL: https://github.com/Sparkle-kon/ai-sect-sandbox.git
Live Preview Site: https://ai-sect-sandbox-mobile-20261121.spazzzz.chatgpt.site/

Sync with remote immediately: run `git pull --rebase origin main` and read the updated `AGENTS.md` and `BACKLOG.md`.

We have added two urgent top-priority tracks at the top of `BACKLOG.md` (`UI1` and `N1`):

1. **Track `UI1` (`[UI1-1]` to `[UI1-5]`): Visual & UI Strict Polish + Live Site Redeploy**
   - Fix the 5 visual issues seen in the user's screenshot:
     - `[UI1-1]`: Eliminate all text/badge/node overlaps on `WorldMapCanvas` (separate `摘星天机台` and `松灯坊市` coordinates; move `[宗1]`~`[宗4]` off the node center; stop cluttering location titles with 10 inline suffixes like `炉2 卫1 经 祠 集`—keep only clean `Location Name + Spirit Root` on canvas and move facility details into `MapEntityPopover`; adjust orbiting actor positions so names never collide with location titles).
     - `[UI1-2]`: Soften the harsh `15x9` Minesweeper-like checkerboard grid and `^` chevrons into an organic Chinese ink-wash landscape, and redesign the bright pastel minimap in the bottom-right corner into a sleek, collapsible dark-gold Xuan-ink compass that never covers `血月魔渊`.
     - `[UI1-3]`: Replace plain black circles and flat colored dots on the map with stylized vector sect landmarks (sword peak, cauldron, star dais, blood moon) and ornate cultivator tokens.
     - `[UI1-4]`: Fill the 80% empty black void in the right sidebar of the `地图` workspace (`views.map` `<aside>`) with a rich Cultivator Dossier showing `CultivatorPortrait` SVG, HP/Qi progress bars, inner monologue quote, equipped artifacts/Dao path, local site events, and quick God actions.
     - `[UI1-5]`: Polish global Xianxia UI theme AND **redeploy/update the live preview site (`https://ai-sect-sandbox-mobile-20261121.spazzzz.chatgpt.site/`)** so the user sees the latest build live!

2. **Track `N1` (`[N1-1]` to `[N1-5]`): Serialized Novel Pacing & Mundane Breathing Room (连载章回小说扩充)**
   - **Core Literary Principle**: Each chapter must read like a real serialized Xianxia novel—**NOT every paragraph should be a dramatic climax!**
   - Use **70% calm, mundane daily life transitions & seasonal atmosphere** (quiet cultivation, mountain rain, tending herb fields, furnace fire, traveling along mountain paths, mundane market errands without exaggerated subheadings) to build breathing room and contrast for the **1–2 true focal scenes** in each chapter, with natural chapter-to-chapter continuity (`书接上回` lead-ins and subtle end-of-chapter hooks) and a clean continuous book-page reader view (`SerializedBookPageTypography`).

Execute `[UI1-1]` through `[UI1-5]`, then `[N1-1]` through `[N1-5]`, and continue through `Phase 18`, `Phase 19`, and `Phase 20` continuously without stopping. Verify every task with `npm run verify`, commit and push to `origin main`, and redeploy the live preview site when available!
```
