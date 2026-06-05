import {
  generateCalendarEvents,
  getCacheDiagnostics,
  getAvailableCities,
  getLatestXlsxFetchedAt,
  SOURCE_PAGE_URL,
} from "./nkomService.ts";
import { renderHomePage } from "./uiPage.tsx";
import { renderAboutPage } from "./aboutPage.tsx";

const DEFAULT_KEYWORD = "Kalviškės";
const UI_ASSET_OUT_DIR = "./public/assets";

const UI_ASSET_MIME: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

const UI_BUILD_ENTRYPOINTS = ["./src/ui/client/home-page.ts"];

async function handleHealth(): Promise<Response> {
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
      usedMb: Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(2)),
    },
    cache,
  });
}

async function handleCities(): Promise<Response> {
  const cities = await getAvailableCities();
  return jsonResponse({
    sourcePageUrl: SOURCE_PAGE_URL,
    count: cities.length,
    cities,
  });
}

async function handleEvents(url: URL): Promise<Response> {
  const keyword = url.searchParams.get("keyword")?.trim() || DEFAULT_KEYWORD;
  const events = await generateCalendarEvents(keyword);
  const lastUpdatedAt = await getLatestXlsxFetchedAt();
  return jsonResponse({
    keyword,
    sourcePageUrl: SOURCE_PAGE_URL,
    count: events.length,
    lastUpdatedAt,
    events,
  });
}

const ROUTES: Record<string, (url: URL) => Response | Promise<Response>> = {
  "/health": handleHealth,
  "/": () => htmlResponse(renderHomePage()),
  "/apie": () => htmlResponse(renderAboutPage()),
  "/cities": handleCities,
  "/events": handleEvents,
};

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  try {
    if (url.pathname.startsWith("/assets/")) {
      return await assetResponse(url.pathname);
    }

    const handler = ROUTES[url.pathname];
    if (handler) {
      return await handler(url);
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
}

export async function startServer(): Promise<void> {
  await buildUiAssets();
  const port = Number(process.env.PORT ?? 3000);

  Bun.serve({ port, fetch: handleRequest });

  console.log(`NKOM service listening on http://localhost:${port}`);
}

async function buildUiAssets(): Promise<void> {
  await buildTailwindCss();

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

async function buildTailwindCss(): Promise<void> {
  const outputPath = `${UI_ASSET_OUT_DIR}/home-page.css`;

  const process = Bun.spawn(
    [
      "bunx",
      "tailwindcss",
      "-i",
      "./src/ui/client/home-page.tailwind.css",
      "-o",
      outputPath,
      "--config",
      "./tailwind.config.cjs",
      "--minify",
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  if (exitCode !== 0) {
    const logs = [stdout, stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Failed to build Tailwind CSS${logs ? `:\n${logs}` : ""}`);
  }

  // Tailwind CLI does not inline our local stylesheet import here, so append it explicitly.
  const [tailwindCss, customCss] = await Promise.all([
    Bun.file(outputPath).text(),
    Bun.file("./src/ui/client/home-page.css").text(),
  ]);

  await Bun.write(outputPath, `${tailwindCss}\n${customCss}`);
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
