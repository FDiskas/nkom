import {
  generateCalendarEvents,
  getCacheDiagnostics,
  getAvailableCities,
  SOURCE_PAGE_URL,
} from "./nkomService.ts";
import { renderHomePage } from "./uiPage.tsx";

const DEFAULT_KEYWORD = "Kalviškės";

export function startServer(): void {
  const port = Number(process.env.PORT ?? 3000);

  Bun.serve({
    port,
    fetch: async (request: Request) => {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        const memory = process.memoryUsage();
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
            rssBytes: memory.rss,
            heapTotalBytes: memory.heapTotal,
            heapUsedBytes: memory.heapUsed,
            externalBytes: memory.external,
            arrayBuffersBytes: memory.arrayBuffers,
          },
          cache,
        });
      }

      if (url.pathname === "/") {
        return htmlResponse(renderHomePage());
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
          return jsonResponse({
            keyword,
            sourcePageUrl: SOURCE_PAGE_URL,
            count: events.length,
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
