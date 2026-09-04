/** Update a rail-button caption without wiping the icon markup. */
export function setAnnotationToolCaption(btn: HTMLElement | null, caption: string): void {
  if (!btn) return;
  const el = btn.querySelector('.annotation-tool-caption');
  if (el) {
    el.textContent = caption;
    return;
  }
  btn.textContent = caption;
}
