import { useState, useEffect } from "react";

export function usePullToRefresh(onRefresh: () => void, isBlocked: boolean) {
  const [pullProgress, setPullProgress] = useState(0);

  useEffect(() => {
    if (isBlocked) return;

    let startY = 0;
    let isTracking = false;

    const getScrollTop = () => window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (getScrollTop() <= 1) {
        startY = e.touches[0].clientY;
        isTracking = true;
      } else {
        isTracking = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTracking) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (diff > 0 && getScrollTop() <= 1) {
        const pullDist = Math.min(diff * 0.4, 75);
        setPullProgress(pullDist);
      } else {
        setPullProgress(0);
      }
    };

    const handleTouchEnd = () => {
      if (!isTracking) return;
      isTracking = false;
      setPullProgress((prev) => {
        if (prev >= 40) onRefresh();
        return 0;
      });
      startY = 0;
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onRefresh, isBlocked]);

  return { pullProgress };
}
