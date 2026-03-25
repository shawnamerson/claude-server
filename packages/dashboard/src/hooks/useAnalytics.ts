import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Generate a stable visitor ID (persisted in localStorage)
function getVisitorId(): string {
  const key = "vs_vid";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function useAnalytics() {
  const location = useLocation();
  const lastPath = useRef("");

  useEffect(() => {
    const path = location.pathname;
    // Don't track the same page twice in a row
    if (path === lastPath.current) return;
    lastPath.current = path;

    // Don't track admin pages
    if (path.startsWith("/admin")) return;

    try {
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          referrer: document.referrer || "",
          visitorId: getVisitorId(),
        }),
      }).catch(() => {}); // Fire and forget
    } catch {}
  }, [location.pathname]);
}
