import { useCallback, useEffect, useRef, useState } from "react";

/**
 * IDs that joined `ids` after it first loaded, so their cards can flash. Each flashes until
 * `dismiss(id)` is called (e.g. when someone touches the card) or, if `durationMs` is set, until
 * that time is up. Anything already showing on first load is old news.
 *
 * An ID only flashes once, so e.g. an order brought back with Undo doesn't flash again. To let
 * one flash again, list it in `resetIds`: an order that was ready and then had a box unticked
 * should flash when it's ready again.
 */
export function useFlashIds(
  ids: string[] | null,
  { durationMs = null as number | null, resetIds = [] as string[] } = {},
) {
  const seen = useRef<Set<string> | null>(null);
  const [flashIds, setFlashIds] = useState<ReadonlySet<string>>(new Set());
  const key = ids?.join(",");
  const resetKey = resetIds.join(",");
  // Each flash gets its own timer, which must survive later flashes, so only unmount clears them
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (ids === null) return;
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    resetIds.forEach((id) => seen.current!.delete(id));
    const fresh = ids.filter((id) => !seen.current!.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => seen.current!.add(id));
    setFlashIds((prev) => new Set([...prev, ...fresh]));
    if (durationMs !== null) {
      timers.current.push(
        setTimeout(() => setFlashIds((prev) => new Set([...prev].filter((id) => !fresh.includes(id)))), durationMs),
      );
    }
    // `key` and `resetKey` capture the contents of the arrays
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, resetKey, durationMs]);

  const dismiss = useCallback(
    (id: string) => setFlashIds((prev) => (prev.has(id) ? new Set([...prev].filter((x) => x !== id)) : prev)),
    [],
  );

  return { flashIds, dismiss };
}
