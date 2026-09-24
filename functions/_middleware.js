const SESSION_COOKIE = 'dash_session';
const SESSION_TTL = 86400; // 24 h
const TS_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TS_SITEKEY = '0x4AAAAAADg-tbuoPRO9s2I5';
const RL_MAX = 5;
const RL_WINDOW = 15 * 60 * 1000; // 15 min

/* Rate limit backed by KV when a DASH_KV binding exists (shared across
   isolates); falls back to in-memory, which resets on cold start. */
const _rl = new Map();
const RL_PREFIX = 'rl:';

/* Static assets that must be publicly accessible regardless of auth state.
   data.json is read by url.lucafchala.com as a fallback and by the page
   itself; blocking it on session expiry would corrupt the SW cache. The
   login page needs the icon and fonts before anyone is signed in. */
const PUBLIC_PATHS = new Set(['/data.json', '/manifest.json', '/icon.svg', '/sw.js', '/robots.txt']);
const PUBLIC_PREFIXES = ['/fonts/'];

/* Function responses don't get _headers applied, so the login page carries
   its own. No inline script: theme comes from the shared lf_theme cookie and
   `next` is rendered server-side, so only Turnstile needs script-src. */
const LOGIN_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src https://challenges.cloudflare.com; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  if (url.pathname === '/api/healthz') return next();
  if (PUBLIC_PATHS.has(url.pathname) || PUBLIC_PREFIXES.some(p => url.pathname.startsWith(p))) return next();

  if (url.pathname === '/login') {
    if (request.method === 'POST') return handleLogin(request, env);
    return loginPage(request, { next: url.searchParams.get('next') || '/' });
  }
  if (url.pathname === '/logout') return logout();

  if (await isAuthed(request, env)) return next();

  /* fetch() follows a 302 to /login and hands the client an HTML page it
     then fails to parse as JSON; API callers get a status they can act on. */
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ message: 'sessão expirada', login: '/login' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  return redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
}

async function isAuthed(request, env) {
  if (!env.DASH_PASSWORD) return false; // fail closed — a missing secret is a deploy error, not a bypass
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || !/^[A-Za-z0-9._-]+$/.test(token)) return false;
  return verifyToken(token, env.DASH_PASSWORD);
}

function readCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  for (const part of cookies.split(';')) {
    const i = part.indexOf('=');
    if (i !== -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/* Only same-origin paths survive; `/\evil.com` and friends are normalised by
   URL() to another origin and rejected. */
function safeNext(next, origin) {
  try {
    const u = new URL(String(next || '/'), origin);
    if (u.origin !== origin || u.pathname === '/login' || u.pathname === '/logout') return '/';
    return u.pathname + u.search + u.hash;
  } catch { return '/'; }
}

async function rlCheck(env, ip) {
  if (env.DASH_KV) {
    const n = parseInt(await env.DASH_KV.get(RL_PREFIX + ip) || '0', 10);
    return n < RL_MAX;
  }
  const now = Date.now();
  const entry = _rl.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RL_WINDOW) { _rl.set(ip, { count: 0, windowStart: now }); return true; }
  return entry.count < RL_MAX;
}
async function rlRecord(env, ip) {
  if (env.DASH_KV) {
    const key = RL_PREFIX + ip;
    const n = parseInt(await env.DASH_KV.get(key) || '0', 10);
    await env.DASH_KV.put(key, String(n + 1), { expirationTtl: Math.ceil(RL_WINDOW / 1000) });
    return;
  }
  const now = Date.now();
  const entry = _rl.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RL_WINDOW) { _rl.set(ip, { count: 1, windowStart: now }); }
  else { _rl.set(ip, { ...entry, count: entry.count + 1 }); }
}
async function rlReset(env, ip) {
  if (env.DASH_KV) { await env.DASH_KV.delete(RL_PREFIX + ip); return; }
  _rl.delete(ip);
}

async function handleLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const origin = new URL(request.url).origin;

  let password = '', tsToken = '', next = '/';
  try {
    const fd = await request.formData();
    password = String(fd.get('password') || '');
    tsToken  = String(fd.get('cf-turnstile-response') || '');
    next     = String(fd.get('next') || '/');
  } catch {
    return loginPage(request, { error: 'Requisição inválida.' });
  }

  if (!await rlCheck(env, ip)) return loginPage(request, { next, error: 'Muitas tentativas. Aguarde alguns minutos.', status: 429 });

  const tsOk = await verifyTurnstile(tsToken, env.TURNSTILE_SECRET_KEY, ip);
  if (!tsOk) return loginPage(request, { next, error: 'Verificação de segurança falhou. Recarregue e tente novamente.', status: 400 });

  if (!env.DASH_PASSWORD || !await sameSecret(password, env.DASH_PASSWORD)) {
    await rlRecord(env, ip);
    return loginPage(request, { next, error: 'Senha incorreta.', status: 401 });
  }
  await rlReset(env, ip);

  const token = await makeToken(env.DASH_PASSWORD);
  return new Response(null, {
    status: 302,
    headers: {
      Location: safeNext(next, origin),
      'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`,
      'Cache-Control': 'no-store',
    },
  });
}

