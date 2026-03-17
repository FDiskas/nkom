import { renderToStaticMarkup } from "react-dom/server";

const tailwindConfigScript = String.raw`
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          display: ["Manrope", "ui-sans-serif", "system-ui"],
        },
        colors: {
          border: "hsl(var(--border))",
          input: "hsl(var(--input))",
          ring: "hsl(var(--ring))",
          background: "hsl(var(--background))",
          foreground: "hsl(var(--foreground))",
          primary: {
            DEFAULT: "hsl(var(--primary))",
            foreground: "hsl(var(--primary-foreground))",
          },
          secondary: {
            DEFAULT: "hsl(var(--secondary))",
            foreground: "hsl(var(--secondary-foreground))",
          },
          muted: {
            DEFAULT: "hsl(var(--muted))",
            foreground: "hsl(var(--muted-foreground))",
          },
          card: {
            DEFAULT: "hsl(var(--card))",
            foreground: "hsl(var(--card-foreground))",
          },
        },
      },
    },
  };
`;

const pageStyles = String.raw`
  @import url("https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap");

  :root {
    --background: 44 33% 97%;
    --foreground: 20 15% 12%;
    --card: 0 0% 100%;
    --card-foreground: 20 15% 12%;
    --primary: 24 91% 53%;
    --primary-foreground: 0 0% 100%;
    --secondary: 45 60% 90%;
    --secondary-foreground: 22 35% 20%;
    --muted: 38 45% 93%;
    --muted-foreground: 24 18% 35%;
    --border: 28 24% 82%;
    --input: 26 25% 80%;
    --ring: 24 91% 53%;
  }

  body {
    background: radial-gradient(circle at 10% 10%, #ffe5bd 0%, transparent 40%),
      radial-gradient(circle at 90% 20%, #ffd7c2 0%, transparent 35%),
      linear-gradient(160deg, #fffdf8 0%, #fef8ef 100%);
  }

  .hero-enter {
    animation: riseIn 600ms ease-out both;
  }

  .stagger-1 {
    animation-delay: 120ms;
  }

  .stagger-2 {
    animation-delay: 220ms;
  }

  @keyframes riseIn {
    from {
      opacity: 0;
      transform: translateY(18px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const homePageScript = String.raw`
  const citySelect = document.getElementById("citySelect");
  const loadBtn = document.getElementById("loadBtn");
  const statusText = document.getElementById("statusText");
  const eventsRoot = document.getElementById("eventsRoot");
  const pastEventsRoot = document.getElementById("pastEventsRoot");
  const pastEventsWrap = document.getElementById("pastEventsWrap");
  const pastToggle = document.getElementById("pastToggle");
  const pastCountValue = document.getElementById("pastCountValue");
  const countValue = document.getElementById("countValue");
  const cityValue = document.getElementById("cityValue");
  const sourceValue = document.getElementById("sourceValue");
  const sourceList = document.getElementById("sourceList");
  const bookmarkLink = document.getElementById("bookmarkLink");
  const copyBookmarkBtn = document.getElementById("copyBookmarkBtn");

  void init();

  async function init() {
    try {
      setStatus("Ikraunamas miestu sarasas...");
      const response = await fetch("/cities");
      if (!response.ok) {
        throw new Error("Nepavyko gauti miestu saraso");
      }

      const payload = await response.json();
      const cities = Array.isArray(payload.cities) ? payload.cities : [];
      populateCities(cities);
      applyCityFromUrl(cities);
      updateBookmarkLink(citySelect.value);
      setStatus("Rasta " + cities.length + " miestu");
      loadBtn.disabled = cities.length === 0;

      if (cities.length > 0) {
        await loadEvents();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, true);
      citySelect.innerHTML = "<option>Klaida kraunant duomenis</option>";
    }
  }

  function populateCities(cities) {
    citySelect.innerHTML = "";

    if (!cities.length) {
      citySelect.append(new Option("Miestu nerasta", ""));
      citySelect.disabled = true;
      return;
    }

    for (const city of cities) {
      citySelect.append(new Option(city, city));
    }

    citySelect.disabled = false;
  }

  loadBtn.addEventListener("click", () => {
    void loadEvents();
  });

  citySelect.addEventListener("change", () => {
    updateBookmarkLink(citySelect.value);
    void loadEvents();
  });

  copyBookmarkBtn.addEventListener("click", async () => {
    const url = bookmarkLink.getAttribute("href") || "";
    if (!url) {
      return;
    }

    const copied = await copyTextToClipboard(url);
    if (!copied) {
      setStatus("Nepavyko nukopijuoti nuorodos", true);
      return;
    }

    const originalText = copyBookmarkBtn.textContent;
    copyBookmarkBtn.textContent = "Nukopijuota";
    setStatus("Nuoroda nukopijuota");
    setTimeout(() => {
      copyBookmarkBtn.textContent = originalText || "Kopijuoti";
    }, 1600);
  });

  pastToggle.addEventListener("click", () => {
    const isHidden = pastEventsRoot.classList.contains("hidden");
    if (isHidden) {
      pastEventsRoot.classList.remove("hidden");
      pastToggle.textContent = "Paslepti praejusius ivykius";
      return;
    }

    pastEventsRoot.classList.add("hidden");
    pastToggle.textContent = "Rodyti praejusius ivykius";
  });

  async function loadEvents() {
    const city = citySelect.value;
    if (!city) {
      return;
    }

    setStatus("Ikraunamas grafikas...");
    loadBtn.disabled = true;
    updateBookmarkLink(city);

    try {
      const response = await fetch(
        "/events?keyword=" + encodeURIComponent(city),
      );
      if (!response.ok) {
        throw new Error("Nepavyko gauti ivykiu");
      }

      const payload = await response.json();
      const events = Array.isArray(payload.events) ? payload.events : [];
      const split = splitEventsByDate(events);
      renderEvents(eventsRoot, split.upcoming);
      renderPastEvents(split.past);

      countValue.textContent = String(split.upcoming.length);
      cityValue.textContent = payload.keyword || city;
      const sources = new Set(events.map((event) => event.sourceFileUrl));
      const sourceUrls = [...sources].filter(Boolean);
      sourceValue.textContent = String(sourceUrls.length);
      renderSourceFiles(sourceUrls);
      updateBookmarkLink(city);

      setStatus("Grafikas sekmingai atnaujintas");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, true);
      eventsRoot.innerHTML =
        '<p class="rounded-md bg-red-50 px-3 py-3 text-sm text-red-700">' +
        escapeHtml(message) +
        "</p>";
      pastEventsWrap.classList.add("hidden");
      sourceValue.textContent = "-";
      sourceList.innerHTML = "";
      updateBookmarkLink(city);
    } finally {
      loadBtn.disabled = false;
    }
  }

  function applyCityFromUrl(cities) {
    if (!cities.length) {
      return;
    }

    const cityFromUrl = new URL(window.location.href).searchParams.get("city");
    if (!cityFromUrl) {
      return;
    }

    const normalizedFromUrl = normalizeCityToken(cityFromUrl);
    const keyedFromUrl = toCityMatchKey(cityFromUrl);
    const match =
      cities.find((city) => city === cityFromUrl) ||
      cities.find((city) => normalizeCityToken(city) === normalizedFromUrl) ||
      cities.find((city) => toCityMatchKey(city) === keyedFromUrl);

    if (match) {
      citySelect.value = match;
    }
  }

  function updateBookmarkLink(city) {
    const currentUrl = new URL(window.location.href);
    if (city) {
      currentUrl.searchParams.set("city", city);
    } else {
      currentUrl.searchParams.delete("city");
    }

    const nextUrl = currentUrl.toString();
    history.replaceState(null, "", nextUrl);
    bookmarkLink.setAttribute("href", nextUrl);
    bookmarkLink.setAttribute("title", nextUrl);
    copyBookmarkBtn.disabled = !city;
  }

  function normalizeCityToken(value) {
    return String(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/["“”„']/g, "")
      .replace(/\s+(?:vs\.?|k\.?|km\.?|mstl\.?|m\.)$/i, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toCityMatchKey(value) {
    const normalized = normalizeCityToken(value);
    if (!normalized) {
      return "";
    }

    return normalized
      .split(" ")
      .filter(Boolean)
      .map((word) => stemCityWord(word))
      .join(" ")
      .trim();
  }

  function stemCityWord(word) {
    const endings = [
      "iai",
      "iu",
      "io",
      "ui",
      "ai",
      "as",
      "is",
      "ys",
      "es",
      "os",
      "us",
      "e",
      "a",
      "i",
      "u",
    ];

    for (const ending of endings) {
      if (word.endsWith(ending) && word.length - ending.length >= 4) {
        return word.slice(0, -ending.length);
      }
    }

    return word;
  }

  async function copyTextToClipboard(value) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // Fallback handled below.
      }
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = value;
      textArea.setAttribute("readonly", "true");
      textArea.style.position = "fixed";
      textArea.style.top = "-1000px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textArea);
      return success;
    } catch {
      return false;
    }
  }

  function renderSourceFiles(urls) {
    if (!urls.length) {
      sourceList.innerHTML =
        '<p class="mt-1 text-xs text-muted-foreground">Saltiniu nerasta.</p>';
      return;
    }

    sourceList.innerHTML = urls
      .map((url, index) => {
        const safeUrl = escapeHtml(url);
        return (
          '<a class="block text-xs text-muted-foreground underline decoration-dotted underline-offset-4" href="' +
          safeUrl +
          '" target="_blank" rel="noreferrer">XLSX saltinis ' +
          String(index + 1) +
          "</a>"
        );
      })
      .join("");
  }

  function renderPastEvents(events) {
    if (!events.length) {
      pastEventsWrap.classList.add("hidden");
      pastEventsRoot.classList.add("hidden");
      return;
    }

    pastEventsWrap.classList.remove("hidden");
    pastEventsRoot.classList.add("hidden");
    pastCountValue.textContent = String(events.length);
    pastToggle.textContent = "Rodyti praejusius ivykius";
    renderEvents(pastEventsRoot, events);
  }

  function renderEvents(root, events) {
    if (!events.length) {
      root.innerHTML = '<p class="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">Pasirinktam miestui ivykiu nerasta.</p>';
      return;
    }

    const rows = events
      .map((event) => {
        const date = escapeHtml(event.date || "-");
        const type = escapeHtml(event.type || "Nezinomas tipas");
        const link = escapeHtml(event.link || "#");

        return (
          '<article class="grid gap-3 rounded-xl border border-border bg-background/80 p-4 sm:grid-cols-[1fr_auto]">' +
          "<div>" +
          '<p class="text-sm font-semibold">' +
          type +
          "</p>" +
          '<p class="text-xs text-muted-foreground">Data: ' +
          date +
          "</p>" +
          "</div>" +
          '<a href="' +
          link +
          '" target="_blank" rel="noreferrer" class="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-xs font-semibold hover:bg-muted">Prideti i kalendoriu</a>' +
          "</article>"
        );
      })
      .join("");

    root.innerHTML = rows;
  }

  function splitEventsByDate(events) {
    const today = new Date();
    const todayKey =
      String(today.getFullYear()) +
      "-" +
      String(today.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(today.getDate()).padStart(2, "0");
    const upcoming = [];
    const past = [];

    for (const event of events) {
      if (typeof event?.date === "string" && event.date < todayKey) {
        past.push(event);
      } else {
        upcoming.push(event);
      }
    }

    return { upcoming, past };
  }

  function setStatus(message, isError = false) {
    statusText.textContent = message;
    statusText.className = isError
      ? "mt-3 min-h-5 text-xs text-red-700"
      : "mt-3 min-h-5 text-xs text-muted-foreground";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
`;

function HomePage() {
  return (
    <html lang="lt">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>NKOM Atlieku Grafikas</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script dangerouslySetInnerHTML={{ __html: tailwindConfigScript }} />
        <style dangerouslySetInnerHTML={{ __html: pageStyles }} />
      </head>
      <body className="font-display text-foreground min-h-screen">
        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <section className="hero-enter rounded-3xl border border-border/70 bg-card/90 p-6 shadow-lg shadow-orange-200/40 backdrop-blur sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <p className="mb-3 inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-secondary-foreground">
                  NKOM klientams
                </p>
                <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
                  Atliekų išvežimo grafikas Jūsų miestui
                </h1>
                <p className="mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
                  Pasirinkite miestą iš sąrašo, gauto tiesiogiai iš NKOM XLSX
                  failų, ir gaukite artimiausius šiukšlių išvežimo laikus su greitomis
                  nuorodomis į google kalendorių.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/90 p-4">
                <label htmlFor="citySelect" className="mb-2 block text-sm font-semibold">
                  Miestas
                </label>
                <select
                  id="citySelect"
                  className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm outline-none transition focus:ring-2 focus:ring-ring"
                  disabled
                >
                  <option>Kraunama...</option>
                </select>
                <button
                  id="loadBtn"
                  className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
                  disabled
                >
                  Rodyti grafiką
                </button>
                <p id="statusText" className="mt-3 min-h-5 text-xs text-muted-foreground"></p>
              </div>
            </div>
          </section>

          <section className="stagger-1 hero-enter mt-6 grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-border bg-card/85 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Pasirinktas miestas
              </p>
              <p id="cityValue" className="mt-1 truncate text-xl font-bold">
                -
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-card/85 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Rastų įvykių
              </p>
              <p id="countValue" className="mt-1 text-2xl font-extrabold">
                -
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-card/85 p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Šaltinio failai <span id="sourceValue">(0)</span>
              </p>
              <div id="sourceList" className="mt-2 space-y-1"></div>
            </article>
          </section>

          <section className="stagger-2 hero-enter mt-6 rounded-2xl border border-border bg-card/90 p-4 shadow-lg shadow-orange-100/50 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold sm:text-xl">
                Artimiausi isvezimo ivykiai
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  id="bookmarkLink"
                  href="#"
                  className="text-xs font-semibold text-muted-foreground underline decoration-dotted underline-offset-4"
                >
                  Nuoroda su miestu
                </a>
                <button
                  id="copyBookmarkBtn"
                  type="button"
                  className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Kopijuoti
                </button>
              </div>
            </div>
            <div id="eventsRoot" className="space-y-3">
              <p className="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">
                Pasirinkite miesta, kad uzkrauti grafika.
              </p>
            </div>
            <div id="pastEventsWrap" className="mt-4 hidden">
              <button
                id="pastToggle"
                type="button"
                className="text-xs font-semibold text-muted-foreground underline decoration-dotted underline-offset-4"
              >
                Rodyti praejusius ivykius
              </button>
              <span className="ml-2 text-xs text-muted-foreground">
                (<span id="pastCountValue">0</span>)
              </span>
              <div id="pastEventsRoot" className="mt-3 hidden space-y-3"></div>
            </div>
          </section>

          <footer className="mt-8 pb-3 text-center">
            <a
              href="/health"
              className="text-xs font-semibold text-muted-foreground underline decoration-dotted underline-offset-4"
            >
              API diagnostika
            </a>
          </footer>
        </main>

        <script dangerouslySetInnerHTML={{ __html: homePageScript }} />
      </body>
    </html>
  );
}

export function renderHomePage(): string {
  return `<!doctype html>${renderToStaticMarkup(<HomePage />)}`;
}
