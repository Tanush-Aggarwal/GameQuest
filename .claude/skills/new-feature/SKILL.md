---
name: new-feature
description: Build one GameQuest feature end to end the project's way (service, tests, route, client, UI states). Use when the user asks to build, add or implement a feature or the next item in docs/PROGRESS.md.
---

# Build a feature

1. Read the feature's section in `docs/BLUEPRINT.md` and the related rules in `AGENTS.md`.
2. Write a short plan (files to create or change, data model changes, endpoints) and confirm it with the user if it touches more than 3 files.
3. Server first:
   - Zod schema in `shared/`
   - Mongoose model + indexes
   - Service with all business rules (state machines, ownership, privacy, duplicates)
   - Tests for the service and route (happy path + each failure case)
   - Route + thin controller, wired through the auth/role middleware
4. Client:
   - API function in `client/src/services/`
   - Screen/components using only design tokens
   - Loading skeleton, empty state with one action, scoped error with Retry, success toast
5. Run lint and all tests; fix failures.
6. Commit with a conventional message, e.g. `feat(library): status state machine with history`.
7. Update `docs/PROGRESS.md` (move the item to Done).
