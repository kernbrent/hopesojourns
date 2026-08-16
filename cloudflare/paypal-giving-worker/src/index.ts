const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
} as const;

const MAX_DONATION = 100_000;
const PAYPAL_ID_PATTERN = /^[A-Z0-9-]{3,64}$/;

type Frequency = "MONTH" | "YEAR";

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function routePath(pathname: string): string {
  const stripped = pathname.replace(/^\/api\/paypal(?=\/|$)/, "");
  return stripped || "/";
}

export function parseAmount(input: unknown): string {
  const raw = typeof input === "number" ? input.toString() : input;
  if (typeof raw !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) {
    throw new HttpError(400, "Enter a valid donation amount with no more than two decimal places.");
  }

  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 1 || amount > MAX_DONATION) {
    throw new HttpError(400, `Donation amount must be between $1 and $${MAX_DONATION.toLocaleString("en-US")}.`);
  }

  return amount.toFixed(2);
}

export function isAllowedOrigin(origin: string | null, allowedOrigins: string): boolean {
  if (!origin) return false;
  return allowedOrigins
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .some((allowedOrigin) => {
      if (allowedOrigin === origin) return true;
      if (!allowedOrigin.endsWith(":*")) return false;

      try {
        const requested = new URL(origin);
        const allowed = new URL(allowedOrigin.slice(0, -2));
        return requested.protocol === allowed.protocol && requested.hostname === allowed.hostname;
      } catch {
        return false;
      }
    });
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, env.ALLOWED_ORIGINS)) return {};

  return {
    "access-control-allow-origin": origin!,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(request: Request, env: Env, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { ...JSON_HEADERS, ...corsHeaders(request, env) },
  });
}

function requireAllowedOrigin(request: Request, env: Env): void {
  if (!isAllowedOrigin(request.headers.get("origin"), env.ALLOWED_ORIGINS)) {
    throw new HttpError(403, "This request did not come from an approved Hope Sojourns page.");
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }

  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function requirePayPalCredentials(env: Env): void {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new HttpError(503, "PayPal credentials have not been configured yet.");
  }
}

async function getAccessToken(env: Env): Promise<string> {
  requirePayPalCredentials(env);
  const authorization = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${env.PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${authorization}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const result = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !result.access_token) {
    throw new HttpError(502, "PayPal authentication failed.", result.error_description);
  }
  return result.access_token;
}

async function paypalRequest<T>(
  env: Env,
  path: string,
  init: RequestInit = {},
  requestId?: string,
): Promise<T> {
  const accessToken = await getAccessToken(env);
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body) headers.set("content-type", "application/json");
  if (requestId) headers.set("paypal-request-id", requestId);
  headers.set("prefer", "return=representation");

  const response = await fetch(`${env.PAYPAL_API_BASE}${path}`, { ...init, headers });
  const text = await response.text();
  const result = text
    ? (JSON.parse(text) as T & { message?: string; details?: unknown })
    : ({} as T & { message?: string; details?: unknown });
  if (!response.ok) {
    throw new HttpError(502, result.message ?? "PayPal returned an error.", result.details);
  }
  return result;
}

async function createOrder(request: Request, env: Env): Promise<Response> {
  requireAllowedOrigin(request, env);
  const input = await readJson(request);
  const amount = parseAmount(input.amount);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 127) : "";

  const result = await paypalRequest<{ id: string; status: string }>(
    env,
    "/v2/checkout/orders",
    {
      method: "POST",
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            description: "Hope Sojourns charitable gift",
            custom_id: note || undefined,
            amount: { currency_code: env.PAYPAL_CURRENCY, value: amount },
          },
        ],
      }),
    },
    crypto.randomUUID(),
  );

  return json(request, env, { id: result.id, status: result.status }, 201);
}

async function captureOrder(request: Request, env: Env, orderId: string): Promise<Response> {
  requireAllowedOrigin(request, env);
  if (!PAYPAL_ID_PATTERN.test(orderId)) throw new HttpError(400, "Invalid PayPal order ID.");

  const result = await paypalRequest<{
    id: string;
    status: string;
    purchase_units?: Array<{ payments?: { captures?: Array<{ id: string; status: string }> } }>;
  }>(env, `/v2/checkout/orders/${orderId}/capture`, { method: "POST" }, crypto.randomUUID());

  const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
  return json(request, env, {
    id: result.id,
    status: result.status,
    captureId: capture?.id,
    captureStatus: capture?.status,
  });
}

function publicConfig(request: Request, env: Env): Response {
  const ready = Boolean(
    env.PAYPAL_CLIENT_ID && env.PAYPAL_MONTHLY_PLAN_ID && env.PAYPAL_YEARLY_PLAN_ID,
  );
  return json(request, env, {
    ready,
    clientId: ready ? env.PAYPAL_CLIENT_ID : null,
    currency: env.PAYPAL_CURRENCY,
    plans: ready
      ? { monthly: env.PAYPAL_MONTHLY_PLAN_ID, yearly: env.PAYPAL_YEARLY_PLAN_ID }
      : null,
  });
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  await crypto.subtle.digest("SHA-256", encoder.encode(`${left.length}:${right.length}`));
  return difference === 0;
}

async function createPlan(env: Env, productId: string, frequency: Frequency) {
  const label = frequency === "MONTH" ? "Monthly" : "Yearly";
  return paypalRequest<{ id: string; status: string }>(
    env,
    "/v1/billing/plans",
    {
      method: "POST",
      body: JSON.stringify({
        product_id: productId,
        name: `Hope Sojourns ${label} Giving`,
        description: `${label} recurring charitable gift to Hope Sojourns`,
        status: "ACTIVE",
        billing_cycles: [
          {
            frequency: { interval_unit: frequency, interval_count: 1 },
            tenure_type: "REGULAR",
            sequence: 1,
            total_cycles: 0,
            pricing_scheme: {
              fixed_price: { value: "1.00", currency_code: env.PAYPAL_CURRENCY },
            },
          },
        ],
        payment_preferences: {
          auto_bill_outstanding: true,
          setup_fee_failure_action: "CONTINUE",
          payment_failure_threshold: 3,
        },
      }),
    },
    `hope-sojourns-${frequency.toLowerCase()}-v1`,
  );
}

