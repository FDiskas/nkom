# Memory Index

## project/
- [architecture-overview](project/architecture-overview.md) — Bun + React SSR scraping NKOM XLSX/PDF; shared/ = pure node-free modules for both server & browser bundle. keywords: architecture, bun, react, ssr, xlsx, pdf, shared
- [code-conventions](project/code-conventions.md) — Bun-native APIs over node: imports; whole repo is LF (enforced via .gitattributes). keywords: bun, node, line-endings, lf, gitattributes
- [quality-tooling](project/quality-tooling.md) — knip + madge + fallow + bun test; entrypoint config + bunx/npx lockfile-pollution gotchas; CRAP is coverage-driven. keywords: knip, madge, fallow, dead-code, lockfile, crap
- [pdf-schedule-fallback](project/pdf-schedule-fallback.md) — anchor-based PDF row grouping; 3 live-data bugs fixed: Stiklas/Pakuotės type collapsing, back-to-back row merging, leaked container-yard section. keywords: pdf, pdfjs-dist, xlsx fallback, table extraction, anchor, groupLinesIntoRows, dropSharedContainerSection

## feedback/
- [event-handler-style](feedback/event-handler-style.md) — tie new UI behavior to an existing semantic event, don't add a redundant listener for an overlapping event. keywords: event listener, focus, click, ux, home-page.ts
