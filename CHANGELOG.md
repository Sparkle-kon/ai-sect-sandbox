# CHANGELOG.md — Automated Evolution Log

## [Unreleased]
- **P1-4:** Validated, persistent multi-month plans now cover sect infiltration, pill acquisition, vengeance and artifact theft. Steps advance through real travel, spending, combat or transfers, and track interruptions, failure and expiry. Both brains pursue the same state machine; the Inspector and map show progress. All 36 deterministic tests, type checking and production build passed.
- **P1-3:** Local witnesses, conversations and sect flying swords carry bounded, decaying rumor ledgers. Deceitful cultivators can plant or exaggerate leads without giving recipients ground truth; both brains see only personal intelligence, and encounters enforce co-location. The Inspector shows provenance and perceived credibility. All 27 deterministic tests, type checking and production build passed.
- **P1-2:** Annual reflection builds bounded beliefs, obsessions and heart demons from recent memories, with expiring influence and traceable evidence. Utility AI uses those findings; optional validated JSON narration keeps mechanics in the simulation. The Inspector and map show active reflections. All 18 deterministic tests, type checking and production build passed.
- **P1-1:** Episodic memories carry emotional valence and decay; each year, up to three distinct high-impact memories consolidate into a bounded long-term bank. Recall affects Utility AI duel caution and is included in structured LLM context. The Inspector shows both banks, while the map highlights the selected cultivator's core memories. Verified with 11 deterministic tests and a production build. Added the npm lockfile for repeatable installs.

## [0.1.0] - Phase 0 Foundation
- Initialized Vite + React 18 + TypeScript + Tailwind CSS + Vitest architecture.
- Implemented core cultivation world domain models (`Cultivator`, `Sect`, `LocationNode`, `MemoryEntry`, `RelationshipEdge`, `WorldEvent`, `LLMDecisionPayload`).
- Implemented `worldEngine.ts` with tick progression, breakthrough/tribulation rolls, movement, combat, social relationship mutations, and Heavenly Dao God Console interventions.
- Implemented `llmBrain.ts` dual-mode cognitive engine (OpenAI-compatible JSON structured reasoning + deterministic heuristic Utility AI fallback).
- Built interactive 2D Canvas World Map, SVG Relationship Graph, God Console, Agent Psyche Inspector, and Chronicle Feed.
- Added initial Vitest test suite in `tests/worldEngine.test.ts`.
