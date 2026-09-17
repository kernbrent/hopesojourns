import type {AdminEnv} from './admin';

type AccountEmailEnv = Pick<AdminEnv, 'MMT_EMAIL_PROVIDER' | 'MMT_EMAIL_DELIVERY_MODE' | 'RESEND_API_KEY' | 'EMAIL_DELIVERY_MODE' | 'EMAIL' | 'EMAIL_FROM_ADDRESS' | 'EMAIL_REPLY_TO'>;

type AccountMessage = {to: string; subject: string; text: string};

export function accountEmailReady(env: AccountEmailEnv): boolean {
  if (env.MMT_EMAIL_PROVIDER === 'resend') {
    return env.MMT_EMAIL_DELIVERY_MODE === 'live' && !!env.RESEND_API_KEY?.trim();
  }
  return env.EMAIL_DELIVERY_MODE === 'live' && !!env.EMAIL;
}

// Account mail has its own activation switch so enabling invitations does not
// unexpectedly release queued trip messages. Never log credentials or links.
export async function sendAccountEmail(env: AccountEmailEnv, message: AccountMessage, idempotencyKey: string): Promise<boolean> {
  if (!accountEmailReady(env)) return false;
  const from = env.EMAIL_FROM_ADDRESS || 'admin@hopesojourns.com';
  const replyTo = env.EMAIL_REPLY_TO || from;
  try {
    if (env.MMT_EMAIL_PROVIDER === 'resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({...message, to: [message.to], from: `Hope Sojourns <${from}>`, reply_to: replyTo}),
      });
      // Acceptance by the provider is not confirmation of inbox delivery.
      const accepted = response.ok;
      if (!accepted) console.warn(JSON.stringify({event: 'mmt_email_rejected', provider: 'resend', status: response.status}));
      await response.body?.cancel();
      return accepted;
    }
    await env.EMAIL!.send({...message, from: {email: from, name: 'Hope Sojourns'}, replyTo});
    return true;
  } catch (error) {
    // Only allowlisted error names: exception messages can contain credentials.
    const failure = error instanceof Error && ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name) ? error.name : 'Error';
    console.warn(JSON.stringify({event: 'mmt_email_failed', provider: env.MMT_EMAIL_PROVIDER || 'cloudflare', failure}));
    // Do not retry through another provider: a timed-out request may have sent.
    return false;
  }
}
