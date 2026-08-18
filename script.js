const calendarUrl = "/schedule/";
const donateUrl = "/giving/#donate";
const siteVersion = "1.0.0";

const header = `
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <nav class="nav-wrap" aria-label="Main navigation">
      <a class="brand" href="/" aria-label="Hope Sojourns home">
        <img class="brand-logo" src="/assets/hope-sojourns-logo.png" alt="Hope Sojourns — Go with Hope. Serve with Faith.">
      </a>
      <button class="nav-toggle" aria-expanded="false" aria-controls="nav-links">Menu</button>
      <div class="nav-links" id="nav-links">
        <a href="/#trips">Trips</a>
        <a href="/past-trips/">Past trips</a>
        <a href="/internships/">Internships</a>
        <a href="/resources/">Resources</a>
        <a href="/giving/">Giving</a>
        <a href="/about/">About us</a>
        <a class="button" href="${calendarUrl}">Book a conversation</a>
      </div>
    </nav>
  </header>`;

const footer = `
  <section class="cta-band">
    <div class="cta-inner">
      <div><h2>Where might hope lead you?</h2><p>Tell us what is stirring—joining a team, exploring an internship, or building a ministry partnership.</p></div>
      <a class="button light" href="${calendarUrl}">Book a conversation</a>
    </div>
  </section>
  <footer class="site-footer">
    <div class="footer-grid">
      <div>
        <a class="footer-brand" href="/" aria-label="Hope Sojourns home">
          <img src="/assets/hope-sojourns-logo.png" alt="Hope Sojourns — Go with Hope. Serve with Faith.">
        </a>
        <p>Purposeful journeys shaped around humility, local partnership, and practical Christian service.</p>
      </div>
      <div>
        <h3>Explore</h3>
        <div class="footer-links">
          <a href="/#trips">Mission trips</a>
          <a href="/past-trips/">Past trips</a>
          <a href="/internships/">Internships</a>
          <a href="/resources/">Resources</a>
          <a href="/giving/">Giving</a>
          <a href="/about/">About us</a>
        </div>
      </div>
      <div>
        <h3>Connect</h3>
        <div class="footer-links">
          <a href="${calendarUrl}">Schedule a meeting</a>
          <span>Christian Steps Ministries</span>
        </div>
      </div>
    </div>
    <div class="footer-bottom">
      <span class="footer-copyright">© <span id="year"></span> Hope Sojourns</span>
      <a class="developer-credit" href="https://careersteps.net/" aria-label="Visit Career Steps Consulting LLC">
        <img src="/assets/career-steps-logo.png" alt="" width="28" height="28">
        <span>Website developed and maintained by <strong>Career Steps Consulting LLC.</strong></span>
      </a>
      <span class="footer-tagline">Travel with purpose. Serve with humility.</span>
    </div>
    <p class="site-version">Version ${siteVersion}</p>
  </footer>`;

document.body.insertAdjacentHTML("afterbegin", header);
document.body.insertAdjacentHTML("beforeend", `<a class="floating-donate" href="${donateUrl}" aria-label="View secure Hope Sojourns donation options">Donate now</a>`);
document.body.insertAdjacentHTML("beforeend", footer);
document.getElementById("year").textContent = new Date().getFullYear();

const toggle = document.querySelector(".nav-toggle");
const links = document.getElementById("nav-links");
toggle?.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!open));
  links.classList.toggle("open", !open);
});
links?.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
  toggle?.setAttribute("aria-expanded", "false");
  links.classList.remove("open");
}));

