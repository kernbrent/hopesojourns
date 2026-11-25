export const referralSources = {
  'friend-family': 'Friend or family',
  'church-ministry': 'Church or ministry',
  'previous-participant': 'Previous Hope Sojourns participant',
  'social-media': 'Social media',
  'online-search': 'Online search',
  'event-presentation': 'Event or presentation',
  other: 'Other',
} as const;

export function referralSourceLabel(value: unknown): string | null {
  return typeof value === 'string' && Object.hasOwn(referralSources, value)
    ? referralSources[value as keyof typeof referralSources] : null;
}

export function referralFields(row: {referral_source?: unknown; referral_detail?: unknown}) {
  return {referralSource: row.referral_source ?? null, referralSourceLabel: referralSourceLabel(row.referral_source), referralDetail: row.referral_detail ?? null};
}
