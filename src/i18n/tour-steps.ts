import type { TourStep } from "@/components/proto/tour";
import type { Tab } from "@/components/proto/tab-bar";
import type { TranslationKey } from "./context";

type TourActions = {
  resetChrome: (next: Tab) => void;
  setLoupe: (open: boolean) => void;
};

type Translate = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

export function buildTourSteps(
  t: Translate,
  reviewUnlock: number,
  { resetChrome, setLoupe }: TourActions,
): TourStep[] {
  return [
    {
      title: t("tourTitle"),
      body: t("tourBody"),
      enter: () => {
        setLoupe(false);
        resetChrome("map");
      },
    },
    {
      screen: t("tourScreenGlobal"),
      target: "#status-info-btn",
      title: t("tourStepInfoPillTitle"),
      body: t("tourStepInfoPillBody"),
      enter: () => resetChrome("map"),
    },
    {
      screen: t("tourScreenGlobal"),
      target: "#contribution-ring",
      title: t("tourStepProgressTitle"),
      body: t("tourStepProgressBody", { count: reviewUnlock }),
      enter: () => resetChrome("map"),
    },
    {
      screen: t("tourScreenMap"),
      target: "#layers-toggle",
      title: t("tourStepLayersTitle"),
      body: t("tourStepLayersBody"),
      enter: () => resetChrome("map"),
    },
    {
      screen: t("tourScreenMap"),
      target: "#pv-toggle",
      title: t("tourStepPvTitle"),
      body: t("tourStepPvBody"),
      enter: () => resetChrome("map"),
    },
    {
      screen: t("tourScreenMap"),
      target: "#loupe-toggle",
      title: t("tourStepLoupeToggleTitle"),
      body: t("tourStepLoupeToggleBody"),
      enter: () => {
        resetChrome("map");
        setLoupe(false);
      },
    },
    {
      screen: t("tourScreenMap"),
      target: "#loupe",
      title: t("tourStepLoupeDragTitle"),
      body: t("tourStepLoupeDragBody"),
      enter: () => {
        resetChrome("map");
        setLoupe(true);
      },
    },
    {
      screen: t("tourScreenMap"),
      target: "#solo-toggle",
      title: t("tourStepSoloTitle"),
      body: t("tourStepSoloBody"),
      enter: () => {
        resetChrome("map");
        setLoupe(false);
      },
    },
    {
      screen: t("tourScreenGlobal"),
      target: "#action-bar",
      title: t("tourStepActionBarTitle"),
      body: t("tourStepActionBarBody"),
      enter: () => resetChrome("map"),
    },
    {
      screen: t("tourScreenMap"),
      target: "#fab-sample-fence",
      title: t("tourStepFabTitle"),
      body: t("tourStepFabBody"),
      enter: () => resetChrome("map"),
    },
    {
      screen: t("tourScreenGlobal"),
      target: "#mobile-tab-bar",
      title: t("tourStepTabsTitle"),
      body: t("tourStepTabsBody"),
      enter: () => resetChrome("map"),
    },
    {
      screen: t("tourScreenGlobalAnnotation"),
      target: "#tab-annotate",
      title: t("tourStepTapAnnotateTitle"),
      body: t("tourStepTapAnnotateBody"),
      awaitTap: true,
      tapHint: t("tourTapAnnotate"),
      enter: () => resetChrome("map"),
    },
    {
      screen: t("tourScreenAnnotation"),
      title: t("tourStepInAnnotateTitle"),
      body: t("tourStepInAnnotateBody"),
      enter: () => resetChrome("annotate"),
    },
    {
      screen: t("tourScreenAnnotation"),
      target: "#annotate-recenter",
      title: t("tourStepRecenterTitle"),
      body: t("tourStepRecenterBody"),
      enter: () => resetChrome("annotate"),
    },
    {
      screen: t("tourScreenAnnotation"),
      target: "#annotate-undo",
      title: t("tourStepUndoTitle"),
      body: t("tourStepUndoBody"),
      enter: () => resetChrome("annotate"),
    },
    {
      screen: t("tourScreenAnnotation"),
      target: "#tag-context",
      title: t("tourStepTagsTitle"),
      body: t("tourStepTagsBody"),
      enter: () => resetChrome("annotate"),
    },
    {
      screen: t("tourScreenAnnotation"),
      target: "#guided-save-btn",
      title: t("tourStepSaveTitle"),
      body: t("tourStepSaveBody"),
      enter: () => resetChrome("annotate"),
    },
    {
      screen: t("tourScreenAnnotation"),
      target: "#guided-exit-btn",
      title: t("tourStepExitTitle"),
      body: t("tourStepExitBody"),
      enter: () => resetChrome("annotate"),
    },
    {
      screen: t("tourScreenMore"),
      target: "#more-status",
      title: t("tourStepMoreTitle"),
      body: t("tourStepMoreBody"),
      enter: () => resetChrome("more"),
    },
    {
      screen: t("tourScreenReview"),
      title: t("tourStepReviewTitle"),
      body: t("tourStepReviewBody", { count: reviewUnlock }),
      enter: () => resetChrome("more"),
    },
  ];
}
