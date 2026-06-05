/// <reference lib="dom" />

type NkomEvent = {
  date?: string;
  type?: string;
  link?: string;
  sourceFileUrl?: string;
};

type CitiesPayload = {
  cities?: unknown;
};

type EventsPayload = {
  keyword?: string;
  lastUpdatedAt?: string;
  events?: unknown;
};

const citySelect = getRequiredElement<HTMLSelectElement>("citySelect");
const citySearch = getRequiredElement<HTMLInputElement>("citySearch");
const cityOptions = getRequiredElement<HTMLUListElement>("cityOptions");
const comboRoot = getRequiredElement<HTMLDivElement>("comboRoot");
const loadBtn = getRequiredElement<HTMLButtonElement>("loadBtn");
const statusText = getRequiredElement<HTMLParagraphElement>("statusText");
const eventsRoot = getRequiredElement<HTMLDivElement>("eventsRoot");
const pastEventsRoot = getRequiredElement<HTMLDivElement>("pastEventsRoot");
const pastEventsWrap = getRequiredElement<HTMLDivElement>("pastEventsWrap");
const pastToggle = getRequiredElement<HTMLButtonElement>("pastToggle");
const pastCountValue = getRequiredElement<HTMLSpanElement>("pastCountValue");
const countValue = getRequiredElement<HTMLParagraphElement>("countValue");
const cityValue = getRequiredElement<HTMLParagraphElement>("cityValue");
const sourceValue = getRequiredElement<HTMLSpanElement>("sourceValue");
const sourceList = getRequiredElement<HTMLDivElement>("sourceList");
const bookmarkLink = getRequiredElement<HTMLAnchorElement>("bookmarkLink");
const copyBookmarkBtn =
  getRequiredElement<HTMLButtonElement>("copyBookmarkBtn");

void init();

async function init(): Promise<void> {
  try {
    setStatus("Ikraunamas miestu sarasas...");
    const response = await fetch("/cities");
    if (!response.ok) {
      throw new Error("Nepavyko gauti miestu saraso");
    }

    const payload = (await response.json()) as CitiesPayload;
    const cities = Array.isArray(payload.cities)
      ? payload.cities.filter(
          (city): city is string => typeof city === "string",
        )
      : [];
    populateCities(cities);
    applyCityFromUrl(cities);
    syncSearchFromSelect();
    updateBookmarkLink(citySelect.value);
    setStatus(`Rasta ${cities.length} miestu`);
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

function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: #${id}`);
  }

  return element as T;
}

function populateCities(cities: string[]): void {
  citySelect.innerHTML = "";
  comboCities = cities;

  if (!cities.length) {
    citySelect.append(new Option("Miestų nerasta", ""));
    citySelect.disabled = true;
    citySearch.disabled = true;
    citySearch.placeholder = "Miestų nerasta";
    return;
  }

  for (const city of cities) {
    citySelect.append(new Option(city, city));
  }

  citySelect.disabled = false;
  citySearch.disabled = false;
  citySearch.placeholder = "Ieškoti gyvenvietės...";
}

let comboCities: string[] = [];
let filteredCities: string[] = [];
let activeIndex = -1;

function syncSearchFromSelect(): void {
  citySearch.value = citySelect.value || "";
}

function isListOpen(): boolean {
  return !cityOptions.classList.contains("hidden");
}

function openList(): void {
  cityOptions.classList.remove("hidden");
  citySearch.setAttribute("aria-expanded", "true");
}

function closeList(): void {
  cityOptions.classList.add("hidden");
  citySearch.setAttribute("aria-expanded", "false");
  activeIndex = -1;
}

function filterCities(query: string): void {
  const normalizedQuery = normalizeCityToken(query);
  const keyedQuery = toCityMatchKey(query);

  filteredCities = !normalizedQuery
    ? comboCities.slice()
    : comboCities.filter((city) => {
        const normalizedCity = normalizeCityToken(city);
        if (normalizedCity.includes(normalizedQuery)) {
          return true;
        }
        return keyedQuery
          ? toCityMatchKey(city).includes(keyedQuery)
          : false;
      });

  activeIndex = filteredCities.length ? 0 : -1;
  renderOptions();
}

