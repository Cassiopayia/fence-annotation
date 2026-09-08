/**
 * Translation strings for fency
 * Add new keys here and translate to each supported language.
 */

export const EN = {
  // Tabs
  tabMap: "Map",
  tabAnnotate: "Annotate",
  tabMore: "More",

  // Status / System states
  statusOpen: "Open",
  statusMine: "Yours · pending",
  statusAwaiting: "Awaiting review",
  statusVerified: "Verified",
  statusFlagged: "Flagged",
  statusExcluded: "Excluded",

  statusHelpOpen: "Nobody has traced this fenceline yet.",
  statusHelpMine:
    "You annotated it. It stays pending until a second person confirms.",
  statusHelpAwaiting:
    "Someone else already traced this. It waits for a second person to confirm before it counts as verified.",
  statusHelpVerified:
    "Confirmed by two reviewers — it goes into the training set.",
  statusHelpFlagged:
    "Reviewers disagreed or the imagery is unusable. Needs a second look.",
  statusHelpExcluded:
    "Marked unsuitable for training and kept out of the export.",

  // Layers
  layerMaxar: "Maxar",
  layerBasemap: "basemap.de",
  layerOSM: "OSM",

  // UI elements
  mapLegend: "Map legend",
  systems: "Systems",
  annotated: "annotated",
  totalSystems: "Total systems",
  contributors: "Contributors",
  yourProgress: "Your progress",
  leaderboardPoints: "Leaderboard points",
  yourReviews: "Your reviews",
  flaggedNeedsChanges: "Flagged / needs changes",
  addMoreFences: "Add more fences",
  backToMap: "Back to map",
  reviewUnlocked:
    "Review is unlocked. You can now vet other contributors' fences from the More list.",

  // Preferences
  language: "Language",
  appearance: "Appearance",
  colourTheme: "Colour theme",
  colourScheme: "Colour scheme",
  languageAppearance: "Language & appearance",
  uiEnglishOnly: "UI is English for now. Deutsch is not wired yet.",

  // Theme labels
  themeLight: "Light",
  themeDark: "Dark",
  themeAuto: "Auto",

  // Scheme labels
  schemeField: "Field",
  schemeMidnight: "Midnight",
  schemeCoral: "Coral",
  schemeHarvest: "Harvest",
  schemeVoltage: "Voltage",

  // Info / InfoPill
  imageryLayers: "Imagery & layers",
  hidePVSystems: "Hide PV systems",
  showPVSystems: "Show PV systems",
  loupe: "Loupe",
  fullScreen: "Full screen",

  // Info sheet
  infoContribution: "Info & contribution",
  infoFences: "fences",
  infoSystems: "systems",
  infoBoard: "board",
  synced: "Synced · all local fences uploaded",
  checkingSupabase: "Checking Supabase…",
  uploadingLocal: "Uploading local cache…",
  offlineStatus: "Offline — saves stay on this device until online",

  // Overview
  goalPVFence: "Goal: every PV fence",
  systemsAnnotated: "systems annotated",
  boardPoints: "board points",
  goal: "goal",
  toReview: "to review",
  reviewed: "reviewed",
  you: "You",
  fences: "fences",
  board: "Board",
  points: "pts",

  // Tour / onboarding
  tourTitle: "Let me show you around",
  tourBody:
    "A quick walk through every control, screen by screen. Arrows point at the real button and it flashes while we talk about it. Skip any time with ✕.",

  // Annotate view
  annotateHint:
    "Tap the map to place fence points. Tap the first point again to close the ring, or save an open line with the lime tick. Use + for an Extra fence (not linked to this PV).",
  recenter: "Recenter",
  undo: "Undo",

  // Connection status
  connectedStatus: "connected",
  loadingStatus: "loading",
  connOffline: "offline",
  pendingStatus: "pending",

  // Captcha
  captchaTitle: "Quick check",
  captchaBody:
    "Complete the CAPTCHA to browse the map and annotate. No account needed — this keeps the shared dataset clear of bots.",

  // Error pages
  pageNotFound: "Page not found",
  pageNotFoundDesc:
    "The page you're looking for doesn't exist or has been moved.",
  goHome: "Go home",
  thisPageDidntLoad: "This page didn't load",
  somethingWentWrong:
    "Something went wrong on our end. You can try refreshing or head back home.",
  tryAgain: "Try again",
} as const;

