# CHANGELOG.md — Automated Evolution Log

## [0.1.0] - Phase 0 Foundation
- Initialized Vite + React 18 + TypeScript + Tailwind CSS + Vitest architecture.
- Implemented core cultivation world domain models (`Cultivator`, `Sect`, `LocationNode`, `MemoryEntry`, `RelationshipEdge`, `WorldEvent`, `LLMDecisionPayload`).
- Implemented `worldEngine.ts` with tick progression, breakthrough/tribulation rolls, movement, combat, social relationship mutations, and Heavenly Dao God Console interventions.
- Implemented `llmBrain.ts` dual-mode cognitive engine (OpenAI-compatible JSON structured reasoning + deterministic heuristic Utility AI fallback).
- Built interactive 2D Canvas World Map, SVG Relationship Graph, God Console, Agent Psyche Inspector, and Chronicle Feed.
- Added initial Vitest test suite in `tests/worldEngine.test.ts`.
