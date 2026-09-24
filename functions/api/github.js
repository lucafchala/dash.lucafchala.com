// GitHub Contents API proxy — the dash routes every GitHub call here and
// GH_PAT (a Pages secret) never reaches the browser. Session auth is enforced
// by the root _middleware before this runs.
//
// Only the Contents API of the ecosystem repos is reachable. The path is
// validated segment by segment and '%' is refused outright: fetch() decodes
// %2e%2e into '..' while building the URL, which would otherwise let a
// "contents/%2e%2e/%2e%2e/…" path climb out to any GitHub endpoint.

const DEFAULT_REPOS = [
  'lucafchala/lucafchala.com',
  'lucafchala/dash.lucafchala.com',
  'lucafchala/paste.lucafchala.com',
  'lucafchala/url.lucafchala.com',
];
const METHODS = new Set(['GET', 'PUT', 'DELETE']);
const SEGMENT_RE = /^[\p{L}\p{N}_.-]+$/u;

export async function onRequestGet({ env }) {
  return json({ configured: !!env.GH_PAT, repos: allowedRepos(env) });
}

export async function onRequestPost({ request, env }) {
  if (!env.GH_PAT) return json({ message: 'GH_PAT não configurado' }, 501);

  let payload;
  try { payload = await request.json(); } catch { return json({ message: 'JSON inválido' }, 400); }
  const { path, method = 'GET', body = null } = payload || {};

  const target = resolvePath(path, allowedRepos(env));
  if (!target) return json({ message: 'Caminho inválido — apenas a Contents API dos repositórios do ecossistema' }, 400);
  if (!METHODS.has(method)) return json({ message: 'Método não permitido' }, 405);

  let res;
  try {
    res = await fetch(target, {
      method,
      headers: {
        'Authorization': `Bearer ${env.GH_PAT}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'dash.lucafchala.com',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body == null || method === 'GET' ? null : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
  } catch {
    return json({ message: 'GitHub indisponível' }, 502);
  }

  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' },
  });
}

function allowedRepos(env) {
  const extra = String(env.GH_REPOS || '').split(',').map(s => s.trim()).filter(Boolean);
  return extra.length ? extra : DEFAULT_REPOS;
}

function resolvePath(path, repos) {
  if (typeof path !== 'string' || !path || path.length > 512) return null;
  if (/[%\\?#\s]/.test(path)) return null;
  const segs = path.split('/');
  if (segs.length < 4 || segs[2] !== 'contents') return null;
  if (!segs.every(s => s && s !== '.' && s !== '..' && SEGMENT_RE.test(s))) return null;
  const repo = `${segs[0]}/${segs[1]}`;
  if (!repos.includes(repo)) return null;
  const url = new URL(`https://api.github.com/repos/${path}`);
  const prefix = `/repos/${repo}/contents/`;
  if (url.origin !== 'https://api.github.com' || !decodeURIComponent(url.pathname).startsWith(prefix)) return null;
  return url.href;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' },
  });
}
