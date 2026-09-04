import { useEffect, useState } from "react";
import { Check, Crosshair, Eye, EyeOff, Frame, Maximize2, Undo2, Plus, X } from "lucide-react";
import { getDrawnGeometry } from "./map-canvas";
import { CyclePill, HudButton, InfoPill } from "./primitives";
import { cn } from "@/lib/utils";
import { DrawModule } from "@/lib/zaun/draw";
import { MapModule } from "@/lib/zaun/map";
import { listAnnotations, saveAnnotation } from "@/lib/zaun/public-api";
import { useMapHudInfo } from "@/hooks/use-map-hud-info";

const CONTEXT = ["Rural", "Urban", "Complex"];
const VISIBILITY = ["Clear", "Partial", "Occluded", "None"];
const NO_DRAW_REASONS = ["No fence visible", "Can't label"] as const;

function geometryReady(geometry: GeoJSON.Geometry | null | undefined): boolean {
  if (!geometry) return false;
  if (geometry.type === "LineString") return (geometry.coordinates?.length || 0) >= 2;
  if (geometry.type === "Polygon") return (geometry.coordinates?.[0]?.length || 0) >= 4;
  if (geometry.type === "MultiPolygon") return (geometry.coordinates?.[0]?.[0]?.length || 0) >= 4;
  return false;
}

/**
 * Guided annotation chrome on top of the shared MapCanvas.
 * Tap the map to place vertices; tap the first vertex again to close the ring.
 *
 * Lime tick → save PV-linked fence, then advance.
 * + → save Extra (no PV link), stay on this system.
 * Lime with nothing drawn → skip reasons → mark skipped and advance (no write of geometry).
 */
