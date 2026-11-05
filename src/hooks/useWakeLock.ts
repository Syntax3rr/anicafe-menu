import { useEffect } from "react";

/**
 * Keeps the screen on while the app is visible, so station iPads and laptops don't dim or lock
 * mid-service. The browser drops the lock whenever the tab is hidden, so it's re-requested on
 * return. Browsers without the Screen Wake Lock API (iPadOS before 16.4) just skip it.
 */
export function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible" || (lock && !lock.released)) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) void sentinel.release();
        else lock = sentinel;
      } catch (error) {
        // e.g. low battery mode; nothing to do but let the screen sleep
        console.warn("Screen wake lock unavailable:", error);
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, []);
}
