const tripData = {
  athens: {
    title: "Athens, Greece",
    eyebrow: "Presence among the crossroads",
    image: "/assets/athens.jpg",
    alt: "Panoramic view of Athens and the Acropolis",
    intro: "Athens is a city of ancient beauty and present-day complexity—a crossroads for residents, refugees, travelers, and people rebuilding their lives.",
    partners: [
      ["New Start Ministries", "Supporting practical next steps and renewed hope."],
      ["Athens Homeless Walks Ministries", "Meeting neighbors on the street with dignity, consistency, and care."],
      ["Glocal Cafe", "Creating hospitality and connection across cultures."],
      ["Additional local ministries", "Serving people experiencing homelessness, refugees, and survivors of human trafficking."]
    ],
    service: "Teams may support outreach walks, hospitality, meal or supply distribution, children and family activities, prayer, facilities projects, and other needs identified by local leaders.",
    focus: "Homelessness, refugee care & anti-trafficking support",
    setting: "Urban ministry",
    note: "Specific activities and ministry partners will be confirmed before registration opens."
  },
  kenya: {
    title: "Kenya",
    eyebrow: "Safety, education & a future",
    image: "/assets/kenya.jpg",
    alt: "Students in Kenya gathered outdoors",
    intro: "This developing journey is centered on encouragement, education, and practical support for girls building lives of safety and possibility.",
    partners: [["The Jerri Savuto Home for Girls", "A place of safety and opportunity for girls affected by harmful practices and early marriage."]],
    service: "Potential team roles may include educational activities, mentoring support, creative programs, facilities projects, staff encouragement, and supplies requested by the home’s leadership.",
    focus: "Girls’ safety, education & encouragement",
    setting: "Residential and community ministry",
    note: "Images are representative of education in Kenya and do not depict residents of the Jerri Savuto Home."
  },
  belize: {
    title: "Belize",
    eyebrow: "Rooted in the rainforest",
    image: "/assets/belize.jpg",
    alt: "A lush river through the Belize rainforest",
    intro: "Beyond the coastline, Belize’s rainforest communities are places of remarkable beauty, deep relationship, and practical ministry opportunity.",
    partners: [["Andy Ministries", "Serving people and communities in the Belizean rainforest through long-term local relationships."]],
    service: "Teams may assist with community projects, children’s activities, ministry programs, facilities work, hospitality, and other priorities shaped by Andy Ministries.",
    focus: "Community partnership & practical service",
    setting: "Rainforest communities",
    note: "Trip scope, accommodations, travel requirements, and service activities are still in development."
  },
  nice: {
    title: "Nice, France",
    eyebrow: "Joyful ministry on the Riviera",
    image: "/assets/nice.jpg",
    alt: "The Mediterranean waterfront and city of Nice, France",
    intro: "Nice is known for its beauty, but every community also needs belonging, encouragement, and spaces where children can encounter faith with joy.",
    partners: [["International VBS Ministries", "Helping churches and communities create engaging, culturally thoughtful Bible experiences for children."]],
    service: "Team members may help prepare and lead children’s activities, music, crafts, games, storytelling, logistics, hospitality, and support for local volunteers.",
    focus: "Children, families & Vacation Bible School",
    setting: "Urban and church ministry",
    note: "Program themes, language needs, and final ministry locations will be confirmed with the host ministry."
  },
  arkansas: {
    title: "Shephard of the Ozarks",
    eyebrow: "Serve close to home",
    image: "/assets/arkansas.jpg",
    alt: "The Buffalo River in the Arkansas Ozarks",
    intro: "The Arkansas Ozarks offer a meaningful domestic mission setting where camp ministry and community service come together.",
    partners: [
      ["Shephard of the Ozarks Camp", "Supporting a place for faith, rest, formation, and outdoor community."],
      ["City of Marshall, Arkansas", "Responding to practical community priorities through respectful local partnership."]
    ],
    service: "Potential work may include camp preparation, maintenance and beautification, children or youth programming, community projects, event support, and encouragement for local leaders.",
    focus: "Camp ministry & community service",
    setting: "Rural Arkansas",
    note: "Project assignments will be based on current camp and community needs."
  },
  "mexico-city": {
    title: "Mexico City, Mexico",
    eyebrow: "A joint journey of practical care",
    image: "/assets/mexico-city.jpg",
    alt: "Palacio de Bellas Artes and the Mexico City skyline",
    intro: "In 2027, Hope Sojourns is developing a joint trip with Metro Relief of Dallas to support a sister ministry serving people experiencing homelessness in Mexico City.",
    partners: [
      ["Metro Relief of Dallas", "Helping coordinate the joint team and connect Hope Sojourns with a sister ministry in Mexico City."],
      ["Sister ministry in Mexico City", "Serving neighbors experiencing homelessness through trusted, ongoing local relationships."]
    ],
    service: "Team members may support street outreach, meal or supply distribution, prayer, listening, conversation, and other practical needs identified by local ministry leaders.",
    focus: "Homeless ministry",
    setting: "Urban ministry",
    teamSize: "10–15 people",
    note: "Dates, costs, host-ministry details, travel requirements, and final team roles will be confirmed before registration opens.",
    credit: "<a href=\"https://commons.wikimedia.org/wiki/File:Mexico_City_Palacio_de_bellas_artes.jpg\" target=\"_blank\" rel=\"noopener noreferrer\">Photo by Jeses via Wikimedia Commons</a>, used under <a href=\"https://creativecommons.org/licenses/by-sa/2.5/\" target=\"_blank\" rel=\"noopener noreferrer\">CC BY-SA 2.5</a>; cropped for display."
  },
  others: {
    title: "Other Journeys",
    eyebrow: "The next place of service",
    image: "/assets/athens.jpg",
    alt: "A wide city view representing future Hope Sojourns destinations",
    intro: "Hope Sojourns is continuing to listen for trustworthy partners and meaningful places where a prepared team can serve well.",
    partners: [["Developing partnerships", "Future journeys will be built around local invitation, responsible leadership, and clearly defined needs."]],
    service: "Possible destinations and service areas will be announced as relationships develop. We welcome conversations with churches, ministries, schools, and community organizations.",
    focus: "New mission partnerships",
    setting: "Domestic and international",
    note: "Have a ministry partnership in mind? Book a conversation and tell us about it."
  }
};

