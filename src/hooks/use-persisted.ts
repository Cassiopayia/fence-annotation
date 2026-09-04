import { useEffect, useState } from "react";

/**
 * Local, cookie-free persistence for user preferences (localStorage).
 * Reads after mount so SSR markup and hydration stay identical.
 */
export function usePersisted<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore unreadable storage */
    }
  }, [key]);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore full/blocked storage */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
