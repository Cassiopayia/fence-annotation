import {
  AlertTriangle,
  Ban,
  Check,
  CheckCheck,
  Circle,
  Clock,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useI18n, type TranslationKey } from "@/i18n/context";
import { cn } from "@/lib/utils";

/**
 * One shared status language for a PV system / chip.
 *
 * Colour is never the only channel: every status also carries an icon and a
 * distinct fill treatment (hollow / hatched / solid), so the states stay
 * readable for red-green colour vision deficiency and in bright sunlight.
 */
export type SystemStatus =
  | "open"
  | "mine"
  | "awaiting"
  | "verified"
  | "flagged"
  | "excluded";

type StyleMeta = {
  icon: LucideIcon;
  /** css var holding the status hue */
  token: string;
  /** map fill treatment */
  fill: "none" | "hatch" | "solid";
  dash?: string;
};

const STATUS_I18N: Record<
  SystemStatus,
  { label: TranslationKey; short: TranslationKey; help: TranslationKey }
> = {
  open: {
    label: "statusOpen",
    short: "statusShortOpen",
    help: "statusHelpOpen",
  },
  mine: {
    label: "statusMine",
    short: "statusShortMine",
    help: "statusHelpMine",
  },
  awaiting: {
    label: "statusAwaiting",
    short: "statusShortAwaiting",
    help: "statusHelpAwaiting",
  },
  verified: {
    label: "statusVerified",
    short: "statusShortVerified",
    help: "statusHelpVerified",
  },
  flagged: {
    label: "statusFlagged",
    short: "statusShortFlagged",
    help: "statusHelpFlagged",
  },
  excluded: {
    label: "statusExcluded",
    short: "statusShortExcluded",
    help: "statusHelpExcluded",
  },
};

export const STATUS: Record<SystemStatus, StyleMeta> = {
  open: {
    icon: Circle,
    token: "--st-open",
    fill: "none",
    dash: "6 5",
  },
  mine: {
    icon: Clock,
    token: "--st-mine",
    fill: "hatch",
  },
  awaiting: {
    icon: Users,
    token: "--st-awaiting",
    fill: "hatch",
  },
  verified: {
    icon: CheckCheck,
    token: "--st-verified",
    fill: "solid",
  },
  flagged: {
    icon: AlertTriangle,
    token: "--st-flagged",
    fill: "hatch",
    dash: "3 3",
  },
  excluded: {
    icon: Ban,
    token: "--st-excluded",
    fill: "none",
    dash: "2 4",
  },
};

export const STATUS_ORDER: SystemStatus[] = [
  "open",
  "mine",
  "awaiting",
  "verified",
  "flagged",
  "excluded",
];

export function useStatusCopy(status: SystemStatus) {
  const { t } = useI18n();
  const keys = STATUS_I18N[status];
  return {
    label: t(keys.label),
    short: t(keys.short),
    help: t(keys.help),
  };
}

/** Small circular badge — icon + hue, sized for a list row. */
export function StatusDot({
  status,
  className,
  size = 22,
}: {
  status: SystemStatus;
  className?: string;
  size?: number;
}) {
  const m = STATUS[status];
  const Icon = status === "verified" ? Check : m.icon;
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        color: m.fill === "solid" ? "var(--background)" : `var(${m.token})`,
        borderColor: `var(${m.token})`,
        backgroundColor:
          m.fill === "solid"
            ? `var(${m.token})`
            : `color-mix(in oklab, var(${m.token}) 18%, transparent)`,
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border-2",
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={3} />
    </span>
  );
}

/** Pill with icon + words, for sheets and headers. */
export function StatusTag({
  status,
  full = false,
  className,
}: {
  status: SystemStatus;
  full?: boolean;
  className?: string;
}) {
  const m = STATUS[status];
  const copy = useStatusCopy(status);
  const Icon = m.icon;
  return (
    <span
      style={{
        color: `var(${m.token})`,
        borderColor: `color-mix(in oklab, var(${m.token}) 55%, transparent)`,
        backgroundColor: `color-mix(in oklab, var(${m.token}) 14%, transparent)`,
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide",
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={3} />
      {full ? copy.label : copy.short}
    </span>
  );
}

/** Map legend — explain every status colour / icon. */
export function StatusLegend({ id }: { id?: string }) {
  const { t } = useI18n();

  return (
    <div id={id}>
      <p className="mb-2.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {t("mapLegend")}
      </p>
      <ul className="space-y-2.5">
        {STATUS_ORDER.map((s) => {
          const keys = STATUS_I18N[s];
          return (
            <li key={s} className="flex items-start gap-3">
              <StatusDot status={s} className="mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">{t(keys.label)}</p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  {t(keys.help)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