function renderOptions(): void {
  if (!filteredCities.length) {
    cityOptions.innerHTML =
      '<li class="px-3 py-2 text-muted-foreground">Nieko nerasta</li>';
    return;
  }

  cityOptions.innerHTML = filteredCities
    .map((city, index) => {
      const isActive = index === activeIndex;
      const isSelected = city === citySelect.value;
      const classes =
        "cursor-pointer px-3 py-2" + (isActive ? " bg-muted" : "");
      return (
        '<li id="cityOption-' +
        String(index) +
        '" role="option" data-index="' +
        String(index) +
        '" data-value="' +
        escapeHtml(city) +
        '" aria-selected="' +
        String(isSelected) +
        '" class="' +
        classes +
        '">' +
        escapeHtml(city) +
        "</li>"
      );
    })
    .join("");

  const activeId = activeIndex >= 0 ? `cityOption-${activeIndex}` : "";
  if (activeId) {
    citySearch.setAttribute("aria-activedescendant", activeId);
    cityOptions
      .querySelector(`#${activeId}`)
      ?.scrollIntoView({ block: "nearest" });
  } else {
    citySearch.removeAttribute("aria-activedescendant");
  }
}

function moveActive(delta: number): void {
  if (!filteredCities.length) {
    return;
  }

  activeIndex =
    (activeIndex + delta + filteredCities.length) % filteredCities.length;
  renderOptions();
}

function chooseCity(city: string): void {
  if (!city) {
    return;
  }

  citySelect.value = city;
  citySearch.value = city;
  closeList();
  updateBookmarkLink(city, true);
  void loadEvents();
}

citySearch.addEventListener("focus", () => {
  filterCities("");
  openList();
});

citySearch.addEventListener("input", () => {
  filterCities(citySearch.value);
  openList();
});

citySearch.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (!isListOpen()) {
      filterCities(citySearch.value);
      openList();
      return;
    }
    moveActive(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveActive(-1);
  } else if (event.key === "Enter") {
    if (isListOpen() && activeIndex >= 0) {
      event.preventDefault();
      chooseCity(filteredCities[activeIndex] ?? "");
    }
  } else if (event.key === "Escape") {
    closeList();
  }
});

citySearch.addEventListener("blur", () => {
  window.setTimeout(() => {
    closeList();
    syncSearchFromSelect();
  }, 120);
});

cityOptions.addEventListener("mousedown", (event) => {
  const target = event.target as HTMLElement | null;
  const item = target?.closest("li[data-value]");
  if (!item) {
    return;
  }

  event.preventDefault();
  chooseCity(item.getAttribute("data-value") || "");
});

document.addEventListener("click", (event) => {
  if (!comboRoot.contains(event.target as Node)) {
    closeList();
  }
});

loadBtn.addEventListener("click", () => {
  void loadEvents();
});

citySelect.addEventListener("change", () => {
  updateBookmarkLink(citySelect.value, true);
  void loadEvents();
});

window.addEventListener("popstate", () => {
  const cityFromUrl = new URL(window.location.href).searchParams.get("city");
  if (!cityFromUrl) {
    return;
  }

  const match = [...citySelect.options].find((opt) => opt.value === cityFromUrl);
  if (match && citySelect.value !== cityFromUrl) {
    citySelect.value = cityFromUrl;
    syncSearchFromSelect();
    void loadEvents();
  }
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
    pastToggle.textContent = "Paslėpti praėjusius grafikus";
    return;
  }

  pastEventsRoot.classList.add("hidden");
  pastToggle.textContent = "Rodyti praėjusius grafikus";
});

async function loadEvents(): Promise<void> {
  const city = citySelect.value;
  if (!city) {
    return;
  }

  setStatus("Įkraunamas grafikas...");
  loadBtn.disabled = true;
  updateBookmarkLink(city);

  try {
    const response = await fetch(`/events?keyword=${encodeURIComponent(city)}`);
    if (!response.ok) {
      throw new Error("Nepavyko gauti grafikų");
    }

    const payload = (await response.json()) as EventsPayload;
    const events = Array.isArray(payload.events)
      ? payload.events.filter(
          (event): event is NkomEvent =>
            typeof event === "object" && event !== null,
        )
      : [];
    const split = splitEventsByDate(events);
    renderEvents(eventsRoot, split.upcoming);
    renderPastEvents(split.past);

    countValue.textContent = String(split.upcoming.length);
    cityValue.textContent = payload.keyword || city;
    const sources = new Set(events.map((event) => event.sourceFileUrl));
    const sourceUrls = [...sources].filter(
      (url): url is string => typeof url === "string" && url.length > 0,
    );
    sourceValue.textContent = String(sourceUrls.length);
    renderSourceFiles(sourceUrls);
    updateBookmarkLink(city);

    setStatus(formatUpdatedStatus(payload.lastUpdatedAt));
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

function formatUpdatedStatus(lastUpdatedAt?: string): string {
  if (!lastUpdatedAt) {
    return "Grafikas atnaujintas";
  }

  const parsed = new Date(lastUpdatedAt);
  if (Number.isNaN(parsed.getTime())) {
    return "Grafikas atnaujintas";
  }

  const datePart = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
    parsed.getDate(),
  ).padStart(2, "0")}`;
  const timePart = `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;

  return `Grafikas atnaujintas: ${datePart} ${timePart}`;
}

