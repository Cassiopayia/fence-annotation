import { useEffect, useMemo, useRef, useState } from "react";
import { usePersisted } from "@/hooks/use-persisted";
import { useMapHudInfo } from "@/hooks/use-map-hud-info";
import { Skeleton } from "@/components/proto/skeleton";
import type { DatasetStats } from "@/components/proto/overview";
import type { BoardRow } from "@/components/proto/leaderboard";
import type { WelcomeStats } from "@/components/proto/welcome-back";
import {
  applyAnnotationCoverageToSystems,
  fetchLeaderboard,
  listAnnotations,
  listSystems,
  patchSystemStatus,
  countPendingAnnotations,
} from "@/lib/zaun/public-api";
import { currentUsernameOrOmit } from "@/lib/zaun/supabase-client";
import { displayAuthorName } from "@/lib/zaun/username";

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
import {
  StatusDot,
  StatusLegend,
  StatusTag,
  type SystemStatus,
} from "@/components/proto/status";
import { WelcomeBack } from "@/components/proto/welcome-back";
import { Leaderboard } from "@/components/proto/leaderboard";
import {
  CaptchaGate,
  captchaConfigured,
} from "@/components/proto/captcha-gate";
import {
  Preferences,
  useThemeEffect,
  type Theme,
  type Scheme,
} from "@/components/proto/preferences";
import { useI18n } from "@/i18n/context";
import { buildTourSteps } from "@/i18n/tour-steps";
import { statusMetaKey } from "@/i18n/status-meta";

import { Tour } from "@/components/proto/tour";
import { TabBar, type Tab } from "@/components/proto/tab-bar";
import {
  InstallPrompt,
  useInstallOffer,
} from "@/components/proto/install-prompt";
import {
  HudButton,
  InfoPill,
  ListRow,
  ProgressRing,
  Sheet,
  StatusPill,
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
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
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
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      { name: "theme-color", content: "#1a1f1c" },
    ],
  }),
  component: Index,
});

import {
  ONBOARDING,
  REVIEW_UNLOCK,
  WHAT_IS_THIS,
  ringAreaHa,
} from "./-home-copy";

type Overlay =
  | "systems"
  | "inspect"
  | "imagery"
  | "info"
  | "onboarding"
  | "overview"
  | "whatisthis"
  | "leaderboard"
  | null;

