-- Reviewed host briefing received November 16, 2026. Source: docs/content/trip-releases/mexico-january-2027-host-briefing.json.

-- Content-only correction, applied independently in each environment. Preserve credentials, visibility settings, finances, packing lists, devotionals, and other trips.

UPDATE destinations SET dates_text='Multiple journeys · See individual departures for dates and availability.', summary='Serve alongside God’s Kitchen through city outreach and practical projects at Rancho Alfa y Omega. Explore real lodging, service, and transport photos. Estimated cost: $1,500 per traveler, subject to confirmation.', introduction='Join Hope Sojourns in cooperation with Metro Relief and the local ministry led by Moises. God’s Kitchen combines meals, practical care, and consistent personal relationships with pathways toward support. Rancho Alfa y Omega provides a base for host-directed service; each Mexico City journey has its own proposed schedule and arrangements.', service='Mexico City journeys may include city outreach, ranch projects, a rehabilitation-center visit, shared meals, reflection, and optional cultural time. Every itinerary is proposed and may change before and during the journey. See each departure’s public page and Traveler Portal for its own schedule and updates.', notes='The $1,500 per traveler figure remains a planning estimate. Allow an additional $100–$200 for optional sightseeing, as recommended by the host. Confirm final flights, room and bed assignments, bedding, vehicle capacity, insurance, inclusions, payment terms, cancellations, and refunds before committing.', image_url='/assets/mexico-host-2026/outreach-meal-service.webp', image_alt='Volunteers prepare a meal-service station in a Mexico City public square', image_credit='', image_key=NULL, image_type=NULL, revision=revision+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug='mexico-city' AND (dates_text <> 'Multiple journeys · See individual departures for dates and availability.' OR summary <> 'Serve alongside God’s Kitchen through city outreach and practical projects at Rancho Alfa y Omega. Explore real lodging, service, and transport photos. Estimated cost: $1,500 per traveler, subject to confirmation.' OR introduction <> 'Join Hope Sojourns in cooperation with Metro Relief and the local ministry led by Moises. God’s Kitchen combines meals, practical care, and consistent personal relationships with pathways toward support. Rancho Alfa y Omega provides a base for host-directed service; each Mexico City journey has its own proposed schedule and arrangements.' OR service <> 'Mexico City journeys may include city outreach, ranch projects, a rehabilitation-center visit, shared meals, reflection, and optional cultural time. Every itinerary is proposed and may change before and during the journey. See each departure’s public page and Traveler Portal for its own schedule and updates.' OR notes <> 'The $1,500 per traveler figure remains a planning estimate. Allow an additional $100–$200 for optional sightseeing, as recommended by the host. Confirm final flights, room and bed assignments, bedding, vehicle capacity, insurance, inclusions, payment terms, cancellations, and refunds before committing.' OR image_url <> '/assets/mexico-host-2026/outreach-meal-service.webp' OR image_alt <> 'Volunteers prepare a meal-service station in a Mexico City public square' OR image_credit <> '' OR image_key IS NOT NULL);

UPDATE trips SET public_summary='January 9–14, 2027: serve alongside God’s Kitchen in Mexico City and contribute to host-directed projects at Rancho Alfa y Omega, with shared meals, cultural learning, and reflection.', public_description='Travel with Hope Sojourns in cooperation with Metro Relief and the local ministry led by Moises. The host’s working plan places street outreach on Sunday and Wednesday and ranch service on Monday and Tuesday. A rehabilitation-center visit, a campfire, and optional cultural time provide further opportunities to learn and reflect. This itinerary is proposed. Activities, times, visits, transportation, and sightseeing may change before and during the journey according to host priorities, weather, local conditions, and flight arrangements. Your leader will share updates.

Our preparation also includes Metro Relief service in Dallas–Fort Worth; the trip leader will confirm those arrangements before departure. Read the daily itinerary for current Mexico City times and the God’s Kitchen briefing for the ministry’s purpose and approach.', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id IN (SELECT id FROM trips WHERE slug='mexico-january-2027-8385c082' AND start_date='2027-01-09' AND end_date='2027-01-14' AND location='Mexico City, Mexico') AND (COALESCE(public_summary,'')<>'January 9–14, 2027: serve alongside God’s Kitchen in Mexico City and contribute to host-directed projects at Rancho Alfa y Omega, with shared meals, cultural learning, and reflection.' OR COALESCE(public_description,'')<>'Travel with Hope Sojourns in cooperation with Metro Relief and the local ministry led by Moises. The host’s working plan places street outreach on Sunday and Wednesday and ranch service on Monday and Tuesday. A rehabilitation-center visit, a campfire, and optional cultural time provide further opportunities to learn and reflect. This itinerary is proposed. Activities, times, visits, transportation, and sightseeing may change before and during the journey according to host priorities, weather, local conditions, and flight arrangements. Your leader will share updates.