function applyCityFromUrl(cities: string[]): void {
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

function updateBookmarkLink(city: string, push = false): void {
  const currentUrl = new URL(window.location.href);
  if (city) {
    currentUrl.searchParams.set("city", city);
  } else {
    currentUrl.searchParams.delete("city");
  }

  const nextUrl = currentUrl.toString();
  if (push) {
    history.pushState(null, "", nextUrl);
  } else {
    history.replaceState(null, "", nextUrl);
  }

  bookmarkLink.setAttribute("href", nextUrl);
  bookmarkLink.setAttribute("title", nextUrl);
  copyBookmarkBtn.disabled = !city;
}

function normalizeCityToken(value: string): string {
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

function toCityMatchKey(value: string): string {
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

function stemCityWord(word: string): string {
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

async function copyTextToClipboard(value: string): Promise<boolean> {
  if (
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
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

function renderSourceFiles(urls: string[]): void {
  if (!urls.length) {
    sourceList.innerHTML =
      '<p class="mt-1 text-xs text-muted-foreground">Šaltinių nerasta.</p>';
    return;
  }

  sourceList.innerHTML = urls
    .map((url, index) => {
      const safeUrl = escapeHtml(url);
      return (
        '<a class="block text-xs text-muted-foreground underline decoration-dotted underline-offset-4" href="' +
        safeUrl +
        '" target="_blank" rel="noreferrer">XLSX šaltinis ' +
        String(index + 1) +
        "</a>"
      );
    })
    .join("");
}

function renderPastEvents(events: NkomEvent[]): void {
  if (!events.length) {
    pastEventsWrap.classList.add("hidden");
    pastEventsRoot.classList.add("hidden");
    return;
  }

  pastEventsWrap.classList.remove("hidden");
  pastEventsRoot.classList.add("hidden");
  pastCountValue.textContent = String(events.length);
  pastToggle.textContent = "Rodyti praėjusius grafikus";
  renderEvents(pastEventsRoot, events);
}

function renderEvents(root: HTMLElement, events: NkomEvent[]): void {
  if (!events.length) {
    root.innerHTML =
      '<p class="rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground">Pasirinktam miestui grafikų nerasta.</p>';
    return;
  }

  const rows = events
    .map((event) => {
      const date = escapeHtml(event.date || "-");
      const rawType = event.type || "Nežinomas tipas";
      const type = escapeHtml(rawType);
      const icon = escapeHtml(getEventTypeIcon(rawType));
      const link = escapeHtml(event.link || "#");

      return (
        '<article class="grid gap-3 rounded-xl border border-border bg-background/80 p-4 sm:grid-cols-[1fr_auto]">' +
        "<div>" +
        '<p class="text-sm font-semibold">' +
        icon +
        " " +
        type +
        "</p>" +
        '<p class="text-xs text-muted-foreground">Data: ' +
        date +
        "</p>" +
        "</div>" +
        '<a href="' +
        link +
        '" target="_blank" rel="noreferrer" class="calendar-link inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-xs font-semibold hover:bg-muted">Pridėti į kalendorių</a>' +
        "</article>"
      );
    })
    .join("");

  root.innerHTML = rows;
}

function getEventTypeIcon(type: string): string {
  const normalized = String(type)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized.includes("misri")) {
    return "🗑️";
  }

  if (normalized.includes("pakuot")) {
    return "♻️";
  }

  if (normalized.includes("stikl")) {
    return "🍾";
  }

  return "📅";
}

function splitEventsByDate(events: NkomEvent[]): {
  upcoming: NkomEvent[];
  past: NkomEvent[];
} {
  const today = new Date();
  const todayKey =
    String(today.getFullYear()) +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(today.getDate()).padStart(2, "0");
  const upcoming: NkomEvent[] = [];
  const past: NkomEvent[] = [];

  for (const event of events) {
    if (typeof event.date === "string" && event.date < todayKey) {
      past.push(event);
    } else {
      upcoming.push(event);
    }
  }

  return { upcoming, past };
}

function setStatus(message: string, isError = false): void {
  statusText.textContent = message;
  statusText.className = isError
    ? "mt-3 min-h-5 text-xs text-red-700"
    : "mt-3 min-h-5 text-xs text-muted-foreground";
}

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
