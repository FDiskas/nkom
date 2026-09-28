---
name: architecture-overview
description: Bun + React SSR app scraping NKOM XLSX/PDF waste-collection schedules; shared/ holds pure node-free modules used by both server and browser bundle
keywords: [architecture, bun, react, ssr, xlsx, pdf, nkom, shared, structure]
created: 2026-06-05
updated: 2026-09-28
---

**What it is:** A Bun server (`Bun.serve`) that scrapes NKOM `.xlsx`/`.pdf` schedule files from https://www.nkom.lt/kita.html, parses Lithuanian waste-collection schedules, and serves SSR React pages (`renderToStaticMarkup`) plus a JSON API (`/health`, `/cities`, `/events`). Entry: `index.ts` → `src/server.ts`.

**Key layers:**
- `src/nkomService.ts` — scraping, file cache, XLSX/PDF dispatch, city/locality extraction, Google Calendar links.
- `src/pdfSchedule.ts` — PDF fallback parser for schedules the site only ships as PDF (no XLSX sibling). See [[pdf-schedule-fallback]] for why it's structured the way it is.
- `src/server.ts` — `Bun.serve` router (ROUTES table + handlers), builds UI assets on startup (`Bun.build` IIFE + tailwind CLI).
- `src/ui/client/home-page.ts` — browser bundle (combobox + event rendering); registered as a build entrypoint via a **string** in server.ts, so dead-code tools can't see it (must be declared in config — see [[quality-tooling]]).
- `src/shared/` — **pure, node-free** modules (`locality.ts`, `waste.ts`) imported by BOTH the server and the browser bundle. Constraint: nothing here may import node/Bun APIs, so it bundles cleanly into the browser IIFE. This is the canonical place for client/server shared logic.
- `src/layout.tsx` — shared `<Layout>` HTML document shell for all SSR pages.

**Why shared/ matters:** locality normalization/stemming must be identical on server (schedule-file keyword matching) and client (search box / URL matching), unified to the server's ruleset.

See [[code-conventions]], [[quality-tooling]], [[pdf-schedule-fallback]].
