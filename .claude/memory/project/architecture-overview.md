---
name: architecture-overview
description: Bun + React SSR app scraping NKOM XLSX waste-collection schedules; shared/ holds pure node-free modules used by both server and browser bundle
keywords: [architecture, bun, react, ssr, xlsx, nkom, shared, structure]
created: 2026-06-05
updated: 2026-06-05
---

**What it is:** A Bun server (`Bun.serve`) that scrapes NKOM `.xlsx` files from https://www.nkom.lt/kita.html, parses Lithuanian waste-collection schedules, and serves SSR React pages (`renderToStaticMarkup`) plus a JSON API (`/health`, `/cities`, `/events`). Entry: `index.ts` → `src/server.ts`.

**Key layers:**
- `src/nkomService.ts` — scraping, file cache, XLSX parsing, city/locality extraction, Google Calendar links.
- `src/server.ts` — `Bun.serve` router (ROUTES table + handlers), builds UI assets on startup (`Bun.build` IIFE + tailwind CLI).
- `src/ui/client/home-page.ts` — browser bundle (combobox + event rendering); registered as a build entrypoint via a **string** in server.ts, so dead-code tools can't see it (must be declared in config — see [[quality-tooling]]).
- `src/shared/` — **pure, node-free** modules (`locality.ts`, `waste.ts`) imported by BOTH the server and the browser bundle. Constraint: nothing here may import node/Bun APIs, so it bundles cleanly into the browser IIFE. This is the canonical place for client/server shared logic.
- `src/layout.tsx` — shared `<Layout>` HTML document shell for all SSR pages.

**Why shared/ matters:** locality normalization/stemming must be identical on server (XLSX keyword matching) and client (search box / URL matching), unified to the server's ruleset.

See [[code-conventions]] and [[quality-tooling]].