Our preparation also includes Metro Relief service in Dallas–Fort Worth; the trip leader will confirm those arrangements before departure. Read the daily itinerary for current Mexico City times and the God’s Kitchen briefing for the ministry’s purpose and approach.');

UPDATE trip_content SET title='Day 1 · Arrive in Mexico City', content='PROPOSED ITINERARY — subject to change before and during the journey. Activities and times may change with host priorities, weather, transportation, and local conditions. Your leader will share updates. All times are local to Mexico City.

An evening arrival, a welcome from our hosts, and settling in at Rancho Alfa y Omega.

• 21:00 — Planned arrival at Mexico City Airport.
• 23:00 — Arrive at Rancho Alfa y Omega, drop off luggage, and settle into the lodging.

Arrival times are the host’s working plan and must agree with the final flight booking.', event_date='2027-01-09', visibility='public', publication_status='published', itinerary_category='daily', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='0d061718-59f9-48a8-9c33-da98bd5d03cb' AND trip_id IN (SELECT id FROM trips WHERE slug='mexico-january-2027-8385c082' AND start_date='2027-01-09' AND end_date='2027-01-14' AND location='Mexico City, Mexico') AND content_type='itinerary' AND (COALESCE(title,'')<>'Day 1 · Arrive in Mexico City' OR COALESCE(content,'')<>'PROPOSED ITINERARY — subject to change before and during the journey. Activities and times may change with host priorities, weather, transportation, and local conditions. Your leader will share updates. All times are local to Mexico City.

An evening arrival, a welcome from our hosts, and settling in at Rancho Alfa y Omega.

• 21:00 — Planned arrival at Mexico City Airport.
• 23:00 — Arrive at Rancho Alfa y Omega, drop off luggage, and settle into the lodging.

Arrival times are the host’s working plan and must agree with the final flight booking.' OR COALESCE(event_date,'')<>'2027-01-09' OR COALESCE(visibility,'')<>'public' OR COALESCE(publication_status,'')<>'published' OR COALESCE(itinerary_category,'')<>'daily');

UPDATE trip_content SET title='Day 2 · Outreach and the city', content='PROPOSED ITINERARY — subject to change before and during the journey. Activities and times may change with host priorities, weather, transportation, and local conditions. Your leader will share updates. All times are local to Mexico City.

Prepare together, join the local outreach team, and begin to know Mexico City.

• 07:00–08:00 — Breakfast.
• 08:00–09:00 — Prepare outreach supplies.
• 09:00–13:00 — Outreach activity in Mexico City.
• 13:00–14:00 — Lunch at Toño’s place.
• 14:00–18:00 — Mexico City tour.
• 18:00 — Return to the ranch.', event_date='2027-01-10', visibility='public', publication_status='published', itinerary_category='daily', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='94da964d-07d0-498c-bad0-a39153f86191' AND trip_id IN (SELECT id FROM trips WHERE slug='mexico-january-2027-8385c082' AND start_date='2027-01-09' AND end_date='2027-01-14' AND location='Mexico City, Mexico') AND content_type='itinerary' AND (COALESCE(title,'')<>'Day 2 · Outreach and the city' OR COALESCE(content,'')<>'PROPOSED ITINERARY — subject to change before and during the journey. Activities and times may change with host priorities, weather, transportation, and local conditions. Your leader will share updates. All times are local to Mexico City.

Prepare together, join the local outreach team, and begin to know Mexico City.

• 07:00–08:00 — Breakfast.
• 08:00–09:00 — Prepare outreach supplies.
• 09:00–13:00 — Outreach activity in Mexico City.
• 13:00–14:00 — Lunch at Toño’s place.
• 14:00–18:00 — Mexico City tour.
• 18:00 — Return to the ranch.' OR COALESCE(event_date,'')<>'2027-01-10' OR COALESCE(visibility,'')<>'public' OR COALESCE(publication_status,'')<>'published' OR COALESCE(itinerary_category,'')<>'daily');

UPDATE trip_content SET title='Day 3 · Ranch service and a ministry visit', content='PROPOSED ITINERARY — subject to change before and during the journey. Activities and times may change with host priorities, weather, transportation, and local conditions. Your leader will share updates. All times are local to Mexico City.

Work alongside the ranch team and learn from a partner rehabilitation center.

• 08:00–10:00 — Breakfast.
• 10:00–12:00 — Host-directed work at the ranch.
• 13:00–15:00 — Lunch at the ranch.
• Evening · time to confirm — Visit to the rehabilitation center and dinner at Rancho Alfa y Omega.

