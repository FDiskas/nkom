---
name: event-handler-style
description: Prefer attaching new UI behavior to an existing semantic event instead of adding a separate redundant listener
keywords: [event listener, focus, click, select, ux, dom, home-page.ts, citySearch]
created: 2026-09-28
updated: 2026-09-28
---

**Rule:** When adding new input behavior (e.g. auto-selecting text), attach it to the event that already drives the related UI action, rather than adding a separate listener for another event that overlaps with it.

**Why:** For the `citySearch` combobox in [home-page.ts](../../../src/ui/client/home-page.ts), I first added text auto-select only on `focus`, then added a redundant `click` listener to also cover re-clicks. The user asked to remove the extra `click` listener — the `focus` handler already fires whenever the city dropdown list opens, so the select-text behavior belongs there, not duplicated across events.

**How to apply:** Before adding a new listener for a UI tweak, check whether an existing listener already fires at the moment that matters (here: `focus` opens the list via `openList()`) and extend that one instead of introducing a new event binding.
