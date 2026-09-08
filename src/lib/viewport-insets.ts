/** Measure safe-area env() — returns 0 when unsupported or not yet applied. */
function measureSafeAreaInsets(): { top: number; bottom: number } {
  if (typeof document === "undefined") return { top: 0, bottom: 0 };
  const el = document.createElement("div");
  el.style.cssText =
    "position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none;";
  document.documentElement.appendChild(el);
  const s = getComputedStyle(el);
  const top = parseFloat(s.paddingTop) || 0;
  const bottom = parseFloat(s.paddingBottom) || 0;
  el.remove();
  return { top, bottom };
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari add-to-homescreen
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Publish --sat, --sab, --app-h on <html> for fixed chrome + full-screen shells. */
export function applyViewportInsets(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const standalone = isStandaloneDisplay();
  const measured = measureSafeAreaInsets();

  let sat = measured.top;
  let sab = measured.bottom;

  const vv = window.visualViewport;
  const innerH = window.innerHeight;

  if (standalone) {
    // env() is often 0 in installed PWAs even with viewport-fit=cover.
    if (sab < 12) sab = 34;
    if (sat < 12) sat = 47;
  } else if (vv) {
    // Mobile Safari: layout viewport extends under the bottom toolbar.
    const toolbar = Math.max(0, innerH - vv.height - vv.offsetTop);
    sab = Math.max(sab, toolbar);
  }

  const appH = standalone ? innerH : Math.round(vv?.height ?? innerH);

  root.style.setProperty("--sat", `${Math.round(sat)}px`);
  root.style.setProperty("--sab", `${Math.round(sab)}px`);
  root.style.setProperty("--app-h", `${appH}px`);
  root.dataset.displayMode = standalone ? "standalone" : "browser";
}

export function startViewportInsets(): () => void {
  const apply = () => applyViewportInsets();
  apply();
  window.addEventListener("resize", apply, { passive: true });
  window.addEventListener("orientationchange", apply, { passive: true });
  window.visualViewport?.addEventListener("resize", apply, { passive: true });
  window.visualViewport?.addEventListener("scroll", apply, { passive: true });
  return () => {
    window.removeEventListener("resize", apply);
    window.removeEventListener("orientationchange", apply);
    window.visualViewport?.removeEventListener("resize", apply);
    window.visualViewport?.removeEventListener("scroll", apply);
  };
}
