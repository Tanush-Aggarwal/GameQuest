@AGENTS.md

## Claude Code only
- Start each session by reading `docs/PROGRESS.md` and the last 10 commits before changing anything.
- Use plan mode (Shift+Tab) for anything that touches more than 3 files or changes a data model.
- Use the `reviewer` subagent before committing a finished feature.
- When the user says "handoff", run the `handoff` skill.
- Keep context small: run `/compact` when a task is done, `/clear` before starting an unrelated task.
