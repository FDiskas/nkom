---
name: code-conventions
description: Use Bun-native APIs instead of node: imports; all files are LF (enforced via .gitattributes)
keywords: [bun, node, conventions, line-endings, lf, crlf, gitattributes, fs, crypto]
created: 2026-06-05
updated: 2026-06-05
---

**Rule: prefer Bun-native APIs over `node:` imports.** The codebase has zero `node:` imports.
- `node:crypto` createHash → `new Bun.CryptoHasher("sha256").update(x).digest("hex")`
- `node:fs` read/write → `Bun.file(p).text()` / `.arrayBuffer()` / `.size`, and `Bun.write(p, data)` (auto-creates parent dirs, so no `mkdir`)
- `node:fs` readdir → `new Bun.Glob("*").scan({ cwd, onlyFiles: true })`
- `node:path` join → template literals (POSIX server; forward slashes fine)

**Why:** User explicitly asked to "use bun instead node". `Bun.build` and the tailwind CLI both create their output dirs, so explicit `mkdir` is unnecessary.

**Rule: LF line endings everywhere.** Repo was originally CRLF; user chose to normalize the whole repo to LF and it's enforced via `.gitattributes` (`* text=auto eol=lf`).

**Why:** User rejected a CRLF-matching proposal and said "normalize to LF". When editing, keep files LF — perl one-liner used: `perl -0777 -pi -e 's/\r\n/\n/g; s/\r/\n/g;'`.

Style: 2-space indent, double quotes. Note `biome.json` is configured for tab indent but the codebase is 2-space — biome is **not** enforced (don't reformat to satisfy it). See [[architecture-overview]].