The order and times of the rehabilitation-center visit and dinner are awaiting host confirmation.', event_date='2027-01-11', visibility='public', publication_status='published', itinerary_category='daily', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='1ae73842-e4cf-459b-9821-daa4845d5e21' AND trip_id IN (SELECT id FROM trips WHERE slug='mexico-january-2027-8385c082' AND start_date='2027-01-09' AND end_date='2027-01-14' AND location='Mexico City, Mexico') AND content_type='itinerary' AND (COALESCE(title,'')<>'Day 3 · Ranch service and a ministry visit' OR COALESCE(content,'')<>'PROPOSED ITINERARY — subject to change before and during the journey. Activities and times may change with host priorities, weather, transportation, and local conditions. Your leader will share updates. All times are local to Mexico City.

Work alongside the ranch team and learn from a partner rehabilitation center.

• 08:00–10:00 — Breakfast.
• 10:00–12:00 — Host-directed work at the ranch.
• 13:00–15:00 — Lunch at the ranch.
• Evening · time to confirm — Visit to the rehabilitation center and dinner at Rancho Alfa y Omega.

The order and times of the rehabilitation-center visit and dinner are awaiting host confirmation.' OR COALESCE(event_date,'')<>'2027-01-11' OR COALESCE(visibility,'')<>'public' OR COALESCE(publication_status,'')<>'published' OR COALESCE(itinerary_category,'')<>'daily');

UPDATE trip_content SET title='Day 4 · Ranch service and a campfire', content='PROPOSED ITINERARY — subject to change before and during the journey. Activities and times may change with host priorities, weather, transportation, and local conditions. Your leader will share updates. All times are local to Mexico City.

A second day of practical work, followed by dinner and a late campfire together.

• 08:00–10:00 — Breakfast.
• 10:00–12:00 — Host-directed work at the ranch.
• 13:00–15:00 — Lunch at the ranch.
• 20:00–22:00 — Dinner at the ranch.
• 22:00–23:00 — Campfire at Rancho Alfa y Omega.

Further work and rest periods will be arranged with the hosts. Only one morning work block is currently scheduled.', event_date='2027-01-12', visibility='public', publication_status='published', itinerary_category='daily', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='46ef7eb7-0e9d-44d1-b224-2e6c10e08354' AND trip_id IN (SELECT id FROM trips WHERE slug='mexico-january-2027-8385c082' AND start_date='2027-01-09' AND end_date='2027-01-14' AND location='Mexico City, Mexico') AND content_type='itinerary' AND (COALESCE(title,'')<>'Day 4 · Ranch service and a campfire' OR COALESCE(content,'')<>'PROPOSED ITINERARY — subject to change before and during the journey. Activities and times may change with host priorities, weather, transportation, and local conditions. Your leader will share updates. All times are local to Mexico City.

A second day of practical work, followed by dinner and a late campfire together.

• 08:00–10:00 — Breakfast.
• 10:00–12:00 — Host-directed work at the ranch.
• 13:00–15:00 — Lunch at the ranch.
• 20:00–22:00 — Dinner at the ranch.
• 22:00–23:00 — Campfire at Rancho Alfa y Omega.

Further work and rest periods will be arranged with the hosts. Only one morning work block is currently scheduled.' OR COALESCE(event_date,'')<>'2027-01-12' OR COALESCE(visibility,'')<>'public' OR COALESCE(publication_status,'')<>'published' OR COALESCE(itinerary_category,'')<>'daily');

UPDATE trip_content SET title='Day 5 · Return to the outreach', content='PROPOSED ITINERARY — subject to change before and during the journey. Activities and times may change with host priorities, weather, transportation, and local conditions. Your leader will share updates. All times are local to Mexico City.

A second day alongside the local ministry, with time for conversation, practical care, and shared meals.

• 07:00–08:00 — Breakfast.
• 08:00–09:00 — Prepare outreach supplies.
• 09:00–13:00 — Outreach activity in Mexico City.
• 14:00–15:00 — Lunch at Toño’s place.
• 16:00 — Return to Rancho Alfa y Omega.', event_date='2027-01-13', visibility='public', publication_status='published', itinerary_category='daily', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='be4235be-cf42-4ae9-8905-e25850b5f0c4' AND trip_id IN (SELECT id FROM trips WHERE slug='mexico-january-2027-8385c082' AND start_date='2027-01-09' AND end_date='2027-01-14' AND location='Mexico City, Mexico') AND content_type='itinerary' AND (COALESCE(title,'')<>'Day 5 · Return to the outreach' OR COALESCE(content,'')<>'PROPOSED ITINERARY — subject to change before and during the journey. Activities and times may change with host priorities, weather, transportation, and local conditions. Your leader will share updates. All times are local to Mexico City.

