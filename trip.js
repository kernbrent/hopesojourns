/* Destination content is managed in the private portal. */
import("/past-trips/stories-list.js?v=2026-10-09.5").then(() => import("/destinations-public.js?v=2026-11-23.seo1")).catch(() => {
  const main = document.getElementById("trip-main");
  if (!main || main.querySelector("h1")) return;
  main.textContent = "This destination is temporarily unavailable. Please refresh.";
});
