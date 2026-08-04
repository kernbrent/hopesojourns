const calendarUrl = "https://calendly.com/brent-kern";

const header = `
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <nav class="nav-wrap" aria-label="Main navigation">
      <a class="brand" href="/" aria-label="Hope Sojourns home">
        <img class="brand-icon" src="/assets/hope-sojourns-icon.png" alt="">
        <span class="brand-copy"><strong>Hope Sojourns</strong><small>Go with faith. Serve with hope.</small></span>
      </a>
      <button class="nav-toggle" aria-expanded="false" aria-controls="nav-links">Menu</button>
      <div class="nav-links" id="nav-links">
        <a href="/#trips">Trips</a>
        <a href="/past-trips/">Past trips</a>
        <a href="/internships/">Internships</a>
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
          <img src="/assets/hope-sojourns-logo.png" alt="Hope Sojourns — Go with faith. Serve with hope.">
        </a>
        <p>Purposeful journeys shaped around humility, local partnership, and practical Christian service.</p>
      </div>
      <div>
        <h3>Explore</h3>
        <div class="footer-links">
          <a href="/#trips">Mission trips</a>
          <a href="/past-trips/">Past trips</a>
          <a href="/internships/">Internships</a>
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
  </footer>`;

document.body.insertAdjacentHTML("afterbegin", header);
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
