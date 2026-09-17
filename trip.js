/* Destination content is managed in the private portal. */
import("/destinations-public.js?v=1").catch(() => {
  document.getElementById("trip-main").textContent = "This destination is temporarily unavailable. Please refresh.";
});
