import { useSyncExternalStore } from "react";

/** The stylesheet's wide layout: wide and tall enough. Under it, the phone's (a phone on its side too). */
export const WIDE = "(min-width: 641px) and (min-height: 501px)";

export const isWide = () => matchMedia(WIDE).matches;

/** Whether the wide layout is showing, kept up to date as the window changes. */
export function useWide(): boolean {
  return useSyncExternalStore((onChange) => {
    const q = matchMedia(WIDE);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, isWide);
}
