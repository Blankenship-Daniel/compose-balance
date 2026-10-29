import { useEffect, useRef } from "react";

/** Global shortcuts never steal native field/button interactions. */
export function useEditorKeys(actions: { togglePlay(): void; undo(): void; close(): void }) {
  const current = useRef(actions);
  current.current = actions;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") return current.current.close();
      const target = event.composedPath()[0];
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName))) return;
      const button = target instanceof Element && (target.closest("button") || target.closest('[role="button"]'));
      if (event.key === " " && !button) {
        event.preventDefault();
        current.current.togglePlay();
      } else if (event.key === "z" && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault();
        current.current.undo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
}
