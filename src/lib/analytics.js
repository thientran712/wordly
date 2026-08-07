// Thin wrapper around GA4's gtag.js. Every call is a safe no-op when analytics
// isn't configured (no NEXT_PUBLIC_GA_MEASUREMENT_ID) or when running on the
// server / before gtag.js has loaded, so callers never need to guard.
export function trackEvent(name, params = {}) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
