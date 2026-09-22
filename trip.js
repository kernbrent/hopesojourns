/* Destination content is managed in the private portal. */
import("/past-trips/stories-list.js?v=2026-09-22.2").then(() => import("/destinations-public.js?v=2026-09-22.2")).catch(() => {
  document.getElementById("trip-main").textContent = "This destination is temporarily unavailable. Please refresh.";
});