const approachTabs = [...document.querySelectorAll(".approach-tab")];
const approachTabsGroup = document.querySelector(".approach-tabs");
const approachPanels = [...document.querySelectorAll(".approach-panel")];
const approachDetailShell = document.getElementById("approach-detail-shell");
const approachCollapse = document.querySelector(".approach-collapse");
const alignApproachTiles = () => {
  if (!approachTabsGroup) return;
  requestAnimationFrame(() => {
    const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height || 0;
    const tilesTop = window.scrollY + approachTabsGroup.getBoundingClientRect().top;
    const targetTop = Math.max(0, tilesTop - headerHeight - 12);
    window.scrollTo({
      top: targetTop,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  });
};
const selectApproach = selectedTab => {
  approachTabs.forEach(tab => {
    const selected = tab === selectedTab;
    tab.setAttribute("aria-expanded", String(selected));
  });
  approachPanels.forEach(panel => {
    panel.hidden = panel.id !== selectedTab.getAttribute("aria-controls");
  });
  approachDetailShell?.classList.add("is-expanded");
  approachDetailShell?.setAttribute("aria-hidden", "false");
  approachDetailShell?.removeAttribute("inert");
  alignApproachTiles();
};
const collapseApproach = () => {
  approachTabs.forEach(tab => tab.setAttribute("aria-expanded", "false"));
  approachDetailShell?.classList.remove("is-expanded");
  approachDetailShell?.setAttribute("aria-hidden", "true");
  approachDetailShell?.setAttribute("inert", "");
};
approachTabs.forEach(tab => {
  tab.addEventListener("click", () => selectApproach(tab));
});
approachCollapse?.addEventListener("click", () => {
  const selectedTab = approachTabs.find(tab => tab.getAttribute("aria-expanded") === "true");
  collapseApproach();
  selectedTab?.focus();
});

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const invitationIntro = document.querySelector("[data-invitation-intro]");
const introReplayButton = document.querySelector("[data-intro-replay]");
const introLastSeenDateKey = invitationIntro?.dataset.introStorageKey || "hope-sojourns-home-intro-last-seen-date";
const pageHero = document.querySelector(".hero, .page-hero");
const journeyPath = document.querySelector(".journey-path");
const revealSelector = [
  ".mission-band",
  "main > .section:not(.resource-article-layout)",
  ".value-card",
  ".trip-card",
  ".internship-callout",
  ".internship-opportunity",
  ".opportunity-next-step",
  ".partner-strip",
  ".past-trip-card",
  ".track",
  ".ministry-item",
  ".info-card",
  ".giving-option",
  ".commitment",
  ".archive-photo",
  ".trip-facts",
  ".portrait",
  ".hosted-giving",
].join(", ");
const staggerSelector = [
  ".three-up",
  ".trip-grid",
  ".tracks",
  ".opportunity-grid",
  ".past-trip-grid",
  ".giving-options",
  ".commitment-grid",
  ".ministry-list",
  ".archive-gallery",
].join(", ");

if (!reduceMotion) {
  document.documentElement.classList.add("motion-enabled");

  if (invitationIntro) {
    let invitationPlaying = false;
    let invitationTimer;
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
      if (invitationPlaying) return;
      invitationPlaying = true;
      document.documentElement.classList.add("invitation-playing");
      introReplayButton?.setAttribute("disabled", "");
      invitationIntro.hidden = false;
      invitationIntro.classList.remove("is-playing", "is-dismissing");
      void invitationIntro.offsetWidth;
      invitationIntro.addEventListener("animationend", handleInvitationAnimationEnd);
      document.addEventListener("pointerdown", dismissInvitation, { once: true });
      document.addEventListener("keydown", dismissInvitation, { once: true });
      requestAnimationFrame(() => invitationIntro.classList.add("is-playing"));
      invitationTimer = window.setTimeout(finishInvitation, 5600);
    };

    const today = localDateKey();
    if (isPageReload() || readLastSeenDate() !== today) {
      recordSeenDate(today);
      playInvitation();
    }
    introReplayButton?.addEventListener("click", playInvitation);
    window.addEventListener("pageshow", () => {
      const currentDate = localDateKey();
      if (readLastSeenDate() === currentDate) return;
      recordSeenDate(currentDate);
      playInvitation();
    });
    window.addEventListener("pagehide", finishInvitation);
  }

  pageHero?.classList.add("hero-animate");

  const applyStagger = root => root.querySelectorAll(staggerSelector).forEach(group => {
    [...group.children].forEach((item, index) => {
      item.style.setProperty("--reveal-delay", `${Math.min(index * 85, 425)}ms`);
    });
  });

  let revealObserver;
  if ("IntersectionObserver" in window) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.12 });

  }

  const registerReveals = root => {
    if (root.matches?.(".hero, .page-hero")) root.classList.add("hero-animate");
    root.querySelectorAll?.(".hero, .page-hero").forEach(hero => hero.classList.add("hero-animate"));
    const candidates = [];
    if (root.matches?.(revealSelector)) candidates.push(root);
    candidates.push(...root.querySelectorAll?.(revealSelector) || []);
    candidates.forEach(element => {
      if (element.classList.contains("reveal-item")) return;
      element.classList.add("reveal-item");
      if (revealObserver) revealObserver.observe(element);
      else element.classList.add("is-visible");
    });
    applyStagger(root);
  };

  registerReveals(document);
  if (journeyPath) {
    journeyPath.classList.add("reveal-item");
    if (revealObserver) revealObserver.observe(journeyPath);
    else journeyPath.classList.add("is-visible");
  }

  const contentObserver = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) registerReveals(node);
    }));
  });
  contentObserver.observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
}