async function requireSetupAccess(request: Request, env: Env): Promise<void> {
  if (String(env.ENVIRONMENT) !== "setup") throw new HttpError(404, "Not found.");
  const suppliedKey = request.headers.get("x-setup-key") ?? "";
  if (!env.SETUP_KEY || !(await constantTimeEqual(suppliedKey, env.SETUP_KEY))) {
    throw new HttpError(404, "Not found.");
  }
}

async function bootstrapPlans(request: Request, env: Env): Promise<Response> {
  await requireSetupAccess(request, env);

  const product = await paypalRequest<{ id: string }>(
    env,
    "/v1/catalogs/products",
    {
      method: "POST",
      body: JSON.stringify({
        name: "Hope Sojourns Giving",
        description: "Charitable giving in support of Hope Sojourns",
        type: "SERVICE",
        home_url: "https://hopesojourns.com/giving/",
      }),
    },
    "hope-sojourns-giving-product-v1",
  );
  const monthly = await createPlan(env, product.id, "MONTH");
  const yearly = await createPlan(env, product.id, "YEAR");

  return json(request, env, {
    productId: product.id,
    monthlyPlanId: monthly.id,
    yearlyPlanId: yearly.id,
  }, 201);
}

async function bootstrapWebhook(request: Request, env: Env): Promise<Response> {
  await requireSetupAccess(request, env);

  const webhook = await paypalRequest<{ id: string; url: string }>(
    env,
    "/v1/notifications/webhooks",
    {
      method: "POST",
      body: JSON.stringify({
        url: "https://hope-sojourns-paypal.kernbrent.workers.dev/webhook",
        event_types: [
          { name: "BILLING.SUBSCRIPTION.CREATED" },
          { name: "BILLING.SUBSCRIPTION.ACTIVATED" },
          { name: "BILLING.SUBSCRIPTION.UPDATED" },
          { name: "BILLING.SUBSCRIPTION.EXPIRED" },
          { name: "BILLING.SUBSCRIPTION.CANCELLED" },
          { name: "BILLING.SUBSCRIPTION.SUSPENDED" },
          { name: "BILLING.SUBSCRIPTION.PAYMENT.FAILED" },
          { name: "PAYMENT.SALE.COMPLETED" },
          { name: "PAYMENT.SALE.REFUNDED" },
          { name: "PAYMENT.SALE.REVERSED" },
        ],
      }),
    },
    "hope-sojourns-webhook-v1",
  );

  return json(request, env, { webhookId: webhook.id, url: webhook.url }, 201);
}

function webhookHeaders(request: Request): Record<string, string> {
  const names = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ];
  const result: Record<string, string> = {};
  for (const name of names) {
    const value = request.headers.get(name);
    if (!value) throw new HttpError(400, `Missing ${name} header.`);
    result[name] = value;
  }
  return result;
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.PAYPAL_WEBHOOK_ID) throw new HttpError(503, "PayPal webhook is not configured yet.");
  const headers = webhookHeaders(request);
  const rawBody = await request.text();
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Webhook body must be valid JSON.");
  }

  const verification = await paypalRequest<{ verification_status: string }>(
    env,
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: env.PAYPAL_WEBHOOK_ID,
        webhook_event: event,
      }),
    },
  );

  if (verification.verification_status !== "SUCCESS") {
    throw new HttpError(400, "Webhook signature verification failed.");
  }

  const resource = event.resource as { id?: string } | undefined;
  console.log(JSON.stringify({
    event: "paypal_webhook_verified",
    eventId: event.id,
    eventType: event.event_type,
    resourceId: resource?.id,
  }));
  return new Response(null, { status: 204 });
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = routePath(url.pathname);

  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(request.headers.get("origin"), env.ALLOWED_ORIGINS)) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (request.method === "GET" && (path === "/" || path === "/health")) {
    return json(request, env, {
      status: "ok",
      service: "hope-sojourns-paypal",
      environment: env.ENVIRONMENT,
      credentialsConfigured: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
      plansConfigured: Boolean(env.PAYPAL_MONTHLY_PLAN_ID && env.PAYPAL_YEARLY_PLAN_ID),
      webhookConfigured: Boolean(env.PAYPAL_WEBHOOK_ID),
    });
  }
  if (request.method === "GET" && path === "/config") return publicConfig(request, env);
  if (request.method === "POST" && path === "/orders") return createOrder(request, env);

  const captureMatch = path.match(/^\/orders\/([A-Z0-9-]+)\/capture$/);
  if (request.method === "POST" && captureMatch) return captureOrder(request, env, captureMatch[1]);
  if (request.method === "POST" && path === "/webhook") return handleWebhook(request, env);
  if (request.method === "POST" && path === "/setup") return bootstrapPlans(request, env);
  if (request.method === "POST" && path === "/setup/webhook") return bootstrapWebhook(request, env);

  throw new HttpError(404, "Not found.");
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        console.warn(JSON.stringify({ event: "request_rejected", status: error.status, message: error.message }));
        return json(request, env, { error: error.message }, error.status);
      }

      console.error(JSON.stringify({
        event: "unhandled_error",
        message: error instanceof Error ? error.message : "Unknown error",
      }));
      return json(request, env, { error: "The giving service encountered an unexpected error." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
