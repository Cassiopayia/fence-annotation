import { Map, PenLine, LayoutGrid } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";

export type Tab = "map" | "annotate" | "more";

export function TabBar({
  value,
  onChange,
  badge,
}: {
  value: Tab;
  onChange: (t: Tab) => void;
  /** red notification bubble on the More tab (e.g. install / onboarding) */
  badge?: number;
}) {
  const { t } = useI18n();

  const TABS = [
    { id: "map" as Tab, label: t("tabMap"), Icon: Map },
    { id: "annotate" as Tab, label: t("tabAnnotate"), Icon: PenLine },
    { id: "more" as Tab, label: t("tabMore"), Icon: LayoutGrid },
  ];

  return (
    <nav
      id="mobile-tab-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card"
    >
      <ul className="grid h-[var(--tab-bar-inner-height)] grid-cols-3">
        {TABS.map(({ id, label, Icon }) => {
          const active = value === id;
          return (
            <li key={id}>
              <button
                id={`tab-${id}`}
                type="button"
                onClick={() => onChange(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex w-full flex-col items-center gap-1 px-2 pt-2 pb-1.5 tap-44",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon
                  className={cn("size-6", active && "text-lime-foreground")}
                  strokeWidth={active ? 2.4 : 1.8}
                />
                {id === "more" && badge ? (
                  <span className="absolute top-1 right-[calc(50%-22px)] grid min-w-4 place-items-center rounded-full bg-destructive px-1 font-mono text-[10px] font-bold text-destructive-foreground">
                    {badge}
                  </span>
                ) : null}
                <span className="text-[11px] font-semibold tracking-wide">
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div
        aria-hidden
        className="bg-card"
        style={{ height: "env(safe-area-inset-bottom, 0px)" }}
      />
    </nav>
  );
}