function logout() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/login',
      'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      'Cache-Control': 'no-store',
      'Clear-Site-Data': '"cache"',
    },
  });
}

async function verifyTurnstile(token, secret, ip) {
  if (!secret) return false; // fail closed — a missing secret is a deploy error, not a bypass
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const res = await fetch(TS_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return (await res.json()).success === true;
  } catch { return false; }
}

/* Compare digests, not the strings, so the comparison time doesn't depend on
   how many leading characters of the guess are right. */
async function sameSecret(a, b) {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
async function digest(s) { return new Uint8Array(await crypto.subtle.digest('SHA-256', enc(s))); }

async function makeToken(secret) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const payload = String(exp);
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc(payload));
  return `${payload}.${hex(sig)}`;
}

async function verifyToken(token, secret) {
  const dot = token.indexOf('.');
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = parseInt(payload, 10);
  if (isNaN(exp) || Date.now() / 1000 > exp) return false;
  const key = await hmacKey(secret);
  const expected = hex(await crypto.subtle.sign('HMAC', key, enc(payload)));
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

function enc(s) { return new TextEncoder().encode(s); }
function hex(buf) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function redirect(loc) { return new Response(null, { status: 302, headers: { Location: loc, 'Cache-Control': 'no-store' } }); }
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'); }

function loginPage(request, { next = '/', error = '', status = 200 } = {}) {
  const theme = readCookie(request, 'lf_theme') === 'light' ? 'light' : 'dark';
  const safe = safeNext(next, new URL(request.url).origin);
  return new Response(loginHTML({ theme, next: safe, error }), { status, headers: LOGIN_HEADERS });
}

function loginHTML({ theme, next, error }) {
  return `<!DOCTYPE html>
<html lang="pt-BR" data-theme="${theme}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Painel — lucafchala</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="${theme === 'light' ? '#f4efe6' : '#0d0c0a'}">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="preload" href="/fonts/jetbrains-mono-latin.woff2" as="font" type="font/woff2" crossorigin>
<script data-cfasync="false" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
@font-face{font-family:'Cormorant Garamond';font-style:normal;font-weight:300 700;font-display:swap;src:url('/fonts/cormorant-garamond-latin.woff2') format('woff2')}
@font-face{font-family:'Cormorant Garamond';font-style:italic;font-weight:300 700;font-display:swap;src:url('/fonts/cormorant-garamond-italic-latin.woff2') format('woff2')}
@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:300 500;font-display:swap;src:url('/fonts/jetbrains-mono-latin.woff2') format('woff2')}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0d0c0a;--border:#252220;--text:#e6e1d6;--muted:#948a7c;--accent:#c08030;--accent-dim:#6a4818;--ctrl-bg:#161412;--err:#e07060}
[data-theme=light]{--bg:#f4efe6;--border:#d8d1c4;--text:#1c1a17;--muted:#6b6152;--accent:#8a5712;--accent-dim:#c89050;--ctrl-bg:#ede8df;--err:#a8321f}
html{background:var(--bg);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:14px;line-height:1.75;-webkit-font-smoothing:antialiased;color-scheme:dark}
[data-theme=light]{color-scheme:light}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px}
.box{width:100%;max-width:340px;animation:rise .7s cubic-bezier(.16,1,.3,1) both}
h1{font-family:'Cormorant Garamond',serif;font-size:clamp(36px,9vw,52px);font-weight:300;line-height:.95;letter-spacing:-.025em;margin-bottom:36px}
h1 em{font-style:italic;color:var(--accent)}
.fields{display:flex;flex-direction:column;gap:18px}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.field input{background:var(--ctrl-bg);border:1px solid var(--border);border-radius:2px;color:var(--text);font-family:inherit;font-size:16px;padding:10px 12px;width:100%}
.field input:focus-visible,.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.error{font-size:12px;color:var(--err)}
.btn{background:none;border:1px solid var(--accent-dim);border-radius:2px;color:var(--accent);font-family:inherit;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:12px 22px;cursor:pointer;transition:border-color .15s;margin-top:4px}
.btn:hover{border-color:var(--accent)}
@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion:reduce){.box{animation:none}}
</style>
</head>
<body>
<main class="box">
  <h1>Painel <em>de</em><br>Controle</h1>
  <form class="fields" method="POST" action="/login">
    <input type="hidden" name="next" value="${escHtml(next)}">
    <div class="field">
      <label for="password">Senha</label>
      <input type="password" id="password" name="password" required autofocus autocomplete="current-password">
    </div>
    <div class="cf-turnstile" data-sitekey="${TS_SITEKEY}" data-theme="${theme}"></div>
    ${error ? `<p class="error" role="alert">${escHtml(error)}</p>` : ''}
    <button class="btn" type="submit">Entrar</button>
  </form>
</main>
</body>
</html>`;
}
