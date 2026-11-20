# CHANGELOG.md — Automated Evolution Log

## [Unreleased]
- **P1-2:** Annual reflection builds bounded beliefs, obsessions and heart demons from recent memories, with expiring influence and traceable evidence. Utility AI uses those findings; optional validated JSON narration keeps mechanics in the simulation. The Inspector and map show active reflections. All 18 deterministic tests, type checking and production build passed.
- **P1-1:** Episodic memories carry emotional valence and decay; each year, up to three distinct high-impact memories consolidate into a bounded long-term bank. Recall affects Utility AI duel caution and is included in structured LLM context. The Inspector shows both banks, while the map highlights the selected cultivator's core memories. Verified with 11 deterministic tests and a production build. Added the npm lockfile for repeatable installs.

## [0.1.0] - Phase 0 Foundation
- Initialized Vite + React 18 + TypeScript + Tailwind CSS + Vitest architecture.
- Implemented core cultivation world domain models (`Cultivator`, `Sect`, `LocationNode`, `MemoryEntry`, `RelationshipEdge`, `WorldEvent`, `LLMDecisionPayload`).
- Implemented `worldEngine.ts` with tick progression, breakthrough/tribulation rolls, movement, combat, social relationship mutations, and Heavenly Dao God Console interventions.
- Implemented `llmBrain.ts` dual-mode cognitive engine (OpenAI-compatible JSON structured reasoning + deterministic heuristic Utility AI fallback).
- Built interactive 2D Canvas World Map, SVG Relationship Graph, God Console, Agent Psyche Inspector, and Chronicle Feed.
- Added initial Vitest test suite in `tests/worldEngine.test.ts`.