function Index() {
  const { t } = useI18n();
  const connectionLabel = (c: ConnectionStatus) => {
    switch (c) {
      case "connected":
        return t("connectedStatus");
      case "loading":
        return t("loadingStatus");
      case "pending":
        return t("pendingStatus");
      default:
        return t("connOffline");
    }
  };
  const [tab, setTab] = useState<Tab>("map");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [review, setReview] = useState(false);
  const [pv, setPv] = useState(true);
  const [selected, setSelected] = useState(SYSTEMS[0]!.id);
  const [systems, setSystems] = useState(SYSTEMS);
  const [recenterKey, setRecenterKey] = useState(0);
  /** Set when welcome "Add mine now" should land in annotate after onboarding. */
  const annotateAfterOnboardingRef = useRef(false);

  /** Still needs a fence — skip already annotated / flagged / excluded systems. */
  const isOpenForAnnotate = (s: { status: SystemStatus }) =>
    s.status === "open";

  const findOpenSystemId = (
    list: typeof systems,
    fromId: string | undefined,
    dir: -1 | 1,
  ): string | null => {
    if (!list.length) return null;
    const start = list.findIndex((x) => x.id === fromId);
    const from = start < 0 ? (dir === 1 ? -1 : 0) : start;
    for (let n = 1; n <= list.length; n += 1) {
      const i = (from + dir * n + list.length * 20) % list.length;
      const cand = list[i]!;
      if (isOpenForAnnotate(cand)) return cand.id;
    }
    return null;
  };

  /** Annotate queue: only systems with status "open" (not awaiting/mine/verified/flagged). */
  const stepSystem = (dir: -1 | 1, openOnly = false) => {
    if (!systems.length) return;
    const onlyOpen = openOnly || tab === "annotate";
    if (onlyOpen) {
      const nextId = findOpenSystemId(systems, selected, dir);
      if (nextId) setSelected(nextId);
      return;
    }
    const i = systems.findIndex((x) => x.id === selected);
    const from = i < 0 ? 0 : i;
    setSelected(systems[(from + dir + systems.length) % systems.length]!.id);
  };

  /** Jump to an open system before guided annotate (never re-queue annotated ones). */
  const enterAnnotate = () => {
    const cur = systems.find((s) => s.id === selected);
    if (!cur || !isOpenForAnnotate(cur)) {
      const nextId =
        findOpenSystemId(systems, selected, 1) ??
        systems.find((s) => isOpenForAnnotate(s))?.id;
      if (!nextId) return; // nothing left to annotate
      setSelected(nextId);
    }
    setTab("annotate");
    setRecenterKey((k) => k + 1);
  };

  const finishOnboarding = (enterAnnotateAfter: boolean) => {
    setOverlay(null);
    if (enterAnnotateAfter && annotateAfterOnboardingRef.current) {
      annotateAfterOnboardingRef.current = false;
      enterAnnotate();
    }
  };
  const [imagery, setImagery] = useState<ImagerySnapshot>(() =>
    getImagerySnapshot(),
  );
  const [dopErrorId, setDopErrorId] = useState<string | null>(null);
  const [solo, setSolo] = useState(false);
  const [loupe, setLoupe] = useState(false);
  const [systemQuery, setSystemQuery] = useState("");
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try {
      return localStorage.getItem("zaun.welcome.seen") !== "1";
    } catch {
      return true;
    }
  });
  const [tourOpen, setTourOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [captchaPassed, setCaptchaPassed] = useState(
    () => !captchaConfigured(),
  );
  const offerInstall = useInstallOffer();

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
    // mailto: URLs are safe to redirect to
    window.location.href = contactMailto;
  };
  const [saved, setSaved] = useState(0);
  const [savedReady, setSavedReady] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [datasetStats, setDatasetStats] = useState<DatasetStats | null>(null);
  const [welcomeStats, setWelcomeStats] = useState<WelcomeStats | null>(null);
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [username, setUsernameState] = useState<string | null>(() =>
    currentUsernameOrOmit(),
  );
  const [connection, setConnection] = useState<ConnectionStatus>(() =>
    getConnectionStatus(),
  );
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
      setStatsLoading(true);
      setBoardLoading(true);
      try {
        const [sysFc, lb, annFc] = await Promise.all([
          listSystems().catch(() => null),
          fetchLeaderboard(50).catch(() => []),
          listAnnotations().catch(() => null),
        ]);
        if (cancelled) return;
        const covered = sysFc && annFc
          ? applyAnnotationCoverageToSystems(sysFc, annFc)
          : sysFc;
        const features =
          (covered as { features?: unknown[] } | null)?.features || [];
        const total = features.length || null;
        let annotated = 0;
        let flaggedLocal = 0;
        for (const f of features as {
          properties?: Record<string, unknown>;
        }[]) {
          const p = f.properties || {};
          if (
            p.annotated === true ||
            p.status === "annotated" ||
            p.status === "mine" ||
            p.status === "verified" ||
            p.status === "awaiting"
          ) {
            annotated += 1;
          }
          if (p.status === "flagged" || p.fence_status === "flagged")
            flaggedLocal += 1;
        }
        const savedCount = (
          (annFc as { features?: { properties?: Record<string, unknown> }[] } | null)?.features || []
        ).filter((f) => {
          const p = f.properties || {};
          return p.is_own === true || p.is_own === "true";
        }).length;
        setSaved(savedCount);
        setSavedReady(true);
        let chipsReviewed = 0;
        let flagVotes = 0;
        for (const f of (
          annFc as {
            features?: { properties?: Record<string, unknown> }[];
          } | null
        )?.features || []) {
          const p = f.properties || {};
          const mine = String(p.my_decision || "").trim();
          if (mine) chipsReviewed += 1;
          if (mine === "needs_changes" || Number(p.needs_changes || 0) > 0)
            flagVotes += 1;
        }
        const people = lb.length || null;
        const communityPoints =
          lb.reduce((s, r) => s + (r.points || 0), 0) || null;
        const stats: DatasetStats = {
          total,
          annotated: total != null ? annotated : null,
          weeklyGoal: 50,
          // Honest label in UI: community points total, not a weekly window.
          weeklyNow: communityPoints ?? 0,
          people: people ?? 0,
          chipsReviewed,
          flags: Math.max(flaggedLocal, flagVotes),
        };
        setDatasetStats(stats);
        setWelcomeStats({
          people: people ?? 0,
          annotations: communityPoints ?? 0,
          goal: 50,
          systems: annotated,
          flags: stats.flags,
          since: null,
        });
        setBoard(
          (lb || []).map((r) => ({
            name: displayAuthorName(r.username),
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
  /** the tab bar hides in annotation, annotation and review to free vertical space */
  const chromeless = solo || tab === "annotate";
  /** the action bar stays bottom-anchored: above the tab bar, or at the very bottom edge without it */
  const barBottom = chromeless
    ? "var(--sab)"
    : "calc(var(--tab-bar-inner-height) + var(--sab))";
  /** Keep annotate save/exit circles just above the action bar (no dead strip). */
  const panelOffset = chromeless
    ? "calc(var(--action-bar-height) + var(--sab) + 1rem)"
    : "calc(var(--tab-bar-inner-height) + var(--action-bar-height) + var(--sab) + 0.75rem)";

  const registerSave = () => {
    setSaved((s) => s + 1);
    setPop(true);
    window.setTimeout(() => setPop(false), 520);
  };

  /** After a PV-linked save or skip — go to the next still-open system and recenter. */
  const advanceAfterPv = (
    justDoneId?: string,
    justDoneStatus?: SystemStatus,
  ) => {
    const list =
      justDoneId && justDoneStatus
        ? systems.map((s) =>
            s.id === justDoneId ? { ...s, status: justDoneStatus } : s,
          )
        : systems;
    const nextId = findOpenSystemId(list, justDoneId ?? selected, 1);
    if (nextId) setSelected(nextId);
    setRecenterKey((k) => k + 1);
  };

  const markSystem = (
    id: string | undefined,
    patch: Record<string, unknown>,
    status: SystemStatus,
  ) => {
    if (!id) return;
    void patchSystemStatus(id, patch).catch(() => {});
    setSystems((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const markWelcomeSeen = () => {
    try {
      localStorage.setItem("zaun.welcome.seen", "1");
    } catch {
      /* ignore */
    }
  };

  const openMore = () => {
    // tapping More while it is open closes it again
    setTab((t) => (t === "more" ? "map" : "more"));
  };

  /** guided tour — arrows and flashing on the real controls, screen by screen */
  const resetChrome = (next: Tab) => {
    setWelcomeOpen(false);
    setOverlay(null);
    setSolo(false);
    setTab(next);
  };
  const tourSteps = useMemo(
    () =>
      buildTourSteps(t, REVIEW_UNLOCK, {
        resetChrome,
        setLoupe,
      }),
    [t],
  );

  if (review) return <ChipReview onExit={() => setReview(false)} />;

  return (
    <main className="relative h-full w-full overflow-hidden bg-card">
      {/* One map for map + annotate — remounting killed MapboxDraw mid-session. */}
      <MapCanvas
        focus={tab === "annotate"}
        pv={pv}
        selected={selected}
        onSelect={(id) => {
          if (tab === "annotate") {
            const sys = systems.find((s) => s.id === id);
            if (!sys || !isOpenForAnnotate(sys)) return;
          }
          setSelected(id);
        }}
        onSystemOpen={(id) => {
          if (tab === "annotate") {
            const sys = systems.find((s) => s.id === id);
            if (!sys || !isOpenForAnnotate(sys)) return;
            setSelected(id);
            return;
          }
          setSelected(id);
          setOverlay("inspect");
        }}
        recenterKey={recenterKey}
        bottomPad={chromeless ? 120 : 168}
        drawing={tab === "annotate"}
        showAttribution={
          tab === "map" &&
          !solo &&
          !welcomeOpen &&
          !(installOpen && offerInstall) &&
          captchaPassed
        }
        onSystemsLoaded={(next) => {
          setSystems(next);
          const cur = next.find((s) => s.id === selected);
          // Prefer first still-open system so annotate never boots on a covered one.
          if (!cur || (tab === "annotate" && !isOpenForAnnotate(cur))) {
            const firstOpen = next.find((s) => isOpenForAnnotate(s));
            if (firstOpen) setSelected(firstOpen.id);
            else if (!cur && next[0]) setSelected(next[0].id);
          }
        }}
      />

      {!captchaPassed && (
        <CaptchaGate onPassed={() => setCaptchaPassed(true)} />
      )}

      {tab === "annotate" ? (
        <AnnotateView
          onExit={() => setTab("map")}
          onSaved={() => {
            const id = selected;
            markSystem(
              id,
              { annotated: true, status: "mine", fence_status: "mine" },
              "mine",
            );
            registerSave();
            advanceAfterPv(id, "mine");
          }}
          onExtraSaved={() => {
            // Extra fence counts toward progress but stays on this PV.
            registerSave();
          }}
          onSkipped={(reason, tags) => {
            const id = selected;
            markSystem(
              id,
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
            advanceAfterPv(id, "flagged");
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
        <div className="absolute right-4 top-[calc(var(--sat)+6px)] z-40">
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
          <div className="absolute left-4 top-[calc(var(--sat)+6px)] z-50">
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
          <div className="absolute right-4 top-[calc(var(--sat)+62px)] z-30 flex flex-col items-end gap-2">
            <HudButton
              id="layers-toggle"
              label={t("imageryLayers")}
              onClick={() => setOverlay("imagery")}
            >
              <Layers className="size-5" />
            </HudButton>
            <HudButton
              id="pv-toggle"
              label={pv ? t("hidePVSystems") : t("showPVSystems")}
              active={!pv}
              onClick={() => setPv(!pv)}
            >
              {pv ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
            </HudButton>

            {!loupe && (
              <HudButton
                label={t("loupeHint")}
                id="loupe-toggle"
                onClick={() => setLoupe(true)}
              >
                <ScanSearch className="size-5" />
              </HudButton>
            )}
            <HudButton
              id="solo-toggle"
              label={t("fullScreenHideChrome")}
              onClick={() => setSolo(true)}
            >
              <Maximize2 className="size-5" />
            </HudButton>
          </div>
        </>
      )}

      {loupe && tab === "map" && !solo && (
        <Loupe onClose={() => setLoupe(false)} />
      )}

      {/* exit full screen: the single control left in solo mode */}
      {solo && (
        <button
          type="button"
          onClick={() => setSolo(false)}
          aria-label={t("exitFullScreen")}
          className="glass absolute right-4 top-[calc(var(--sat)+12px)] z-40 grid size-10 place-items-center rounded-full border border-border shadow-hud"
        >
          <Minimize2 className="size-5" />
        </button>
      )}

      {/* More — full-height surface with its own close control */}
      {tab === "more" && (
        <div className="absolute inset-x-0 bottom-0 top-[calc(var(--sat)+5rem)] z-30 overflow-y-auto rounded-t-[28px] bg-card px-5 pt-4 pb-[calc(var(--tab-bar-inner-height)+var(--sab)+1rem)] shadow-sheet">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">{t("tabMore")}</h1>
            <button
              type="button"
              onClick={() => setTab("map")}
              aria-label={t("closeMore")}
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
                <span className="block text-[15px] font-semibold">
                  {t("tourCardTitle")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("tourCardMeta")}
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
                  <span className="block text-[15px] font-semibold">
                    {t("installHomeScreen")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t("installHomeScreenMeta")}
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
              title={t("systemsCatalog")}
              meta={
                statsLoading || !datasetStats?.total
                  ? t("loadingCatalog")
                  : t("systemsAnnotatedMeta", {
                      total: datasetStats.total.toLocaleString("en-US").replace(",", " "),
                      annotated: datasetStats.annotated ?? 0,
                    })
              }
              onClick={() => setOverlay("systems")}
              trailing={<ListTree className="size-5" />}
            />
            <ListRow
              title={t("reviewAnnotations")}
              meta={
                unlocked
                  ? t("reviewAnnotationsMetaUnlocked")
                  : t("reviewAnnotationsMetaLocked", {
                      count: REVIEW_UNLOCK,
                      saved,
                    })
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
              title={t("imageryLayers")}
              meta="basemap.de · Land DOP · Maxar · OSM≤z14"
              onClick={() => setOverlay("imagery")}
              trailing={<Layers className="size-5" />}
            />
            <ListRow
              title={t("communitySnapshot")}
              meta={
                statsLoading
                  ? t("loadingCommunityStats")
                  : welcomeStats?.people != null &&
                      welcomeStats?.annotations != null
                    ? t("communitySnapshotMeta", {
                        people: welcomeStats.people,
                        points: welcomeStats.annotations,
                      })
                    : t("communityStatsUnavailable")
              }
              onClick={() => setWelcomeOpen(true)}
              trailing={<Sparkles className="size-5" />}
            />
            <ListRow
              title={t("whatIsThis")}
              meta={t("whatIsThisMeta")}
              onClick={() => setOverlay("whatisthis")}
              trailing={<HelpCircle className="size-5" />}
            />
            <ListRow
              title={t("infoContribution")}
              meta={t("infoContributionMeta", {
                saved,
                status: connectionLabel(connection),
              })}
              onClick={() => setOverlay("info")}
              trailing={<Info className="size-5" />}
            />
            <ListRow
              title={t("leaderboard")}
              meta={t("leaderboardMeta")}
              onClick={() => setOverlay("leaderboard")}
              trailing={<Trophy className="size-5" />}
            />
            <ListRow
              title={t("controlReference")}
              meta={t("controlReferenceMeta")}
              onClick={() => setOverlay("onboarding")}
              trailing={<HelpCircle className="size-5" />}
            />
            <ListRow
              title={t("exportGeojson")}
              meta={t("exportGeojsonMeta")}
              trailing={<Lock className="size-5 text-muted-foreground" />}
            />
            {bugReportUrl ? (
              <ListRow
                title={t("reportBug")}
                meta={t("reportBugMeta")}
                variant="destructive"
                onClick={reportBug}
                trailing={<Bug className="size-5" />}
              />
            ) : null}
            {contactMailto ? (
              <ListRow
                title={t("contactRemoval")}
                meta={t("contactRemovalMeta")}
                onClick={openContact}
                trailing={<HelpCircle className="size-5" />}
              />
            ) : null}
          </div>

          <div className="mt-4">
            <Preferences
              theme={theme}
              scheme={scheme}
              onTheme={setTheme}
              onScheme={setScheme}
            />
          </div>
        </div>
      )}

      {/* Action bar — map + annotate (tabs hide on annotate; bar drops to the bottom edge) */}
      {(tab === "map" || tab === "annotate") &&
        !solo &&
        !overlay &&
        !welcomeOpen &&
        !(installOpen && offerInstall) &&
        captchaPassed && (
          <div
            id="action-bar"
            className="fixed inset-x-4 z-40"
            style={{ bottom: barBottom }}
          >
            <div className="flex items-center gap-2 rounded-full border border-border bg-card p-1.5">
              <HudButton label={t("prevSystem")} onClick={() => stepSystem(-1)}>
                <ChevronLeft className="size-5" />
              </HudButton>
              {tab === "annotate" ? (
                <button
                  type="button"
                  onClick={() => setRecenterKey((k) => k + 1)}
                  className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-secondary px-3 py-2.5 text-sm font-semibold"
                >
                  <span className="truncate font-mono text-xs">
                    {selectedLabel || t("currentSystem")}
                    {selectedHa ? ` · ${selectedHa}` : ""}
                  </span>
                </button>
              ) : (
                <button
                  id="fab-guided-annotation"
                  type="button"
                  onClick={() => setOverlay("systems")}
                  aria-label={t("searchSystems")}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-secondary px-3 py-2.5 text-left"
                >
                  <Search className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-xs">
                    {t("goToIdSystems", { count: systems.length.toLocaleString() })}
                  </span>
                </button>
              )}
              <HudButton label={t("nextSystem")} onClick={() => stepSystem(1)}>
                <ChevronRight className="size-5" />
              </HudButton>
            </div>
          </div>
        )}

      {/* map mode: the engaging annotate button, right above the bar's ▶ */}
      {tab === "map" &&
        !solo &&
        !overlay &&
        !welcomeOpen &&
        !(installOpen && offerInstall) &&
        captchaPassed && (
          <div
            className="fixed inset-x-4 z-30 flex justify-end"
            style={{
              bottom: `calc(${barBottom} + var(--action-bar-height) + 0.75rem)`,
            }}
          >
            <button
              id="fab-sample-fence"
              type="button"
              onClick={() => enterAnnotate()}
              className="flex items-center gap-2 rounded-full bg-lime px-4 py-3 font-display text-[15px] font-bold text-lime-foreground tap-44"
            >
              <PenLine className="size-4" /> {t("annotateFab")}
            </button>
          </div>
        )}

      {/* Hide under welcome/install — translucent backdrop otherwise shows clipped tab labels as fuzzy green lines */}
      {!chromeless &&
        !welcomeOpen &&
        !(installOpen && offerInstall) &&
        captchaPassed && (
          <TabBar
            value={tab}
            onChange={(t) => {
              if (t === "more") openMore();
              else if (t === "annotate") enterAnnotate();
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
            setWelcomeOpen(false);
            setOverlay(null);
            setSolo(false);
            annotateAfterOnboardingRef.current = false;
            enterAnnotate();
          }}
        />
      )}

      {/* Greeting — what the community added while you were away */}
      {captchaPassed && welcomeOpen && (
        <WelcomeBack
          onClose={() => {
            markWelcomeSeen();
            setWelcomeOpen(false);
            if (offerInstall) setInstallOpen(true);
          }}
          onStart={() => {
            markWelcomeSeen();
            setWelcomeOpen(false);
            annotateAfterOnboardingRef.current = true;
            setOverlay("onboarding");
          }}
          stats={welcomeStats}
          loading={statsLoading}
          onOpenLeaderboard={() => {
            markWelcomeSeen();
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
        title={t("systems")}
      >
        <div className="sticky top-0 -mx-5 bg-card px-5 pb-3">
          <label className="flex items-center gap-2 rounded-full bg-secondary px-4 py-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={systemQuery}
              onChange={(e) => setSystemQuery(e.target.value)}
              autoFocus
              className="w-full bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
              placeholder={t("searchSystemsPlaceholder")}
              aria-label={t("searchSystemsPlaceholder")}
            />
          </label>
        </div>
        <div className="mb-4 rounded-2xl bg-secondary px-4 py-3">
          <StatusLegend id="systems-map-legend" />
        </div>
        {(() => {
          const q = systemQuery.trim().toLowerCase();
          // Default list: open systems first so annotate targets stay clear.
          const ranked = [...systems].sort((a, b) => {
            const ao = isOpenForAnnotate(a) ? 0 : 1;
            const bo = isOpenForAnnotate(b) ? 0 : 1;
            return ao - bo;
          });
          const filtered = !q
            ? ranked.filter((s) => isOpenForAnnotate(s)).slice(0, 80)
            : ranked
                .filter((s) => {
                  const meta = t(statusMetaKey(s.status));
                  const hay = `${s.id} ${s.status} ${meta}`.toLowerCase();
                  return hay.includes(q) || s.id === q.replace(/^#/, "");
                })
                .slice(0, 80);
          if (!filtered.length) {
            return (
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                {q
                  ? t("systemsNoMatch", { query: systemQuery.trim() })
                  : t("systemsNoOpen")}
              </p>
            );
          }
          return filtered.map((s) => (
            <ListRow
              key={s.id}
              title={`#${s.id}`}
              meta={t(statusMetaKey(s.status))}
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
        title={selectedLabel || (selected ? `PV-${selected}` : t("systemFallback"))}
      >
        <div className="space-y-4 pt-1">
          <div className="flex flex-wrap gap-2">
            {selectedHa ? <StatusPill>{selectedHa}</StatusPill> : null}
            {selectedSys ? (
              <StatusTag status={selectedSys.status} full />
            ) : null}
            <StatusPill tone="neutral">
              {t(statusMetaKey(selectedSys?.status ?? "open"))}
            </StatusPill>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {selectedSys
              ? selectedSys.status === "open"
                ? t("inspectOpenBody", { label: selectedLabel ?? "" })
                : t("inspectClosedBody", {
                    status: t(statusMetaKey(selectedSys.status)),
                  })
              : t("inspectNoSelection")}
          </p>
          {(!selectedSys || isOpenForAnnotate(selectedSys)) && (
            <button
              type="button"
              onClick={() => {
                setOverlay(null);
                enterAnnotate();
              }}
              className="h-12 w-full rounded-full bg-lime font-display text-[15px] font-bold text-lime-foreground"
            >
              {t("traceFenceline")}
            </button>
          )}
        </div>
      </Sheet>

      {/* Imagery — basemap.de default; OSM optional ≤z14; Land DOP + Maxar */}
      <Sheet
        open={overlay === "imagery"}
        onClose={() => setOverlay(null)}
        title={t("imageryLayers")}
      >
        <div className="space-y-3 pt-1">
          <ListRow
            title="basemap.de"
            meta={t("basemapMeta")}
            trailing={<StatusPill tone="neutral">{t("toggleOn")}</StatusPill>}
          />
          <ListRow
            title={t("maxarSatellite")}
            meta={imagery.maxar ? t("maxarOn") : t("maxarOff")}
            trailing={
              <TogglePill
                on={imagery.maxar}
                onClick={() => setMaxarEnabled(!imagery.maxar)}
              />
            }
          />
          <ListRow
            title={t("openStreetMap")}
            meta={imagery.osm ? t("osmOn") : t("osmOff")}
            trailing={
              <TogglePill
                on={imagery.osm}
                onClick={() => setOsmEnabled(!imagery.osm)}
              />
            }
          />
          <ListRow
            title={t("dopAllLaender")}
            meta={
              imagery.ready
                ? imagery.dopMaster
                  ? t("dopEnabledMeta", {
                      enabled: imagery.dops.filter((d) => d.enabled).length,
                      total: imagery.dops.length,
                    })
                  : t("dopAllOff")
                : t("loadingCatalog")
            }
            trailing={
              <TogglePill
                on={imagery.dopMaster}
                onClick={() => setDopMaster(!imagery.dopMaster)}
              />
            }
          />

          <p className="pt-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {t("landDopServices")}
          </p>
          <div className="space-y-1">
            {imagery.dops.map((dop) => {
              const showErr = dopErrorId === dop.id;
              return (
                <div
                  key={dop.id}
                  className="rounded-2xl bg-secondary/60 px-3 py-2.5"
                >
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
                          ? t("dopStatusError")
                          : dop.active
                            ? t("dopStatusActive")
                            : dop.enabled
                              ? t("dopStatusEnabled")
                              : t("dopStatusOff")
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {dop.label}
                      </p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {!dop.ok
                          ? t("dopStatusError")
                          : dop.active
                            ? t("dopActiveMeta", { zoom: dop.minzoom })
                            : dop.enabled
                              ? t("dopReadyMeta", { zoom: dop.minzoom })
                              : t("dopStatusOff")}
                      </p>
                    </div>
                    {!dop.ok && (
                      <button
                        type="button"
                        aria-label={t("dopErrorFor", { label: dop.label })}
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
                {imagery.ready ? t("dopCatalogEmpty") : t("loadingDopCatalog")}
              </p>
            )}
          </div>

          <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
            {t("imageryHelpBlurb")}
          </p>
        </div>
      </Sheet>

      {/* Info & contribution */}
      <Sheet
        open={overlay === "info"}
        onClose={() => setOverlay(null)}
        title={t("infoContribution")}
      >
        <div className="space-y-4 pt-1">
          <div className="rounded-2xl bg-secondary px-4 py-3">
            {selectedLabel ? (
              <>
                <p className="font-mono text-sm font-semibold">
                  {selectedLabel}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {[selectedHa, zoomLabel, imageryService]
                    .filter(Boolean)
                    .join(" · ")}
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
                connection === "loading" && "bg-warn animate-pulse",
                (connection === "offline" || connection === "pending") &&
                  "bg-destructive animate-pulse",
              )}
            />
            <p className="text-sm font-medium">
              {connection === "connected"
                ? t("synced")
                : connection === "loading"
                  ? t("checkingSupabase")
                  : connection === "pending"
                    ? t("uploadingLocalLeft", {
                        count: countPendingAnnotations(),
                      })
                    : t("offlineStatus")}
            </p>
          </div>
          <div className="rounded-2xl bg-secondary px-4 py-3 font-mono text-xs">
            <p className="text-muted-foreground">{t("yourFences")}</p>
            {savedReady ? (
              <p className="mt-1 text-sm font-semibold">{saved}</p>
            ) : (
              <Skeleton className="mt-1 h-5 w-8" />
            )}
          </div>
          <button
            type="button"
            onClick={() => setOverlay("overview")}
            className="h-11 w-full rounded-full bg-secondary text-sm font-semibold"
          >
            {t("datasetOverview")}
          </button>
          <div className="rounded-2xl bg-secondary px-4 py-4">
            <StatusLegend id="status-legend" />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("infoBlurb", { count: REVIEW_UNLOCK })}
          </p>
          {contactMailto ? (
            <button
              type="button"
              onClick={openContact}
              className="h-11 w-full rounded-full bg-secondary text-sm font-semibold"
            >
              {t("contactRemoveEmail")}
            </button>
          ) : null}
        </div>
      </Sheet>

      {/* Onboarding — every control on every screen, skippable at any point */}
      <Sheet
        id="onboarding-sheet"
        open={overlay === "onboarding"}
        onClose={() => {
          annotateAfterOnboardingRef.current = false;
          setOverlay(null);
        }}
        title={t("onboardingTitle")}
      >
        <div className="space-y-4 pt-1 pb-2">
          {ONBOARDING.map(([screen, items]) => (
            <div key={screen}>
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                {screen}
              </p>
              <div className="mt-2 space-y-1.5">
                {items.map(([icon, label, desc]) => (
                  <div
                    key={label}
                    className="flex gap-3 rounded-2xl bg-secondary px-3 py-2.5"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card font-mono text-[13px] font-bold">
                      {icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {label}
                      </span>
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
              {t("appearance")}
            </p>
            <div className="mt-2">
              <Preferences
                compact
                theme={theme}
                scheme={scheme}
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
            {t("onboardingShowTour")}
          </button>
          <button
            id="onboarding-skip-btn"
            type="button"
            onClick={() => finishOnboarding(true)}
            className="h-11 w-full rounded-full text-sm font-semibold text-muted-foreground"
          >
            {t("onboardingSkip")}
          </button>
        </div>
      </Sheet>

      {/* Overview — what we achieved and what the goal is */}
      <Sheet
        id="overview-sheet"
        open={overlay === "overview"}
        onClose={() => setOverlay(null)}
        title={t("overviewTitle")}
      >
        <Overview
          saved={saved}
          stats={datasetStats}
          loading={statsLoading}
          onClose={() => setOverlay(null)}
          onAnnotate={() => {
            setOverlay(null);
            enterAnnotate();
          }}
        />
      </Sheet>

      {/* Leaderboard — verified annotations only */}
      <Sheet
        id="leaderboard-sheet"
        elevated
        open={overlay === "leaderboard"}
        onClose={() => setOverlay(null)}
        title={t("leaderboard")}
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
        title={t("whatIsThis")}
      >
        <div className="space-y-4 pt-1">
          <p className="text-sm leading-relaxed text-card-foreground">
            {WHAT_IS_THIS}
          </p>
          <div className="rounded-2xl bg-secondary px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {t("contactSection")}
            </p>
            <p className="mt-1 text-sm">{t("contactBody")}</p>
            {contactMailto ? (
              <button
                type="button"
                onClick={openContact}
                className="mt-3 h-11 w-full rounded-full bg-lime font-display text-[14px] font-bold text-lime-foreground"
              >
                {t("emailMaintainer")}
              </button>
            ) : (
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                {t("contactNotConfigured")}
              </p>
            )}
          </div>
        </div>
      </Sheet>
    </main>
  );
}
