---
name: quality-tooling
description: Code-quality stack is knip + madge + fallow + bun test; entrypoint config gotchas and bunx/npx lockfile-pollution gotcha
keywords: [knip, madge, fallow, bun test, tooling, dead-code, quality, gotcha, lockfile, crap, coverage]
created: 2026-06-05
updated: 2026-06-05
---

**Tools used for code quality:** `knip` (dead code), `madge` (circular deps), `fallow` (`npx -y fallow` — dead-code/dupes/health/complexity), and `bun test`. Configs: `knip.json` and `.fallowrc.json`. Scripts: `bun test`, `tsc --noEmit` (`typecheck`).

**Gotcha — string-referenced build entrypoint:** `src/ui/client/home-page.ts` is referenced as a string in server.ts, so knip AND fallow falsely flag it (and its imports) as unused. Both configs declare it as an entry. Test files (`src/**/*.test.ts`) must also be declared as fallow entries or they show as "unused files".

**Gotcha — bunx/npx pollute the lockfile:** Running `bunx tsc`/`madge`/`knip` or `npx fallow` makes Bun auto-add deps (e.g. `@types/node`) to `package.json` + `bun.lock`. Revert after: `git checkout HEAD -- package.json bun.lock`.

**On fallow "complexity" findings:** CRAP score = cyclomatic + cyclomatic²·(1−coverage). With no/low test coverage, normal functions read as CRITICAL/HIGH purely from the untested penalty — adding tests (not fragmenting code) is the real fix. Flat JSX markup and the idiomatic route dispatcher are intentionally left long; don't fragment to game the metric. See [[code-conventions]] and [[architecture-overview]].
