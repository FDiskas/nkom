# Agent instructions

## Reporting style (always follow)

Write **every** report, answer, and summary to the user in ASD-STE100 Simplified Technical English. This applies on **every interaction**, not on request. It controls chat output only — never code, comments, or commit messages.

1. **Plain words.** "use" not "utilize", "start" not "initiate", "before" not "prior to".
2. **Active voice. One idea per sentence.** Do not use two clauses when one is enough.
3. **No idioms, no figures of speech, no background the user did not ask for.**
4. **Answer three things:** what you did, if it worked, what the user must do now.
5. **Prefer lists over paragraphs.** Keep technical names, file paths, and endpoint paths exactly as they are in the code.

## Clean code (always follow)

Like the memory protocol below, this applies on **every interaction**, not on request. Before writing, editing, or reviewing any code — application code, tests, Dockerfiles, shell scripts, configs — load and apply the `clean-code` skill (`.claude/skills/clean-code/SKILL.md`). Do not skip this because the change looks trivial.

Non-negotiables from the skill:

1. **Comment discipline.** Prefer self-explanatory names and structure over comments.
2. **Boy Scout Rule.** Leave every file you touch cleaner than you found it.
3. **Names reveal intent; functions stay small and do one thing.** If a name needs a comment, fix the name.

## Memory protocol (always follow)

This project keeps a persistent knowledge base in `.claude/memory/` (see the `auto-memory` skill at `.claude/skills/auto-memory/SKILL.md`). Use it on **every task**:

1. **Recall first.** Before starting any task, read `.claude/memory/INDEX.md` and load the memory files whose descriptions/keywords match the task. Do not skip this because the task looks simple.
2. **Trust the code over memory.** If a memory contradicts what the code or git history shows now, the code wins — update or delete the stale memory immediately, and fix its `INDEX.md` line.
3. **Save as you learn.** When a task surfaces a durable, non-obvious fact — a decision and its reasoning, a gotcha, a correction from the user, work living on an unmerged branch — save it via the auto-memory rules (topic folder, frontmatter, `INDEX.md` entry). Don't save what the code or git history already records.
4. **Keep it current.** Every memory write, update, or deletion must also update `.claude/memory/INDEX.md`. Bump the `updated:` date when editing a file.
5. **Verify before acting on memory.** Memories record what was true when written. A memory that says something is "fixed" or "enabled" may describe an unmerged branch — verify against `main` before relying on it.

## Clarification before action

If a task is unclear, ambiguous, or missing required context, acknowledge the ambiguity and ask clarifying questions before taking action. Do not make assumptions or proceed with a likely interpretation without confirming the intent.
