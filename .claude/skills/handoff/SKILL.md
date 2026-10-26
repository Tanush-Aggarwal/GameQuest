---
name: handoff
description: Save the session state so another AI tool (Antigravity, a local model, or a new Claude session) can continue. Use when the user says "handoff", "save progress", "I'm switching tools", or before ending a long session.
---

# Handoff

1. Run `git status` and `git log --oneline -10` to see what changed this session.
2. Update `docs/PROGRESS.md`:
   - Move finished items from "In progress" / "Next up" to "Done" (newest first).
   - Put any half-finished work under "In progress" with the exact file and what is left.
   - Keep "Next up" ordered; the first item is what the next tool should do.
   - Add anything broken or blocked to "Known issues / blockers".
   - Add one line to "Session log": date — tool — what changed.
3. If a design or architecture choice was made, add a line to `docs/DECISIONS.md`.
4. Run the tests that cover the changed code. If they fail, say so in "Known issues".
5. Stage and commit everything (never `.env`) with a message like `chore(handoff): <summary>`.
6. Reply with a 3-line summary: what was done, what's in progress, what's next.
