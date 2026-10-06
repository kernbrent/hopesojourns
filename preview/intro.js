// Production welcome animation, isolated for the story preview.
(() => {
const preference = matchMedia("(prefers-reduced-motion: reduce)");
const invitationIntro = document.querySelector("[data-invitation-intro]");
const introBrandTransition = document.querySelector("[data-intro-brand-transition]");
const headerBrandLogo = document.querySelector(".site-header .brand-logo");
const introReplayButton = document.querySelector("[data-intro-replay]");
const introLastSeenDateKey = invitationIntro?.dataset.introStorageKey || "hope-sojourns-home-intro-last-seen-date";

if (!preference.matches) {
document.documentElement.classList.add("motion-enabled");
  if (invitationIntro) {
    let invitationPlaying = false;
    let invitationTimer;
    const positionIntroBrandTransition = () => {
      if (!introBrandTransition || !headerBrandLogo) return;
      const introWidth = introBrandTransition.offsetWidth;
      const introHeight = introBrandTransition.offsetHeight;
      const headerBox = headerBrandLogo.getBoundingClientRect();
      if (!introWidth || !introHeight || !headerBox.width || !headerBox.height) return;

      const naturalWidth = headerBrandLogo.naturalWidth || 1308;
      const naturalHeight = headerBrandLogo.naturalHeight || 733;
      const containedScale = Math.min(headerBox.width / naturalWidth, headerBox.height / naturalHeight);
      const targetWidth = naturalWidth * containedScale;
      const targetHeight = naturalHeight * containedScale;
      const startX = Math.max(12, (window.innerWidth - introWidth) / 2);
      const startY = Math.max(18, Math.min(window.innerHeight * .05, 54));
      const endX = headerBox.left;
      const endY = headerBox.top + ((headerBox.height - targetHeight) / 2);

      introBrandTransition.style.setProperty("--intro-logo-start-x", `${startX}px`);
      introBrandTransition.style.setProperty("--intro-logo-start-y", `${startY}px`);
      introBrandTransition.style.setProperty("--intro-logo-end-x", `${endX}px`);
      introBrandTransition.style.setProperty("--intro-logo-end-y", `${endY}px`);
      introBrandTransition.style.setProperty("--intro-logo-end-scale", String(targetWidth / introWidth));
    };
    const localDateKey = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    const readLastSeenDate = () => {
      try {
        const storedDate = localStorage.getItem(introLastSeenDateKey);
        if (storedDate) return storedDate;
      } catch {
        // Fall through to session storage when local storage is unavailable.
      }
      try {
        return sessionStorage.getItem(introLastSeenDateKey);
      } catch {
        return null;
      }
    };
    const recordSeenDate = date => {
      try {
        localStorage.setItem(introLastSeenDateKey, date);
      } catch {
        // Session storage below preserves same-tab navigation behavior.
      }
      try {
        sessionStorage.setItem(introLastSeenDateKey, date);
      } catch {
        // The introduction can still play when browser storage is unavailable.
      }
    };
    const isPageReload = () => {
      const navigationEntry = performance.getEntriesByType?.("navigation")?.[0];
      if (navigationEntry) return navigationEntry.type === "reload";
      return performance.navigation?.type === 1;
    };
    const finishInvitation = () => {
      if (!invitationPlaying) return;
      invitationPlaying = false;
      window.clearTimeout(invitationTimer);
      invitationIntro.hidden = true;
      invitationIntro.classList.remove("is-playing", "is-dismissing");
      document.documentElement.classList.remove("invitation-playing");
      document.documentElement.classList.remove("intro-brand-transition-playing");
      introReplayButton?.removeAttribute("disabled");
      invitationIntro.removeEventListener("animationend", handleInvitationAnimationEnd);
      document.removeEventListener("pointerdown", dismissInvitation);
      document.removeEventListener("keydown", dismissInvitation);
    };
    const dismissInvitation = () => {
      if (!invitationPlaying) return;
      invitationIntro.classList.add("is-dismissing");
      window.setTimeout(finishInvitation, 250);
    };
    const handleInvitationAnimationEnd = event => {
      if (event.target === invitationIntro) finishInvitation();
    };
    const playInvitation = () => {
      if (invitationPlaying || preference.matches || document.body.classList.contains("motion-paused")) return;
      invitationPlaying = true;
      document.documentElement.classList.add("invitation-playing");
      if (introBrandTransition) document.documentElement.classList.add("intro-brand-transition-playing");
      introReplayButton?.setAttribute("disabled", "");
      invitationIntro.hidden = false;
      invitationIntro.classList.remove("is-playing", "is-dismissing");
      positionIntroBrandTransition();
      void invitationIntro.offsetWidth;
      invitationIntro.addEventListener("animationend", handleInvitationAnimationEnd);
      document.addEventListener("pointerdown", dismissInvitation, { once: true });
      document.addEventListener("keydown", dismissInvitation, { once: true });
      requestAnimationFrame(() => invitationIntro.classList.add("is-playing"));
      invitationTimer = window.setTimeout(finishInvitation, 5600);
    };

    const today = localDateKey();
    if ((!location.hash || location.hash === "#home") && (isPageReload() || readLastSeenDate() !== today)) {
      recordSeenDate(today);
      playInvitation();
    }
    introReplayButton?.addEventListener("click", playInvitation);
    headerBrandLogo?.addEventListener("load", () => {
      if (invitationPlaying) positionIntroBrandTransition();
    });
    window.addEventListener("resize", () => {
      if (invitationPlaying) positionIntroBrandTransition();
    });
    window.addEventListener("pageshow", () => {
      const currentDate = localDateKey();
      if (location.hash && location.hash !== "#home" || readLastSeenDate() === currentDate) return;
      recordSeenDate(currentDate);
      playInvitation();
    });
    window.addEventListener("pagehide", finishInvitation);
    window.addEventListener("hashchange", finishInvitation);
    preference.addEventListener("change", finishInvitation);
    document.querySelector(".motion-toggle")?.addEventListener("click", finishInvitation);
  }
}
})();
