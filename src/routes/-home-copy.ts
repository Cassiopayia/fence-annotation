import type { SystemStatus } from "@/components/proto/status";

/** Annotations needed before reviewing other contributors' work. */
export const REVIEW_UNLOCK = 10;

export const STATUS_META: Record<SystemStatus, string> = {
  open: "nobody has traced this yet",
  mine: "yours · awaiting confirmation",
  awaiting: "annotated by someone else · awaiting review",
  verified: "verified by 2",
  flagged: "flagged for a second look",
  excluded: "excluded from training",
};

/** Every control, grouped by the screen it lives on. */
export const ONBOARDING: [string, [string, string, string][]][] = [
  [
    "global — on every screen",
    [
      ["i", "Info pill", "Tap once for imagery (zoom + tile service), again for the selected system and its hectares, again for the full sheet."],
      ["◍", "Progress ring", "Your contribution count. Fills up and pops on every saved fence; unlocks review at 10."],
      ["⌕", "Action bar", "Fixed at the bottom: ◀ ▶ step through systems, the middle field searches or shows the current system."],
      ["▭", "Tabs", "Map · Annotate · More. Hidden during annotation and review for more map."],
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

export const WHAT_IS_THIS =
  "This Web-app was designed as a first step of my thesis to create a dataset large enough to train an Convulational Network on fences arround solar-systems in Germany. While i will not be able to ensure to review all data that may come in here and add it to my thesis for training (than I would have to discuss about inter rator reliability, I may use this app data to validate my models after training). Im yet not quite sure of the legality of this use case here, if you have any reccomendations on how to publish my own datasets that would be based on German dop20 data pls let me know. until then only a geojson of the annotations will be downloadable.";

/** Rough polygon area in hectares from a lon/lat ring (WGS84). */
export function ringAreaHa(ring: [number, number][]): string | undefined {
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
