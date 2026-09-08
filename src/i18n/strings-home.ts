/** Home-screen UI strings — merged into EN/DE in strings.ts */

export const EN_HOME = {
  // Welcome
  welcomeAway: "away {since}",
  welcomeLoading: "loading…",
  welcomeBadge: "welcome",
  closeGreeting: "Close greeting",
  loadingAnnotations: "Loading annotations",
  welcomeTitle: "Welcome to fency",
  welcomeStatsBody:
    "Right now the board shows {people} contributors and {points} points toward a {goal}-point community goal ({pct}%).",
  statContributors: "contributors",
  statSystemsDone: "systems done",
  statOpenFlags: "open flags",
  guestAnnotating: "Annotating as guest",
  guestSyncHint: "no account — fences sync anonymously when online",
  leaderboard: "Leaderboard",
  addMineNow: "Add mine now",
  justLookAtMap: "Just look at the map",

  // Install
  closeInstallPrompt: "Close install prompt",
  installTitle: "Add fency to your Home Screen",
  installBodyIos:
    "Safari doesn't auto-prompt — you'll use Share → Add to Home Screen.",
  installBodyNative: "Your browser can install this as an app in one tap.",
  installBodyGeneric:
    "Browsers offer install when the site is a PWA (manifest + secure origin). Until then, use the steps below.",
  installNow: "Install app now",
  installShowSteps: "Tell me how to install it",
  installLater: "I know where to find it later",
  installGotIt: "Got it",
  installStepNative1: "Your browser can install this app directly.",
  installStepNative2: "Tap Install below — no Share menu needed.",
  installStepIos1: "Safari only: tap the Share button (square with ↑).",
  installStepIos2: "Scroll and tap “Add to Home Screen”.",
  installStepIos3: "Confirm Add — fency opens full-screen next time.",
  installStepAndroid1: "Open the browser menu (⋮).",
  installStepAndroid2: "Tap “Install app” or “Add to Home screen”.",
  installStepAndroid3: "Confirm — then launch from your home screen.",
  installStepDesktop1:
    "Look for the install icon in the address bar (⊕ / monitor+arrow).",
  installStepDesktop2: "Or use the browser menu → “Install fency…”.",
  installStepDesktop3:
    "If you don't see it yet, keep using the site — Chrome offers install after engagement.",
  installStepFallback:
    "Use your browser's Share or menu → “Add to Home Screen” / “Install app”.",

  // Action bar & FAB
  annotateFab: "Annotate",
  prevSystem: "Previous system",
  nextSystem: "Next system",
  currentSystem: "Current system",
  searchSystems: "Search systems",
  goToIdSystems: "Go to #ID · {count} systems",
  exitFullScreen: "Exit full screen",
  fullScreenHideChrome: "Full screen — hide all chrome",
  loupeHint:
    "Loupe — draggable magnifier. Tap the label inside to cycle layers.",

  // More menu
  tourCardTitle: "How annotating works",
  tourCardMeta: "Guided tour · arrows on every control",
  installHomeScreen: "Add to Home Screen",
  installHomeScreenMeta: "Full-screen field mode without browser chrome",
  systemsCatalog: "Systems catalog",
  loadingCatalog: "Loading catalog…",
  systemsAnnotatedMeta: "{total} systems · {annotated} annotated",
  reviewAnnotations: "Review annotations",
  reviewAnnotationsMetaUnlocked: "Vote keep / reject on saved fences",
  reviewAnnotationsMetaLocked:
    "Unlocks after {count} annotations · {saved}/{count}",
  communitySnapshot: "Community snapshot",
  loadingCommunityStats: "Loading community stats…",
  communitySnapshotMeta: "{people} people · {points} board points",
  communityStatsUnavailable: "Community stats unavailable",
  whatIsThis: "What is this?",
  whatIsThisMeta: "Thesis, dataset and legal notes",
  infoContributionMeta: "{saved} fences saved · connection {status}",
  leaderboardMeta: "Verified fences · guest annotations",
  controlReference: "Control reference",
  controlReferenceMeta: "Optional · every button listed",
  exportGeojson: "Export GeoJSON",
  exportGeojsonMeta: "Coming later — download stays a stub for now",
  reportBug: "Report bug",
  reportBugMeta: "Opens a GitHub issue",
  contactRemoval: "Contact / removal",
  contactRemovalMeta: "Private email — not a public GitHub issue",
  closeMore: "Close more",

  // Systems sheet
  searchSystemsPlaceholder: "Search by #ID or status",
  systemsNoMatch: "No systems match “{query}”.",
  systemsNoOpen: "No open systems left to annotate in this catalog.",

  // Status meta (list rows)
  statusMetaOpen: "nobody has traced this yet",
  statusMetaMine: "yours · awaiting confirmation",
  statusMetaAwaiting: "annotated by someone else · awaiting review",
  statusMetaVerified: "verified by 2",
  statusMetaFlagged: "flagged for a second look",
  statusMetaExcluded: "excluded from training",

  // Inspect sheet
  systemFallback: "System",
  inspectOpenBody:
    "Selected photovoltaic system {label}. Trace the fence on aerial imagery, or keep browsing.",
  inspectClosedBody:
    "This system is already {status}. Pick an open (yellow) system to annotate.",
  inspectNoSelection: "Select a PV system on the map.",
  traceFenceline: "Trace fenceline",

  // Imagery sheet
  basemapMeta:
    "default country context · underlay until a covering Land DOP paints",
  maxarSatellite: "Maxar satellite",
  maxarOn: "on · replaces basemap.de",
  maxarOff: "off (default)",
  openStreetMap: "OpenStreetMap",
  osmOn: "on · only loads at zoom ≤ 14",
  osmOff: "off · optional overlay, max zoom 14",
  dopAllLaender: "DOP20 · all Länder",
  dopEnabledMeta: "{enabled}/{total} enabled · z14+",
  dopAllOff: "all Land DOPs off",
  landDopServices: "Land DOP services",
  dopStatusError: "error",
  dopStatusActive: "active in view",
  dopStatusEnabled: "enabled",
  dopStatusOff: "off",
  dopActiveMeta: "active in view · z{zoom}+",
  dopReadyMeta: "ready · z{zoom}+",
  dopErrorFor: "Error for {label}",
  dopCatalogEmpty: "No DOP catalog entries found.",
  loadingDopCatalog: "Loading DOP catalog…",
  imageryHelpBlurb:
    "Default: basemap.de stays visible until a covering Land DOP can paint (enabled, in bounds, at that Land's minzoom). OSM is optional and never requests tiles above z14. Maxar is off unless you enable it. Green = active in view; lime = enabled; red = probe error (tap ⓘ).",
  toggleOn: "on",
  toggleOff: "off",

  // Onboarding sheet
  onboardingTitle: "What every button does",
  onboardingShowTour: "Show me on screen",
  onboardingSkip: "Skip — I'll figure it out",
  overviewTitle: "Overview",
  contactSection: "contact",
  contactBody:
    "Legal or licensing advice, or a request to remove annotations from the public dataset:",
  emailMaintainer: "Email maintainer",
  contactNotConfigured: "Contact email not configured for this deployment.",
  contactRemoveEmail: "Contact / remove annotations (email)",

  // Annotate
  savePendingSync:
    "Saved on this device only — will sync when the red dot turns green.",
  saveExtraNeedFence:
    "Draw a fence first, then tap + to save it as Extra (not linked to this PV).",
  recenterOnSystem: "Recenter on this system",
  undoLastPoint: "Undo last point",
  flagNoSaveHint: "Flag this system — no fence will be saved.",
  tagContext: "context",
  tagVisibility: "visibility",
  goBack: "Go back",
  saveExtraAria: "Save extra fence without PV link",
  leaveAnnotateAria: "Leave annotation without saving",
  saveFenceAria: "Save fence and continue",

  // Tour chrome
  tourSkipAria: "Skip the tour",
  tourPrev: "Previous step",
  tourNext: "Next step",
  tourTapToContinue: "Tap it to continue",
  tourFinish: "Start annotating",
  tourTapAnnotate: "Tap Annotate",

  // Tour screens
  tourScreenGlobal: "global",
  tourScreenMap: "map",
  tourScreenAnnotation: "annotation",
  tourScreenMore: "more",
  tourScreenReview: "review",
  tourScreenGlobalAnnotation: "global → annotation",

  // Tour steps
  tourStepInfoPillTitle: "The info pill",
  tourStepInfoPillBody:
    "Tap once for imagery (zoom + tile service), again for the selected system with its hectares, again for the full sheet. The dot is green whenever you are connected.",
  tourStepProgressTitle: "Your progress ring",
  tourStepProgressBody:
    "It fills and pops with every saved fence. At {count} annotations dataset chip review unlocks.",
  tourStepLayersTitle: "Imagery & layers",
  tourStepLayersBody:
    "Switch basemaps: basemap.de by default, plus Maxar, Land DOP WMS and optional OSM (tiles stop at zoom 14).",
  tourStepPvTitle: "Hide the PV outlines",
  tourStepPvBody:
    "Turn the solar outlines off to judge the raw imagery, then back on to compare.",
  tourStepLoupeToggleTitle: "The loupe lives here",
  tourStepLoupeToggleBody:
    "Open the magnifier from this rail. Close it again and it snaps straight back to this button.",
  tourStepLoupeDragTitle: "Drag it anywhere",
  tourStepLoupeDragBody:
    "The loupe shows a second layer (Maxar by default) — drag it over a fence line and cycle the layer inside it.",
  tourStepSoloTitle: "Full screen",
  tourStepSoloBody:
    "Hides every piece of chrome for a pure map. One small control in the corner brings it all back.",
  tourStepActionBarTitle: "The action bar",
  tourStepActionBarBody:
    "Always within thumb reach at the bottom — above the tab bar here, and dropped to the very bottom edge when the tabs hide. ◀ ▶ step through systems. The middle field searches by ID or place — during annotation it shows the current system instead.",
  tourStepFabTitle: "Start annotating",
  tourStepFabBody:
    "The lime button opens guided annotation on the nearest open system. Lime always means action.",
  tourStepTabsTitle: "Three tabs, that's it",
  tourStepTabsBody:
    "Map · Annotate · More. The bar hides during annotation, annotation and review so the map gets the whole screen.",
  tourStepTapAnnotateTitle: "Your turn: open Annotate",
  tourStepTapAnnotateBody:
    "Tap the Annotate tab yourself. The tab bar disappears and we continue inside guided annotation.",
  tourStepInAnnotateTitle: "You're in annotation now",
  tourStepInAnnotateBody:
    "Notice the change: no tab bar, no extra chrome — just the map, the drawing controls on the right and the action bar showing the current system. Everything from here on lives on this screen.",
  tourStepRecenterTitle: "Recenter",
  tourStepRecenterBody:
    "Snap back to the current system when you pan away while tracing.",
  tourStepUndoTitle: "Undo a point",
  tourStepUndoBody:
    "Removes the last point you placed. Long-press a vertex on the map to delete just that one.",
  tourStepTagsTitle: "Context & visibility",
  tourStepTagsBody:
    "Two small pills that cycle: rural / urban / complex, and clear / partial / occluded / none. They only appear once a fence is drawn and never cover the line.",
  tourStepSaveTitle: "The lime tick saves",
  tourStepSaveBody:
    "It wiggles as soon as the line is closed, flies into your progress ring and moves on to the next system.",
  tourStepExitTitle: "Leave, or add an extra fence",
  tourStepExitBody:
    "✕ leaves without saving. The + above saves an additional fence that is not linked to this PV system.",
  tourStepMoreTitle: "More opens with your status",
  tourStepMoreBody:
    "Dataset progress, chips you reviewed, and community board points. Tap it for the full overview.",
  tourStepReviewTitle: "Dataset chip review",
  tourStepReviewBody:
    "After {count} saved fences, review unlocks in More: full screen, swipe right to keep, left to reject, up and down to change chip, flag for a second look.",

  // Review
  reviewLoadFailed: "Could not load annotations for review.",
  reviewSavedFence: "saved fence",
  reviewFenceLabel: "Fence {id}",
  reviewFlag: "Flag",
  reviewFlagTips: "tips",
  reviewFlagAria: "Flag tip. Tap to cycle reasons.",
  reviewHeading: "annotation review",
  reviewCaughtUp: "Caught up · {count} reviewed",
  reviewNothing: "Nothing to review",
  reviewProgress: "{reviewed} reviewed · {left} left",
  reviewLoading: "Loading annotations…",
  reviewEmptyCaughtUp: "You're caught up.",
  reviewEmptyVoted: "already reviewed by you",
  reviewEmptyOwn: "are yours",
  reviewEmptyOwnNote: "(others review those)",
  reviewEmptyVerified: "already verified",
  reviewEmptyNone:
    "No annotations left to review. Save fences on the map to grow the queue.",
  reviewSkippedOwn:
    "Skipped — that fence is yours. You can only review other people's annotations.",
  reviewSaveFailed: "Review save failed",
  reviewReject: "Reject",
  reviewKeep: "Keep",
  reviewHideOverlay: "Hide annotation overlay",
  reviewShowOverlay: "Show annotation overlay",
  reviewFlagBtn: "Flag annotation",
  reviewUndo: "Undo last decision",
  reviewClose: "Close review",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  reviewUndoTitle: "Go back one annotation?",
  reviewUndoBody:
    "Jump to the previous fence. You can change your vote — the new decision replaces the last one.",
  reviewUndoEmpty: "No previous review in this session yet.",
  reviewUndoConfirm: "Show previous annotation",
  cancel: "Cancel",
  reviewFlagTitle: "Why is this annotation wrong?",

  // Leaderboard
  leaderboardNameHint:
    "Set a name before you save fences — otherwise verified rows show as Guest. No accounts required.",
  yourName: "Your name",
  guestPlaceholder: "guest",
  save: "Save",
  usernameRules: "{min}–{max} chars · a–z, 0–9, _",
  nameSaved: "· saved",
  loadingLeaderboard: "Loading leaderboard",
  leaderboardEmpty: "No verified contributors yet — be the first.",
  leaderboardYourStats: "{saved} saved · {verified} verified",
  leaderboardHidden: "Hidden until your first verified fence",
  leaderboardWaitingReview: "— {saved} waiting in review.",

  // Primitives
  infoPillAria: "Info — {detail}. Tap for more detail.",
  progressRingComplete: "Review queue complete",
  progressRingAria: "Contribution progress: {value} of {max} annotations",
  sheetGrabberAriaExpanded: "Drag down to shrink or close",
  sheetGrabberAriaCollapsed: "Drag up for full screen, down to close",
  sheetGrabberSrExpanded:
    "Sheet expanded. Drag down to shrink, further to close.",
  sheetGrabberSrCollapsed:
    "Drag up to expand sheet full screen, or down to close.",
  close: "Close",
  cyclePillAria: "{label}: {value}. Tap to cycle.",

  // Loupe
  loupeLayerAria: "Loupe layer: {layer}. Tap to switch.",
  closeLoupe: "Close loupe",
} as const;

