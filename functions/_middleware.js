const SESSION_COOKIE = 'dash_session';
const SESSION_TTL = 86400; // 24 h
const TS_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RL_MAX = 5;
const RL_WINDOW = 15 * 60 * 1000; // 15 min

/* In-memory rate limit — resets on Worker restart, good enough for a personal dashboard */
const _rl = new Map();

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  if (url.pathname === '/login') {
    if (request.method === 'GET') return loginPage();
    if (request.method === 'POST') return handleLogin(request, env);
  }

  if (await isAuthed(request, env)) return next();

  const dest = encodeURIComponent(url.pathname + url.search);
  return redirect(`/login?next=${dest}`);
}

async function isAuthed(request, env) {
  if (!env.DASH_PASSWORD) return false; // fail closed — a missing secret is a deploy error, not a bypass
  const cookies = request.headers.get('Cookie') || '';
  const match = cookies.match(/dash_session=([A-Za-z0-9+/=._-]+)/);
  if (!match) return false;
  return verifyToken(match[1], env.DASH_PASSWORD);
}

function rlCheck(ip) {
  const now = Date.now();
  const entry = _rl.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RL_WINDOW) { _rl.set(ip, { count: 0, windowStart: now }); return true; }
  return entry.count < RL_MAX;
}
function rlRecord(ip) {
  const now = Date.now();
  const entry = _rl.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RL_WINDOW) { _rl.set(ip, { count: 1, windowStart: now }); }
  else { _rl.set(ip, { ...entry, count: entry.count + 1 }); }
}
function rlReset(ip) { _rl.delete(ip); }

async function handleLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  if (!rlCheck(ip)) return loginPage(true, 'Muitas tentativas. Aguarde alguns minutos.');

  let password, tsToken, next;
  try {
    const fd = await request.formData();
    password = fd.get('password') || '';
    tsToken  = fd.get('cf-turnstile-response') || '';
    next     = fd.get('next') || '/';
  } catch {
    return loginPage(true);
  }

  const tsOk = await verifyTurnstile(tsToken, env.TURNSTILE_SECRET_KEY);
  if (!tsOk) return loginPage(true, 'Verificação de segurança falhou. Recarregue e tente novamente.');

  if (!env.DASH_PASSWORD || password !== env.DASH_PASSWORD) {
    rlRecord(ip);
    return loginPage(true, 'Senha incorreta.');
  }
  rlReset(ip);

  const token = await makeToken(env.DASH_PASSWORD);
  const dest = /^\/[^/]/.test(next) ? next : '/';
  return new Response(null, {
    status: 302,
    headers: {
      Location: dest,
      'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`,
    },
  });
}

async function verifyTurnstile(token, secret) {
  if (!secret) return false; // fail closed — a missing secret is a deploy error, not a bypass
  if (!token) return false;
  try {
    const res = await fetch(TS_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    return (await res.json()).success === true;
  } catch { return false; }
}

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
function hex(buf) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join(''); }
function redirect(loc) { return new Response(null, { status: 302, headers: { Location: loc } }); }

function loginPage(error = false, msg = 'Senha incorreta.') {
  return new Response(loginHTML(error, msg), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function loginHTML(error, msg) {
  return `<!DOCTYPE html>
<html lang="pt-BR" data-theme="dark">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Painel — lucafchala</title>
<meta name="theme-color" content="#0d0c0a">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script>(function(){document.documentElement.dataset.theme=localStorage.getItem('theme')||'dark'})()</script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0d0c0a;--border:#252220;--text:#e6e1d6;--muted:#6a6358;--accent:#c08030;--accent-dim:#6a4818;--ctrl-bg:#161412}
[data-theme=light]{--bg:#f4efe6;--border:#d8d1c4;--text:#1c1a17;--muted:#9a8f80;--accent:#a06820;--accent-dim:#c89050;--ctrl-bg:#ede8df}
html{background:var(--bg);color:var(--text);font-family:'JetBrains Mono',monospace;font-size:14px;line-height:1.75;-webkit-font-smoothing:antialiased}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px}
.box{width:100%;max-width:340px}
h1{font-family:'Cormorant Garamond',serif;font-size:clamp(36px,9vw,52px);font-weight:300;line-height:.95;letter-spacing:-.025em;margin-bottom:36px}
h1 em{font-style:italic;color:var(--accent)}
.fields{display:flex;flex-direction:column;gap:18px}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.field input{background:var(--ctrl-bg);border:1px solid var(--border);border-radius:2px;color:var(--text);font-family:'JetBrains Mono',monospace;font-size:13px;padding:10px 12px;outline:none;transition:border-color .15s;width:100%}
.field input:focus{border-color:var(--accent-dim)}
.error{font-size:11px;color:#c04040;display:${error ? 'block' : 'none'}}
.btn{background:none;border:1px solid var(--accent-dim);border-radius:2px;color:var(--accent);font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;padding:10px 22px;cursor:pointer;transition:border-color .15s;margin-top:4px}
.btn:hover{border-color:var(--accent)}
@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.box{animation:rise .7s cubic-bezier(.16,1,.3,1) both}
</style>
</head>
<body>
<div class="box">
  <h1>Painel <em>de</em><br>Controle</h1>
  <form class="fields" method="POST" action="/login">
    <input type="hidden" name="next" value="">
    <div class="field">
      <label>Senha</label>
      <input type="password" name="password" autofocus autocomplete="current-password">
    </div>
    <div class="cf-turnstile" data-sitekey="0x4AAAAAADg-tbuoPRO9s2I5" data-theme="auto"></div>
    <span class="error">${msg}</span>
    <button class="btn" type="submit">Entrar</button>
  </form>
</div>
<script>
const p=new URLSearchParams(location.search);if(p.get('next'))document.querySelector('[name=next]').value=p.get('next');
</script>
</body>
</html>`;
}