A second day alongside the local ministry, with time for conversation, practical care, and shared meals.

• 07:00–08:00 — Breakfast.
• 08:00–09:00 — Prepare outreach supplies.
• 09:00–13:00 — Outreach activity in Mexico City.
• 14:00–15:00 — Lunch at Toño’s place.
• 16:00 — Return to Rancho Alfa y Omega.' OR COALESCE(event_date,'')<>'2027-01-13' OR COALESCE(visibility,'')<>'public' OR COALESCE(publication_status,'')<>'published' OR COALESCE(itinerary_category,'')<>'daily');

UPDATE trip_content SET title='Day 6 · A final look and the journey home', content='PROPOSED ITINERARY — subject to change before and during the journey. Activities and times may change with host priorities, weather, transportation, and local conditions. Your leader will share updates. All times are local to Mexico City.

Optional cultural time before the airport transfer, shaped around the confirmed departure flight.

• 08:00–10:00 — Breakfast.
• 10:00–12:00 — Optional free time for a Mexico City or pyramids visit.
• 18:00–19:00 · provisional — Ground transfer to the airport.

The airport transfer must be confirmed against the booked departure flight. Cultural activities depend on time, local arrangements, and personal budget.', event_date='2027-01-14', visibility='public', publication_status='published', itinerary_category='daily', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='a18fc0dc-7db4-4b4a-bfd5-60fcf153abd2' AND trip_id IN (SELECT id FROM trips WHERE slug='mexico-january-2027-8385c082' AND start_date='2027-01-09' AND end_date='2027-01-14' AND location='Mexico City, Mexico') AND content_type='itinerary' AND (COALESCE(title,'')<>'Day 6 · A final look and the journey home' OR COALESCE(content,'')<>'PROPOSED ITINERARY — subject to change before and during the journey. Activities and times may change with host priorities, weather, transportation, and local conditions. Your leader will share updates. All times are local to Mexico City.

Optional cultural time before the airport transfer, shaped around the confirmed departure flight.

• 08:00–10:00 — Breakfast.
• 10:00–12:00 — Optional free time for a Mexico City or pyramids visit.
• 18:00–19:00 · provisional — Ground transfer to the airport.

The airport transfer must be confirmed against the booked departure flight. Cultural activities depend on time, local arrangements, and personal budget.' OR COALESCE(event_date,'')<>'2027-01-14' OR COALESCE(visibility,'')<>'public' OR COALESCE(publication_status,'')<>'published' OR COALESCE(itinerary_category,'')<>'daily');

INSERT INTO trip_content(id,trip_id,content_type,title,content,link_url,visibility,publication_status,sort_order,created_at,updated_at) SELECT 'mexico-gods-kitchen-20261116',id,'overview','Meet God’s Kitchen','Learn how the Alfa y Omega Foundation’s mobile meal ministry connects food, clothing, hygiene supplies, consistent presence, and voluntary pathways toward support. Explore the ministry briefing and return to this portal for your trip’s daily plan.','/trips/mexico-city/gods-kitchen/','public','published',20,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM trips WHERE id IN (SELECT id FROM trips WHERE slug='mexico-january-2027-8385c082' AND start_date='2027-01-09' AND end_date='2027-01-14' AND location='Mexico City, Mexico') AND NOT EXISTS(SELECT 1 FROM trip_content WHERE id='mexico-gods-kitchen-20261116');

INSERT INTO trip_content(id,trip_id,content_type,title,content,link_url,visibility,publication_status,sort_order,created_at,updated_at) SELECT 'mexico-host-preparation-20261116',id,'overview','Mexico preparation and optional sightseeing','Plan for the host’s current itinerary and review the ranch lodging, outreach settings, and transportation photos. Confirm your room and bed assignment, bedding, accessibility needs, and vehicle capacity with your leader.

Allow an additional US $100–$200 for optional sightseeing and tourist activities, following the host’s suggestion. This is separate from the trip planning estimate.

The trip leader will confirm Metro Relief preparation/service in Dallas–Fort Worth, final flights, Monday evening arrangements, and the return airport transfer. Keep your packing list and devotional preparation alongside this itinerary.','/trips/mexico-city/#host-photos','public','published',21,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM trips WHERE id IN (SELECT id FROM trips WHERE slug='mexico-january-2027-8385c082' AND start_date='2027-01-09' AND end_date='2027-01-14' AND location='Mexico City, Mexico') AND NOT EXISTS(SELECT 1 FROM trip_content WHERE id='mexico-host-preparation-20261116');
