# Languages
- for code and documentation: English
- for chat (your responses to user): Czech

# AGENTS

## Agentic memory

This repository uses persistent, versioned project memory in `agent-memory/`.

- For every non-trivial coding task, read `agent-memory/index.md` first.
- Load only the memory notes relevant to the task; do not read the whole `agent-memory/` tree by default.
- For code-changing tasks, treat `agent-memory/active-context.md`, `agent-memory/invariants.md`, and `agent-memory/architecture.md` as the default baseline unless the task is clearly unrelated.
- Before editing, briefly state which memory notes are active and which invariants apply.
- Update memory only for reusable project facts, stable patterns, architectural decisions, or traps likely to recur.
- If the user explicitly asks to update memory, edit the relevant memory files directly; otherwise mention a proposed memory update instead of adding noise.
- Keep memory concise, factual, and linked to source files or implementation patterns.