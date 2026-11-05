import { useEffect, useRef, useState } from "react";

/**
 * IDs that showed up after the list first loaded, each kept for `durationMs` so its card can
 * flash. IDs already seen never count as new again, so an undone "complete" doesn't flash.
 */
export function useNewIds(ids: string[] | null, durationMs = 10_000) {
  const seen = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());
  const key = ids?.join(",");
  // Each arrival gets its own timer, which must survive later arrivals, so only unmount clears them
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (ids === null) return;
    if (seen.current === null) {
      // First load: everything already on screen is old news
      seen.current = new Set(ids);
      return;
    }
    const fresh = ids.filter((id) => !seen.current!.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => seen.current!.add(id));
    setNewIds((prev) => new Set([...prev, ...fresh]));
    timers.current.push(
      setTimeout(() => setNewIds((prev) => new Set([...prev].filter((id) => !fresh.includes(id)))), durationMs),
    );
    // `key` captures the contents of `ids`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, durationMs]);

  return newIds;
}
