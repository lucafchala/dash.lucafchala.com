// Liveness + config probe. Exempt from the auth middleware so CI and the
// status page can assert the dash is deployable; exposes only booleans.

export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    ok: true,
    dashPassword: !!env.DASH_PASSWORD,
    turnstileSecret: !!env.TURNSTILE_SECRET_KEY,
    githubProxy: !!env.GH_PAT,
    kvRateLimit: !!env.DASH_KV,
  }), {
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' },
  });
}
