// Each customer gets an isolated deployment/database. No tenant is selected by
// a browser-supplied ID. This config is intentionally separate from group logic.
export function siteConfig(env) {
  return {
    environment: env.ENVIRONMENT || 'local',
    organizationName: env.PORTAL_ORGANIZATION_NAME || 'Hope Sojourns',
    organizationTagline: env.PORTAL_ORGANIZATION_TAGLINE || 'Go with Hope. Serve with Faith.',
    logoPath: /^\/assets\/[a-z0-9.-]+$/i.test(env.PORTAL_LOGO_PATH || '') ? env.PORTAL_LOGO_PATH : '/assets/hope-sojourns-logo.png',
    communityName: env.PORTAL_COMMUNITY_NAME || 'Accountability & prayer',
    welcomeTitle: env.PORTAL_WELCOME_TITLE || 'Walk honestly. Grow together.',
    welcomeMessage: env.PORTAL_WELCOME_MESSAGE || 'A private place for our men’s accountability group and prayer partners to encourage one another, share prayer needs, and take the next faithful step.',
    allowMemberGroups: env.PORTAL_ALLOW_MEMBER_GROUPS !== 'false'
  };
}
