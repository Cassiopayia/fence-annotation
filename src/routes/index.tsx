import { useEffect, useState } from "react";
import { usePersisted } from "@/hooks/use-persisted";
import { useMapHudInfo } from "@/hooks/use-map-hud-info";
import { Skeleton } from "@/components/proto/skeleton";
import type { DatasetStats } from "@/components/proto/overview";
import type { BoardRow } from "@/components/proto/leaderboard";
import type { WelcomeStats } from "@/components/proto/welcome-back";
import {
  countMyAnnotations,
  fetchLeaderboard,
  listSystems,
  patchSystemStatus,
} from "@/lib/zaun/public-api";
import { currentUsernameOrOmit } from "@/lib/zaun/supabase-client";

import { createFileRoute } from "@tanstack/react-router";
import {
  Layers,
  Search,
  ChevronLeft,
  ChevronRight,
  ScanSearch,
  Eye,
  EyeOff,

  HelpCircle,
  Images,
  ListTree,
  ShieldCheck,
  Info,
  Lock,
  Maximize2,
  Minimize2,
  PenLine,
  Share,
  Sparkles,
  X,
  Bug,
  Trophy,
} from "lucide-react";
import { MapCanvas, SYSTEMS } from "@/components/proto/map-canvas";
import { AnnotateView } from "@/components/proto/annotate-view";
import { ChipReview } from "@/components/proto/chip-review";
import { Loupe } from "@/components/proto/loupe";
import { Overview } from "@/components/proto/overview";
import { MoreStatus } from "@/components/proto/more-status";
import { StatusDot, StatusLegend, StatusTag, type SystemStatus } from "@/components/proto/status";
import { WelcomeBack } from "@/components/proto/welcome-back";
import { Leaderboard } from "@/components/proto/leaderboard";
import { CaptchaGate, captchaConfigured } from "@/components/proto/captcha-gate";
import {
  Preferences,
  useThemeEffect,
  type Lang,
  type Theme,
  type Scheme,
} from "@/components/proto/preferences";

import { Tour, type TourStep } from "@/components/proto/tour";
import { TabBar, type Tab } from "@/components/proto/tab-bar";
import { InstallPrompt, useInstallOffer } from "@/components/proto/install-prompt";
import {
  HudButton,
  InfoPill,
  ListRow,
  ProgressRing,
  Sheet,
  StatusPill,
  TagChip,
  TogglePill,
} from "@/components/proto/primitives";

import { cn } from "@/lib/utils";
import {
  getConnectionStatus,
  startConnectionMonitoring,
  subscribeConnectionStatus,
  type ConnectionStatus,
} from "@/lib/zaun/connection-status";
import {
  getImagerySnapshot,
  setDopEnabled,
  setDopMaster,
  setMaxarEnabled,
  setOsmEnabled,
  subscribeImagery,
  type ImagerySnapshot,
} from "@/lib/zaun/imagery-service";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "fency" },
      {
        name: "description",
        content:
          "Phone-first shell for fency: full-bleed map, guided fence annotation and full-screen dataset chip review, designed for standalone iOS PWA.",
      },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { property: "og:title", content: "fency" },
      {
        property: "og:description",
        content:
          "Map, Annotate, More: an iPhone PWA shell for annotating photovoltaic fence lines on aerial imagery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "fency" },
      { name: "application-name", content: "fency" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "theme-color", content: "#1a1f1c" },
    ],
  }),
  component: Index,
});

type Overlay = "systems" | "inspect" | "imagery" | "info" | "onboarding" | "overview" | "whatisthis" | "leaderboard" | null;

/** annotations needed before reviewing other contributors' work */
const REVIEW_UNLOCK = 10;

/** demo distribution for the catalogue list */
const CATALOG_STATUS: SystemStatus[] = [
  "open",
  "mine",
  "awaiting",
  "verified",
  "flagged",
  "verified",
  "excluded",
];
const STATUS_META: Record<SystemStatus, string> = {
  open: "nobody has traced this yet",
  mine: "yours · awaiting confirmation",
  awaiting: "annotated by someone else · awaiting review",
  verified: "verified by 2",
  flagged: "flagged for a second look",
  excluded: "excluded from training",
};

/** every control, grouped by the screen it lives on */
const ONBOARDING: [string, [string, string, string][]][] = [
  [
    "global — on every screen",
    [
      ["i", "Info pill", "Tap once for imagery (zoom + tile service), again for the selected system and its hectares, again for the full sheet."],
      ["◍", "Progress ring", "Your contribution count. Fills up and pops on every saved fence; unlocks review at 10."],
      ["⌕", "Action bar", "Fixed at the bottom: ◀ ▶ step through systems, the middle field searches or shows the current system."],
      ["▭", "Tabs", "Map · Annotate · More. Hidden during annotation, slideshow and review for more map."],
    ],
  ],
  [
    "map screen",
    [
      ["≡", "Layers", "Switch basemaps: basemap.de (default), Maxar, Land DOP WMS, OSM (≤ z14)."],
      ["👁", "PV visibility", "Hide or show the PV outlines so you can judge the raw imagery."],
      ["⌾", "Loupe", "Drag the magnifier anywhere; it shows a second layer (Maxar by default). Tap the label to cycle Maxar · basemap.de · OSM."],
      ["⛶", "Full screen", "Hides all chrome. A single small control brings it back."],
      ["✎", "Annotate", "The lime button starts guided annotation on the nearest open system."],
    ],
  ],
  [
    "annotation screen",
    [
      ["✛", "Recenter", "Snaps back to the current system."],
      ["▣", "Chip frame", "Shows the export chip boundary around the system."],
      ["↺", "Undo", "Removes the last point; long-press a vertex to delete it."],
      ["+", "Extra fence", "Saves an additional fence that is not linked to this PV system."],
      ["✓", "Save", "The lime tick. It wiggles once the line is closed, then advances to the next system."],
      ["✕", "Leave", "Exits annotation without saving anything."],
      ["◐", "Context / visibility", "Small pills that cycle: rural/urban/complex and clear/partial/occluded/none."],
    ],
  ],
  [
    "dataset chip review",
    [
      ["→", "Keep", "Swipe right — the chip turns green and joins the pack."],
      ["←", "Reject", "Swipe left — the chip turns red and is dropped."],
      ["↑↓", "Change chip", "Up for the next chip, down to go back — going back asks whether to undo the last decision."],
      ["⚑", "Flag", "Marks the chip wrong and asks for a hard-negative reason."],
      ["!", "Auto-flags", "Sits beside the metadata, never on the image. Tap to cycle through the open flags."],
    ],
  ],
];