const slug = document.body.dataset.trip;
const trip = tripData[slug];
if (trip) {
  document.title = `${trip.title} | Hope Sojourns`;
  document.getElementById("trip-main").innerHTML = `
    <section class="page-hero">
      <img src="${trip.image}" alt="${trip.alt}">
      <div class="hero-content"><p class="eyebrow">${trip.eyebrow}</p><h1>${trip.title}</h1><p>${trip.intro}</p></div>
    </section>
    ${trip.credit ? `<p class="image-credit">${trip.credit}</p>` : ""}
    <section class="section content-grid">
      <div class="prose">
        <p class="eyebrow">The opportunity</p>
        <h2>Come ready to listen, learn, and help.</h2>
        <p>${trip.intro}</p>
        <div class="ministry-list">
          ${trip.partners.map(([name, text]) => `<article class="ministry-item"><h3>${name}</h3><p>${text}</p></article>`).join("")}
        </div>
        <h2>How a team may serve</h2>
        <p>${trip.service}</p>
        <p class="notice"><strong>Developing opportunity:</strong> ${trip.note}</p>
      </div>
      <aside>
        <div class="info-card">
          <h3>Journey at a glance</h3>
          <dl><dt>Primary focus</dt><dd>${trip.focus}</dd><dt>Setting</dt><dd>${trip.setting}</dd>${trip.teamSize ? `<dt>Target team</dt><dd>${trip.teamSize}</dd>` : ""}<dt>Status</dt><dd>Interest conversations open</dd></dl>
          <a class="button" href="https://calendly.com/brent-kern" target="_blank" rel="noopener">Talk about this trip</a>
        </div>
      </aside>
    </section>`;
}
