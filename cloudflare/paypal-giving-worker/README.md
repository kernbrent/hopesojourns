# Hope Sojourns PayPal Worker

Cloudflare Worker for Hope Sojourns giving. It keeps the PayPal client secret off the website, creates one-time orders, provides public recurring-plan configuration, and verifies PayPal webhooks.

The Worker is deployed to its `workers.dev` address first. The production `hopesojourns.com/api/paypal/*` route should only be added after PayPal credentials, plans, and webhook verification have been tested.

## Secret values

Never put these sensitive values in source control:

- `PAYPAL_CLIENT_SECRET`
- `SETUP_KEY` (temporary bootstrap protection)

This project also stores `PAYPAL_CLIENT_ID` as a Worker secret. The client ID is returned to the browser at runtime because the PayPal JavaScript SDK requires it. The client ID, monthly and yearly plan IDs, and webhook ID are identifiers rather than secret credentials; the plan and webhook IDs can be stored as ordinary Worker variables.

## Local validation

```text
npm install
npm run types
npm run check
npm test
npm run deploy:dry
```

No live charge is created by these checks.
