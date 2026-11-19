import { useLayoutEffect, useState, type RefObject } from "react";

/** Give records the space below their controls; allow page scrolling on very short/zoomed screens. */
export function useTransactionListHeight(
  panelRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLElement | null>,
  mode: "page" | "dialog",
  enabled = true,
) {
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const list = listRef.current;
    if (!enabled || !panel || !list) return;
    const shell = panel.closest<HTMLElement>(".app-navigation-clearance");
    const measure = () => {
      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const listTop = list.getBoundingClientRect().top;
      let available: number;
      if (mode === "dialog") {
        const cardLimit = viewportHeight * (window.innerWidth >= 640 ? 0.85 : 0.92);
        available = cardLimit - (listTop - panel.getBoundingClientRect().top);
      } else {
        const clearance = shell ? (parseFloat(getComputedStyle(shell).paddingBottom) || 96) : 96;
        const cardPadding = list.parentElement ? (parseFloat(getComputedStyle(list.parentElement).paddingBottom) || 0) : 0;
        available = viewportHeight - (listTop + window.scrollY) - clearance - cardPadding;
      }
      // Keep records reachable when expanded filters or larger text exceed the viewport budget.
      setHeight(Math.max(160, Math.floor(available)));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(panel);
    if (panel.parentElement) observer?.observe(panel.parentElement);
    if (shell) observer?.observe(shell);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [enabled, mode, panelRef, listRef]);
  return height;
}
