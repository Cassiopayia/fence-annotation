# German Language Support (i18n) - Implementation Plan

## Branch Name

`feature/i18n-german`

## Overview

This branch adds German language (Deutsch) support to the fency web application. All UI strings are extracted to a translation module with English (default) and German translations.

## Implementation Steps

### Step 1: Create Translation Module ✓

Files created:

- `src/i18n/strings.ts` - All English and German translations
- `src/i18n/context.tsx` - i18n context provider and hooks

### Step 2: Wire i18n into App Root

**File:** `src/routes/__root.tsx`

Wrap the app with I18nProvider:

```tsx
import { I18nProvider } from "@/i18n/context";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  shellComponent: RootShell,
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    </I18nProvider>
  );
}
```

### Step 3: Update Preferences Component

**File:** `src/components/proto/preferences.tsx`

Replace hardcoded language strings with translation hook:

```tsx
import { useI18n } from "@/i18n/context";

export function Preferences({ lang, theme, scheme, onLang, onTheme, onScheme, compact = false }: ...) {
  const { t } = useI18n();

  const LANGS = [
    { id: "en" as const, label: t("language"), meta: "EN" },
    { id: "de" as const, label: t("language"), meta: "DE" }, // Removed disabled state
  ];

  // ... rest of component uses t() for strings
}
```

### Step 4: Update Tab Bar Component

**File:** `src/components/proto/tab-bar.tsx`

```tsx
import { useI18n } from "@/i18n/context";

export function TabBar({ value, onChange, badge }: ...) {
  const { t } = useI18n();

  const TABS = [
    { id: "map" as Tab, label: t("tabMap"), Icon: Map },
    { id: "annotate" as Tab, label: t("tabAnnotate"), Icon: PenLine },
    { id: "more" as Tab, label: t("tabMore"), Icon: LayoutGrid },
  ];

  // ...
}
```

### Step 5: Update Status Components

**File:** `src/components/proto/status.tsx`

```tsx
import { useI18n } from "@/i18n/context";

// In StatusLegend component:
export function StatusLegend({ id }: { id?: string }) {
  const { t } = useI18n();

  return (
    <div id={id}>
      <p>{t("mapLegend")}</p>
      {/* ... use t("statusOpen"), t("statusHelpOpen"), etc. */}
    </div>
  );
}
```

### Step 6: Update Info / InfoPill Components

**File:** `src/components/proto/info-pill.tsx` (create if needed) or inline

Use `t("imageryLayers")`, `t("hidePVSystems")`, etc.

### Step 7: Update Overview / More Status

**Files:** `src/components/proto/overview.tsx`, `src/components/proto/more-status.tsx`

Update all strings like:

- `t("systemsAnnotated")`
- `t("yourProgress")`
- `t("leaderboardPoints")`
- `t("addMoreFences")`

### Step 8: Update Connection Status Display

**File:** `src/lib/zaun/connection-status.ts`

Modify `recomputeConnectionStatus()` to update UI text via translation:

```tsx
// Map connection status codes to translated strings
const statusText = (status: ConnectionStatus): string => {
  switch (status) {
    case "connected": return t("connectedStatus");
    case "loading": return t("loadingStatus");
    case "offline": return t("connOffline");
    case "pending": return t("pendingStatus");
  }
};
```

### Step 9: Update Tour / Onboarding

**File:** `src/components/proto/tour.tsx`

Replace all tour text with `t()` calls:

```tsx
tourSteps: TourStep[] = [
  {
    title: t("tourTitle"),
    body: t("tourBody"),
    // ...
  },
];
```

### Step 10: Update Annotate View

**File:** `src/components/proto/annotate-view.tsx`

Replace hint text and button labels with translations.

### Step 11: Update Captcha Gate

**File:** `src/components/proto/captcha-gate.tsx`

```tsx
<h2>{t("captchaTitle")}</h2>
<p>{t("captchaBody")}</p>
```

### Step 12: Update Meta Tags

**Files:** `src/routes/__root.tsx`, `src/routes/index.tsx`

Update `<title>` and `<meta name="description">` to use translations dynamically.

### Step 13: Update Settings Text

**File:** `src/components/proto/preferences.tsx`

- Remove `uiEnglishOnly` warning message
- Add `t("uiEnglishOnly")` as a helper tip (not a blocking message)

### Step 14: Test and Polish

1. Switch language in Preferences
2. Verify all text updates immediately
3. Test RTL support (not needed for German, but good practice)
4. Test on mobile (language should persist across reloads)

## Files Modified

### Core i18n

- `src/i18n/strings.ts` (NEW)
- `src/i18n/context.tsx` (NEW)

### App Integration

- `src/routes/__root.tsx`
- `src/components/proto/preferences.tsx`
- `src/components/proto/tab-bar.tsx`
- `src/components/proto/status.tsx`
- `src/components/proto/overview.tsx`
- `src/components/proto/more-status.tsx`
- `src/components/proto/annotate-view.tsx`
- `src/components/proto/tour.tsx`
- `src/components/proto/captcha-gate.tsx`
- `src/lib/zaun/connection-status.ts`

## Translation Keys Reference

### Tabs

- `tabMap`, `tabAnnotate`, `tabMore`

### Status States

- `statusOpen`, `statusMine`, `statusAwaiting`, `statusVerified`, `statusFlagged`, `statusExcluded`
- `statusHelp*`

### UI Elements

- `mapLegend`, `systems`, `annotated`, `contributors`, `yourProgress`, `leaderboardPoints`

### Info Sheets

- `infoContribution`, `offlineStatus`, `checkingSupabase`

### Preferences

- `language`, `appearance`, `colourTheme`, `colourScheme`

### Tour

- `tourTitle`, `tourBody`

## Notes on Translations

Some German translations use informal "Du" form (not "Sie") since the app is informal/consumer-facing. This should be confirmed with the maintainer.

## Testing Checklist

- [ ] German language selection works
- [ ] Language persists after page reload
- [ ] All screens show German text
- [ ] Status legend translates correctly
- [ ] Map labels translate
- [ ] Connection status translates
- [ ] Tour text translates
- [ ] Tab bar translates
- [ ] Meta tags update with language
