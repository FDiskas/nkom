import { renderToStaticMarkup } from "react-dom/server";
import { SOURCE_PAGE_URL } from "./nkomService";
import { SiteFooter } from "./siteFooter";

function AboutPage() {
  return (
    <html lang="lt">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Apie projektą | NKOM Atliekų išvežimo grafikas</title>
        <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap"
        />
        <link rel="stylesheet" href="/assets/home-page.css" />
      </head>
      <body className="font-display text-foreground min-h-screen">
        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <section className="hero-enter rounded-3xl border border-border/70 bg-card/90 p-6 shadow-lg shadow-orange-200/40 backdrop-blur sm:p-8">
            <p className="mb-3 inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-secondary-foreground">
              Apie projektą
            </p>
            <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              Kodėl?
            </h1>
            <p className="mt-4 max-w-3xl text-sm text-muted-foreground sm:text-base">
              Atsibodo nuolatos rankiniu būdu siųstis „NKOM Excel“ failus, ranka juose ieškoti savo miesto ir ranka sukelinėti į kalendorių. Beje, ne visi naudoja „Microsoft Excel“ :).
              Įgyvendinant šį projektą, turbūt blogiausia yra tai, jog patys „NKOM Excel“ failai yra ne sisteminiai ir nestabilūs, juose dažnai keičiasi struktūra, o miestų pavadinimai pateikiami nevienodai.
              Šiuo metu informacija gaunama iš {SOURCE_PAGE_URL}, surandami joje pateikiami duomenys bei atnaujinami kartą per 7-ias dienas. Visa agreguota informacija pateikiama per „API“
            </p>
          </section>

          <section className="stagger-1 hero-enter mt-6 grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-border bg-card/85 p-5 shadow-sm">
              <h2 className="text-lg font-bold">Kam skirtas?</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Puslapis skirtas „NKOM“ klientams, kurie nori greitai pasirinktam
                miestui matyti artimiausius atliekų išvežimo grafikus.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Tuo pačiu projektas skirtas ir developeriams, kuriems reikia
                patikimo „JSON API“ integracijoms, automatizacijoms ar papildomoms
                klientų aplikacijoms.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-card/85 p-5 shadow-sm">
              <h2 className="text-lg font-bold">Svarbu žinoti</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Aš nedirbu „NKOM'e“ ir nesu kaip nors su jais susijęs - Todėl pamatę kokius nors neatitikimus pirmiausia pasitikrinkite juos
                <a
                  className="ml-1 font-semibold underline decoration-dotted underline-offset-4"
                  href={`${SOURCE_PAGE_URL}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >{SOURCE_PAGE_URL}</a> puslapyje bei komunikuokite tiesiai su NKOM.
                Man galite rašyti tik šios svetainės veikimo/neveikimo klausimais el. paštu:
                <a
                  className="ml-1 font-semibold underline decoration-dotted underline-offset-4"
                  href="#"
                >
                  projektas[eta]gmail.com
                </a>
              </p>
            </article>
          </section>

          <section className="stagger-2 hero-enter mt-6 rounded-2xl border border-border bg-card/90 p-4 shadow-lg shadow-orange-100/50 sm:p-6">
            <h2 className="text-lg font-bold sm:text-xl">„API“ dokumentacija</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Žemiau pateikti „API“ endpointai. Visi
              atsakymai grąžinami „JSON“ formatu.
            </p>

            <div className="mt-5 space-y-4">
              <article className="rounded-xl border border-border bg-background/80 p-4">
                <p className="text-sm font-semibold">GET /health</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Serviso būklės monitorinimui.
                </p>
                <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground">
{`{
  "ok": true,
  "service": "nkom",
  "now": "2026-03-17T08:00:00.000Z",
  "uptimeSeconds": 123,
  "memory": { "usedMb": 64.5 },
  "cache": { "xlsxCount": 2 }
}`}
                </pre>
              </article>

              <article className="rounded-xl border border-border bg-background/80 p-4">
                <p className="text-sm font-semibold">GET /cities</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Grąžina visų rastų miestų sąrašą. (Labai tikėtina, kad jūsų miesto pavadinimo nebus arba jis bus netikslus)
                </p>
                <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground">
{`{
  "sourcePageUrl": "https://...",
  "count": 3,
  "cities": ["Kalviskes", "Avizieniai", "Didzioji Riese"]
}`}
                </pre>
              </article>

              <article className="rounded-xl border border-border bg-background/80 p-4">
                <p className="text-sm font-semibold">GET /events?keyword=&lt;miestas&gt;</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pagrindinis endpointas, kuris grąžina miesto atliekų išvežimo
                  tvarkaraščius.
                </p>
                <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs text-foreground">
{`{
  "keyword": "Kalviskes",
  "sourcePageUrl": "https://...",
  "count": 2,
  "lastUpdatedAt": "2026-03-16T21:15:00.000Z",
  "events": [
    {
      "date": "2026-03-20",
      "type": "Misiu komunaliniu atlieku isvezimas",
      "link": "https://calendar.google.com/...",
      "sourceFileUrl": "https://...xlsx"
    }
  ]
}`}
                </pre>
              </article>
            </div>
          </section>

          <SiteFooter />
        </main>
      </body>
    </html>
  );
}

export function renderAboutPage(): string {
  return `<!doctype html>${renderToStaticMarkup(<AboutPage />)}`;
}