const photoViewerEnabled = document.body.hasAttribute("data-photo-viewer");

if (photoViewerEnabled) {
  const photoViewerMain = document.querySelector("main");

  document.body.insertAdjacentHTML("beforeend", `
    <div class="photo-lightbox" role="dialog" aria-modal="true" aria-label="Trip photo viewer" aria-hidden="true" hidden>
      <button type="button" class="photo-lightbox-close" aria-label="Close photo viewer">&times;</button>
      <div class="photo-lightbox-media">
        <img class="photo-lightbox-image" alt="">
      </div>
      <p class="photo-lightbox-caption"></p>
      <p class="photo-lightbox-position" aria-live="polite"></p>
      <div class="photo-lightbox-controls">
        <button type="button" class="photo-lightbox-button photo-lightbox-previous">&#9664; Previous</button>
        <button type="button" class="photo-lightbox-button photo-lightbox-next">Next &#9654;</button>
      </div>
    </div>`);

  const photoLightbox = document.querySelector(".photo-lightbox");
  const lightboxImage = photoLightbox.querySelector(".photo-lightbox-image");
  const lightboxCaption = photoLightbox.querySelector(".photo-lightbox-caption");
  const lightboxPosition = photoLightbox.querySelector(".photo-lightbox-position");
  const lightboxClose = photoLightbox.querySelector(".photo-lightbox-close");
  const lightboxPrevious = photoLightbox.querySelector(".photo-lightbox-previous");
  const lightboxNext = photoLightbox.querySelector(".photo-lightbox-next");
  let pagePhotos = [];
  let currentPhotoIndex = 0;
  let photoViewerReturnFocus = null;

  const visiblePagePhotos = () => [...photoViewerMain.querySelectorAll("img:not([data-photo-viewer-ignore])")]
    .filter(image => image.getClientRects().length > 0);

  const photoCaption = image => {
    const figureCaption = image.closest("figure")?.querySelector("figcaption");
    const figureLabel = figureCaption?.querySelector("strong")?.textContent?.trim();
    const figureDescription = figureCaption?.textContent
      ?.slice(figureLabel?.length || 0)
      .replace(/\s+/g, " ")
      .trim();
    const combinedCaption = [figureLabel, figureDescription].filter(Boolean).join(" — ");
    return combinedCaption || image.alt || "Trip photo";
  };

  const fullPhotoSource = image => {
    const linkedSource = image.closest("a")?.href;
    const isImageLink = linkedSource && /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i.test(linkedSource);
    return isImageLink ? linkedSource : (image.currentSrc || image.src);
  };

  const preparePhotoTriggers = () => {
    const photos = visiblePagePhotos();
    photos.forEach((image, index) => {
      const linkedTrigger = image.closest("a");
      const trigger = linkedTrigger && photoViewerMain.contains(linkedTrigger) ? linkedTrigger : image;
      trigger.dataset.photoViewerTrigger = "";
      trigger.classList.add("photo-viewer-trigger");
      trigger.setAttribute("aria-label", `Open photo ${index + 1} of ${photos.length}: ${photoCaption(image)}`);
      if (trigger === image) {
        trigger.setAttribute("role", "button");
        trigger.tabIndex = 0;
      }
    });
  };

  const updatePhotoLightbox = () => {
    const image = pagePhotos[currentPhotoIndex];
    const caption = photoCaption(image);
    lightboxImage.src = fullPhotoSource(image);
    lightboxImage.alt = caption;
    lightboxCaption.textContent = caption;
    lightboxPosition.textContent = `Photo ${currentPhotoIndex + 1} of ${pagePhotos.length}`;
    const singlePhoto = pagePhotos.length < 2;
    lightboxPrevious.disabled = singlePhoto;
    lightboxNext.disabled = singlePhoto;
  };

  const openPhotoLightbox = image => {
    pagePhotos = visiblePagePhotos();
    currentPhotoIndex = pagePhotos.indexOf(image);
    if (currentPhotoIndex < 0) return;
    photoViewerReturnFocus = image.closest("[data-photo-viewer-trigger]") || image;
    document.body.classList.add("photo-lightbox-open");
    photoLightbox.hidden = false;
    photoLightbox.setAttribute("aria-hidden", "false");
    updatePhotoLightbox();
    lightboxClose.focus();
  };

  const closePhotoLightbox = () => {
    document.body.classList.remove("photo-lightbox-open");
    photoLightbox.hidden = true;
    photoLightbox.setAttribute("aria-hidden", "true");
    lightboxImage.removeAttribute("src");
    photoViewerReturnFocus?.focus();
  };

  const showPreviousPhoto = () => {
    currentPhotoIndex = (currentPhotoIndex - 1 + pagePhotos.length) % pagePhotos.length;
    updatePhotoLightbox();
  };

  const showNextPhoto = () => {
    currentPhotoIndex = (currentPhotoIndex + 1) % pagePhotos.length;
    updatePhotoLightbox();
  };

  photoViewerMain.addEventListener("click", event => {
    const trigger = event.target.closest("[data-photo-viewer-trigger]");
    if (!trigger || !photoViewerMain.contains(trigger)) return;
    const image = trigger.matches("img") ? trigger : trigger.querySelector("img");
    if (!image) return;
    event.preventDefault();
    openPhotoLightbox(image);
  });

  photoViewerMain.addEventListener("keydown", event => {
    const trigger = event.target.closest("img[data-photo-viewer-trigger]");
    if (!trigger || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    openPhotoLightbox(trigger);
  });

  lightboxClose.addEventListener("click", closePhotoLightbox);
  lightboxPrevious.addEventListener("click", showPreviousPhoto);
  lightboxNext.addEventListener("click", showNextPhoto);
  photoLightbox.addEventListener("click", event => {
    if (event.target === photoLightbox) closePhotoLightbox();
  });

  document.addEventListener("keydown", event => {
    if (photoLightbox.hidden) return;
    if (event.key === "Escape") closePhotoLightbox();
    if (event.key === "ArrowLeft" && pagePhotos.length > 1) showPreviousPhoto();
    if (event.key === "ArrowRight" && pagePhotos.length > 1) showNextPhoto();
    if (event.key !== "Tab") return;

    const focusable = [...photoLightbox.querySelectorAll("button:not([disabled])")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  preparePhotoTriggers();
  const photoTriggerObserver = new MutationObserver(preparePhotoTriggers);
  photoTriggerObserver.observe(photoViewerMain, { childList: true, subtree: true });
}