const WHAT_IS_THIS =
  "This Web-app was designed as a first step of my thesis to create a dataset large enough to train an Convulational Network on fences arround solar-systems in Germany. While i will not be able to ensure to review all data that may come in here and add it to my thesis for training (than I would have to discuss about inter rator reliability, I may use this app data to validate my models after training). Im yet not quite sure of the legality of this use case here, if you have any reccomendations on how to publish my own datasets that would be based on German dop20 data pls let me know. until then only a geojson of the annotations will be downloadable.";

/** Rough polygon area in hectares from a lon/lat ring (WGS84). */
function ringAreaHa(ring: [number, number][]): string | undefined {
  if (!ring || ring.length < 3) return undefined;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    sum += x1 * y2 - x2 * y1;
  }
  const deg2 = Math.abs(sum) / 2;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const m2 = deg2 * 111_320 * (111_320 * Math.cos((lat * Math.PI) / 180));
  const ha = m2 / 10_000;
  if (!Number.isFinite(ha) || ha <= 0) return undefined;
  return `${ha < 10 ? ha.toFixed(1) : Math.round(ha)} ha`;
}

function Index() {
  const [tab, setTab] = useState<Tab>("map");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [review, setReview] = useState(false);
  const [slideshow, setSlideshow] = useState(false);
  const [pv, setPv] = useState(true);
  const [selected, setSelected] = useState(SYSTEMS[0]!.id);
  const [systems, setSystems] = useState(SYSTEMS);
  const [recenterKey, setRecenterKey] = useState(0);
  const stepSystem = (dir: -1 | 1) => {
    const i = systems.findIndex((x) => x.id === selected);
    setSelected(systems[(i + dir + systems.length) % systems.length]!.id);
  };
  const [imagery, setImagery] = useState<ImagerySnapshot>(() => getImagerySnapshot());
  const [dopErrorId, setDopErrorId] = useState<string | null>(null);
  const [solo, setSolo] = useState(false);
  const [loupe, setLoupe] = useState(false);
  const [systemQuery, setSystemQuery] = useState("");
  const [welcomeOpen, setWelcomeOpen] = useState(true);
  const [tourOpen, setTourOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [captchaPassed, setCaptchaPassed] = useState(() => !captchaConfigured());
  const offerInstall = useInstallOffer();

  const [lang, setLang] = usePersisted<Lang>("zaun.lang", "en");
  const [theme, setTheme] = usePersisted<Theme>("zaun.theme", "light");
  const [scheme, setScheme] = usePersisted<Scheme>("zaun.scheme", "voltage");

  useThemeEffect(theme, scheme);
  const bugReportUrl = String(import.meta.env.VITE_BUG_REPORT_URL || "").trim();
  // Private contact — from EMAIL env (mailto). Hidden when unset.
  const contactMailto = (() => {
    const raw = String(import.meta.env.EMAIL || "").trim();
    if (!raw) return "";
    const addr = raw.includes("@") ? raw : `${raw}@users.noreply.github.com`;
    const params = new URLSearchParams({
      subject: "fency — contact / annotation removal",
      body: "Legal / licensing advice, or a request to remove annotations:\n\n",
    });
    return `mailto:${addr}?${params.toString()}`;
  })();
  const reportBug = () => {
    if (!bugReportUrl) return;
    window.open(bugReportUrl, "_blank", "noopener,noreferrer");
  };
  const openContact = () => {
    if (!contactMailto) return;
    window.location.href = contactMailto;
  };
  const [saved, setSaved] = useState(0);
  const [savedReady, setSavedReady] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [datasetStats, setDatasetStats] = useState<DatasetStats | null>(null);
  const [welcomeStats, setWelcomeStats] = useState<WelcomeStats | null>(null);
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [username, setUsernameState] = useState<string | null>(() => currentUsernameOrOmit());
  const [connection, setConnection] = useState<ConnectionStatus>(() => getConnectionStatus());
  const { zoomLabel, service: imageryService } = useMapHudInfo();
  const selectedSys = systems.find((s) => s.id === selected);
  const selectedHa = selectedSys ? ringAreaHa(selectedSys.ring) : undefined;
  const selectedLabel = selectedSys ? `PV-${selectedSys.id}` : undefined;

  useEffect(() => {
    startConnectionMonitoring();
    return subscribeConnectionStatus(setConnection);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const n = await countMyAnnotations();
        if (!cancelled) {
          setSaved(n);
          setSavedReady(true);
        }
      } catch {
        if (!cancelled) setSavedReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatsLoading(true);
      setBoardLoading(true);
      try {
        const [sysFc, lb] = await Promise.all([
          listSystems().catch(() => null),
          fetchLeaderboard(50).catch(() => []),
        ]);
        if (cancelled) return;
        const features = (sysFc as { features?: unknown[] } | null)?.features || [];
        const total = features.length || null;
        let annotated = 0;
        for (const f of features as { properties?: Record<string, unknown> }[]) {
          const p = f.properties || {};
          if (p.annotated === true || p.status === "annotated" || p.status === "mine" || p.status === "verified") {
            annotated += 1;
          }
        }
        const people = lb.length || null;
        const weeklyNow = lb.reduce((s, r) => s + (r.points || 0), 0) || null;
        const stats: DatasetStats = {
          total,
          annotated: total != null ? annotated : null,
          weeklyGoal: 50,
          weeklyNow: weeklyNow ?? 0,
          people: people ?? 0,
          chipsReviewed: 0,
          flags: 0,
        };
        setDatasetStats(stats);
        setWelcomeStats({
          people: people ?? 0,
          annotations: weeklyNow ?? 0,
          goal: 50,
          systems: annotated,
          flags: 0,
          since: null,
        });
        setBoard(
          (lb || []).map((r) => ({
            name: r.username,
            verified: r.points,
          })),
        );
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
          setBoardLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => subscribeImagery(setImagery), []);

  const [verifiedOwn] = useState(0);
  const [pop, setPop] = useState(false);

  const unlocked = saved >= REVIEW_UNLOCK;
  /** the tab bar hides in annotation, slideshow and review to free vertical space */
  const chromeless = solo || tab === "annotate" || slideshow;
  /** the action bar stays bottom-anchored: above the tab bar, or at the very bottom edge without it */
  const barBottom = chromeless ? "max(8px,env(safe-area-inset-bottom))" : "calc(58px + env(safe-area-inset-bottom))";
  /** Keep annotate save/exit circles just above the action bar (no dead strip). */
  const panelOffset = chromeless ? 72 : 140;


  const registerSave = () => {
    setSaved((s) => s + 1);
    setPop(true);
    window.setTimeout(() => setPop(false), 520);
  };

  /** After a PV-linked save or skip — go to the next system and recenter. */
  const advanceAfterPv = () => {
    stepSystem(1);
    setRecenterKey((k) => k + 1);
  };

  const markSystem = (id: string | undefined, patch: Record<string, unknown>, status: SystemStatus) => {
    if (!id) return;
    void patchSystemStatus(id, patch).catch(() => {});
    setSystems((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const openMore = () => {
    // tapping More while it is open closes it again
    setTab((t) => (t === "more" ? "map" : "more"));
    setSlideshow(false);
  };

  /** guided tour — arrows and flashing on the real controls, screen by screen */
  const resetChrome = (next: Tab) => {
    setWelcomeOpen(false);
    setOverlay(null);
    setSolo(false);
    setSlideshow(false);
    setTab(next);
  };
  const tourSteps: TourStep[] = [
    {
      title: "Let me show you around",
      body: "A quick walk through every control, screen by screen. Arrows point at the real button and it flashes while we talk about it. Skip any time with ✕.",
      enter: () => {
        setLoupe(false);
        resetChrome("map");
      },
    },
    {
      screen: "global",
      target: "#status-info-btn",
      title: "The info pill",
      body: "Tap once for imagery (zoom + tile service), again for the selected system with its hectares, again for the full sheet. The dot is green whenever you are connected.",
      enter: () => resetChrome("map"),
    },
    {
      screen: "global",
      target: "#contribution-ring",
      title: "Your progress ring",
      body: `It fills and pops with every saved fence. At ${REVIEW_UNLOCK} annotations dataset chip review unlocks.`,
      enter: () => resetChrome("map"),
    },
    {
      screen: "map",
      target: "#layers-toggle",
      title: "Imagery & layers",
      body: "Switch basemaps: basemap.de by default, plus Maxar, Land DOP WMS and optional OSM (tiles stop at zoom 14).",
      enter: () => resetChrome("map"),
    },
    {
      screen: "map",
      target: "#pv-toggle",
      title: "Hide the PV outlines",
      body: "Turn the solar outlines off to judge the raw imagery, then back on to compare.",
      enter: () => resetChrome("map"),
    },
    {
      screen: "map",
      target: "#loupe-toggle",
      title: "The loupe lives here",
      body: "Open the magnifier from this rail. Close it again and it snaps straight back to this button.",
      enter: () => {
        resetChrome("map");
        setLoupe(false);
      },
    },
    {
      screen: "map",
      target: "#loupe",
      title: "Drag it anywhere",
      body: "The loupe shows a second layer (Maxar by default) — drag it over a fence line and cycle the layer inside it.",
      enter: () => {
        resetChrome("map");
        setLoupe(true);
      },
    },
    {
      screen: "map",
      target: "#solo-toggle",
      title: "Full screen",
      body: "Hides every piece of chrome for a pure map. One small control in the corner brings it all back.",
      enter: () => {
        resetChrome("map");
        setLoupe(false);
      },
    },
    {
      screen: "global",
      target: "#action-bar",
      title: "The action bar",
      body: "Always within thumb reach at the bottom — above the tab bar here, and dropped to the very bottom edge when the tabs hide. ◀ ▶ step through systems. The middle field searches by ID or place — during annotation it shows the current system instead.",
      enter: () => resetChrome("map"),
    },
    {
      screen: "map",
      target: "#fab-sample-fence",
      title: "Start annotating",
      body: "The lime button opens guided annotation on the nearest open system. Lime always means action.",
      enter: () => resetChrome("map"),
    },
    {
      screen: "global",
      target: "#mobile-tab-bar",
      title: "Three tabs, that's it",
      body: "Map · Annotate · More. The bar hides during annotation, slideshow and review so the map gets the whole screen.",
      enter: () => resetChrome("map"),
    },
    {
      screen: "global → annotation",
      target: "#tab-annotate",
      title: "Your turn: open Annotate",
      body: "Tap the Annotate tab yourself. The tab bar disappears and we continue inside guided annotation.",
      awaitTap: true,
      tapHint: "Tap Annotate",
      enter: () => resetChrome("map"),
    },
    {
      screen: "annotation",
      title: "You're in annotation now",
      body: "Notice the change: no tab bar, no extra chrome — just the map, the drawing controls on the right and the action bar showing the current system. Everything from here on lives on this screen.",
      enter: () => resetChrome("annotate"),
    },
    {
      screen: "annotation",
      target: "#annotate-recenter",
      title: "Recenter and chip frame",
      body: "Snap back to the current system, and show the 512 px export chip boundary around it.",
      enter: () => resetChrome("annotate"),
    },
    {
      screen: "annotation",
      target: "#annotate-undo",
      title: "Undo a point",
      body: "Removes the last point you placed. Long-press a vertex on the map to delete just that one.",
      enter: () => resetChrome("annotate"),
    },
    {
      screen: "annotation",
      target: "#tag-context",
      title: "Context & visibility",
      body: "Two small pills that cycle: rural / urban / complex, and clear / partial / occluded / none. They only appear once a fence is drawn and never cover the line.",
      enter: () => resetChrome("annotate"),
    },
    {
      screen: "annotation",
      target: "#guided-save-btn",
      title: "The lime tick saves",
      body: "It wiggles as soon as the line is closed, flies into your progress ring and moves on to the next system.",
      enter: () => resetChrome("annotate"),
    },
    {
      screen: "annotation",
      target: "#guided-exit-btn",
      title: "Leave, or add an extra fence",
      body: "✕ leaves without saving. The + above saves an additional fence that is not linked to this PV system.",
      enter: () => resetChrome("annotate"),
    },
    {
      screen: "more",
      target: "#more-status",
      title: "More opens with your status",
      body: "Dataset progress, chips reviewed and the weekly community goal. Tap it for the full overview.",
      enter: () => resetChrome("more"),
    },
    {
      screen: "review",
      title: "Dataset chip review",
      body: `After ${REVIEW_UNLOCK} saved fences, review unlocks in More: full screen, swipe right to keep, left to reject, up and down to change chip, flag for a second look.`,
      enter: () => resetChrome("more"),
    },
  ];


  if (review) return <ChipReview onExit={() => setReview(false)} />;

  return (
    <main className="fixed inset-0 w-full overflow-hidden bg-card">
      {/* One map for map + annotate — remounting killed MapboxDraw mid-session. */}
      <MapCanvas
        focus={tab === "annotate"}
        aoi={slideshow}
        fence
        pv={pv}
        selected={selected}
        onSelect={setSelected}
        onSystemOpen={(id) => {
          setSelected(id);
          if (tab !== "annotate") setOverlay("inspect");
        }}
        recenterKey={recenterKey}
        bottomPad={chromeless ? 72 : 140}
        drawing={tab === "annotate"}
        showAttribution={
          tab === "map" && !solo && !welcomeOpen && !(installOpen && offerInstall) && captchaPassed
        }
        onSystemsLoaded={(next) => {
          setSystems(next);
          if (!next.some((s) => s.id === selected) && next[0]) {
            setSelected(next[0].id);
          }
        }}
      />

      {!captchaPassed && <CaptchaGate onPassed={() => setCaptchaPassed(true)} />}

      {tab === "annotate" ? (
        <AnnotateView
          onExit={() => setTab("map")}
          onSaved={() => {
            markSystem(selected, { annotated: true, status: "mine", fence_status: "mine" }, "mine");
            registerSave();
            advanceAfterPv();
          }}
          onExtraSaved={() => {
            // Extra fence counts toward progress but stays on this PV.
            registerSave();
          }}
          onSkipped={(reason, tags) => {
            markSystem(
              selected,
              {
                status: "flagged",
                fence_status: "flagged",
                skip_reason: reason,
                context: tags.context,
                visibility: tags.visibility,
                annotated: false,
              },
              "flagged",
            );
            advanceAfterPv();
          }}
          onInfo={() => setOverlay("info")}
          solo={solo}
          onSolo={setSolo}
          pv={pv}
          onPv={setPv}
          bottomOffset={panelOffset}
          selected={selected}
          ha={selectedHa}
          systemLabel={selectedLabel}
          onRecenter={() => setRecenterKey((k) => k + 1)}
          connection={connection}
        />
      ) : null}


      {/* global, every screen: circular contribution progress, top right */}
      {!solo && (
        <div className="absolute right-4 top-[max(6px,env(safe-area-inset-top))] z-40">
          <ProgressRing
            id="contribution-ring"
            value={saved}
            max={REVIEW_UNLOCK}
            pop={pop}
            onClick={() => setOverlay("info")}
          />
        </div>
      )}

      {/* Map screen: global (i) plus this screen's own tool rail */}
      {tab === "map" && !solo && (
        <>
          <div className="absolute left-4 top-[max(6px,env(safe-area-inset-top))] z-50">
            <InfoPill
              id="status-info-btn"
              onClick={() => setOverlay("info")}
              connection={connection}
              zoom={zoomLabel}
              service={imageryService}
              systemLabel={selectedLabel}
              ha={selectedHa}
            />
          </div>
          <div className="absolute right-4 top-[calc(max(6px,env(safe-area-inset-top))+56px)] z-30 flex flex-col items-end gap-2">
            <HudButton id="layers-toggle" label="Imagery and layers" onClick={() => setOverlay("imagery")}>
              <Layers className="size-5" />
            </HudButton>
            <HudButton
              id="pv-toggle"
              label={pv ? "Hide PV systems" : "Show PV systems"}
              active={!pv}
              onClick={() => setPv(!pv)}
            >
              {pv ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
            </HudButton>

            {!loupe && (
              <HudButton
                label="Loupe — draggable magnifier with a second imagery layer"
                id="loupe-toggle"
                onClick={() => setLoupe(true)}
              >
                <ScanSearch className="size-5" />
              </HudButton>
            )}
            <HudButton id="solo-toggle" label="Full screen — hide all chrome" onClick={() => setSolo(true)}>
              <Maximize2 className="size-5" />
            </HudButton>
          </div>
        </>
      )}


      {loupe && tab === "map" && !solo && <Loupe onClose={() => setLoupe(false)} />}


      {/* exit full screen: the single control left in solo mode */}
      {solo && (
        <button
          type="button"
          onClick={() => setSolo(false)}
          aria-label="Exit full screen"
          className="glass absolute right-4 top-[max(12px,env(safe-area-inset-top))] z-40 grid size-10 place-items-center rounded-full border border-border shadow-hud"
        >
          <Minimize2 className="size-5" />
        </button>
      )}

      {/* Screen 7 — slideshow runs on the live map, no play button needed */}
      {slideshow && tab !== "annotate" && (
        <div
          className="absolute inset-x-4 z-30"
          style={{ bottom: `calc(${barBottom} + 62px)` }}
        >
          <div className="glass flex items-center gap-3 rounded-2xl border border-border px-3 py-2.5 shadow-hud">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs font-semibold">
                {selectedLabel || "No system selected"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {selectedHa ? `${selectedHa} · ` : ""}
                swipe or use ◀ ▶
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSlideshow(false)}
              aria-label="Close slideshow"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* More — full-height surface with its own close control */}
      {tab === "more" && (
        <div className="absolute inset-x-0 bottom-0 top-24 z-30 overflow-y-auto rounded-t-[28px] bg-card px-5 pt-4 pb-[calc(150px+env(safe-area-inset-bottom))] shadow-sheet">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">More</h1>
            <button
              type="button"
              onClick={() => setTab("map")}
              aria-label="Close more"
              className="grid size-9 place-items-center rounded-full bg-secondary"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <MoreStatus
              saved={saved}
              stats={datasetStats}
              loading={statsLoading}
              onOpenOverview={() => setOverlay("overview")}
            />
            <button
              type="button"
              onClick={() => {
                setTab("map");
                setTourOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-lime-soft px-4 py-3 text-left"
            >
              <Sparkles className="size-5 shrink-0 text-lime-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">How annotating works</span>
                <span className="block text-xs text-muted-foreground">
                  Guided tour · arrows on every control
                </span>
              </span>
            </button>

            {offerInstall && (
              <button
                type="button"
                onClick={() => setInstallOpen(true)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left"
              >
                <Share className="size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">Add to Home Screen</span>
                  <span className="block text-xs text-muted-foreground">
                    Full-screen field mode without browser chrome
                  </span>
                </span>
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-destructive font-mono text-[10px] font-bold text-destructive-foreground">
                  1
                </span>
              </button>
            )}
          </div>

          <div className="mt-3">
            <ListRow
              title="All buttons explained"
              meta="Static reference for every control"
              onClick={() => setOverlay("onboarding")}
              trailing={<HelpCircle className="size-5" />}
            />
            <ListRow
              title="Systems catalog"
              meta={
                statsLoading || !datasetStats?.total
                  ? "Loading catalog…"
                  : `${datasetStats.total.toLocaleString("en-US").replace(",", " ")} systems · ${datasetStats.annotated ?? 0} annotated`
              }
              onClick={() => setOverlay("systems")}
              trailing={<ListTree className="size-5" />}
            />
            <ListRow
              title="Review annotations"
              meta={
                unlocked
                  ? "Vote keep / reject on saved fences"
                  : `Unlocks after ${REVIEW_UNLOCK} annotations · ${saved}/${REVIEW_UNLOCK}`
              }
              onClick={() => unlocked && setReview(true)}
              trailing={
                unlocked ? (
                  <ShieldCheck className="size-5" />
                ) : (
                  <Lock className="size-5 text-muted-foreground" />
                )
              }
            />
            <ListRow
              title="Annotation slideshow"
              meta="Review saved fences on the map"
              onClick={() => {
                setSlideshow(true);
                setTab("map");
              }}
              trailing={<Images className="size-5" />}
            />
            <ListRow
              title="Imagery & layers"
              meta="basemap.de · Land DOP · Maxar · OSM≤z14"
              onClick={() => setOverlay("imagery")}
              trailing={<Layers className="size-5" />}
            />
            <ListRow
              title="While you were gone"
              meta={
                statsLoading
                  ? "Loading community stats…"
                  : welcomeStats?.people != null && welcomeStats?.annotations != null
                    ? `${welcomeStats.people} people · ${welcomeStats.annotations} annotations`
                    : "Community stats unavailable"
              }
              onClick={() => setWelcomeOpen(true)}
              trailing={<Sparkles className="size-5" />}
            />
            <ListRow
              title="What is this?"
              meta="Thesis, dataset and legal notes"
              onClick={() => setOverlay("whatisthis")}
              trailing={<HelpCircle className="size-5" />}
            />
            <ListRow
              title="Info & contribution"
              meta={`${saved} fences saved · connection ${connection}`}
              onClick={() => setOverlay("info")}
              trailing={<Info className="size-5" />}
            />
            <ListRow
              title="Leaderboard"
              meta="Verified fences · guest annotations"
              onClick={() => setOverlay("leaderboard")}
              trailing={<Trophy className="size-5" />}
            />
            {bugReportUrl ? (
              <ListRow
                title="Report bug"
                meta="Opens a GitHub issue"
                variant="destructive"
                onClick={reportBug}
                trailing={<Bug className="size-5" />}
              />
            ) : null}
            {contactMailto ? (
              <ListRow
                title="Contact / removal"
                meta="Private email — not a public GitHub issue"
                onClick={openContact}
                trailing={<HelpCircle className="size-5" />}
              />
            ) : null}
          </div>

          <div className="mt-4">
            <Preferences
              lang={lang}
              theme={theme}
              scheme={scheme}
              onLang={setLang}
              onTheme={setTheme}
              onScheme={setScheme}
            />
          </div>
        </div>
      )}

      {/* Action bar — map + annotate (tabs hide on annotate; bar drops to the bottom edge) */}
      {(tab === "map" || tab === "annotate") && !solo && !overlay && !welcomeOpen && !(installOpen && offerInstall) && captchaPassed && (
      <div id="action-bar" className="absolute inset-x-4 z-40" style={{ bottom: barBottom }}>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card p-1.5">
          <HudButton label="Previous system" onClick={() => stepSystem(-1)}>
            <ChevronLeft className="size-5" />
          </HudButton>
          {tab === "annotate" || slideshow ? (
            <button
              type="button"
              onClick={() => setRecenterKey((k) => k + 1)}
              className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-secondary px-3 py-2.5 text-sm font-semibold"
            >
              <span className="truncate font-mono text-xs">
                {selectedLabel || "Current system"}
                {selectedHa ? ` · ${selectedHa}` : ""}
              </span>
            </button>
          ) : (
            <button
              id="fab-guided-annotation"
              type="button"
              onClick={() => setOverlay("systems")}
              aria-label="Search systems"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-secondary px-3 py-2.5 text-left"
            >
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-xs">
                {`Go to #ID · ${systems.length.toLocaleString()} systems`}
              </span>
            </button>
          )}
          <HudButton label="Next system" onClick={() => stepSystem(1)}>
            <ChevronRight className="size-5" />
          </HudButton>
        </div>
      </div>
      )}

      {/* map mode: the engaging annotate button, right above the bar's ▶ */}
      {tab === "map" && !solo && !slideshow && !overlay && !welcomeOpen && !(installOpen && offerInstall) && captchaPassed && (
        <div className="absolute inset-x-4 z-30 flex justify-end" style={{ bottom: `calc(${barBottom} + 70px)` }}>
          <button
            id="fab-sample-fence"
            type="button"
            onClick={() => setTab("annotate")}
            className="flex items-center gap-2 rounded-full bg-lime px-4 py-3 font-display text-[15px] font-bold text-lime-foreground tap-44"
          >
            <PenLine className="size-4" /> Annotate
          </button>
        </div>
      )}


      {/* Hide under welcome/install — translucent backdrop otherwise shows clipped tab labels as fuzzy green lines */}
      {!chromeless && !welcomeOpen && !(installOpen && offerInstall) && captchaPassed && (
        <TabBar
          value={tab}
          onChange={(t) => {
            if (t === "more") openMore();
            else if (t === "annotate") setTab("annotate");
            else setTab(t);
          }}
          badge={offerInstall ? 1 : 0}
        />
      )}

      {/* Guided tour — arrows + flashing on the real controls */}
      {tourOpen && (
        <Tour
          steps={tourSteps}
          onClose={() => {
            setTourOpen(false);
            resetChrome("map");
          }}
          onFinish={() => {
            setTourOpen(false);
            resetChrome("annotate");
          }}
        />
      )}

      {/* Greeting — what the community added while you were away */}
      {captchaPassed && welcomeOpen && (
        <WelcomeBack
          onClose={() => {
            setWelcomeOpen(false);
            if (offerInstall) setInstallOpen(true);
          }}
          onStart={() => {
            setWelcomeOpen(false);
            setTab("annotate");
          }}
          stats={welcomeStats}
          loading={statsLoading}
          onOpenLeaderboard={() => {
            setWelcomeOpen(false);
            setOverlay("leaderboard");
          }}
        />
      )}

      {/* Browser-only — hidden when already installed as PWA / standalone */}
      {offerInstall && !welcomeOpen && !tourOpen && (
        <InstallPrompt
          open={installOpen}
          onClose={() => setInstallOpen(false)}
          onDone={() => setInstallOpen(false)}
        />
      )}


      {/* Systems catalog — same bottom sheet treatment as every other surface */}
      <Sheet
        id="systems-sheet"
        open={overlay === "systems"}
        onClose={() => {
          setOverlay(null);
          setSystemQuery("");
        }}
        title="Systems"
      >

        <div className="sticky top-0 -mx-5 bg-card px-5 pb-3">
          <label className="flex items-center gap-2 rounded-full bg-secondary px-4 py-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={systemQuery}
              onChange={(e) => setSystemQuery(e.target.value)}
              autoFocus
              className="w-full bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Search by ID, place or status"
            />
          </label>
        </div>
        <div className="mb-4 rounded-2xl bg-secondary px-4 py-3">
          <StatusLegend id="systems-map-legend" />
        </div>
        {(() => {
          const q = systemQuery.trim().toLowerCase();
          const filtered = !q
            ? systems.slice(0, 80)
            : systems
                .filter((s) => {
                  const hay = `${s.id} ${s.status} ${s.location ?? ""}`.toLowerCase();
                  return hay.includes(q);
                })
                .slice(0, 80);
          if (!filtered.length) {
            return (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                No systems match “{systemQuery.trim()}”.
              </p>
            );
          }
          return filtered.map((s) => (
            <ListRow
              key={s.id}
              title={s.id}
              meta={`${s.location ?? "PV system"} · ${STATUS_META[s.status] ?? s.status}`}
              onClick={() => {
                setSelected(s.id);
                setOverlay(null);
                setSystemQuery("");
              }}
              trailing={<StatusDot status={s.status} />}
            />
          ));
        })()}
      </Sheet>

      {/* System info — opened by tapping a PV polygon on the map */}
      <Sheet
        open={overlay === "inspect"}
        onClose={() => setOverlay(null)}
        title={selectedLabel || (selected ? `PV-${selected}` : "System")}
      >
        <div className="space-y-4 pt-1">
          <div className="flex flex-wrap gap-2">
            {selectedHa ? <StatusPill>{selectedHa}</StatusPill> : null}
            {selectedSys ? <StatusTag status={selectedSys.status} full /> : null}
            <StatusPill tone="neutral">{STATUS_META[selectedSys?.status ?? "open"]}</StatusPill>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {selectedSys
              ? `Selected photovoltaic system ${selectedLabel}. Trace the fence on aerial imagery, or keep browsing.`
              : "Select a PV system on the map."}
          </p>
          <button
            type="button"
            onClick={() => {
              setOverlay(null);
              setTab("annotate");
            }}
            className="h-12 w-full rounded-full bg-lime font-display text-[15px] font-bold text-lime-foreground"
          >
            Trace fenceline
          </button>
        </div>
      </Sheet>

      {/* Imagery — basemap.de default; OSM optional ≤z14; Land DOP + Maxar */}
      <Sheet open={overlay === "imagery"} onClose={() => setOverlay(null)} title="Imagery & layers">
        <div className="space-y-3 pt-1">
          <ListRow
            title="basemap.de"
            meta="default country context · underlay until a covering Land DOP paints"
            trailing={<StatusPill tone="neutral">on</StatusPill>}
          />
          <ListRow
            title="Maxar satellite"
            meta={imagery.maxar ? "on · replaces basemap.de" : "off (default)"}
            trailing={
              <TogglePill on={imagery.maxar} onClick={() => setMaxarEnabled(!imagery.maxar)} />
            }
          />
          <ListRow
            title="OpenStreetMap"
            meta={
              imagery.osm
                ? "on · only loads at zoom ≤ 14"
                : "off · optional overlay, max zoom 14"
            }
            trailing={<TogglePill on={imagery.osm} onClick={() => setOsmEnabled(!imagery.osm)} />}
          />
          <ListRow
            title="DOP20 · all Länder"
            meta={
              imagery.ready
                ? imagery.dopMaster
                  ? `${imagery.dops.filter((d) => d.enabled).length}/${imagery.dops.length} enabled · z14+`
                  : "all Land DOPs off"
                : "loading catalog…"
            }
            trailing={
              <TogglePill
                on={imagery.dopMaster}
                onClick={() => setDopMaster(!imagery.dopMaster)}
              />
            }
          />

          <p className="pt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Land DOP services
          </p>
          <div className="space-y-1">
            {imagery.dops.map((dop) => {
              const showErr = dopErrorId === dop.id;
              return (
                <div key={dop.id} className="rounded-2xl bg-secondary/60 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        !dop.enabled && "bg-muted-foreground/40",
                        dop.enabled && dop.active && dop.ok && "bg-online",
                        dop.enabled && !dop.active && dop.ok && "bg-lime",
                        dop.enabled && !dop.ok && "bg-destructive",
                      )}
                      title={
                        !dop.ok
                          ? "error"
                          : dop.active
                            ? "active in view"
                            : dop.enabled
                              ? "enabled"
                              : "off"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{dop.label}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {!dop.ok
                          ? "error"
                          : dop.active
                            ? `active in view · z${dop.minzoom}+`
                            : dop.enabled
                              ? `ready · z${dop.minzoom}+`
                              : "off"}
                      </p>
                    </div>
                    {!dop.ok && (
                      <button
                        type="button"
                        aria-label={`Error for ${dop.label}`}
                        onClick={() => setDopErrorId(showErr ? null : dop.id)}
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive"
                      >
                        <Info className="size-4" />
                      </button>
                    )}
                    <TogglePill
                      on={dop.enabled}
                      onClick={() => setDopEnabled(dop.id, !dop.enabled)}
                    />
                  </div>
                  {showErr && dop.error && (
                    <p className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-[12px] leading-snug text-destructive">
                      {dop.error}
                    </p>
                  )}
                </div>
              );
            })}
            {!imagery.dops.length && (
              <p className="px-1 py-3 text-sm text-muted-foreground">
                {imagery.ready ? "No DOP catalog entries found." : "Loading DOP catalog…"}
              </p>
            )}
          </div>

          <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
            Default: basemap.de stays visible until a covering Land DOP can paint (enabled,
            in bounds, at that Land’s minzoom). OSM is optional and never requests tiles above
            z14. Maxar is off unless you enable it. Green = active in view;
            lime = enabled; red = probe error (tap ⓘ).
          </p>
        </div>
      </Sheet>

      {/* Info & contribution */}
      <Sheet open={overlay === "info"} onClose={() => setOverlay(null)} title="Info & contribution">
        <div className="space-y-4 pt-1">
          <div className="rounded-2xl bg-secondary px-4 py-3">
            {selectedLabel ? (
              <>
                <p className="font-mono text-sm font-semibold">{selectedLabel}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {[selectedHa, zoomLabel, imageryService].filter(Boolean).join(" · ")}
                </p>
              </>
            ) : (
              <>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-2 h-3 w-56" />
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2.5 rounded-full",
                connection === "connected" && "bg-online",
                connection === "loading" && "bg-warn",
                connection === "offline" && "bg-destructive",
              )}
            />
            <p className="text-sm font-medium">
              {connection === "connected"
                ? "Connected · Supabase reachable"
                : connection === "loading"
                  ? "Checking Supabase…"
                  : "Offline — Supabase unreachable; saves stay local"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 font-mono text-xs">
            <div className="rounded-2xl bg-secondary px-3 py-3">
              <p className="text-muted-foreground">fences</p>
              {savedReady ? (
                <p className="mt-1 text-sm font-semibold">{saved}</p>
              ) : (
                <Skeleton className="mt-1 h-5 w-8" />
              )}
            </div>
            <div className="rounded-2xl bg-secondary px-3 py-3">
              <p className="text-muted-foreground">systems</p>
              {!statsLoading && datasetStats?.total != null ? (
                <p className="mt-1 text-sm font-semibold">{datasetStats.total}</p>
              ) : (
                <Skeleton className="mt-1 h-5 w-10" />
              )}
            </div>
            <div className="rounded-2xl bg-secondary px-3 py-3">
              <p className="text-muted-foreground">board</p>
              {!boardLoading && board != null ? (
                <p className="mt-1 text-sm font-semibold">{board.length}</p>
              ) : (
                <Skeleton className="mt-1 h-5 w-8" />
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-secondary px-4 py-4">
            <StatusLegend id="status-legend" />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            fency builds open training data for fence detection on German DOP20 and Maxar
            imagery. Every {REVIEW_UNLOCK} annotations unlock reviewing other contributors' work.
          </p>
          {contactMailto ? (
            <button
              type="button"
              onClick={openContact}
              className="h-11 w-full rounded-full bg-secondary text-sm font-semibold"
            >
              Contact / remove annotations (email)
            </button>
          ) : null}
        </div>
      </Sheet>

      {/* Onboarding — every control on every screen, skippable at any point */}
      <Sheet
        id="onboarding-sheet"
        open={overlay === "onboarding"}
        onClose={() => setOverlay(null)}
        title="What every button does"
      >
        <div className="space-y-4 pt-1 pb-2">
          {ONBOARDING.map(([screen, items]) => (
            <div key={screen}>
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {screen}
              </p>
              <div className="mt-2 space-y-1.5">
                {items.map(([icon, label, desc]) => (
                  <div key={label} className="flex gap-3 rounded-2xl bg-secondary px-3 py-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card font-mono text-[13px] font-bold">
                      {icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {desc}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              appearance
            </p>
            <div className="mt-2">
              <Preferences
                compact
                lang={lang}
                theme={theme}
                scheme={scheme}
                onLang={setLang}
                onTheme={setTheme}
                onScheme={setScheme}
              />
            </div>
          </div>
          <button

            type="button"
            onClick={() => {
              setOverlay(null);
              setTourOpen(true);
            }}
            className="h-12 w-full rounded-full bg-lime font-display text-[15px] font-bold text-lime-foreground"
          >
            Show me on screen
          </button>
          <button
            id="onboarding-skip-btn"
            type="button"
            onClick={() => setOverlay(null)}
            className="h-11 w-full rounded-full text-sm font-semibold text-muted-foreground"
          >
            Skip — I'll figure it out
          </button>
        </div>
      </Sheet>

      {/* Overview — what we achieved and what the goal is */}
      <Sheet
        id="overview-sheet"
        open={overlay === "overview"}
        onClose={() => setOverlay(null)}
        title="Overview"
      >
        <Overview
          saved={saved}
          stats={datasetStats}
          loading={statsLoading}
          onClose={() => setOverlay(null)}
          onAnnotate={() => {
            setOverlay(null);
            setTab("annotate");
          }}
        />
      </Sheet>

      {/* Leaderboard — verified annotations only */}
      <Sheet
        id="leaderboard-sheet"
        elevated
        open={overlay === "leaderboard"}
        onClose={() => setOverlay(null)}
        title="Leaderboard"
      >
        <Leaderboard
          username={username}
          saved={saved}
          verified={verifiedOwn}
          board={board}
          loading={boardLoading}
          onUsernameChange={setUsernameState}
        />
      </Sheet>

      {/* What is this — thesis, dataset and legal notes */}
      <Sheet
        id="what-is-this-sheet"
        open={overlay === "whatisthis"}
        onClose={() => setOverlay(null)}
        title="What is this?"
      >
        <div className="space-y-4 pt-1">
          <p className="text-sm leading-relaxed text-card-foreground">{WHAT_IS_THIS}</p>
          <div className="rounded-2xl bg-secondary px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              contact
            </p>
            <p className="mt-1 text-sm">
              Legal or licensing advice, dataset questions, or a request to remove annotations —
              email the maintainer privately (opens your mail app). Not posted publicly.
            </p>
            {contactMailto ? (
              <button
                type="button"
                onClick={openContact}
                className="mt-3 h-11 w-full rounded-full bg-lime font-display text-[14px] font-bold text-lime-foreground"
              >
                Email maintainer
              </button>
            ) : (
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                Contact email not configured — set the EMAIL env / secret.
              </p>
            )}
          </div>
        </div>
      </Sheet>
    </main>
  );
}
