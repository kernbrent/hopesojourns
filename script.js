const calendarUrl = "https://calendly.com/brent-kern";
const donateUrl = "/giving/#donate";

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
        <a class="button" href="${calendarUrl}" target="_blank" rel="noopener">Book a conversation</a>
      </div>
    </nav>
  </header>`;

const footer = `
  <section class="cta-band">
    <div class="cta-inner">
      <div><h2>Where might hope lead you?</h2><p>Tell us what is stirring—joining a team, exploring an internship, or building a ministry partnership.</p></div>
      <a class="button light" href="${calendarUrl}" target="_blank" rel="noopener">Book a conversation</a>
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
          <a href="${calendarUrl}" target="_blank" rel="noopener">Schedule a meeting</a>
          <span>Christian Steps Ministries</span>
        </div>
      </div>
    </div>
    <div class="footer-bottom"><span>© <span id="year"></span> Hope Sojourns</span><span>Travel with purpose. Serve with humility.</span></div>
    <a class="developer-credit" href="https://careersteps.net/" aria-label="Visit Career Steps Consulting LLC">
      <img src="/assets/career-steps-logo.png" alt="" width="28" height="28">
      <span>Website developed and maintained by <strong>Career Steps Consulting LLC.</strong></span>
    </a>
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

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pageHero = document.querySelector(".hero, .page-hero");
const journeyPath = document.querySelector(".journey-path");
const revealSelector = [
  ".mission-band",
  "main > .section",
  ".value-card",
  ".trip-card",
  ".internship-callout",
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
  ".past-trip-grid",
  ".giving-options",
  ".commitment-grid",
  ".ministry-list",
  ".archive-gallery",
].join(", ");

if (!reduceMotion) {
  document.documentElement.classList.add("motion-enabled");
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
