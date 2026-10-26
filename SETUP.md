# GameQuest — multi-AI setup guide

Claude Code, Antigravity and your local model **do not share memory with each other**.
They share context through three things in the repo, which every tool reads:

| File | What it holds | Who reads it |
| --- | --- | --- |
| `AGENTS.md` | The rules: stack, architecture, security, UI, workflow | Antigravity, OpenCode, most AI tools natively; Claude Code via `CLAUDE.md` |
| `docs/PROGRESS.md` | What's done, in progress and next | Every tool, at the start and end of each session |
| `docs/DECISIONS.md` | Why things were built a certain way | Every tool, before changing architecture |
| Git history | The actual changes | Every tool (`git log --oneline -10`) |

`CLAUDE.md` contains one line, `@AGENTS.md`, so Claude Code loads the same rules. **Only ever edit `AGENTS.md`** for shared rules.

---

## 1. Create the repo (once)

In PowerShell (or any terminal):

```powershell
mkdir gamequest
cd gamequest
git init
# copy everything from this setup kit into this folder (including the hidden .claude folder and .gitignore)
git add .
git commit -m "chore: project rules and shared AI context"
```

Then replace `docs/BLUEPRINT.md` with the real blueprint: open the GameQuest Blueprint doc on claude.ai, download/export it as Markdown, and save it over `docs/BLUEPRINT.md`. Commit it.

Create a GitHub repo and push, so the history is backed up from the first day.

## 2. Claude Code

```powershell
cd gamequest
claude
```

- The first time, approve the `@AGENTS.md` import when asked.
- Type `/context` to check that `CLAUDE.md` and `AGENTS.md` are loaded.
- What's included in this kit:
  - **Skill `new-feature`** (`.claude/skills/`): builds a feature the project's way. Say *"build the next item in PROGRESS.md"*.
  - **Skill `handoff`**: say *"handoff"* before you stop or switch tools.
  - **Subagent `reviewer`** (`.claude/agents/`): say *"use the reviewer agent"* before committing a feature.
- Save credits:
  - `/clear` before starting a new, unrelated task; `/compact` after finishing one.
  - Shift+Tab for plan mode on big changes, so you approve the plan before it writes code.
  - Give it one PROGRESS item at a time, not "build the whole tier".

## 3. Antigravity

- Open the `gamequest` folder as the workspace.
- Antigravity reads `AGENTS.md` from the project root automatically (recent versions; check it appears under the agent's Rules/Customizations panel). You don't need a `GEMINI.md`.
- Start each task with: *"Read AGENTS.md and docs/PROGRESS.md, then do the first item in Next up."*
- End each task with: *"handoff"* (the procedure is written in `AGENTS.md`, so it knows what to do).
- Good at: building UI screens and checking them in its browser.

## 4. Local model (free, unlimited, offline)

1. Install **Ollama** from ollama.com, then pick a coding model that fits your GPU memory:
   ```powershell
   ollama pull qwen2.5-coder:7b     # ~8 GB VRAM or less
   # ollama pull qwen2.5-coder:14b  # 12–16 GB VRAM
   ```
2. Give it a bigger context window so it can read `AGENTS.md` and your files (set once, then restart Ollama):
   ```powershell
   setx OLLAMA_CONTEXT_LENGTH 16384
   ```
3. Install **OpenCode** (a terminal coding agent that works with Ollama and reads `AGENTS.md`):
   ```powershell
   npm i -g opencode-ai
   cd gamequest
   opencode
   ```
   The kit's `opencode.json` already points it at `ollama/qwen2.5-coder:7b`. If you pulled a different model, change the name in that file to match `ollama list` exactly. Check opencode.ai/docs if the install command has changed; on Windows, WSL also works if the native install gives trouble.
4. Use local models for **small, well-defined tasks**: writing tests, seed data, README sections, CSS tweaks, simple components. They are much weaker than Claude or Gemini at multi-file architecture and tricky bugs.

## 5. The daily workflow

```
Start any tool  →  "Read AGENTS.md + docs/PROGRESS.md, do the first Next up item"
                →  tool builds ONE item, runs tests, commits
                →  "handoff"  (updates PROGRESS.md, commits)
Switch tools    →  the next tool starts from PROGRESS.md + git log
```

Suggested split:

| Tool | Use it for |
| --- | --- |
| Claude Code | Architecture, data models, auth, sync jobs, tricky logic, `reviewer` agent before commits |
| Antigravity | UI screens and layouts, checking pages in the browser, styling |
| Local model (OpenCode) | Tests, seed data, docs, small components, repetitive edits |

Rules that prevent chaos:
- **Never run two tools on the same files at the same time.** One tool works, hands off, then the next starts.
- **Commit before switching tools**, so any bad change is one `git restore` away.
- If a tool goes wrong, don't argue with it for 20 messages — `git restore .` and give a clearer, smaller task.
- Keep `PROGRESS.md` short. It's a to-do list, not a diary.

## 6. Plugins and MCP servers — keep it minimal

You don't need many. One is genuinely useful:

- **Context7** — gives the AI up-to-date docs for React, Express, Mongoose, Tailwind and so on, so it stops writing outdated code. In Claude Code:
  ```powershell
  claude mcp add --transport http context7 https://mcp.context7.com/mcp
  ```
  Then add "use context7" to a prompt when working with a library. Antigravity has an MCP settings panel where you can add the same server.

Optional later: a Playwright MCP for automated browser testing. Skip everything else until you hit a real need — every extra tool adds tokens to each request.

## 7. Never commit secrets

`.env` is in `.gitignore`. Put API keys (IGDB/Twitch, Steam, YouTube, Discord, MongoDB URI, JWT secrets) only in `.env`, and list their **names** (no values) in `.env.example`.
