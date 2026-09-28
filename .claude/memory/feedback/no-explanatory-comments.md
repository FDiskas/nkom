---
name: no-explanatory-comments
description: User rejects explanatory comments in code (call-site rationale, doc-comments, algorithm/timing explanations) even where clean-code would normally allow them; put reasoning in memory or the commit/PR description instead.
keywords: [comments, clean-code, why-comment, rationale-comment, doc-comment]
updated: 2026-09-28
---

### Rule / Fact

Default to no explanatory comments in code, even "why" comments that the `clean-code` skill would normally allow. This covers call-site rationale comments, function-level doc-comment blocks explaining a non-obvious algorithm, and inline comments explaining a timing/behavior gotcha.

### Context & Why

Confirmed through repeated corrections on prior work: rationale comments and doc-comment blocks explaining algorithm behavior were added, then removed on sight once flagged. In each case the reasoning was already captured elsewhere (memory or commit/PR description), so removing the comment lost nothing.

### Practical Impact

- When code needs explaining, use a clearer name or an extracted function first.
- If reasoning still needs to live somewhere, put it in `.claude/memory/` or the commit/PR description, not in a code comment.
- Treat this as the default, not a case-by-case judgment call.
- Unconfirmed: whether this extends to comments the user did not personally flag (e.g. pre-existing ones already in a file). Ask before mass-removing those rather than assuming the same treatment applies.
