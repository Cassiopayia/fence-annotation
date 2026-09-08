# German i18n — status & coverage

## Architecture

| File | Role |
|------|------|
| `src/i18n/strings.ts` | EN + DE string tables (single source of truth) |
| `src/i18n/context.tsx` | `I18nProvider`, `useI18n()`, `t()` with `{var}` interpolation |
| Storage key | `i18n.lang` in `localStorage` |

Language is selected in **More → Language & appearance** (or compact prefs in onboarding). Changes apply immediately and persist across reloads.

## Wired (translates with DE toggle)

- Tab bar (`tabMap`, `tabAnnotate`, `tabMore`)
- Preferences section labels, theme/scheme names, footer hint
- Status legend + status tags (all six states + help text)
- Overview / More status cards
- Info sheet: sync status, your fences, dataset overview, blurb
- Captcha gate
- Error / 404 pages in root route

## Still English-only (by design or backlog)

| Area | Notes |
|------|-------|
| Welcome modal | `welcome-back.tsx` — high-traffic first screen |
| Install prompt | Platform-specific install steps |
| Guided tour | ~20 steps in `index.tsx` |
| Annotate / chip review | Hints, errors, taxonomy chips (dataset schema stays EN) |
| Action bar | Search placeholder, HUD aria-labels |
| `-home-copy.ts` | Onboarding encyclopedia, legal blurb |
| Meta tags | `<title>`, OG description (static in route head) |
| Map layer names | Maxar, basemap.de, OSM (proper nouns) |

Taxonomy values (`Rural`, `PV modules`, flag reasons, etc.) intentionally stay in English — they map to the dataset schema.

## German copy notes

- Informal **Du** form in UI (not Sie); error pages updated to match.
- `board`, `Leaderboard`, product name **fency** kept as-is.
- Scheme names are localized labels over the same CSS palette ids.

## Next slices (if continuing)

1. Welcome + install prompts
2. Tour steps → extract to `strings.ts` or `tour-strings.ts`
3. Annotate hints / save errors
4. Dynamic `<html lang>` + meta description from active locale

## Quick test

1. More → Language → **Deutsch**
2. Tab bar, status legend, overview, captcha (if enabled) should flip immediately
3. Reload — language should persist
4. Switch back to English — no stale strings in wired components
