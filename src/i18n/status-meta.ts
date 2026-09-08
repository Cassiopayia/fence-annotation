import type { SystemStatus } from "@/components/proto/status";
import type { TranslationKey } from "./context";

const STATUS_META_KEYS: Record<SystemStatus, TranslationKey> = {
  open: "statusMetaOpen",
  mine: "statusMetaMine",
  awaiting: "statusMetaAwaiting",
  verified: "statusMetaVerified",
  flagged: "statusMetaFlagged",
  excluded: "statusMetaExcluded",
};

export function statusMetaKey(status: SystemStatus): TranslationKey {
  return STATUS_META_KEYS[status];
}
