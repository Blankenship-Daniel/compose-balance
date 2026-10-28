/** The stylesheet's wide layout: wide and tall enough. Under it, the phone's (a phone on its side too). */
export const WIDE = "(min-width: 641px) and (min-height: 501px)";

export const isWide = () => matchMedia(WIDE).matches;
