import {
  generateCalendarEvents,
  getCacheDiagnostics,
  getAvailableCities,
  getLatestXlsxFetchedAt,
  SOURCE_PAGE_URL,
} from "./nkomService.ts";
import { mkdir } from "node:fs/promises";
import { renderHomePage } from "./uiPage.tsx";
import { renderAboutPage } from "./aboutPage.tsx";

const DEFAULT_KEYWORD = "Kalviškės";
const UI_ASSET_OUT_DIR = "./public/assets";

const UI_ASSET_MIME: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

const UI_BUILD_ENTRYPOINTS = [
  "./src/ui/client/home-page.ts",
  "./src/ui/client/tailwind-config.ts",
];

export async function startServer(): Promise<void> {
  await buildUiAssets();
  const port = Number(process.env.PORT ?? 3000);

  Bun.serve({
    port,
    fetch: async (request: Request) => {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        const memory = process.memoryUsage();
        const rssBytes = memory.rss;
        const cache = await getCacheDiagnostics();
        return jsonResponse({
          ok: true,
          service: "nkom",
          now: new Date().toISOString(),
          uptimeSeconds: Math.round(process.uptime()),
          bunVersion: Bun.version,
          nodeCompatibilityVersion: process.version,
          platform: process.platform,
          pid: process.pid,
          memory: {
            usedMb: Number((rssBytes / (1024 * 1024)).toFixed(2)),
          },
          cache,
        });
      }

      if (url.pathname === "/") {
        return htmlResponse(renderHomePage());
      }

      if (url.pathname === "/apie") {
        return htmlResponse(renderAboutPage());
      }

      if (url.pathname.startsWith("/assets/")) {
        return await assetResponse(url.pathname);
      }

      if (url.pathname === "/cities") {
        try {
          const cities = await getAvailableCities();
          return jsonResponse({
            sourcePageUrl: SOURCE_PAGE_URL,
            count: cities.length,
            cities,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return jsonResponse({ error: message }, 500);
        }
      }

      if (url.pathname === "/events") {
        const queryKeyword = url.searchParams.get("keyword")?.trim();
        const keyword = queryKeyword || DEFAULT_KEYWORD;

        try {
          const events = await generateCalendarEvents(keyword);
          const lastUpdatedAt = await getLatestXlsxFetchedAt();
          return jsonResponse({
            keyword,
            sourcePageUrl: SOURCE_PAGE_URL,
            count: events.length,
            lastUpdatedAt,
            events,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return jsonResponse({ error: message }, 500);
        }
      }

      return jsonResponse({ error: "Not found" }, 404);
    },
  });

  console.log(`NKOM service listening on http://localhost:${port}`);
}

async function buildUiAssets(): Promise<void> {
  await mkdir(UI_ASSET_OUT_DIR, { recursive: true });

  await Bun.write(
    `${UI_ASSET_OUT_DIR}/home-page.css`,
    Bun.file("./src/ui/client/home-page.css"),
  );

  const build = await Bun.build({
    entrypoints: UI_BUILD_ENTRYPOINTS,
    outdir: UI_ASSET_OUT_DIR,
    target: "browser",
    format: "iife",
    naming: "[name].js",
    minify: false,
    sourcemap: "none",
  });

  if (!build.success) {
    const details =
      build.logs
        .map((log) => log.message)
        .filter(Boolean)
        .join("\n") || "Unknown build error";
    throw new Error(`Failed to build UI assets:\n${details}`);
  }
}

async function assetResponse(pathname: string): Promise<Response> {
  const extension = pathname.slice(pathname.lastIndexOf("."));
  const contentType = UI_ASSET_MIME[extension];
  if (!contentType) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  const file = Bun.file(`./public${pathname}`);
  if (!(await file.exists())) {
    return jsonResponse({ error: "Not found" }, 404);
  }

  return new Response(file, {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
    },
  });
}