export function AnnotateView({
  onExit: _onExit,
  onSaved,
  onExtraSaved,
  onSkipped,
  onInfo,
  solo,
  onSolo,
  pv,
  onPv,
  bottomOffset,
  selected,
  onRecenter,
  connection = "loading",
  ha,
  systemLabel,
}: {
  onExit: () => void;
  onSaved: () => void;
  onExtraSaved?: () => void;
  onSkipped?: (reason: string) => void;
  onInfo: () => void;
  solo: boolean;
  onSolo: (v: boolean) => void;
  pv: boolean;
  onPv: (v: boolean) => void;
  bottomOffset: number;
  selected?: string;
  onRecenter: () => void;
  connection?: "connected" | "loading" | "offline";
  ha?: string;
  systemLabel?: string;
}) {
  const { zoomLabel, service } = useMapHudInfo();
  const [context, setContext] = useState(CONTEXT[0]!);
  const [visibility, setVisibility] = useState(VISIBILITY[0]!);
  const [drawn, setDrawn] = useState(false);
  const [aoi, setAoi] = useState(true);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [hint, setHint] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    // Ensure draw mode is armed every time this screen is shown (old guided flow).
    document.body.dataset.extraFence = "0";
    DrawModule.setActiveState("ANNOTATION");
    const t = window.setTimeout(() => DrawModule.setActiveState("ANNOTATION"), 200);
    const t2 = window.setTimeout(() => DrawModule.setActiveState("ANNOTATION"), 600);
    const hideHint = window.setTimeout(() => setHint(false), 5000);

    const tick = () => {
      const has = geometryReady(getDrawnGeometry());
      setDrawn(has);
      if (has) setHint(false);
    };
    const map = MapModule.getMap?.();
    map?.on("draw.create", tick);
    map?.on("draw.update", tick);
    map?.on("draw.delete", tick);
    map?.on("draw.modechange", tick);
    const id = window.setInterval(tick, 400);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
      window.clearTimeout(hideHint);
      map?.off("draw.create", tick);
      map?.off("draw.update", tick);
      map?.off("draw.delete", tick);
      map?.off("draw.modechange", tick);
      window.clearInterval(id);
      delete document.body.dataset.extraFence;
    };
  }, []);

  const rearmDraw = () => {
    document.body.dataset.extraFence = "0";
    DrawModule.setActiveState("ANNOTATION");
    window.setTimeout(() => DrawModule.setActiveState("ANNOTATION"), 100);
  };

  const refreshAnnotations = async () => {
    try {
      MapModule.setAnnotations(await listAnnotations());
    } catch (_) {}
  };

  const commit = () => {
    const geometry = getDrawnGeometry();
    if (!geometryReady(geometry)) {
      setReasonOpen(true);
      return;
    }
    setDrawn(true);
    setCommitting(true);
    setSaveError(null);
    void saveAnnotation({
      geometry: geometry!,
      properties: {
        area_id: selected,
        context,
        visibility,
        extra: "no",
        sample: false,
        link_systems: true,
      },
    })
      .then(async () => {
        DrawModule.clearAll();
        setDrawn(false);
        await refreshAnnotations();
        onSaved();
        rearmDraw();
      })
      .catch((err) => {
        console.error("[AnnotateView] save failed", err);
        setSaveError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setCommitting(false));
  };

  const saveExtra = () => {
    const geometry = getDrawnGeometry();
    if (!geometryReady(geometry)) {
      setHint(true);
      setSaveError("Draw a fence first, then tap + to save it as Extra (not linked to this PV).");
      return;
    }
    setCommitting(true);
    setSaveError(null);
    document.body.dataset.extraFence = "1";
    void saveAnnotation({
      geometry: geometry!,
      properties: {
        context,
        visibility,
        extra: "yes",
        sample: true,
        link_systems: false,
      },
    })
      .then(async () => {
        DrawModule.clearAll();
        setDrawn(false);
        await refreshAnnotations();
        // Extra stays on this system — do not advance.
        (onExtraSaved || onSaved)();
        rearmDraw();
      })
      .catch((err) => {
        console.error("[AnnotateView] extra save failed", err);
        setSaveError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setCommitting(false);
        document.body.dataset.extraFence = "0";
      });
  };

  const skipWithReason = (reason: string) => {
    setReasonOpen(false);
    DrawModule.clearAll();
    setDrawn(false);
    setSaveError(null);
    onSkipped?.(reason);
    rearmDraw();
  };

  return (
    <>
      {/* per-screen tool rail — the global (i) and progress ring live above it */}
      {!solo && (
        <div className="absolute right-4 top-[calc(max(6px,env(safe-area-inset-top))+56px)] z-30 flex flex-col items-end gap-2">
          <HudButton id="annotate-recenter" label="Recenter on this system" onClick={onRecenter}>
            <Crosshair className="size-5" />
          </HudButton>
          <HudButton id="annotate-chipframe" label="Export chip frame" active={aoi} onClick={() => setAoi(!aoi)}>
            <Frame className="size-5" />
          </HudButton>
          <HudButton
            id="annotate-undo"
            label="Undo last point"
            onClick={() => {
              DrawModule.deleteActiveOrSelectedFeature?.();
              setDrawn(geometryReady(getDrawnGeometry()));
            }}
          >
            <Undo2 className="size-5" />
          </HudButton>
          <HudButton
            id="pv-toggle-annotate"
            label={pv ? "Hide PV systems" : "Show PV systems"}
            active={!pv}
            onClick={() => onPv(!pv)}
          >
            {pv ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
          </HudButton>
          <HudButton label="Full screen — hide all chrome" onClick={() => onSolo(true)}>
            <Maximize2 className="size-5" />
          </HudButton>
        </div>
      )}

      {hint && !drawn && !solo && (
        <div className="pointer-events-none absolute inset-x-4 top-[calc(max(6px,env(safe-area-inset-top))+56px)] z-30 flex justify-center">
          <p className="max-w-[20rem] rounded-2xl border border-border bg-card px-3 py-2 text-center text-[12px] font-medium">
            Tap the map to place fence points. Tap the first point again to close the ring, then hit the lime tick.
            Use + for an Extra fence (not linked to this PV).
          </p>
        </div>
      )}

      {saveError && !solo && (
        <div className="absolute inset-x-4 top-[calc(max(6px,env(safe-area-inset-top))+56px)] z-40 flex justify-center">
          <p className="max-w-[22rem] rounded-2xl border border-destructive/40 bg-card px-3 py-2 text-center text-[12px] font-medium text-destructive">
            {saveError}
          </p>
        </div>
      )}

      {/* floating controls: tags appear with the drawn fence, actions stack bottom-right */}
      <div
        id="guided-panel"
        className="absolute inset-x-4 z-30 space-y-2"
        style={{ bottom: bottomOffset }}
      >
        {reasonOpen ? (
          <div className="glass space-y-2 rounded-3xl border border-border p-2 shadow-hud">
            <p className="px-2 pt-1 text-center text-[12px] font-medium text-muted-foreground">
              Skip this system without saving a fence?
            </p>
            {NO_DRAW_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => skipWithReason(r)}
                className="h-11 w-full rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
              >
                {r}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setReasonOpen(false)}
              className="h-11 w-full rounded-full text-sm font-semibold text-muted-foreground"
            >
              Go back
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            {drawn && !solo && (
              <div className="flex min-w-0 flex-col items-start gap-1.5">
                <CyclePill
                  id="tag-context"
                  label="context"
                  options={CONTEXT}
                  value={context}
                  onChange={setContext}
                  className="glass w-auto flex-none gap-1.5 border border-border px-2.5 py-1 shadow-hud"
                />
                <CyclePill
                  id="tag-visibility"
                  label="visibility"
                  options={VISIBILITY}
                  value={visibility}
                  onChange={setVisibility}
                  className="glass w-auto flex-none gap-1.5 border border-border px-2.5 py-1 shadow-hud"
                />
              </div>
            )}

            <div className="ml-auto flex shrink-0 flex-col items-end gap-2">
              <button
                id="guided-save-extra-btn"
                type="button"
                onClick={saveExtra}
                disabled={committing}
                aria-label="Save extra fence without PV link"
                className="glass grid size-11 place-items-center rounded-full border border-border shadow-hud disabled:opacity-50"
              >
                <Plus className="size-5" />
              </button>
              <div className="flex items-center gap-2">
                <button
                  id="guided-exit-btn"
                  type="button"
                  onClick={() => {
                    // Leave without writing — discard the in-progress outline.
                    DrawModule.clearAll();
                    setDrawn(false);
                    _onExit();
                  }}
                  aria-label="Leave annotation without saving"
                  className="glass grid size-11 place-items-center rounded-full border border-border text-destructive shadow-hud"
                >
                  <X className="size-5" />
                </button>
                <button
                  id="guided-save-btn"
                  type="button"
                  onClick={commit}
                  disabled={committing}
                  aria-label="Save fence and continue"
                  className={cn(
                    "grid size-11 place-items-center rounded-full bg-lime text-lime-foreground shadow-hud",
                    drawn && !committing && "animate-tick-wiggle",
                    committing && "animate-tick-commit",
                  )}
                >
                  <Check className="size-5" strokeWidth={3} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!solo && (
        <div className="absolute left-4 top-[max(6px,env(safe-area-inset-top))] z-50">
          <InfoPill
            id="annotate-info-btn"
            onClick={onInfo}
            ha={ha}
            systemLabel={systemLabel || (selected ? `PV-${selected}` : undefined)}
            zoom={zoomLabel}
            service={service}
            connection={connection}
          />
        </div>
      )}
    </>
  );
}
