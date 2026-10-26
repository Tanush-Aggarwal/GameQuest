# GameQuest — Decisions log

Record every design or architecture decision here so every AI tool follows the same choices.
Format: date — decision — why.

- 2026-10-26 — One LibraryEntry per user per game with an `ownerships[]` array — the product promise is a unified library; per-platform entries would duplicate games.
- 2026-10-26 — Progress kept as three separate tracks (manual, achievement %, playtime) — playtime is not completion; synced data must not overwrite user input.
- 2026-10-26 — Background jobs with Agenda on MongoDB instead of BullMQ — no Redis to host or pay for.
- 2026-10-26 — IGDB as main game data source (also unlocks Twitch clips with the same credentials); RAWG as fallback.
- 2026-10-26 — Discord: OAuth `identify` + validated pasted invite first; bot-created invites/events second — linking an account cannot create server invites.
- 2026-10-26 — Dark-first UI with Quest Violet accent and Loot Gold reserved for rewards.
- 2026-10-26 — 3D features (Blender/VRoid) deferred until the full website is built.

## 2026-10-26 — Claude Code — item 1: monorepo scaffold
- npm workspaces (shared, server, client); plain JS + ESM everywhere; single flat ESLint config at root.
- Tailwind v3 (config maps colours to tokens.css CSS variables); Vite client; Jest (ESM via --experimental-vm-modules) server, Vitest client.
- docs/BLUEPRINT.md is still a placeholder — rules taken from AGENTS.md only.
