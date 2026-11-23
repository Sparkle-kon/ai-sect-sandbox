# PROMPT_FOR_DOTS.md — 复制给 GPT / Dots / Codex 的【星露谷式 2D 具象化视觉大重塑 + Engine 2.0】指令

```markdown
Target GitHub Repository: https://github.com/Sparkle-kon/ai-sect-sandbox
Git Clone URL: https://github.com/Sparkle-kon/ai-sect-sandbox.git
Live Preview Site: https://ai-sect-sandbox-mobile-20261121.spazzzz.chatgpt.site/

Sync with remote immediately: run `git pull --rebase origin main` and read the updated `AGENTS.md` and `BACKLOG.md`.

CRITICAL USER FEEDBACK & VISUAL OVERHAUL (`SV1`–`SV3` at the top of `BACKLOG.md`):
The user reviewed the game and pointed out that the visual presentation is still way too shallow and abstract ("目前不具有可视化的，展示的太浅显了，现在连人物样貌，背景地图，都没有，要打磨成类似《星露谷物语 Stardew Valley》的具象化 2D 展现形式").

Stop writing text-only micro-story engines (`P22/P23`) immediately! Start from the new top-most unchecked task `[SV1-1]` at the top of `BACKLOG.md` and execute `SV1 -> SV2 -> SV3` sequentially:

1. **Stage `SV1` (`[SV1-1]` to `[SV1-5]`): Stardew-Style 2D Character Sprites, Full-Color Layered Portraits & Lush Tilemaps**
   - `[SV1-1]`: Transform `StoryFirstHome` and `CockpitStoryStage` from plain text boxes into a **Stardew-Style 2D Scene Stage (`SceneStageCanvas.tsx`) + Bottom Full-Color Portrait Dialogue Box**: render a living 2D courtyard/location scene on top (grass/stone tiles, ancient pavilions, smoking alchemy furnace, herb plots, pine trees, seasonal petals/snow, and 2D full-body cultivator sprites walking/meditating/dueling) paired with a large full-color character portrait box beside the story text (while keeping all existing ARIA roles/buttons so all 2,900+ tests stay green!).
   - `[SV1-2]`: Replace abstract circles/tokens on `WorldMapCanvas` with **2D Full-Body Chibi/Pixel Cultivator Sprites (`canvasCharacterSprite.ts`)** featuring visible hair buns/crowns, faces with eyes, flowing sect robes, swords/artifacts, and 4 animated poses (idle/flying sword, cross-legged meditation with rising qi motes, sword-slash combat, and herb-gathering/alchemy).
   - `[SV1-3]`: Repaint the `WorldMapCanvas` background (`lushTilemapRenderer.ts`) into a **Lush Colored 2D Tilemap with Architectural Building Sprites** (vibrant meadows, flowing rivers/waves, stone roads, snow peaks, and recognizable 2D building facades for Sword Pavilions, Alchemy Furnaces & Herb Plots, Red-Lantern Market Streets, Star Towers, and Thatched Villages).
   - `[SV1-4]`: Overhaul `CultivatorPortrait.tsx` into an **8-Layer Full-Color Paper-Doll Portrait with 5 Dynamic Facial Expressions** (scenic background, realm dharma halo, backed weapon, ornate sect robes, warm skin shading, expressive eyes/mouth switching between Calm, Breakthrough Joy, Fierce Combat, Wounded, and Heart-Demon Purple Eyes, plus 12 hairstyles & crowns).
   - `[SV1-5]`: Build **Stardew-Style Local Courtyard Tilemap View (`LocalCourtyardCanvas.tsx`)** allowing players to zoom/toggle into any location's 16x10 courtyard/town street to see herb plots growing, furnaces burning, pavilions, and resident 2D cultivator sprites walking and working in their actual roles!

2. **Stage `SV2` (`[SV2-1]` to `[SV2-5]`): Visual Duel Arena, Interactive Alchemy/Dungeon Mini-Stages & Web Audio Soundscape**
   - `[SV2-1]`: Build `VisualDuelArena.tsx` (side-by-side full-color portraits + center 2D sprites clashing with sword beams and step-by-step tactical combat animation).
   - `[SV2-2]` & `[SV2-3]`: Add 2D visual canvases for Alchemy Furnace flame control / Herb Garden growth stages and a 2D Dungeon Room Map with Boss sprites.
   - `[SV2-4]` & `[SV2-5]`: Add Day/Night & Seasonal weather particles (peach blossoms, fireflies, autumn leaves, snow) and a zero-dependency Web Audio API procedural Guqin & Sword soundscape (`soundscapeEngine.ts`).

3. **Stage `SV3` (`[SV3-1]` to `[SV3-5]`): Engine 2.0 Data-Driven Storylet Architecture & Live Site Redeployment**
   - Consolidate micro-events into a data-driven `storyletEngine.ts`, modularize `storageEngine.ts` (4600 lines), `llmBrain.ts` (4000 lines), and `worldEngine.ts` (2500 lines), and **redeploy the live preview site (`https://ai-sect-sandbox-mobile-20261121.spazzzz.chatgpt.site/`)**!

Start immediately with `[SV1-1]`, verify every task with `npm run verify`, commit and push each task to `origin main`, and NEVER stop between tasks!
```
