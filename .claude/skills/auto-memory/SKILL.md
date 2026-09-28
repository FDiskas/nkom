---
name: auto-memory
description: Persistent per-project knowledge base. Saves high-signal facts (architecture choices, developer preferences, decisions, non-obvious gotchas) into topic folders under .claude/memory/, maintains root and folder-level indexes, and recalls relevant entries before starting tasks.
---

# Auto Memory

A structured, low-overhead project memory system. Context is organized hierarchically with a root index and topic-level indexes so agents can quickly discover and retrieve relevant context without bulk-loading files.

## Storage Layout

All files live under `.claude/memory/` in the project root:

```text
.claude/memory/
├── INDEX.md                          # Global master index pointing to topics and key files
├── project/                          # Topic folder
│   ├── INDEX.md                      # Index of all project-level memory files
│   ├── architecture-overview.md
│   └── deploy-pipeline.md
├── developer/                        # Topic folder
│   ├── INDEX.md                      # Index of all developer-profile memory files
│   └── preferences.md
├── decisions/                        # Topic folder
│   ├── INDEX.md                      # Index of architectural/technical decisions
│   └── cache-strategy.md
└── gotchas/                          # Topic folder
    ├── INDEX.md                      # Index of pitfalls and failure modes
    └── build-gotchas.md
```

### Folder & Index Rules:

- **Root Index:** `.claude/memory/INDEX.md` provides an overview of available topics and one-line summaries of key entries.
- **Folder Indexes (Mandatory):** Every subfolder under `.claude/memory/` **must** have its own `INDEX.md` listing all files in that specific folder with summaries and keywords.
- **Folder Names:** Use lowercase kebab-case. Check the root `INDEX.md` first and reuse an existing folder before inventing a new one.
- **Lazy Initialization:** Create `.claude/memory/` and the relevant folder on the first write. Do not scaffold unused empty directories.

---

## When to Save vs. Skip

**Save:**

- Explicit commands: _"remember this"_, _"save to memory"_, _"note that..."_, _"for future reference"_
- Developer profile & preferences: working style, PR/commit rules, communication tone, tooling constraints
- Context not deducible from code: business goals, external dependency quirks, deadlines, non-code rationales
- Trade-offs & decisions: reasons an alternative was rejected (especially when the code alone doesn't explain why)
- Incidents and gotchas: "we tried X and it failed because Y"

**Do NOT Save:**

- Anything derivable by reading current code, `git log`, or `git blame`
- Ephemeral task states, sprint todos, or work-in-progress notes (use task trackers instead)
- Raw code snippets, credentials, tokens, or secrets
- Changelogs, historical iterations, or narrative superseded states

---

## Storage Specification

### 1. Memory Entry (`.claude/memory/<topic>/<slug>.md`)

The slug names the topic, never a date. Do not put dates in file names or `name:` slugs; the `updated:` field carries the date.

Use clean frontmatter and structured sections:

```markdown
---
name: <short-kebab-slug>
description: <one-line summary used for index matching>
keywords: [tag1, tag2, tag3]
updated: YYYY-MM-DD
---

### Rule / Fact

<Clear, unambiguous statement of truth>

### Context & Why

<Reason, constraint, past incident, or rationale not visible in code>

### Practical Impact

<When this applies, how to handle edge cases>
```

### 2. Folder Index (`.claude/memory/<topic>/INDEX.md`)

Every folder contains an index cataloging its contents:

```markdown
# Developer Memory Index

- [preferences](preferences.md) — Concise explanations, prefer functional patterns, no trailing PR summaries. tags: style, comms, pr
- [tooling](tooling.md) — Uses pnpm instead of npm; Docker daemon runs on custom socket. tags: pnpm, docker, env
```

### 3. Root Master Index (`.claude/memory/INDEX.md`)

A high-level map organized by topic:

```markdown
# Project Memory Index

## developer/ ([Topic Index](developer/INDEX.md))

- [preferences](developer/preferences.md) — Style and PR conventions. tags: style, comms

## decisions/ ([Topic Index](decisions/INDEX.md))

- [cache-strategy](decisions/cache-strategy.md) — In-memory chosen over Redis for local execution. tags: cache, redis
```

---

## Retrieval Protocol

Run at the start of substantive tasks (skip for atomic, mechanical tasks like fixing a typo, running a single git command, or formatting):

1. **Check:** Does `.claude/memory/INDEX.md` exist? If not, skip retrieval.
2. **Scan:** Read `.claude/memory/INDEX.md`.
3. **Drill Down (if needed):** If a topic seems relevant, read `.claude/memory/<topic>/INDEX.md` to pinpoint specific files.
4. **Targeted Read:** Read _only_ the matching files. Never bulk-load the entire memory folder.
5. **Codebase Truth:** Always verify memory against current code and configuration. If a memory conflicts with code, the code wins: update or delete the stale entry immediately.

---

## Updating, Pruning, and Parity

- **Synchronized Index Updates:** Whenever a memory file is added, edited, or deleted:
  1. Update or create the file itself.
  2. Update the folder-level `.claude/memory/<topic>/INDEX.md`.
  3. Update the global `.claude/memory/INDEX.md`.
- **Atomic Updates:** Overwrite outdated files directly. Never maintain narrative history (_"originally X, changed to Y"_, _"a hook/approach was built then rejected/deleted"_). Git history already has whatever was tried and reversed — do not restate it in memory. State only the current reality: the decision, the rule, or the constraint as it stands now.
- **Resolved Issues:** Delete bug/gotcha entries when permanently fixed, unless a durable architectural constraint remains.
- **Explicit vs. Implicit Feedback:**
  - On explicit save: Save and confirm the file path.
  - On auto-detected save: Save silently and output a single-line notification (e.g., `Noted in memory/developer/preferences.md`).