export const DE = {
  // Tabs
  tabMap: "Karte",
  tabAnnotate: "Markieren",
  tabMore: "Mehr",

  // Status / System states
  statusOpen: "Offen",
  statusMine: "Deine · ausstehend",
  statusAwaiting: "Ausstehend zur Prüfung",
  statusVerified: "Verifiziert",
  statusFlagged: "Markiert",
  statusExcluded: "Ausgeschlossen",

  statusHelpOpen: "Noch hat niemand diese Zäunung nachgezeichnet.",
  statusHelpMine:
    "Du hast sie markiert. Sie bleibt ausstehend, bis eine zweite Person sie bestätigt.",
  statusHelpAwaiting:
    "Jemand anderes hat dies bereits nachgezeichnet. Es wartet auf Bestätigung durch eine zweite Person, bevor es als verifiziert zählt.",
  statusHelpVerified:
    "Von zwei Prüfern bestätigt — es geht in den Trainingsdatensatz ein.",
  statusHelpFlagged:
    "Prüfer waren sich nicht einig oder das Bildmaterial ist unbrauchbar. Braucht eine zweite Prüfung.",
  statusHelpExcluded:
    "Als ungeeignet für das Training markiert und aus dem Export ausgeschlossen.",

  // Layers
  layerMaxar: "Maxar",
  layerBasemap: "basemap.de",
  layerOSM: "OSM",

  // UI elements
  mapLegend: "Kartenlegende",
  systems: "Systeme",
  annotated: "markiert",
  totalSystems: "Alle Systeme",
  contributors: "Mitwirkende",
  yourProgress: "Dein Fortschritt",
  leaderboardPoints: "Leaderboard-Punkte",
  yourReviews: "Deine Prüfungen",
  flaggedNeedsChanges: "Markiert / Änderungen nötig",
  addMoreFences: "Weitere Zäunungen hinzufügen",
  backToMap: "Zurück zur Karte",
  reviewUnlocked:
    'Prüfung ist freigeschaltet. Du kannst jetzt die Zäunungen anderer Mitwirkender aus der Liste "Mehr" überprüfen.',

  // Preferences
  language: "Sprache",
  appearance: "Erscheinungsbild",
  colourTheme: "Farbtheme",
  colourScheme: "Farbschema",
  languageAppearance: "Sprache & Erscheinungsbild",
  uiEnglishOnly:
    "Die Benutzeroberfläche ist derzeit nur auf Englisch. Deutsch ist noch nicht eingebunden.",

  // Theme labels
  themeLight: "Hell",
  themeDark: "Dunkel",
  themeAuto: "Automatisch",

  // Scheme labels
  schemeField: "Feld",
  schemeMidnight: "Mitternacht",
  schemeCoral: "Koralle",
  schemeHarvest: "Ernte",
  schemeVoltage: "Spannung",

  // Info / InfoPill
  imageryLayers: "Bilder & Ebenen",
  hidePVSystems: "PV-Systeme ausblenden",
  showPVSystems: "PV-Systeme anzeigen",
  loupe: "Lupe",
  fullScreen: "Vollbild",

  // Info sheet
  infoContribution: "Info & Beitrag",
  infoFences: "Zäunungen",
  infoSystems: "Systeme",
  infoBoard: "Board",
  synced: "Synchronisiert · alle lokalen Zäunungen hochgeladen",
  checkingSupabase: "Supabase wird überprüft…",
  uploadingLocal: "Lokaler Cache wird hochgeladen…",
  offlineStatus:
    "Offline · Speicherung bleibt auf diesem Gerät bis zur Verbindung",

  // Overview
  goalPVFence: "Ziel: jede PV-Zäunung",
  systemsAnnotated: "Systeme markiert",
  boardPoints: "Board-Punkte",
  goal: "Ziel",
  toReview: "zur Prüfung",
  reviewed: "überprüft",
  you: "Deine",
  fences: "Zäunungen",
  board: "Board",
  points: "Punkte",

  // Tour / onboarding
  tourTitle: "Lass mich dich herumführen",
  tourBody:
    "Ein kurzer Rundgang durch jede Steuerung, Bildschirm für Bildschirm. Pfeile zeigen auf den echten Button und er blinkt, während wir darüber sprechen. Mit ✕ jederzeit überspringen.",

  // Annotate view
  annotateHint:
    "Tippe auf die Karte, um Punkte zu setzen. Tippe erneut auf den ersten Punkt, um den Ring zu schließen, oder speichere eine offene Linie mit dem grünen Haken. Nutze + für eine Extra-Zäunung (nicht mit diesem PV-System verknüpft).",
  recenter: "Zentrieren",
  undo: "Rückgängig",

  // Connection status
  connectedStatus: "Verbunden",
  loadingStatus: "Lade…",
  connOffline: "Offline",
  pendingStatus: "Ausstehend",

  // Captcha
  captchaTitle: "Schnellprüfung",
  captchaBody:
    "Schließe die CAPTCHA ab, um die Karte zu durchsuchen und zu markieren. Kein Konto erforderlich — dies hält den gemeinsamen Datensatz sauber.",

  // Error pages
  pageNotFound: "Seite nicht gefunden",
  pageNotFoundDesc:
    "Die Seite, die Sie suchen, existiert nicht oder wurde verschoben.",
  goHome: "Zurück nach Hause",
  thisPageDidntLoad: "Diese Seite konnte nicht geladen werden",
  somethingWentWrong:
    "Auf unserer Seite ist etwas schiefgelaufen. Versuchen Sie es mit einem Neuladen oder gehen Sie zurück nach Hause.",
  tryAgain: "Erneut versuchen",
} as const;