export const DE_HOME = {
  welcomeAway: "weg {since}",
  welcomeLoading: "lädt…",
  welcomeBadge: "willkommen",
  closeGreeting: "Begrüßung schließen",
  loadingAnnotations: "Markierungen werden geladen",
  welcomeTitle: "Willkommen bei fency",
  welcomeStatsBody:
    "Aktuell zeigt das Board {people} Mitwirkende und {points} Punkte auf ein Community-Ziel von {goal} Punkten ({pct}%).",
  statContributors: "Mitwirkende",
  statSystemsDone: "Systeme fertig",
  statOpenFlags: "offene Flags",
  guestAnnotating: "Markieren als Gast",
  guestSyncHint: "Kein Konto — Zäunungen synchronisieren anonym, wenn online",
  leaderboard: "Leaderboard",
  addMineNow: "Jetzt meine hinzufügen",
  justLookAtMap: "Nur Karte ansehen",

  closeInstallPrompt: "Installationshinweis schließen",
  installTitle: "fency zum Home-Bildschirm hinzufügen",
  installBodyIos:
    "Safari fragt nicht automatisch — nutze Teilen → Zum Home-Bildschirm.",
  installBodyNative:
    "Dein Browser kann die App mit einem Tipp installieren.",
  installBodyGeneric:
    "Browser bieten Installation an, wenn die Seite eine PWA ist (Manifest + sichere Origin). Bis dahin die Schritte unten.",
  installNow: "App jetzt installieren",
  installShowSteps: "Anleitung anzeigen",
  installLater: "Ich finde es später selbst",
  installGotIt: "Verstanden",
  installStepNative1: "Dein Browser kann diese App direkt installieren.",
  installStepNative2: "Tippe unten auf Installieren — kein Teilen-Menü nötig.",
  installStepIos1: "Nur Safari: Tippe auf Teilen (Quadrat mit ↑).",
  installStepIos2: "Scrolle und tippe „Zum Home-Bildschirm“.",
  installStepIos3:
    "Bestätige Hinzufügen — fency startet beim nächsten Mal vollbild.",
  installStepAndroid1: "Öffne das Browser-Menü (⋮).",
  installStepAndroid2: "Tippe „App installieren“ oder „Zum Startbildschirm“.",
  installStepAndroid3:
    "Bestätige — dann starte von deinem Home-Bildschirm.",
  installStepDesktop1:
    "Suche das Install-Symbol in der Adressleiste (⊕ / Monitor+Pfeil).",
  installStepDesktop2: "Oder Browser-Menü → „fency installieren…“.",
  installStepDesktop3:
    "Wenn du es noch nicht siehst, nutze die Seite weiter — Chrome bietet Installation nach Nutzung an.",
  installStepFallback:
    "Teilen oder Menü → „Zum Home-Bildschirm“ / „App installieren“.",

  annotateFab: "Markieren",
  prevSystem: "Vorheriges System",
  nextSystem: "Nächstes System",
  currentSystem: "Aktuelles System",
  searchSystems: "Systeme suchen",
  goToIdSystems: "Zu #ID · {count} Systeme",
  exitFullScreen: "Vollbild beenden",
  fullScreenHideChrome: "Vollbild — alle Bedienelemente ausblenden",
  loupeHint:
    "Lupe — verschiebbare Vergrößerung. Tippe auf die Beschriftung, um Ebenen zu wechseln.",

  tourCardTitle: "So funktioniert Markieren",
  tourCardMeta: "Geführte Tour · Pfeile an jeder Steuerung",
  installHomeScreen: "Zum Home-Bildschirm",
  installHomeScreenMeta: "Vollbild-Feldmodus ohne Browser-Leiste",
  systemsCatalog: "Systemkatalog",
  loadingCatalog: "Katalog wird geladen…",
  systemsAnnotatedMeta: "{total} Systeme · {annotated} markiert",
  reviewAnnotations: "Markierungen prüfen",
  reviewAnnotationsMetaUnlocked: "Behalten / Ablehnen bei gespeicherten Zäunungen",
  reviewAnnotationsMetaLocked:
    "Freischaltung nach {count} Markierungen · {saved}/{count}",
  communitySnapshot: "Community-Überblick",
  loadingCommunityStats: "Community-Statistik wird geladen…",
  communitySnapshotMeta: "{people} Personen · {points} Board-Punkte",
  communityStatsUnavailable: "Community-Statistik nicht verfügbar",
  whatIsThis: "Was ist das?",
  whatIsThisMeta: "These, Datensatz und rechtliche Hinweise",
  infoContributionMeta: "{saved} Zäunungen gespeichert · Verbindung {status}",
  leaderboardMeta: "Verifizierte Zäunungen · Gast-Markierungen",
  controlReference: "Steuerungsreferenz",
  controlReferenceMeta: "Optional · jede Taste aufgelistet",
  exportGeojson: "GeoJSON exportieren",
  exportGeojsonMeta: "Kommt später — Download bleibt vorerst ein Platzhalter",
  reportBug: "Fehler melden",
  reportBugMeta: "Öffnet ein GitHub-Issue",
  contactRemoval: "Kontakt / Entfernung",
  contactRemovalMeta: "Private E-Mail — kein öffentliches GitHub-Issue",
  closeMore: "Mehr schließen",

  searchSystemsPlaceholder: "Suche nach #ID oder Status",
  systemsNoMatch: "Keine Systeme passen zu „{query}“.",
  systemsNoOpen:
    "Keine offenen Systeme mehr zum Markieren in diesem Katalog.",

  statusMetaOpen: "noch niemand nachgezeichnet",
  statusMetaMine: "deine · wartet auf Bestätigung",
  statusMetaAwaiting: "von jemand anderem · wartet auf Prüfung",
  statusMetaVerified: "von 2 verifiziert",
  statusMetaFlagged: "zur zweiten Prüfung markiert",
  statusMetaExcluded: "vom Training ausgeschlossen",

  systemFallback: "System",
  inspectOpenBody:
    "Ausgewähltes PV-System {label}. Zeichne die Zäunung auf Luftbildern nach oder browse weiter.",
  inspectClosedBody:
    "Dieses System ist bereits {status}. Wähle ein offenes (gelbes) System zum Markieren.",
  inspectNoSelection: "Wähle ein PV-System auf der Karte.",
  traceFenceline: "Zäunung nachzeichnen",

  basemapMeta:
    "Standard-Länderkontext · Unterlage, bis ein Land-DOP darüber malt",
  maxarSatellite: "Maxar-Satellit",
  maxarOn: "an · ersetzt basemap.de",
  maxarOff: "aus (Standard)",
  openStreetMap: "OpenStreetMap",
  osmOn: "an · lädt nur bis Zoom ≤ 14",
  osmOff: "aus · optionale Ebene, max. Zoom 14",
  dopAllLaender: "DOP20 · alle Länder",
  dopEnabledMeta: "{enabled}/{total} aktiv · ab z14",
  dopAllOff: "alle Land-DOPs aus",
  landDopServices: "Land-DOP-Dienste",
  dopStatusError: "Fehler",
  dopStatusActive: "aktiv im Blick",
  dopStatusEnabled: "aktiviert",
  dopStatusOff: "aus",
  dopActiveMeta: "aktiv im Blick · ab z{zoom}",
  dopReadyMeta: "bereit · ab z{zoom}",
  dopErrorFor: "Fehler bei {label}",
  dopCatalogEmpty: "Keine DOP-Katalogeinträge gefunden.",
  loadingDopCatalog: "DOP-Katalog wird geladen…",
  imageryHelpBlurb:
    "Standard: basemap.de bleibt sichtbar, bis ein passendes Land-DOP malt (aktiv, im Blick, ab Minzoom). OSM ist optional und lädt nie über z14. Maxar ist aus, bis du es aktivierst. Grün = aktiv im Blick; Limette = aktiviert; Rot = Sondierungsfehler (tippe ⓘ).",
  toggleOn: "an",
  toggleOff: "aus",

  onboardingTitle: "Was jede Taste macht",
  onboardingShowTour: "Auf dem Bildschirm zeigen",
  onboardingSkip: "Überspringen — finde es selbst heraus",
  overviewTitle: "Übersicht",
  contactSection: "Kontakt",
  contactBody:
    "Rechtliche oder Lizenzfragen, oder Bitte zur Entfernung von Markierungen aus dem öffentlichen Datensatz:",
  emailMaintainer: "Maintainer per E-Mail",
  contactNotConfigured: "Kontakt-E-Mail ist für dieses Deployment nicht konfiguriert.",
  contactRemoveEmail: "Kontakt / Markierungen entfernen (E-Mail)",

  savePendingSync:
    "Nur auf diesem Gerät gespeichert — synchronisiert, wenn der rote Punkt grün wird.",
  saveExtraNeedFence:
    "Zeichne zuerst eine Zäunung, dann tippe + für Extra (nicht mit diesem PV verknüpft).",
  recenterOnSystem: "Auf dieses System zentrieren",
  undoLastPoint: "Letzten Punkt rückgängig",
  flagNoSaveHint: "System markieren — es wird keine Zäunung gespeichert.",
  tagContext: "Kontext",
  tagVisibility: "Sichtbarkeit",
  goBack: "Zurück",
  saveExtraAria: "Extra-Zäunung ohne PV-Verknüpfung speichern",
  leaveAnnotateAria: "Markierung verlassen ohne Speichern",
  saveFenceAria: "Zäunung speichern und weiter",

  tourSkipAria: "Tour überspringen",
  tourPrev: "Vorheriger Schritt",
  tourNext: "Nächster Schritt",
  tourTapToContinue: "Tippe darauf, um fortzufahren",
  tourFinish: "Markieren starten",
  tourTapAnnotate: "Tippe Markieren",

  tourScreenGlobal: "global",
  tourScreenMap: "Karte",
  tourScreenAnnotation: "Markieren",
  tourScreenMore: "Mehr",
  tourScreenReview: "Prüfung",
  tourScreenGlobalAnnotation: "global → Markieren",

  tourStepInfoPillTitle: "Die Info-Pille",
  tourStepInfoPillBody:
    "Einmal tippen für Bildmaterial (Zoom + Kacheldienst), erneut für das gewählte System mit Hektar, nochmal für das volle Sheet. Der Punkt ist grün, wenn du verbunden bist.",
  tourStepProgressTitle: "Dein Fortschrittsring",
  tourStepProgressBody:
    "Er füllt sich und poppt bei jeder gespeicherten Zäunung. Ab {count} Markierungen schaltet die Chip-Prüfung frei.",
  tourStepLayersTitle: "Bilder & Ebenen",
  tourStepLayersBody:
    "Basiskarten wechseln: basemap.de standardmäßig, plus Maxar, Land-DOP-WMS und optional OSM (Kacheln stoppen bei Zoom 14).",
  tourStepPvTitle: "PV-Umrisse ausblenden",
  tourStepPvBody:
    "Schalte Solar-Umrisse aus, um das Rohbild zu beurteilen, dann wieder ein zum Vergleich.",
  tourStepLoupeToggleTitle: "Die Lupe sitzt hier",
  tourStepLoupeToggleBody:
    "Öffne die Lupe über diese Leiste. Schließe sie wieder — sie springt zurück zu diesem Button.",
  tourStepLoupeDragTitle: "Überall hinziehen",
  tourStepLoupeDragBody:
    "Die Lupe zeigt eine zweite Ebene (standardmäßig Maxar) — ziehe sie über eine Zäunung und wechsle die Ebene darin.",
  tourStepSoloTitle: "Vollbild",
  tourStepSoloBody:
    "Blendet alle Bedienelemente aus für eine reine Karte. Eine kleine Steuerung in der Ecke holt alles zurück.",
  tourStepActionBarTitle: "Die Aktionsleiste",
  tourStepActionBarBody:
    "Immer in Daumenreichweite unten — hier über der Tab-Leiste, und ganz unten, wenn Tabs ausblenden. ◀ ▶ durch Systeme. Das mittlere Feld sucht nach ID — beim Markieren zeigt es das aktuelle System.",
  tourStepFabTitle: "Markieren starten",
  tourStepFabBody:
    "Der limettenfarbene Button startet geführtes Markieren am nächsten offenen System. Limette bedeutet immer Aktion.",
  tourStepTabsTitle: "Drei Tabs, das war's",
  tourStepTabsBody:
    "Karte · Markieren · Mehr. Die Leiste verschwindet beim Markieren und bei der Prüfung — die Karte bekommt den ganzen Bildschirm.",
  tourStepTapAnnotateTitle: "Du bist dran: Markieren öffnen",
  tourStepTapAnnotateBody:
    "Tippe selbst auf den Tab Markieren. Die Tab-Leiste verschwindet und wir machen drinnen weiter.",
  tourStepInAnnotateTitle: "Du bist im Markieren-Modus",
  tourStepInAnnotateBody:
    "Beachte den Unterschied: keine Tab-Leiste, kein Extra-Chrome — nur Karte, Steuerungen rechts und die Aktionsleiste mit dem aktuellen System. Ab hier lebt alles auf diesem Bildschirm.",
  tourStepRecenterTitle: "Zentrieren",
  tourStepRecenterBody:
    "Zurück zum aktuellen System, wenn du beim Nachzeichnen weggeschwenkt hast.",
  tourStepUndoTitle: "Punkt rückgängig",
  tourStepUndoBody:
    "Entfernt den zuletzt gesetzten Punkt. Lange auf einen Eckpunkt drücken, um nur diesen zu löschen.",
  tourStepTagsTitle: "Kontext & Sichtbarkeit",
  tourStepTagsBody:
    "Zwei kleine Pillen zum Durchschalten: ländlich / urban / komplex und klar / teilweise / verdeckt / keine. Sie erscheinen erst nach gezeichneter Zäunung und verdecken die Linie nicht.",
  tourStepSaveTitle: "Der limette Haken speichert",
  tourStepSaveBody:
    "Er wackelt, sobald die Linie geschlossen ist, fliegt in deinen Fortschrittsring und geht zum nächsten System.",
  tourStepExitTitle: "Verlassen oder Extra-Zäunung",
  tourStepExitBody:
    "✕ verlässt ohne Speichern. Das + darüber speichert eine zusätzliche Zäunung ohne PV-Verknüpfung.",
  tourStepMoreTitle: "Mehr startet mit deinem Status",
  tourStepMoreBody:
    "Datensatz-Fortschritt, geprüfte Chips und Community-Board-Punkte. Tippe für die volle Übersicht.",
  tourStepReviewTitle: "Chip-Prüfung im Datensatz",
  tourStepReviewBody:
    "Nach {count} gespeicherten Zäunungen schaltet Prüfung in Mehr frei: Vollbild, nach rechts wischen = behalten, links = ablehnen, hoch/runter = Chip wechseln, Flag für zweiten Blick.",

  reviewLoadFailed: "Markierungen für Prüfung konnten nicht geladen werden.",
  reviewSavedFence: "gespeicherte Zäunung",
  reviewFenceLabel: "Zäunung {id}",
  reviewFlag: "Flag",
  reviewFlagTips: "Tipps",
  reviewFlagAria: "Flag-Tipp. Tippe, um Gründe zu wechseln.",
  reviewHeading: "Markierungs-Prüfung",
  reviewCaughtUp: "Alles erledigt · {count} geprüft",
  reviewNothing: "Nichts zu prüfen",
  reviewProgress: "{reviewed} geprüft · {left} übrig",
  reviewLoading: "Markierungen werden geladen…",
  reviewEmptyCaughtUp: "Du bist durch.",
  reviewEmptyVoted: "bereits von dir geprüft",
  reviewEmptyOwn: "sind deine",
  reviewEmptyOwnNote: "(andere prüfen diese)",
  reviewEmptyVerified: "bereits verifiziert",
  reviewEmptyNone:
    "Keine Markierungen mehr zu prüfen. Speichere Zäunungen auf der Karte, um die Warteschlange zu füllen.",
  reviewSkippedOwn:
    "Übersprungen — diese Zäunung ist deine. Du kannst nur fremde Markierungen prüfen.",
  reviewSaveFailed: "Prüfung konnte nicht gespeichert werden",
  reviewReject: "Ablehnen",
  reviewKeep: "Behalten",
  reviewHideOverlay: "Markierungs-Overlay ausblenden",
  reviewShowOverlay: "Markierungs-Overlay anzeigen",
  reviewFlagBtn: "Markierung flaggen",
  reviewUndo: "Letzte Entscheidung rückgängig",
  reviewClose: "Prüfung schließen",
  zoomIn: "Heranzoomen",
  zoomOut: "Herauszoomen",
  reviewUndoTitle: "Eine Markierung zurück?",
  reviewUndoBody:
    "Zur vorherigen Zäunung springen. Du kannst deine Stimme ändern — die neue Entscheidung ersetzt die letzte.",
  reviewUndoEmpty: "Noch keine vorherige Prüfung in dieser Sitzung.",
  reviewUndoConfirm: "Vorherige Markierung anzeigen",
  cancel: "Abbrechen",
  reviewFlagTitle: "Warum ist diese Markierung falsch?",

  leaderboardNameHint:
    "Lege einen Namen fest, bevor du Zäunungen speicherst — sonst erscheinen verifizierte Einträge als Gast. Kein Konto nötig.",
  yourName: "Dein Name",
  guestPlaceholder: "Gast",
  save: "Speichern",
  usernameRules: "{min}–{max} Zeichen · a–z, 0–9, _",
  nameSaved: "· gespeichert",
  loadingLeaderboard: "Leaderboard wird geladen",
  leaderboardEmpty: "Noch keine verifizierten Mitwirkenden — sei der Erste.",
  leaderboardYourStats: "{saved} gespeichert · {verified} verifiziert",
  leaderboardHidden: "Verborgen bis zur ersten verifizierten Zäunung",
  leaderboardWaitingReview: "— {saved} warten auf Prüfung.",

  infoPillAria: "Info — {detail}. Tippe für Details.",
  progressRingComplete: "Prüfwarteschlange leer",
  progressRingAria: "Beitragsfortschritt: {value} von {max} Markierungen",
  sheetGrabberAriaExpanded: "Nach unten ziehen zum Verkleinern oder Schließen",
  sheetGrabberAriaCollapsed: "Nach oben für Vollbild, nach unten zum Schließen",
  sheetGrabberSrExpanded:
    "Sheet erweitert. Nach unten ziehen zum Verkleinern, weiter zum Schließen.",
  sheetGrabberSrCollapsed:
    "Nach oben ziehen für Vollbild-Sheet, oder nach unten zum Schließen.",
  close: "Schließen",
  cyclePillAria: "{label}: {value}. Tippe zum Wechseln.",

  loupeLayerAria: "Lupen-Ebene: {layer}. Tippe zum Wechseln.",
  closeLoupe: "Lupe schließen",
} as const;
