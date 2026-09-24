import type { AdminEnv } from './admin';

type GiftRow = {
  id: string; transaction_date: string; charitable_amount: number;
  payment_type: string; budget_category: string; transaction_purpose: string;
  note: string | null; trip_title: string | null; thanks_sent_at: string | null;
};

export async function contactGiving(env: AdminEnv, personId: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find(value => value.type === type)!.value);
  const year = part('year'), month = part('month'), day = part('day');
  // Clamp February 29 to February 28 when the starting year is not a leap year.
  const startDay = Math.min(day, new Date(Date.UTC(year - 2, month, 0)).getUTCDate());
  const startDate = new Date(Date.UTC(year - 2, month - 1, startDay)).toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  const exclusiveEnd = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const gifts = await env.DB.prepare(`
    SELECT g.id, g.transaction_date, g.charitable_amount, g.payment_type,
           g.budget_category, g.transaction_purpose, g.note, t.title AS trip_title,
           (SELECT sent_at FROM gift_thanks WHERE entry_id=g.id AND status='sent' AND (person_id=g.person_id OR NOT EXISTS(SELECT 1 FROM donation_splits WHERE entry_id=g.id AND json_array_length(allocations_json)>0)) LIMIT 1) AS thanks_sent_at
    FROM donation_gifts g LEFT JOIN trips t ON t.id = g.trip_id
    WHERE g.person_id = ?1 AND g.transaction_date >= ?2 AND g.transaction_date < ?3
    ORDER BY g.transaction_date DESC, g.created_at DESC, g.id
  `).bind(personId, startDate, exclusiveEnd).all<GiftRow>();
  return {
    startDate, endDate,
    total: gifts.results.reduce((sum, gift) => sum + Math.round(gift.charitable_amount * 100), 0) / 100,
    gifts: gifts.results.map(gift => ({
      id: gift.id, personId, thanksSentAt:gift.thanks_sent_at, date: gift.transaction_date, amount: gift.charitable_amount,
      paymentMethod: gift.payment_type, category: gift.budget_category,
      purpose: gift.transaction_purpose, note: gift.note, tripTitle: gift.trip_title,
    })),
  };
}
