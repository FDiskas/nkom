import { renderToStaticMarkup } from "react-dom/server";
import { Layout } from "./layout";
import { SiteFooter } from "./siteFooter";

function HomePage() {
  return (
    <Layout title="NKOM Atliekų išvežimo grafikas">
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <section className="hero-enter relative z-30 rounded-3xl border border-border/70 bg-card/90 p-6 shadow-lg shadow-orange-200/40 backdrop-blur sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <p className="mb-3 inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-secondary-foreground">
                  „NKOM“ klientams
                </p>
                <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
                  Atliekų išvežimo grafikai
                </h1>
                <p className="mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
                  Pasirinkite gyvenvietę iš sąrašo, gauto tiesiogiai iš „NKOM“ XLSX
                  failų, ir gaukite artimiausius šiukšlių išvežimo laikus su nuorodomis į „Google“ kalendorių.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/90 p-4">
                <label htmlFor="citySearch" className="mb-2 block text-sm font-semibold">
                  Gyvenvietė
                </label>
                <div id="comboRoot" className="relative">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    id="citySearch"
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    aria-expanded="false"
                    aria-controls="cityOptions"
                    aria-autocomplete="list"
                    placeholder="Kraunama..."
                    className="h-11 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-55"
                    disabled
                  />
                  <ul
                    id="cityOptions"
                    role="listbox"
                    className="absolute z-20 mt-1 hidden max-h-64 w-full overflow-auto rounded-md border border-border bg-card py-1 text-sm shadow-lg"
                  ></ul>
                  <select
                    id="citySelect"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    disabled
                  >
                    <option>Kraunama...</option>
                  </select>
                </div>
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
                Rastų grafikų
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
                Atliekų išvežimo tvarkaraščiai
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  id="bookmarkLink"
                  href="#"
                  className="text-xs font-semibold text-muted-foreground underline decoration-dotted underline-offset-4"
                >
                  Nuoroda
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
                Pasirinkite miestą.
              </p>
            </div>
            <div id="pastEventsWrap" className="mt-4 hidden">
              <button
                id="pastToggle"
                type="button"
                className="text-xs font-semibold text-muted-foreground underline decoration-dotted underline-offset-4"
              >
                Rodyti praėjusius grafikus
              </button>
              <span className="ml-2 text-xs text-muted-foreground">
                (<span id="pastCountValue">0</span>)
              </span>
              <div id="pastEventsRoot" className="mt-3 hidden space-y-3"></div>
            </div>
          </section>

          <SiteFooter />
        </main>
        <script src="/assets/home-page.js" defer></script>
    </Layout>
  );
}

export function renderHomePage(): string {
  return `<!doctype html>${renderToStaticMarkup(<HomePage />)}`;
}
